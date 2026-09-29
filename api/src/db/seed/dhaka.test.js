import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { zones, zoneDistances, places } from '../schema.js';
import { haversineKm } from '../../lib/geo.js';
import { seedDhaka } from './dhaka.js';

describe('Dhaka seed data', () => {
  let allZones;
  let allDistances;

  beforeAll(async () => {
    allZones = await db.select().from(zones);
    allDistances = await db.select().from(zoneDistances);
  });

  it('has all 12 zones', () => {
    expect(allZones).toHaveLength(12);
  });

  it('has a distance row for every ordered pair of different zones', () => {
    const ids = allZones.map((z) => z.id);
    const have = new Set(allDistances.map((d) => `${d.fromZoneId}|${d.toZoneId}`));

    const missing = [];
    for (const from of ids) {
      for (const to of ids) {
        if (from === to) continue;
        if (!have.has(`${from}|${to}`)) missing.push(`${from}|${to}`);
      }
    }
    expect(missing).toEqual([]);
    expect(allDistances).toHaveLength(12 * 11);
  });

  it('matches the 6 distances the demo scenarios depend on', async () => {
    const byName = new Map(allZones.map((z) => [z.name, z.id]));
    const distanceBetween = async (a, b) => {
      const row = allDistances.find((d) => d.fromZoneId === byName.get(a) && d.toZoneId === byName.get(b));
      return row.distanceKm;
    };
    expect(await distanceBetween('Banani', 'Mohakhali')).toBe(3);
    expect(await distanceBetween('Banani', 'Gulshan 1')).toBe(2);
    expect(await distanceBetween('Mohakhali', 'Gulshan 1')).toBe(2.5);
    expect(await distanceBetween('Banani', 'Tejgaon')).toBe(4);
    expect(await distanceBetween('Mohakhali', 'Tejgaon')).toBe(2);
    expect(await distanceBetween('Gulshan 1', 'Tejgaon')).toBe(3);
  });

  it('seeds at least one Tesla stand in every zone', async () => {
    const allPlaces = await db.select().from(places);
    const zoneIdsWithStand = new Set(allPlaces.filter((p) => p.kind === 'STAND').map((p) => p.zoneId));
    const missing = allZones.filter((z) => !zoneIdsWithStand.has(z.id)).map((z) => z.name);
    expect(missing).toEqual([]);
  });

  it('keeps every two zone centres at least 500 m apart', () => {
    const tooClose = [];
    for (const a of allZones) {
      for (const b of allZones) {
        if (a.name >= b.name) continue;
        const km = haversineKm(a.centerLat, a.centerLng, b.centerLat, b.centerLng);
        if (km < 0.5) tooClose.push(`${a.name}-${b.name} ${km.toFixed(2)} km`);
      }
    }
    expect(tooClose).toEqual([]);
  });

  it('never makes a detour through a third zone shorter than the direct distance', () => {
    const km = new Map(allDistances.map((d) => [`${d.fromZoneId}|${d.toZoneId}`, d.distanceKm]));
    const between = (a, b) => (a === b ? 0 : km.get(`${a}|${b}`));
    const name = new Map(allZones.map((z) => [z.id, z.name]));
    const broken = [];
    for (const a of allZones) {
      for (const b of allZones) {
        for (const via of allZones) {
          if (a.id === b.id || via.id === a.id || via.id === b.id) continue;
          if (between(a.id, via.id) + between(via.id, b.id) < between(a.id, b.id)) {
            broken.push(`${name.get(a.id)}->${name.get(b.id)} via ${name.get(via.id)}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("puts every place closest to its own zone's centre", async () => {
    const allPlaces = await db.select().from(places);
    const misplaced = allPlaces
      .filter((p) => {
        const nearest = allZones.reduce((best, z) =>
          haversineKm(p.lat, p.lng, z.centerLat, z.centerLng) < haversineKm(p.lat, p.lng, best.centerLat, best.centerLng) ? z : best,
        );
        return nearest.id !== p.zoneId;
      })
      .map((p) => p.name);
    expect(misplaced).toEqual([]);
  });
});

describe('re-running the Dhaka seed', () => {
  it('corrects zones, distances and places that already exist with old values', async () => {
    const [gulshan2] = await db.select().from(zones).where(eq(zones.name, 'Gulshan 2'));
    const [banani] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
    const [pinkCity] = await db.select().from(places).where(eq(places.name, 'Pink City Gulshan 2'));
    const pair = and(eq(zoneDistances.fromZoneId, banani.id), eq(zoneDistances.toZoneId, gulshan2.id));
    const [before] = await db.select().from(zoneDistances).where(pair);

    await db.update(zones).set({ centerLat: 23.7925, centerLng: 90.4078 }).where(eq(zones.id, gulshan2.id));
    await db.update(zoneDistances).set({ distanceKm: 0 }).where(pair);
    await db.update(places).set({ zoneId: banani.id, lat: 23.79, lng: 90.4 }).where(eq(places.id, pinkCity.id));

    await seedDhaka();

    const [zoneAfter] = await db.select().from(zones).where(eq(zones.id, gulshan2.id));
    const [distanceAfter] = await db.select().from(zoneDistances).where(pair);
    const [placeAfter] = await db.select().from(places).where(eq(places.id, pinkCity.id));
    expect(zoneAfter).toMatchObject({ id: gulshan2.id, centerLat: gulshan2.centerLat, centerLng: gulshan2.centerLng });
    expect(distanceAfter.distanceKm).toBe(before.distanceKm);
    expect(placeAfter).toMatchObject({ id: pinkCity.id, zoneId: gulshan2.id, lat: pinkCity.lat, lng: pinkCity.lng });
    expect(await db.select().from(zones)).toHaveLength(12);
  });
});

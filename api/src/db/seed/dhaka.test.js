import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../client.js';
import { zones, zoneDistances, places } from '../schema.js';

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
});

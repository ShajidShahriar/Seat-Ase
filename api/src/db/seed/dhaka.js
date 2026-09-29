import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { pool } from '../pool.js';
import { zones, zoneDistances, places } from '../schema.js';
import { ZONES } from './zones.js';
import { buildZoneDistances } from './distances.js';
import { buildPlaces } from './places.js';
import { logger } from '../../lib/logger.js';

// ---- Every seed is an upsert: re-running it corrects rows that already exist, so a fix reaches old databases ----

async function seedZones() {
  const byName = new Map();
  for (const zone of ZONES) {
    const [row] = await db
      .insert(zones)
      .values(zone)
      .onConflictDoUpdate({ target: zones.name, set: { centerLat: zone.centerLat, centerLng: zone.centerLng } })
      .returning();
    byName.set(row.name, row);
  }
  return byName;
}

async function seedZoneDistances(zoneByName) {
  const pairs = buildZoneDistances(ZONES);
  const existing = await db.select().from(zoneDistances);
  const current = new Map(existing.map((row) => [`${row.fromZoneId}|${row.toZoneId}`, row.distanceKm]));

  const rows = [];
  for (const { fromName, toName, km } of pairs) {
    const from = zoneByName.get(fromName);
    const to = zoneByName.get(toName);
    for (const [fromZoneId, toZoneId] of [
      [from.id, to.id],
      [to.id, from.id],
    ]) {
      if (current.get(`${fromZoneId}|${toZoneId}`) === km) continue;
      rows.push({ fromZoneId, toZoneId, distanceKm: km });
    }
  }

  if (rows.length > 0) {
    await db
      .insert(zoneDistances)
      .values(rows)
      .onConflictDoUpdate({ target: [zoneDistances.fromZoneId, zoneDistances.toZoneId], set: { distanceKm: sql`excluded.distance_km` } });
  }
  return rows.length;
}

async function seedPlaces(zoneByName) {
  const wanted = buildPlaces(zoneByName);
  const existing = new Map((await db.select().from(places)).map((p) => [p.name, p]));

  let changed = 0;
  for (const p of wanted) {
    const row = { name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, zoneId: zoneByName.get(p.zoneName).id };
    const old = existing.get(p.name);
    if (!old) {
      await db.insert(places).values(row);
      changed++;
    } else if (old.kind !== row.kind || old.lat !== row.lat || old.lng !== row.lng || old.zoneId !== row.zoneId) {
      await db.update(places).set(row).where(eq(places.id, old.id));
      changed++;
    }
  }
  return changed;
}

export async function seedDhaka() {
  const zoneByName = await seedZones();
  const distanceRowsChanged = await seedZoneDistances(zoneByName);
  const placeRowsChanged = await seedPlaces(zoneByName);
  return { zoneByName, distanceRowsChanged, placeRowsChanged };
}

async function main() {
  const { zoneByName, distanceRowsChanged, placeRowsChanged } = await seedDhaka();

  logger.info('seed:dhaka complete', {
    zones: zoneByName.size,
    distanceRowsChanged,
    placeRowsChanged,
  });
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('seed:dhaka failed', { error: err.message });
    process.exit(1);
  });
}

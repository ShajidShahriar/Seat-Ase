import { fileURLToPath } from 'node:url';
import { db } from '../client.js';
import { pool } from '../pool.js';
import { zones, zoneDistances, places } from '../schema.js';
import { ZONES } from './zones.js';
import { buildZoneDistances } from './distances.js';
import { buildPlaces } from './places.js';
import { logger } from '../../lib/logger.js';

async function seedZones() {
  const existing = await db.select().from(zones);
  const byName = new Map(existing.map((z) => [z.name, z]));

  for (const zone of ZONES) {
    if (byName.has(zone.name)) continue;
    const [inserted] = await db.insert(zones).values(zone).returning();
    byName.set(inserted.name, inserted);
  }
  return byName;
}

async function seedZoneDistances(zoneByName) {
  const pairs = buildZoneDistances(ZONES);
  const existing = await db.select().from(zoneDistances);
  const seen = new Set(existing.map((row) => `${row.fromZoneId}|${row.toZoneId}`));

  const rows = [];
  for (const { fromName, toName, km } of pairs) {
    const from = zoneByName.get(fromName);
    const to = zoneByName.get(toName);
    for (const [fromZoneId, toZoneId] of [
      [from.id, to.id],
      [to.id, from.id],
    ]) {
      const key = `${fromZoneId}|${toZoneId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ fromZoneId, toZoneId, distanceKm: km });
    }
  }

  if (rows.length > 0) await db.insert(zoneDistances).values(rows);
  return rows.length;
}

async function seedPlaces(zoneByName) {
  const wanted = buildPlaces(zoneByName);
  const existingNames = new Set((await db.select({ name: places.name }).from(places)).map((p) => p.name));

  const rows = wanted
    .filter((p) => !existingNames.has(p.name))
    .map((p) => ({
      name: p.name,
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
      zoneId: zoneByName.get(p.zoneName).id,
    }));

  if (rows.length > 0) await db.insert(places).values(rows);
  return rows.length;
}

async function main() {
  const zoneByName = await seedZones();
  const distanceRowsAdded = await seedZoneDistances(zoneByName);
  const placeRowsAdded = await seedPlaces(zoneByName);

  logger.info('seed:dhaka complete', {
    zones: zoneByName.size,
    distanceRowsAdded,
    placeRowsAdded,
  });
  await pool.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error('seed:dhaka failed', { error: err.message });
    process.exit(1);
  });
}

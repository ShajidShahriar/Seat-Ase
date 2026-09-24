import { eq, ilike } from 'drizzle-orm';
import { db } from '../db/client.js';
import { places, zones } from '../db/schema.js';
import { haversineKm, walkMinutes } from '../lib/geo.js';
import { AppError } from '../lib/AppError.js';

const SERVICE_AREA_MAX_KM = 3;

function escapeLikePattern(input) {
  return input.replace(/[%_\\]/g, '\\$&');
}

export async function search(query) {
  const pattern = `%${escapeLikePattern(query)}%`;
  return db
    .select({ id: places.id, name: places.name, kind: places.kind, lat: places.lat, lng: places.lng, zoneId: places.zoneId })
    .from(places)
    .where(ilike(places.name, pattern));
}

async function nearestOf(rows, lat, lng) {
  let best = null;
  let bestKm = Infinity;
  for (const row of rows) {
    const km = haversineKm(lat, lng, row.lat, row.lng);
    if (km < bestKm) {
      best = row;
      bestKm = km;
    }
  }
  return best ? { ...best, distanceKm: bestKm } : null;
}

export async function findNearestZone(lat, lng) {
  const allZones = await db.select().from(zones);
  const rows = allZones.map((z) => ({ ...z, lat: z.centerLat, lng: z.centerLng }));
  return nearestOf(rows, lat, lng);
}

export async function findNearestStand(lat, lng) {
  const stands = await db
    .select({
      id: places.id,
      name: places.name,
      lat: places.lat,
      lng: places.lng,
      zoneId: places.zoneId,
      zoneName: zones.name,
    })
    .from(places)
    .innerJoin(zones, eq(zones.id, places.zoneId))
    .where(eq(places.kind, 'STAND'));
  return nearestOf(stands, lat, lng);
}

/**
 * Confirms a pin is actually somewhere in Dhaka before we do anything with it (fix #39).
 * Throws if the nearest zone centre is still implausibly far away.
 */
export async function assertWithinServiceArea(lat, lng) {
  const nearest = await findNearestZone(lat, lng);
  if (!nearest || nearest.distanceKm > SERVICE_AREA_MAX_KM) {
    throw new AppError(400, 'OUTSIDE_SERVICE_AREA', 'That location is outside our service area.');
  }
  return nearest;
}

export async function nearestStandWithWalk(lat, lng) {
  await assertWithinServiceArea(lat, lng);
  const stand = await findNearestStand(lat, lng);
  if (!stand) {
    throw new AppError(404, 'NO_STANDS', 'No Tesla stands are set up in this area yet.');
  }
  return {
    stand: { id: stand.id, name: stand.name, lat: stand.lat, lng: stand.lng },
    zone: { id: stand.zoneId, name: stand.zoneName },
    distanceMeters: Math.round(stand.distanceKm * 1000),
    walkMinutes: Math.round(walkMinutes(stand.distanceKm)),
  };
}

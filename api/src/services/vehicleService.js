import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vehicles, zones } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';

const STALE_AFTER_MINUTES = 5;

export async function getVehicleByDriver(driverId) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  return vehicle ?? null;
}

export async function addVehicle(driverId, { name, registrationNo, capacity }) {
  const [vehicle] = await db.insert(vehicles).values({ driverId, name, registrationNo, capacity }).returning();
  return vehicle;
}

export async function goOnline(driverId, zoneId) {
  const vehicle = await getVehicleByDriver(driverId);
  if (!vehicle) {
    throw new AppError(409, 'NO_VEHICLE', 'Add your vehicle before going online.');
  }

  const [zone] = await db.select().from(zones).where(eq(zones.id, zoneId));
  if (!zone) {
    throw new AppError(400, 'ZONE_NOT_FOUND', 'That is not a real zone.');
  }

  const [updated] = await db
    .update(vehicles)
    .set({ isOnline: true, currentZoneId: zoneId, lastSeenAt: new Date() })
    .where(eq(vehicles.driverId, driverId))
    .returning();
  return updated;
}

export async function goOffline(driverId) {
  const [updated] = await db
    .update(vehicles)
    .set({ isOnline: false })
    .where(eq(vehicles.driverId, driverId))
    .returning();
  if (!updated) {
    throw new AppError(409, 'NO_VEHICLE', 'You have no vehicle to go offline.');
  }
  return updated;
}

export async function touchLastSeen(driverId) {
  await db.update(vehicles).set({ lastSeenAt: new Date() }).where(eq(vehicles.driverId, driverId));
}

export async function onlineCountInZone(zoneId) {
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000);
  const rows = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.currentZoneId, zoneId), eq(vehicles.isOnline, true), gt(vehicles.lastSeenAt, staleCutoff)));
  return rows.length;
}

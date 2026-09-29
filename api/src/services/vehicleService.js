import { and, eq, gt, inArray, lt, not, notExists } from 'drizzle-orm';
import { db } from '../db/client.js';
import { rides, vehicles, zones } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';

const STALE_AFTER_MINUTES = 5;
const ACTIVE_RIDE_STATUSES = ['OPEN', 'ARRIVED', 'STARTED'];

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
    .where(and(eq(vehicles.driverId, driverId), noActiveRide()))
    .returning();
  if (!updated) throw rideInProgress('change your area');
  return updated;
}

export async function goOffline(driverId) {
  const vehicle = await getVehicleByDriver(driverId);
  if (!vehicle) {
    throw new AppError(409, 'NO_VEHICLE', 'You have no vehicle to go offline.');
  }

  const [updated] = await db
    .update(vehicles)
    .set({ isOnline: false })
    .where(and(eq(vehicles.id, vehicle.id), noActiveRide()))
    .returning();
  if (!updated) throw rideInProgress('go offline');
  return updated;
}

// ---- A driver with an open, arrived or started ride keeps his area and stays online until it ends ----

function noActiveRide() {
  return notExists(
    db
      .select({ id: rides.id })
      .from(rides)
      .where(and(eq(rides.vehicleId, vehicles.id), inArray(rides.status, ACTIVE_RIDE_STATUSES))),
  );
}

function rideInProgress(action) {
  return new AppError(409, 'RIDE_IN_PROGRESS', `You can't ${action} during a ride. Finish or cancel it first.`);
}

function canStillJoin(standId) {
  return and(
    eq(rides.status, 'OPEN'),
    eq(rides.isPrivate, false),
    lt(rides.seatsTaken, rides.capacity),
    standId ? eq(rides.pickupStandId, standId) : undefined,
  );
}

export async function touchLastSeen(driverId) {
  await db.update(vehicles).set({ lastSeenAt: new Date() }).where(eq(vehicles.driverId, driverId));
}

// ---- Teslas a passenger could actually get into: free ones, or one filling up at her stand with a seat left ----

export async function onlineCountInZone(zoneId, standId) {
  const staleCutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000);
  const rows = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.currentZoneId, zoneId),
        eq(vehicles.isOnline, true),
        gt(vehicles.lastSeenAt, staleCutoff),
        notExists(
          db
            .select({ id: rides.id })
            .from(rides)
            .where(and(eq(rides.vehicleId, vehicles.id), inArray(rides.status, ACTIVE_RIDE_STATUSES), not(canStillJoin(standId)))),
        ),
      ),
    );
  return rows.length;
}

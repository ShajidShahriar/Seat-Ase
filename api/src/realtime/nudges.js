import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { rideRequests, rides, vehicles } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { notify } from './notify.js';

// ---- Who gets nudged for each action (red-team #42) ----

export const WHO_GETS_NUDGED = {
  REQUEST_CREATED: ['bookingOwners', 'zoneDrivers'],
  REQUEST_CANCELLED: ['bookingOwners', 'rideDriver', 'ridePassengers', 'zoneDrivers'],
  REQUEST_EXPIRED: ['bookingOwners', 'zoneDrivers'],
  REQUEST_MATCHED: ['bookingOwners', 'rideDriver', 'ridePassengers', 'zoneDrivers'],
  RIDE_CANCELLED: ['bookingOwners', 'rideDriver', 'zoneDrivers'],
  ARRIVED: ['rideDriver', 'ridePassengers'],
  BOARDED: ['bookingOwners', 'rideDriver'],
  NO_SHOW: ['bookingOwners', 'rideDriver', 'ridePassengers'],
  STARTED: ['bookingOwners', 'rideDriver', 'ridePassengers', 'zoneDrivers'],
  DROPPED: ['bookingOwners', 'rideDriver', 'ridePassengers'],
  RIDE_AUTO_CLOSED: ['bookingOwners', 'rideDriver'],
};

const RIDE_BOOKING_STATUSES = ['MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];

// ---- Finding the people ----

async function bookingOwners(requestIds) {
  if (requestIds.length === 0) return [];
  return db
    .select({ requestId: rideRequests.id, passengerId: rideRequests.passengerId })
    .from(rideRequests)
    .where(inArray(rideRequests.id, requestIds));
}

async function rideDriver(rideId) {
  const [ride] = await db.select({ driverId: rides.driverId }).from(rides).where(eq(rides.id, rideId));
  return ride ? [ride.driverId] : [];
}

async function ridePassengers(rideId) {
  const rows = await db
    .select({ passengerId: rideRequests.passengerId })
    .from(rideRequests)
    .where(and(eq(rideRequests.rideId, rideId), inArray(rideRequests.status, RIDE_BOOKING_STATUSES)));
  return rows.map((r) => r.passengerId);
}

async function zoneDrivers(zoneId) {
  const rows = await db
    .select({ driverId: vehicles.driverId })
    .from(vehicles)
    .where(and(eq(vehicles.currentZoneId, zoneId), eq(vehicles.isOnline, true)));
  return rows.map((r) => r.driverId);
}

// ---- Sending, only ever called after a transaction has committed ----

export async function nudge(action, { rideId, requestIds = [], zoneId } = {}) {
  const audiences = WHO_GETS_NUDGED[action];
  if (!audiences) throw new Error(`No nudge rule for action ${action}`);

  try {
    if (audiences.includes('bookingOwners')) {
      for (const { requestId, passengerId } of await bookingOwners(requestIds)) {
        notify([passengerId], { type: 'booking.updated', action, requestId });
      }
    }
    if (rideId) {
      const rideAudience = [
        ...(audiences.includes('rideDriver') ? await rideDriver(rideId) : []),
        ...(audiences.includes('ridePassengers') ? await ridePassengers(rideId) : []),
      ];
      notify(rideAudience, { type: 'ride.updated', action, rideId });
    }
    if (zoneId && audiences.includes('zoneDrivers')) {
      notify(await zoneDrivers(zoneId), { type: 'waiting-list.updated', action, zoneId });
    }
  } catch (err) {
    logger.warn('Could not send live-update nudge', { action, rideId, error: err.message });
  }
}

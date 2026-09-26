import { and, asc, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { rideRequests, rides, rideEvents, vehicles, users, zones, places } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';
import { hashBody } from '../lib/hash.js';
import * as placesService from './placesService.js';
import { recordEvent } from './rideEventService.js';
import { nudge } from '../realtime/nudges.js';
import { estimateFares } from './fareService.js';

export const ACTIVE_BOOKING_STATUSES = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];
const EXPIRY_MINUTES = 15;
const ARRIVAL_CANCEL_MINUTES = 15;
const AUTO_CLOSE_HOURS = 3;

export async function expireStaleRequests() {
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);
  const expired = await db
    .update(rideRequests)
    .set({ status: 'EXPIRED' })
    .where(and(eq(rideRequests.status, 'REQUESTED'), lt(rideRequests.queuedAt, cutoff)))
    .returning({ id: rideRequests.id, pickupZoneId: rideRequests.pickupZoneId });

  const byZone = Map.groupBy(expired, (r) => r.pickupZoneId);
  for (const [zoneId, rows] of byZone) {
    await nudge('REQUEST_EXPIRED', { zoneId, requestIds: rows.map((r) => r.id) });
  }
}

export async function autoCloseStaleRides() {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_HOURS * 60 * 60 * 1000);
  const staleRides = await db.select().from(rides).where(and(eq(rides.status, 'STARTED'), lt(rides.startedAt, cutoff)));

  for (const ride of staleRides) {
    await db.update(rides).set({ status: 'COMPLETED', completedAt: new Date() }).where(eq(rides.id, ride.id));
    const closed = await db
      .update(rideRequests)
      .set({ status: 'COMPLETED', droppedAt: new Date() })
      .where(and(eq(rideRequests.rideId, ride.id), eq(rideRequests.status, 'IN_PROGRESS')))
      .returning({ id: rideRequests.id });
    await recordEvent({ rideId: ride.id, type: 'RIDE_AUTO_CLOSED', fromStatus: 'STARTED', toStatus: 'COMPLETED' });
    await nudge('RIDE_AUTO_CLOSED', { rideId: ride.id, requestIds: closed.map((r) => r.id) });
  }
}

async function resolvePickup(lat, lng) {
  const nearest = await placesService.nearestStandWithWalk(lat, lng);
  return { pickupStandId: nearest.stand.id, pickupZoneId: nearest.zone.id, pickupLat: null, pickupLng: null };
}

export async function quoteFare({ pickupLat, pickupLng, dropLat, dropLng, seats }) {
  const pickup = await resolvePickup(pickupLat, pickupLng);
  const dropZone = await placesService.assertWithinServiceArea(dropLat, dropLng);

  const distanceKm = await placesService.getZoneDistanceKm(pickup.pickupZoneId, dropZone.id);
  const fares = estimateFares(distanceKm, { seats });

  return {
    dropZoneId: dropZone.id,
    shared: {
      pickupZoneId: pickup.pickupZoneId,
      distanceKm,
      soloPoysha: fares.soloPoysha,
      pooledPoysha: fares.pooledPoysha,
    },
    private: {
      pickupZoneId: pickup.pickupZoneId,
      distanceKm,
      privatePoysha: fares.privatePoysha,
    },
  };
}

export async function createRequest(passenger, body, idempotencyKey) {
  if (!idempotencyKey) {
    throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'The Idempotency-Key header is required.');
  }

  const bodyHash = hashBody(body);
  const [existing] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.passengerId, passenger.id), eq(rideRequests.idempotencyKey, idempotencyKey)));

  if (existing) {
    if (existing.bodyHash !== bodyHash) {
      throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
    }
    return { request: existing, replay: true };
  }

  if (body.womenOnly && passenger.gender !== 'FEMALE') {
    throw new AppError(403, 'WOMEN_ONLY_REQUIRES_FEMALE', 'Only female passengers can request a women-only ride.');
  }

  const [activeExisting] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.passengerId, passenger.id), inArray(rideRequests.status, ACTIVE_BOOKING_STATUSES)));
  if (activeExisting) {
    throw new AppError(409, 'ACTIVE_BOOKING_EXISTS', 'You already have an active booking.');
  }

  const pickup = await resolvePickup(body.pickupLat, body.pickupLng);
  const dropZone = await placesService.assertWithinServiceArea(body.dropLat, body.dropLng);

  const [inserted] = await db
    .insert(rideRequests)
    .values({
      passengerId: passenger.id,
      seats: body.seats,
      rideType: body.rideType,
      womenOnly: body.womenOnly,
      pickupStandId: pickup.pickupStandId,
      pickupLat: pickup.pickupLat,
      pickupLng: pickup.pickupLng,
      pickupZoneId: pickup.pickupZoneId,
      dropZoneId: dropZone.id,
      idempotencyKey,
      bodyHash,
    })
    .returning();

  await recordEvent({ requestId: inserted.id, actorId: passenger.id, type: 'REQUESTED', toStatus: 'REQUESTED' });
  await nudge('REQUEST_CREATED', { requestIds: [inserted.id], zoneId: inserted.pickupZoneId });

  return { request: inserted, replay: false };
}

export async function listForPassenger(passengerId) {
  await expireStaleRequests();
  await autoCloseStaleRides();
  return db.select().from(rideRequests).where(eq(rideRequests.passengerId, passengerId)).orderBy(desc(rideRequests.createdAt));
}

export async function getOwnRequest(id, passengerId) {
  await expireStaleRequests();
  await autoCloseStaleRides();
  const [request] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.id, id), eq(rideRequests.passengerId, passengerId)));
  if (!request) {
    throw new AppError(404, 'NOT_FOUND', 'No booking found with that id.');
  }
  return request;
}

export async function cancelRequest(id, passengerId) {
  const cancelled = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, id), eq(rideRequests.passengerId, passengerId)));
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'No booking found with that id.');
    }

    if (existing.status === 'REQUESTED') {
      const [updated] = await tx
        .update(rideRequests)
        .set({ status: 'CANCELLED' })
        .where(and(eq(rideRequests.id, id), eq(rideRequests.status, 'REQUESTED')))
        .returning();
      if (!updated) {
        throw new AppError(409, 'CANNOT_CANCEL', 'This booking can no longer be cancelled.');
      }
      await recordEvent(
        { requestId: id, actorId: passengerId, type: 'CANCELLED', fromStatus: 'REQUESTED', toStatus: 'CANCELLED' },
        tx,
      );
      return updated;
    }

    if (existing.status === 'MATCHED' || existing.status === 'DRIVER_ARRIVED') {
      const [ride] = await tx.select().from(rides).where(eq(rides.id, existing.rideId)).for('update');

      if (existing.status === 'DRIVER_ARRIVED') {
        const escapeCutoff = new Date(Date.now() - ARRIVAL_CANCEL_MINUTES * 60 * 1000);
        if (ride.arrivedAt > escapeCutoff) {
          throw new AppError(
            409,
            'DRIVER_JUST_ARRIVED',
            `You can cancel once ${ARRIVAL_CANCEL_MINUTES} minutes have passed since the driver arrived without starting.`,
          );
        }
      }

      const [updated] = await tx
        .update(rideRequests)
        .set({ status: 'CANCELLED' })
        .where(and(eq(rideRequests.id, id), eq(rideRequests.status, existing.status)))
        .returning();
      if (!updated) {
        throw new AppError(409, 'CANNOT_CANCEL', 'This booking can no longer be cancelled.');
      }

      const newSeatsTaken = ride.seatsTaken - existing.seats;
      const emptiedOut = newSeatsTaken <= 0;
      await tx
        .update(rides)
        .set({ seatsTaken: newSeatsTaken, status: emptiedOut ? 'CANCELLED' : ride.status })
        .where(eq(rides.id, ride.id));

      await recordEvent(
        { rideId: ride.id, requestId: id, actorId: passengerId, type: 'CANCELLED', fromStatus: existing.status, toStatus: 'CANCELLED' },
        tx,
      );
      if (emptiedOut) {
        await recordEvent(
          { rideId: ride.id, actorId: null, type: 'RIDE_AUTO_CANCELLED', fromStatus: ride.status, toStatus: 'CANCELLED' },
          tx,
        );
      }
      return updated;
    }

    throw new AppError(409, 'CANNOT_CANCEL', 'This booking can no longer be cancelled.');
  });

  await nudge('REQUEST_CANCELLED', {
    requestIds: [cancelled.id],
    rideId: cancelled.rideId,
    zoneId: cancelled.pickupZoneId,
  });
  return cancelled;
}

export async function getOwnTimeline(id, passengerId) {
  const [existing] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.id, id), eq(rideRequests.passengerId, passengerId)));
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'No booking found with that id.');
  }

  const ownEvent = eq(rideEvents.requestId, id);
  const rideWideEvent = existing.rideId
    ? and(eq(rideEvents.rideId, existing.rideId), isNull(rideEvents.requestId))
    : undefined;

  return db
    .select({ type: rideEvents.type, fromStatus: rideEvents.fromStatus, toStatus: rideEvents.toStatus, createdAt: rideEvents.createdAt })
    .from(rideEvents)
    .where(rideWideEvent ? or(ownEvent, rideWideEvent) : ownEvent)
    .orderBy(asc(rideEvents.createdAt));
}

const RIDE_INFO_STATUSES = ['MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
const CO_RIDER_STATUSES = ['MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];

function firstNameOf(fullName) {
  return fullName.trim().split(/\s+/)[0];
}

export async function getOwnRideInfo(id, passengerId) {
  const booking = await getOwnRequest(id, passengerId);
  if (!booking.rideId || !RIDE_INFO_STATUSES.includes(booking.status)) {
    return null;
  }

  const [ride] = await db
    .select({
      isPrivate: rides.isPrivate,
      seatsTaken: rides.seatsTaken,
      capacity: rides.capacity,
      driverName: users.name,
      vehicleName: vehicles.name,
      registrationNo: vehicles.registrationNo,
      pickupStandName: places.name,
      pickupZoneName: zones.name,
    })
    .from(rides)
    .innerJoin(users, eq(users.id, rides.driverId))
    .innerJoin(vehicles, eq(vehicles.id, rides.vehicleId))
    .innerJoin(zones, eq(zones.id, rides.zoneId))
    .leftJoin(places, eq(places.id, rides.pickupStandId))
    .where(eq(rides.id, booking.rideId));

  let coRiders = [];
  if (CO_RIDER_STATUSES.includes(booking.status)) {
    const others = await db
      .select({ name: users.name, dropZoneName: zones.name, seats: rideRequests.seats })
      .from(rideRequests)
      .innerJoin(users, eq(users.id, rideRequests.passengerId))
      .innerJoin(zones, eq(zones.id, rideRequests.dropZoneId))
      .where(and(eq(rideRequests.rideId, booking.rideId), inArray(rideRequests.status, CO_RIDER_STATUSES), ne(rideRequests.id, booking.id)))
      .orderBy(asc(rideRequests.createdAt));
    coRiders = others.map((other) => ({ firstName: firstNameOf(other.name), dropZoneName: other.dropZoneName, seats: other.seats }));
  }

  return {
    isPrivate: ride.isPrivate,
    seatsTaken: ride.seatsTaken,
    capacity: ride.capacity,
    driverName: ride.driverName,
    vehicle: { name: ride.vehicleName, registrationNo: ride.registrationNo },
    pickupStandName: ride.pickupStandName,
    pickupZoneName: ride.pickupZoneName,
    coRiders,
  };
}

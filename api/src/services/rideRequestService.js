import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { rideRequests } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';
import { hashBody } from '../lib/hash.js';
import * as placesService from './placesService.js';
import { recordEvent } from './rideEventService.js';

export const ACTIVE_BOOKING_STATUSES = ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];
const EXPIRY_MINUTES = 15;

export async function expireStaleRequests() {
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);
  await db
    .update(rideRequests)
    .set({ status: 'EXPIRED' })
    .where(and(eq(rideRequests.status, 'REQUESTED'), lt(rideRequests.queuedAt, cutoff)));
}

async function resolvePickup(rideType, lat, lng) {
  if (rideType === 'PRIVATE') {
    const zone = await placesService.assertWithinServiceArea(lat, lng);
    return { pickupStandId: null, pickupZoneId: zone.id, pickupLat: lat, pickupLng: lng };
  }
  const nearest = await placesService.nearestStandWithWalk(lat, lng);
  return { pickupStandId: nearest.stand.id, pickupZoneId: nearest.zone.id, pickupLat: null, pickupLng: null };
}

export async function createRequest(passenger, body) {
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

  const pickup = await resolvePickup(body.rideType, body.pickupLat, body.pickupLng);
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
      idempotencyKey: randomUUID(),
      bodyHash: hashBody(body),
    })
    .returning();

  await recordEvent({ requestId: inserted.id, actorId: passenger.id, type: 'REQUESTED', toStatus: 'REQUESTED' });

  return { request: inserted, replay: false };
}

export async function listForPassenger(passengerId) {
  await expireStaleRequests();
  return db.select().from(rideRequests).where(eq(rideRequests.passengerId, passengerId)).orderBy(desc(rideRequests.createdAt));
}

export async function getOwnRequest(id, passengerId) {
  await expireStaleRequests();
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
  const [existing] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.id, id), eq(rideRequests.passengerId, passengerId)));
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'No booking found with that id.');
  }

  const [updated] = await db
    .update(rideRequests)
    .set({ status: 'CANCELLED' })
    .where(and(eq(rideRequests.id, id), eq(rideRequests.status, 'REQUESTED')))
    .returning();
  if (!updated) {
    throw new AppError(409, 'CANNOT_CANCEL', 'This booking can no longer be cancelled.');
  }

  await recordEvent({ requestId: id, actorId: passengerId, type: 'CANCELLED', fromStatus: 'REQUESTED', toStatus: 'CANCELLED' });
  return updated;
}

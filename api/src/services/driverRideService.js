import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { rides, rideRequests, vehicles, users, zones } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';
import { withDeadlockRetry } from '../lib/dbRetry.js';
import { checkFit } from './matchService.js';
import { getZoneDistanceKm } from './placesService.js';
import { soloFarePerSeatPoysha, pooledFarePerSeatPoysha, privateFarePoysha } from './fareService.js';
import { recordEvent } from './rideEventService.js';
import { ACTIVE_BOOKING_STATUSES, expireStaleRequests, autoCloseStaleRides } from './rideRequestService.js';
import { nudge } from '../realtime/nudges.js';

const ACTIVE_RIDE_STATUSES = ['OPEN', 'ARRIVED', 'STARTED'];
const REQUEST_EXPIRY_MINUTES = 15;
const NO_SHOW_WAIT_MINUTES = 5;

async function activeBookingsForRide(tx, rideId, excludingId) {
  const rows = await tx
    .select({
      id: rideRequests.id,
      seats: rideRequests.seats,
      rideType: rideRequests.rideType,
      dropZoneId: rideRequests.dropZoneId,
      womenOnly: rideRequests.womenOnly,
      fareCapPoysha: rideRequests.fareCapPoysha,
      gender: users.gender,
    })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .where(and(eq(rideRequests.rideId, rideId), inArray(rideRequests.status, ACTIVE_BOOKING_STATUSES)));
  return excludingId ? rows.filter((r) => r.id !== excludingId) : rows;
}

async function buildZoneDistanceLookup(candidateDropZoneId, otherZoneIds) {
  const uniqueZones = [...new Set(otherZoneIds)];
  const entries = await Promise.all(
    uniqueZones.map(async (zoneId) => [zoneId, await getZoneDistanceKm(candidateDropZoneId, zoneId)]),
  );
  const map = new Map(entries);
  return (a, b) => {
    const otherZone = a === candidateDropZoneId ? b : a;
    return otherZone === candidateDropZoneId ? 0 : map.get(otherZone);
  };
}

async function updateFareCaps(tx, ride) {
  const activeBookings = await activeBookingsForRide(tx, ride.id);
  const count = activeBookings.length;

  for (const booking of activeBookings) {
    const distanceKm = await getZoneDistanceKm(ride.zoneId, booking.dropZoneId);
    const fare =
      booking.rideType === 'PRIVATE'
        ? privateFarePoysha(distanceKm, ride.capacity)
        : (count >= 2 ? pooledFarePerSeatPoysha(distanceKm) : soloFarePerSeatPoysha(distanceKm)) * booking.seats;
    const newCap = booking.fareCapPoysha == null ? fare : Math.min(booking.fareCapPoysha, fare);
    if (newCap !== booking.fareCapPoysha) {
      await tx.update(rideRequests).set({ fareCapPoysha: newCap }).where(eq(rideRequests.id, booking.id));
    }
  }
}

async function acceptOnce(driverId, requestId) {
  return db.transaction(async (tx) => {
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.driverId, driverId));
    if (!vehicle) {
      throw new AppError(409, 'NO_VEHICLE', 'Add your vehicle before accepting requests.');
    }
    if (!vehicle.isOnline) {
      throw new AppError(409, 'NOT_ONLINE', 'Go online before accepting requests.');
    }

    const [existingRide] = await tx
      .select()
      .from(rides)
      .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, ACTIVE_RIDE_STATUSES)))
      .for('update');

    const [candidateRow] = await tx
      .select({
        id: rideRequests.id,
        status: rideRequests.status,
        queuedAt: rideRequests.queuedAt,
        seats: rideRequests.seats,
        rideType: rideRequests.rideType,
        womenOnly: rideRequests.womenOnly,
        pickupStandId: rideRequests.pickupStandId,
        pickupZoneId: rideRequests.pickupZoneId,
        dropZoneId: rideRequests.dropZoneId,
        gender: users.gender,
      })
      .from(rideRequests)
      .innerJoin(users, eq(users.id, rideRequests.passengerId))
      .where(eq(rideRequests.id, requestId));

    if (!candidateRow) {
      throw new AppError(404, 'NOT_FOUND', 'No such request.');
    }

    const cutoff = new Date(Date.now() - REQUEST_EXPIRY_MINUTES * 60 * 1000);
    if (candidateRow.status !== 'REQUESTED' || candidateRow.queuedAt < cutoff) {
      throw new AppError(409, 'REQUEST_UNAVAILABLE', 'That request is no longer waiting.');
    }

    if (!existingRide && candidateRow.pickupZoneId !== vehicle.currentZoneId) {
      throw new AppError(409, 'NOT_IN_YOUR_AREA', 'That request is not in your declared area.');
    }

    const activeBookings = existingRide ? await activeBookingsForRide(tx, existingRide.id) : [];
    const zoneDistanceKm = await buildZoneDistanceLookup(
      candidateRow.dropZoneId,
      activeBookings.map((b) => b.dropZoneId),
    );

    const fit = checkFit({
      ride: existingRide ?? null,
      activeBookings,
      candidate: candidateRow,
      zoneDistanceKm,
    });
    if (!fit.fits) {
      throw new AppError(409, 'DOES_NOT_FIT', fit.reasons.map((r) => r.message).join(' '));
    }

    let ride = existingRide;
    if (!ride) {
      const [created] = await tx
        .insert(rides)
        .values({
          vehicleId: vehicle.id,
          driverId,
          pickupStandId: candidateRow.rideType === 'PRIVATE' ? null : candidateRow.pickupStandId,
          zoneId: candidateRow.pickupZoneId,
          capacity: vehicle.capacity,
          isPrivate: candidateRow.rideType === 'PRIVATE',
        })
        .returning();
      ride = created;
    }

    const claimedSeats = candidateRow.rideType === 'PRIVATE' ? ride.capacity : candidateRow.seats;
    const [claimed] = await tx
      .update(rideRequests)
      .set({ status: 'MATCHED', rideId: ride.id, seats: claimedSeats })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, 'REQUESTED')))
      .returning();
    if (!claimed) {
      throw new AppError(409, 'REQUEST_UNAVAILABLE', 'That request was just taken.');
    }

    const seatUpdate =
      candidateRow.rideType === 'PRIVATE'
        ? await tx
            .update(rides)
            .set({ seatsTaken: ride.capacity })
            .where(and(eq(rides.id, ride.id), eq(rides.seatsTaken, 0)))
            .returning()
        : await tx
            .update(rides)
            .set({ seatsTaken: sql`${rides.seatsTaken} + ${claimedSeats}` })
            .where(and(eq(rides.id, ride.id), sql`${rides.seatsTaken} + ${claimedSeats} <= ${rides.capacity}`))
            .returning();

    const [updatedRide] = seatUpdate;
    if (!updatedRide) {
      throw new AppError(409, 'SEATS_UNAVAILABLE', 'Not enough seats left.');
    }

    await updateFareCaps(tx, updatedRide);

    await recordEvent(
      {
        rideId: updatedRide.id,
        requestId: claimed.id,
        actorId: driverId,
        type: 'REQUEST_MATCHED',
        fromStatus: 'REQUESTED',
        toStatus: 'MATCHED',
      },
      tx,
    );

    const [freshRequest] = await tx.select().from(rideRequests).where(eq(rideRequests.id, claimed.id));
    return { ride: updatedRide, request: freshRequest };
  });
}

export async function acceptRequest(driverId, requestId) {
  const result = await withDeadlockRetry(() => acceptOnce(driverId, requestId));
  await nudge('REQUEST_MATCHED', {
    rideId: result.ride.id,
    requestIds: [result.request.id],
    zoneId: result.request.pickupZoneId,
  });
  return result;
}

function serializeWaitingRequest(row, fit) {
  const isPrivate = row.rideType === 'PRIVATE';
  return {
    id: row.id,
    seats: row.seats,
    rideType: row.rideType,
    womenOnly: row.womenOnly,
    pickupStandId: isPrivate ? null : row.pickupStandId,
    pickupZoneName: row.pickupZoneName,
    dropZoneId: row.dropZoneId,
    queuedAt: row.queuedAt,
    fits: fit.fits,
    reasons: fit.reasons,
  };
}

export async function listWaitingRequests(driverId) {
  await expireStaleRequests();

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  if (!vehicle) {
    throw new AppError(409, 'NO_VEHICLE', 'Add your vehicle before viewing requests.');
  }

  const [ride] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, ACTIVE_RIDE_STATUSES)));

  if (ride?.isPrivate) {
    return [];
  }

  const candidates = await db
    .select({
      id: rideRequests.id,
      seats: rideRequests.seats,
      rideType: rideRequests.rideType,
      womenOnly: rideRequests.womenOnly,
      pickupStandId: rideRequests.pickupStandId,
      pickupZoneId: rideRequests.pickupZoneId,
      pickupZoneName: zones.name,
      dropZoneId: rideRequests.dropZoneId,
      queuedAt: rideRequests.queuedAt,
      gender: users.gender,
    })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .innerJoin(zones, eq(zones.id, rideRequests.pickupZoneId))
    .where(
      and(
        eq(rideRequests.status, 'REQUESTED'),
        ride ? eq(rideRequests.pickupStandId, ride.pickupStandId) : eq(rideRequests.pickupZoneId, vehicle.currentZoneId),
      ),
    );

  const activeBookings = ride ? await activeBookingsForRide(db, ride.id) : [];

  const results = [];
  for (const candidate of candidates) {
    const zoneDistanceKm = await buildZoneDistanceLookup(
      candidate.dropZoneId,
      activeBookings.map((b) => b.dropZoneId),
    );
    const fit = checkFit({ ride: ride ?? null, activeBookings, candidate, zoneDistanceKm });
    results.push(serializeWaitingRequest(candidate, fit));
  }
  return results;
}

export async function cancelRide(driverId) {
  const { cancelled, requestIds } = await db.transaction(async (tx) => {
    const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.driverId, driverId));
    if (!vehicle) {
      throw new AppError(404, 'NOT_FOUND', 'No vehicle found.');
    }

    const [ride] = await tx
      .select()
      .from(rides)
      .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, ['OPEN', 'ARRIVED'])))
      .for('update');
    if (!ride) {
      throw new AppError(404, 'NOT_FOUND', 'No cancellable ride found.');
    }

    const bookings = await tx
      .select({ id: rideRequests.id })
      .from(rideRequests)
      .where(and(eq(rideRequests.rideId, ride.id), inArray(rideRequests.status, ACTIVE_BOOKING_STATUSES)));

    for (const booking of bookings) {
      await tx
        .update(rideRequests)
        .set({ status: 'REQUESTED', rideId: null, queuedAt: new Date(), fareCapPoysha: null })
        .where(eq(rideRequests.id, booking.id));
      await recordEvent(
        {
          rideId: ride.id,
          requestId: booking.id,
          actorId: driverId,
          type: 'RIDE_CANCELLED',
          fromStatus: 'MATCHED',
          toStatus: 'REQUESTED',
        },
        tx,
      );
    }

    const [cancelled] = await tx.update(rides).set({ status: 'CANCELLED' }).where(eq(rides.id, ride.id)).returning();
    return { cancelled, requestIds: bookings.map((b) => b.id) };
  });

  await nudge('RIDE_CANCELLED', { rideId: cancelled.id, requestIds, zoneId: cancelled.zoneId });
  return cancelled;
}

async function getOwnedActiveRide(tx, driverId, allowedStatuses) {
  const [vehicle] = await tx.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  if (!vehicle) {
    throw new AppError(404, 'NOT_FOUND', 'No vehicle found.');
  }
  const [ride] = await tx
    .select()
    .from(rides)
    .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, allowedStatuses)))
    .for('update');
  if (!ride) {
    throw new AppError(404, 'NOT_FOUND', 'No ride found in that state.');
  }
  return ride;
}

export async function arriveRide(driverId) {
  const arrived = await db.transaction(async (tx) => {
    const ride = await getOwnedActiveRide(tx, driverId, ['OPEN']);

    const active = await activeBookingsForRide(tx, ride.id);
    if (active.length === 0) {
      throw new AppError(409, 'RIDE_EMPTY', 'Nobody is booked into this ride yet.');
    }

    const [updatedRide] = await tx
      .update(rides)
      .set({ status: 'ARRIVED', arrivedAt: new Date() })
      .where(eq(rides.id, ride.id))
      .returning();

    await tx
      .update(rideRequests)
      .set({ status: 'DRIVER_ARRIVED' })
      .where(and(eq(rideRequests.rideId, ride.id), eq(rideRequests.status, 'MATCHED')));

    await recordEvent(
      { rideId: ride.id, actorId: driverId, type: 'ARRIVED', fromStatus: 'OPEN', toStatus: 'ARRIVED' },
      tx,
    );
    return updatedRide;
  });

  await nudge('ARRIVED', { rideId: arrived.id });
  return arrived;
}

export async function boardPassenger(driverId, requestId) {
  const boarded = await db.transaction(async (tx) => {
    const ride = await getOwnedActiveRide(tx, driverId, ['ARRIVED']);

    const [booking] = await tx
      .update(rideRequests)
      .set({ boardedAt: new Date() })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, ride.id), eq(rideRequests.status, 'DRIVER_ARRIVED')))
      .returning();
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'No such waiting passenger on your ride.');
    }

    await recordEvent({ rideId: ride.id, requestId: booking.id, actorId: driverId, type: 'BOARDED' }, tx);
    return booking;
  });

  await nudge('BOARDED', { rideId: boarded.rideId, requestIds: [boarded.id] });
  return boarded;
}

export async function markNoShow(driverId, requestId) {
  const noShow = await db.transaction(async (tx) => {
    const ride = await getOwnedActiveRide(tx, driverId, ['ARRIVED']);

    const waitCutoff = new Date(Date.now() - NO_SHOW_WAIT_MINUTES * 60 * 1000);
    if (ride.arrivedAt > waitCutoff) {
      throw new AppError(409, 'NO_SHOW_TOO_EARLY', `Wait ${NO_SHOW_WAIT_MINUTES} minutes after arriving before marking a no-show.`);
    }

    const [booking] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, ride.id)));
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'No such passenger on your ride.');
    }
    if (booking.boardedAt) {
      throw new AppError(409, 'ALREADY_BOARDED', 'This passenger already boarded.');
    }

    const [updated] = await tx
      .update(rideRequests)
      .set({ status: 'NO_SHOW' })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, 'DRIVER_ARRIVED')))
      .returning();
    if (!updated) {
      throw new AppError(409, 'CANNOT_MARK_NO_SHOW', 'This passenger is not waiting to board.');
    }

    const newSeatsTaken = ride.seatsTaken - booking.seats;
    const emptiedOut = newSeatsTaken <= 0;
    await tx
      .update(rides)
      .set({ seatsTaken: newSeatsTaken, status: emptiedOut ? 'CANCELLED' : ride.status })
      .where(eq(rides.id, ride.id));

    await recordEvent(
      { rideId: ride.id, requestId: updated.id, actorId: driverId, type: 'NO_SHOW', fromStatus: 'DRIVER_ARRIVED', toStatus: 'NO_SHOW' },
      tx,
    );
    if (emptiedOut) {
      await recordEvent({ rideId: ride.id, type: 'RIDE_AUTO_CANCELLED', fromStatus: ride.status, toStatus: 'CANCELLED' }, tx);
    }
    return updated;
  });

  await nudge('NO_SHOW', { rideId: noShow.rideId, requestIds: [noShow.id] });
  return noShow;
}

export async function startRide(driverId) {
  const { started, leftBehindIds } = await db.transaction(async (tx) => {
    const ride = await getOwnedActiveRide(tx, driverId, ['ARRIVED']);

    const bookings = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.rideId, ride.id), eq(rideRequests.status, 'DRIVER_ARRIVED')));

    const boarded = bookings.filter((b) => b.boardedAt);
    const notBoarded = bookings.filter((b) => !b.boardedAt);

    if (boarded.length === 0) {
      throw new AppError(409, 'NOBODY_BOARDED', 'At least one passenger must board before starting.');
    }

    for (const booking of notBoarded) {
      await tx
        .update(rideRequests)
        .set({ status: 'REQUESTED', rideId: null, queuedAt: new Date(), fareCapPoysha: null })
        .where(eq(rideRequests.id, booking.id));
      await recordEvent(
        {
          rideId: ride.id,
          requestId: booking.id,
          actorId: driverId,
          type: 'LEFT_BEHIND',
          fromStatus: 'DRIVER_ARRIVED',
          toStatus: 'REQUESTED',
        },
        tx,
      );
    }

    const boardedCount = boarded.length;
    const newSeatsTaken = boarded.reduce((sum, b) => sum + b.seats, 0);

    for (const booking of boarded) {
      const distanceKm = await getZoneDistanceKm(ride.zoneId, booking.dropZoneId);
      const calculatedFare =
        booking.rideType === 'PRIVATE'
          ? privateFarePoysha(distanceKm, ride.capacity)
          : (boardedCount >= 2 ? pooledFarePerSeatPoysha(distanceKm) : soloFarePerSeatPoysha(distanceKm)) * booking.seats;
      const finalFare = booking.fareCapPoysha == null ? calculatedFare : Math.min(calculatedFare, booking.fareCapPoysha);

      await tx.update(rideRequests).set({ status: 'IN_PROGRESS', farePoysha: finalFare }).where(eq(rideRequests.id, booking.id));

      await recordEvent(
        {
          rideId: ride.id,
          requestId: booking.id,
          actorId: driverId,
          type: 'STARTED',
          fromStatus: 'DRIVER_ARRIVED',
          toStatus: 'IN_PROGRESS',
          details: { farePoysha: finalFare },
        },
        tx,
      );
    }

    const [updatedRide] = await tx
      .update(rides)
      .set({ status: 'STARTED', startedAt: new Date(), seatsTaken: newSeatsTaken })
      .where(eq(rides.id, ride.id))
      .returning();

    return { started: updatedRide, leftBehindIds: notBoarded.map((b) => b.id) };
  });

  await nudge('STARTED', {
    rideId: started.id,
    requestIds: leftBehindIds,
    zoneId: leftBehindIds.length > 0 ? started.zoneId : undefined,
  });
  return started;
}

export async function dropPassenger(driverId, requestId) {
  const dropped = await db.transaction(async (tx) => {
    const ride = await getOwnedActiveRide(tx, driverId, ['STARTED']);

    const [booking] = await tx
      .update(rideRequests)
      .set({ status: 'COMPLETED', droppedAt: new Date() })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, ride.id), eq(rideRequests.status, 'IN_PROGRESS')))
      .returning();
    if (!booking) {
      throw new AppError(404, 'NOT_FOUND', 'No such in-progress passenger on your ride.');
    }

    await recordEvent(
      { rideId: ride.id, requestId: booking.id, actorId: driverId, type: 'DROPPED', fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED' },
      tx,
    );

    const [{ count }] = await tx
      .select({ count: sql`count(*)::int` })
      .from(rideRequests)
      .where(and(eq(rideRequests.rideId, ride.id), eq(rideRequests.status, 'IN_PROGRESS')));

    let updatedRide = ride;
    if (count === 0) {
      [updatedRide] = await tx
        .update(rides)
        .set({ status: 'COMPLETED', completedAt: new Date() })
        .where(eq(rides.id, ride.id))
        .returning();
      await tx.update(vehicles).set({ currentZoneId: booking.dropZoneId }).where(eq(vehicles.id, ride.vehicleId));
      await recordEvent({ rideId: ride.id, type: 'RIDE_COMPLETED', fromStatus: 'STARTED', toStatus: 'COMPLETED' }, tx);
    }

    return { ride: updatedRide, request: booking };
  });

  await nudge('DROPPED', { rideId: dropped.ride.id, requestIds: [dropped.request.id] });
  return dropped;
}

export async function getDriverRide(driverId) {
  await expireStaleRequests();
  await autoCloseStaleRides();

  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  if (!vehicle) {
    throw new AppError(404, 'NOT_FOUND', 'No vehicle found.');
  }

  const [ride] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, ACTIVE_RIDE_STATUSES)));
  if (!ride) {
    return { ride: null, passengers: [] };
  }

  const bookings = await db
    .select({
      id: rideRequests.id,
      status: rideRequests.status,
      seats: rideRequests.seats,
      rideType: rideRequests.rideType,
      womenOnly: rideRequests.womenOnly,
      dropZoneId: rideRequests.dropZoneId,
      dropZoneName: zones.name,
      boardedAt: rideRequests.boardedAt,
      fareCapPoysha: rideRequests.fareCapPoysha,
      farePoysha: rideRequests.farePoysha,
      passengerName: users.name,
    })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .innerJoin(zones, eq(zones.id, rideRequests.dropZoneId))
    .where(and(eq(rideRequests.rideId, ride.id), inArray(rideRequests.status, ACTIVE_BOOKING_STATUSES)));

  const withDistance = await Promise.all(
    bookings.map(async (b) => ({ ...b, distanceFromPickupKm: await getZoneDistanceKm(ride.zoneId, b.dropZoneId) })),
  );
  withDistance.sort((a, b) => a.distanceFromPickupKm - b.distanceFromPickupKm);

  return { ride, passengers: withDistance };
}

export async function getDriverHistory(driverId) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  if (!vehicle) {
    throw new AppError(404, 'NOT_FOUND', 'No vehicle found.');
  }
  return db
    .select()
    .from(rides)
    .where(and(eq(rides.vehicleId, vehicle.id), inArray(rides.status, ['COMPLETED', 'CANCELLED'])))
    .orderBy(desc(rides.createdAt));
}

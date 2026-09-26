import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { normalizePhone } from '@seat-ase/shared';
import { db } from '../db/client.js';
import { rideEvents, rideRequests, rides, users, vehicles, zones, places } from '../db/schema.js';
import { PASSENGERS, DRIVERS } from '../db/seed/cast.js';
import { seedDrivers } from '../db/seed/drivers.js';
import { seedPassengers } from '../db/seed/passengers.js';
import { AppError } from '../lib/AppError.js';
import { goOnline } from './vehicleService.js';
import { createRequest, ACTIVE_BOOKING_STATUSES } from './rideRequestService.js';
import { acceptRequest } from './driverRideService.js';

// ---- Reset: only rides, requests and events go. Zones, places, distances and every user stay (base world only) ----

export async function resetWorld() {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.update(vehicles).set({ isOnline: false });
  await seedDrivers();
  await seedPassengers();
}

// ---- Cast and places, looked up by the same phones the seed uses ----

async function userByPhone(phone) {
  const [user] = await db.select().from(users).where(eq(users.phone, normalizePhone(phone)));
  if (!user) throw new AppError(409, 'CAST_MISSING', 'The demo cast is missing. Run the seeds first.');
  return user;
}

async function cast() {
  const byName = {};
  for (const member of [...DRIVERS, ...PASSENGERS]) byName[member.name] = await userByPhone(member.phone);
  return byName;
}

async function zoneCentre(name) {
  const [zone] = await db.select().from(zones).where(eq(zones.name, name));
  return zone;
}

async function bookRide(passenger, dropZoneName, { seats = 1, womenOnly = false } = {}) {
  const [stand] = await db.select().from(places).where(eq(places.name, 'Banani Road 11 police box'));
  const drop = await zoneCentre(dropZoneName);
  const body = {
    pickupLat: stand.lat,
    pickupLng: stand.lng,
    dropLat: drop.centerLat,
    dropLng: drop.centerLng,
    seats,
    rideType: 'SHARED',
    womenOnly,
  };
  const { request } = await createRequest(passenger, body, `scenario-${passenger.name}-${Date.now()}-${Math.random()}`);
  return request;
}

// ---- The race: every contender's accept runs in its own transaction, and each one reports when that transaction began ----

async function race(contenders) {
  const clock = () => performance.timeOrigin + performance.now();

  const runs = await Promise.all(
    contenders.map(async (contender) => {
      const run = { label: contender.label };
      try {
        await acceptRequest(contender.driverId, contender.requestId, {
          onTransactionStart: async (tx) => {
            if (run.startedAtMs !== undefined) return;
            run.startedAtMs = clock();
            const { rows } = await tx.execute(sql`select pg_backend_pid() as pid`);
            run.backendPid = rows[0].pid;
          },
        });
        run.outcome = 'won';
        run.status = 200;
      } catch (err) {
        run.outcome = 'lost';
        run.status = err.status ?? 500;
        run.code = err.code ?? 'ERROR';
        run.message = err.message;
      }
      run.finishedAtMs = clock();
      return run;
    }),
  );

  const first = Math.min(...runs.map((run) => run.startedAtMs));
  const contendersOut = runs.map((run) => ({
    ...run,
    startedAt: new Date(run.startedAtMs).toISOString(),
    offsetMs: round(run.startedAtMs - first),
    durationMs: round(run.finishedAtMs - run.startedAtMs),
  }));

  const starts = runs.map((run) => run.startedAtMs);
  const finishes = runs.map((run) => run.finishedAtMs);
  return {
    contenders: contendersOut,
    startsApartMs: round(Math.max(...starts) - Math.min(...starts)),
    overlapped: Math.max(...starts) < Math.min(...finishes),
    distinctConnections: new Set(runs.map((run) => run.backendPid)).size === runs.length,
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

// ---- What the database recorded for the ride: the proof that only one accept counted ----

async function eventLog(rideIds) {
  if (rideIds.length === 0) return [];
  const rows = await db
    .select({
      type: rideEvents.type,
      fromStatus: rideEvents.fromStatus,
      toStatus: rideEvents.toStatus,
      at: rideEvents.createdAt,
      passenger: users.name,
    })
    .from(rideEvents)
    .leftJoin(rideRequests, eq(rideRequests.id, rideEvents.requestId))
    .leftJoin(users, eq(users.id, rideRequests.passengerId))
    .where(inArray(rideEvents.rideId, rideIds))
    .orderBy(asc(rideEvents.createdAt));
  return rows;
}

async function bookedSeats(rideId) {
  const matched = await db
    .select({ seats: rideRequests.seats })
    .from(rideRequests)
    .where(and(eq(rideRequests.rideId, rideId), inArray(rideRequests.status, ACTIVE_BOOKING_STATUSES)));
  return matched.reduce((sum, row) => sum + row.seats, 0);
}

// ---- Scenario B: one seat left, two passengers, one Tesla ----

export async function seatRace() {
  await resetWorld();
  const people = await cast();
  const banani = await zoneCentre('Banani');
  await goOnline(people.Jashim.id, banani.id);

  const rafiqRequest = await bookRide(people.Rafiq, 'Gulshan 1', { seats: 2 });
  await acceptRequest(people.Jashim.id, rafiqRequest.id);
  const nusratRequest = await bookRide(people.Nusrat, 'Mohakhali');
  const shirinRequest = await bookRide(people.Shirin, 'Mohakhali');

  const outcome = await race([
    { label: 'Nusrat', driverId: people.Jashim.id, requestId: nusratRequest.id },
    { label: 'Shirin', driverId: people.Jashim.id, requestId: shirinRequest.id },
  ]);

  const allRides = await db.select().from(rides);
  const [ride] = allRides;
  const booked = await bookedSeats(ride.id);
  return {
    scenario: 'seat-race',
    title: 'One seat left, two passengers',
    ...outcome,
    ride: { seatsTaken: ride.seatsTaken, capacity: ride.capacity, seatsBooked: booked },
    seatInvariantHolds: ride.seatsTaken <= ride.capacity && ride.seatsTaken === booked,
    events: await eventLog(allRides.map((row) => row.id)),
  };
}

// ---- Two Teslas, one request ----

export async function twoDrivers() {
  await resetWorld();
  const people = await cast();
  const banani = await zoneCentre('Banani');
  await goOnline(people.Jashim.id, banani.id);
  await goOnline(people.Mokbul.id, banani.id);

  const shirinRequest = await bookRide(people.Shirin, 'Mohakhali', { womenOnly: true });
  const outcome = await race([
    { label: 'Jashim', driverId: people.Jashim.id, requestId: shirinRequest.id },
    { label: 'Mokbul', driverId: people.Mokbul.id, requestId: shirinRequest.id },
  ]);

  const allRides = await db.select().from(rides);
  const booked = allRides.length === 1 ? await bookedSeats(allRides[0].id) : 0;
  return {
    scenario: 'two-drivers',
    title: 'Two Teslas, one request',
    ...outcome,
    ride: allRides.length === 1 ? { seatsTaken: allRides[0].seatsTaken, capacity: allRides[0].capacity, seatsBooked: booked } : null,
    ridesCreated: allRides.length,
    seatInvariantHolds: allRides.length === 1 && allRides[0].seatsTaken === booked,
    events: await eventLog(allRides.map((row) => row.id)),
  };
}

// ---- One scenario at a time: two visitors clicking at once would wipe each other's setup ----

let running = false;

export const SCENARIOS = {
  reset: async () => {
    await resetWorld();
    return { scenario: 'reset', title: 'Rides, requests and events cleared; the map and the cast are untouched' };
  },
  'seat-race': seatRace,
  'two-drivers': twoDrivers,
};

export async function runScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new AppError(404, 'NOT_FOUND', 'No such scenario.');
  if (running) throw new AppError(409, 'SCENARIO_BUSY', 'Another scenario is running. Try again in a moment.');
  running = true;
  try {
    return await scenario();
  } finally {
    running = false;
  }
}

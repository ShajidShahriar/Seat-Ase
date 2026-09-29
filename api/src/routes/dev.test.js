import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const DEMO_KEY = vi.hoisted(() => {
  const key = 'test-demo-key-that-is-long-enough-0123456789';
  process.env.DEMO_MODE = 'true';
  process.env.DEMO_KEY = key;
  return key;
});

import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, zones, places, zoneDistances, rides, rideRequests, rideEvents } from '../db/schema.js';
import { createDemoGuard } from '../middleware/demoGuard.js';
import { listenOnLoopback, closeLoopbackServers } from '../test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

const run = (name, key = DEMO_KEY) => request(api).post(`/dev/scenario/${name}`).set('X-Demo-Key', key);

async function count(table) {
  return (await db.select().from(table)).length;
}

describe('who can reach /dev', () => {
  it('does not exist when demo mode is off or no key is configured', () => {
    const next = vi.fn();
    createDemoGuard({ DEMO_MODE: false, DEMO_KEY: 'a-key' })({ get: () => 'a-key' }, {}, next);
    createDemoGuard({ DEMO_MODE: true, DEMO_KEY: undefined })({ get: () => 'anything' }, {}, next);
    expect(next.mock.calls[0][0].status).toBe(404);
    expect(next.mock.calls[1][0].status).toBe(404);
  });

  it('answers 401 without the key or with a wrong one', async () => {
    expect((await request(api).post('/dev/scenario/reset')).status).toBe(401);
    const wrong = await run('reset', 'not-the-key');
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('DEMO_KEY_REQUIRED');
  });

  it('answers 404 for a scenario that does not exist', async () => {
    expect((await run('no-such-scenario')).status).toBe(404);
  });
});

describe('reset only touches the demo cast, and deletes nothing', () => {
  it("ends the cast's rides and bookings, keeps every row, and never touches the map or the users", async () => {
    await run('seat-race');
    const before = {
      rides: await count(rides),
      requests: await count(rideRequests),
      events: await count(rideEvents),
      map: { zones: await count(zones), places: await count(places), distances: await count(zoneDistances), users: await count(users) },
    };
    expect(before.rides).toBe(1);

    const res = await run('reset');
    expect(res.status).toBe(200);

    expect(await count(rides)).toBe(before.rides);
    expect(await count(rideRequests)).toBe(before.requests);
    expect(await count(rideEvents)).toBeGreaterThan(before.events);
    expect({ zones: await count(zones), places: await count(places), distances: await count(zoneDistances), users: await count(users) }).toEqual(before.map);

    const allRides = await db.select().from(rides);
    expect(allRides.map((r) => [r.status, r.seatsTaken])).toEqual([['CANCELLED', 0]]);
    const bookings = await db.select().from(rideRequests);
    expect(bookings.every((b) => b.status === 'CANCELLED' || b.status === 'EXPIRED')).toBe(true);
    const resetEvents = (await db.select().from(rideEvents)).filter((e) => e.type === 'DEMO_RESET');
    expect(resetEvents.length).toBeGreaterThan(0);
    expect((await db.select().from(vehicles)).every((v) => !v.isOnline)).toBe(true);
  });

  it("leaves someone else's finished trip, waiting booking and online car exactly as they were", async () => {
    const zoneRows = await db.select().from(zones);
    const banani = zoneRows.find((z) => z.name === 'Banani');
    const mohakhali = zoneRows.find((z) => z.name === 'Mohakhali');
    const trip = { pickupLat: banani.centerLat, pickupLng: banani.centerLng, dropLat: mohakhali.centerLat, dropLng: mohakhali.centerLng, seats: 1, rideType: 'SHARED', womenOnly: false };

    const driver = request.agent(api);
    await driver.post('/auth/signup').send({ name: 'Karim', phone: '01800000001', password: 'password123', role: 'DRIVER', gender: 'MALE', nid: '3000000001' });
    await driver.post('/driver/vehicle').send({ name: 'Other', registrationNo: 'DHAKA-METRO-GA-99-9999', capacity: 3 });
    await driver.post('/driver/online').send({ zoneId: banani.id });

    async function evaluator(phone, nid, key) {
      const agent = request.agent(api);
      await agent.post('/auth/signup').send({ name: 'Evaluator', phone, password: 'password123', role: 'PASSENGER', gender: 'FEMALE', nid });
      const sent = await agent.post('/auth/otp/send');
      await agent.post('/auth/otp/verify').send({ code: sent.body.demoCode });
      return (await agent.post('/requests').set('Idempotency-Key', key).send(trip).expect(201)).body.request.id;
    }
    const finishedId = await evaluator('01800000002', '3000000002', 'e1');
    await driver.post(`/driver/ride/requests/${finishedId}/accept`).expect(200);
    await driver.post('/driver/ride/arrived').expect(200);
    await driver.post(`/driver/ride/requests/${finishedId}/board`).expect(200);
    await driver.post('/driver/ride/start').expect(200);
    await driver.post(`/driver/ride/requests/${finishedId}/drop`).expect(200);
    await driver.post('/driver/online').send({ zoneId: banani.id }).expect(200);
    const waitingId = await evaluator('01800000003', '3000000003', 'e2');
    const eventsBefore = await count(rideEvents);

    expect((await run('reset')).status).toBe(200);

    const byId = new Map((await db.select().from(rideRequests)).map((b) => [b.id, b]));
    expect(byId.get(finishedId).status).toBe('COMPLETED');
    expect(byId.get(waitingId).status).toBe('REQUESTED');
    const [karimsCar] = (await db.select().from(vehicles)).filter((v) => v.registrationNo === 'DHAKA-METRO-GA-99-9999');
    expect(karimsCar.isOnline).toBe(true);
    expect(await count(rideEvents)).toBe(eventsBefore);
  });
});

describe('seat-race: one seat left, two passengers', () => {
  it('gives the seat to exactly one, from two separate connections, whose transactions overlapped', async () => {
    const res = await run('seat-race');
    expect(res.status).toBe(200);

    const { contenders, ride, seatInvariantHolds, distinctConnections, overlapped, startsApartMs } = res.body;
    expect(contenders.map((c) => c.outcome).sort()).toEqual(['lost', 'won']);
    expect(contenders.find((c) => c.outcome === 'won').status).toBe(200);
    expect(contenders.find((c) => c.outcome === 'lost').status).toBe(409);
    expect(ride).toEqual({ seatsTaken: 3, capacity: 3, seatsBooked: 3 });
    expect(seatInvariantHolds).toBe(true);
    expect(distinctConnections).toBe(true);
    expect(overlapped).toBe(true);
    expect(startsApartMs).toBeLessThan(250);
    for (const c of contenders) {
      expect(new Date(c.startedAt).toISOString()).toBe(c.startedAt);
      expect(typeof c.backendPid).toBe('number');
    }
  });

  it('logs only one match for the last seat: the event log proves the loser never counted', async () => {
    const { body } = await run('seat-race');
    const matched = body.events.filter((event) => event.type === 'REQUEST_MATCHED').map((event) => event.passenger);
    expect(matched).toHaveLength(2);
    expect(matched[0]).toBe('Rafiq');
    const winner = body.contenders.find((c) => c.outcome === 'won').label;
    expect(matched[1]).toBe(winner);
  });

  it('holds up when run ten times in a row', async () => {
    for (let i = 0; i < 10; i++) {
      const { body } = await run('seat-race');
      expect(body.contenders.map((c) => c.outcome).sort()).toEqual(['lost', 'won']);
      expect(body.seatInvariantHolds).toBe(true);
      expect(body.distinctConnections).toBe(true);
    }
  }, 60_000);
});

describe('two-drivers: two Teslas, one request', () => {
  it('lets exactly one driver have it and creates exactly one ride', async () => {
    const res = await run('two-drivers');
    expect(res.status).toBe(200);
    expect(res.body.contenders.map((c) => c.outcome).sort()).toEqual(['lost', 'won']);
    expect(res.body.ridesCreated).toBe(1);
    expect(res.body.seatInvariantHolds).toBe(true);
    expect(res.body.distinctConnections).toBe(true);
  });
});

describe('one scenario at a time', () => {
  it('turns the second of two simultaneous runs away with 409', async () => {
    const [a, b] = await Promise.all([run('seat-race'), run('seat-race')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const busy = [a, b].find((r) => r.status === 409);
    expect(busy.body.error.code).toBe('SCENARIO_BUSY');
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides, places, zones } from '../db/schema.js';
import { listenOnLoopback, closeLoopbackServers } from '../test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

const BANANI_LAT = 23.7937;
const BANANI_LNG = 90.4076;
const MOHAKHALI = { lat: 23.7805, lng: 90.4053 };
const GULSHAN1 = { lat: 23.7808, lng: 90.4142 };
const TEJGAON = { lat: 23.7644, lng: 90.3938 };

let bananiZoneId;

beforeAll(async () => {
  const [zone] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
  bananiZoneId = zone.id;
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

async function driverAgent(name, phone, nid, capacity = 3) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name, phone, password: 'password123', role: 'DRIVER', gender: 'MALE', nid });
  await agent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: `REG-${phone}`, capacity });
  await agent.post('/driver/online').send({ zoneId: bananiZoneId });
  return agent;
}

async function passengerAgent(name, phone, gender, nid) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name, phone, password: 'password123', role: 'PASSENGER', gender, nid });
  const sendRes = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
  return agent;
}

async function requestRide(agent, key, { drop, seats = 1, rideType = 'SHARED', womenOnly = false, pickupLat = BANANI_LAT, pickupLng = BANANI_LNG }) {
  const res = await agent
    .post('/requests')
    .set('Idempotency-Key', key)
    .send({ pickupLat, pickupLng, dropLat: drop.lat, dropLng: drop.lng, seats, rideType, womenOnly });
  return res.body.request.id;
}

describe('Scenario A: the morning pool', () => {
  it('Jashim accepts Nusrat then Rafiq; Shirin women-only does not fit', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');

    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    const shirinReq = await requestRide(shirin, 's1', { drop: MOHAKHALI, womenOnly: true });

    const listBefore = await jashim.get('/driver/requests');
    expect(listBefore.body.requests).toHaveLength(3);

    const acceptNusrat = await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    expect(acceptNusrat.status).toBe(200);
    expect(acceptNusrat.body.request.fareCapPoysha).toBe(11500);

    const acceptRafiq = await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);
    expect(acceptRafiq.status).toBe(200);

    const [nusratRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    const [rafiqRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, rafiqReq));
    expect(nusratRow.fareCapPoysha).toBe(9625);
    expect(rafiqRow.fareCapPoysha).toBe(7750);

    const acceptShirin = await jashim.post(`/driver/ride/requests/${shirinReq}/accept`);
    expect(acceptShirin.status).toBe(409);
    expect(acceptShirin.body.error.code).toBe('DOES_NOT_FIT');

    const [ride] = await db.select().from(rides);
    expect(ride.seatsTaken).toBe(2);
    expect(ride.capacity).toBe(3);
  });
});

describe('Scenario B: last-seat race', () => {
  it('exactly one of two simultaneous accepts wins the last seat, 20 times running', async () => {
    for (let i = 0; i < 20; i++) {
      const jashim = await driverAgent('Jashim', `0171${String(i).padStart(7, '0')}`, `31${String(i).padStart(8, '0')}`);
      const filler = await passengerAgent('Filler', `0172${String(i).padStart(7, '0')}`, 'MALE', `32${String(i).padStart(8, '0')}`);
      const nusrat = await passengerAgent('Nusrat', `0173${String(i).padStart(7, '0')}`, 'FEMALE', `33${String(i).padStart(8, '0')}`);
      const shirin = await passengerAgent('Shirin', `0174${String(i).padStart(7, '0')}`, 'FEMALE', `34${String(i).padStart(8, '0')}`);

      const fillerReq = await requestRide(filler, `f${i}`, { drop: GULSHAN1, seats: 2 });
      const nusratReq = await requestRide(nusrat, `n${i}`, { drop: MOHAKHALI });
      const shirinReq = await requestRide(shirin, `s${i}`, { drop: MOHAKHALI });

      const fillerAccept = await jashim.post(`/driver/ride/requests/${fillerReq}/accept`);
      expect(fillerAccept.status).toBe(200);

      const [a, b] = await Promise.all([
        jashim.post(`/driver/ride/requests/${nusratReq}/accept`),
        jashim.post(`/driver/ride/requests/${shirinReq}/accept`),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);

      const [ride] = await db.select().from(rides);
      expect(ride.seatsTaken).toBe(3);
      expect(ride.seatsTaken).toBeLessThanOrEqual(ride.capacity);

      await db.delete(rideEvents);
      await db.delete(rideRequests);
      await db.delete(rides);
      await db.delete(vehicles);
      await db.delete(otpCodes);
      await db.delete(users);
    }
  }, 30_000);

  it('two different drivers racing for the same booking: exactly one wins', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const mokbul = await driverAgent('Mokbul', '01700000011', '1000000002');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');

    const shirinReq = await requestRide(shirin, 's1', { drop: MOHAKHALI, womenOnly: true });

    const [a, b] = await Promise.all([
      jashim.post(`/driver/ride/requests/${shirinReq}/accept`),
      mokbul.post(`/driver/ride/requests/${shirinReq}/accept`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const allRides = await db.select().from(rides);
    expect(allRides).toHaveLength(1);
  });
});

describe('Scenario C: women-only', () => {
  it("Mokbul accepts Shirin's women-only request; Rafiq then cannot join", async () => {
    const mokbul = await driverAgent('Mokbul', '01700000011', '1000000002');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');

    const shirinReq = await requestRide(shirin, 's1', { drop: MOHAKHALI, womenOnly: true });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });

    const acceptShirin = await mokbul.post(`/driver/ride/requests/${shirinReq}/accept`);
    expect(acceptShirin.status).toBe(200);

    const acceptRafiq = await mokbul.post(`/driver/ride/requests/${rafiqReq}/accept`);
    expect(acceptRafiq.status).toBe(409);
    expect(acceptRafiq.body.error.code).toBe('DOES_NOT_FIT');
  });
});

describe('Scenario D: private hire', () => {
  it("Nusrat hires the whole Tesla; nobody else can join, fare is 34500", async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');

    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI, rideType: 'PRIVATE', pickupLat: 23.794, pickupLng: 90.407 });
    const accept = await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.ride.seatsTaken).toBe(3);
    expect(accept.body.ride.isPrivate).toBe(true);
    expect(accept.body.request.fareCapPoysha).toBe(34500);

    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    const acceptRafiq = await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);
    expect(acceptRafiq.status).toBe(409);
  });
});

describe('GET /driver/requests: what a driver is shown before accepting', () => {
  it('a shared request shows its stand and area but nothing about the passenger', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');
    await requestRide(shirin, 's1', { drop: MOHAKHALI, womenOnly: true, seats: 2 });

    const [card] = (await jashim.get('/driver/requests')).body.requests;
    expect(card).toMatchObject({
      pickupStandName: 'Banani Road 11 police box',
      pickupZoneName: 'Banani',
      rideType: 'SHARED',
      womenOnly: true,
      seats: 2,
      fits: true,
    });
    for (const secret of ['passengerId', 'name', 'phone', 'gender', 'nid', 'pickupLat', 'pickupLng']) {
      expect(card).not.toHaveProperty(secret);
    }
  });

  it('a private request hides the stand and the door pin until it is accepted', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    await requestRide(nusrat, 'n1', { drop: MOHAKHALI, rideType: 'PRIVATE', pickupLat: 23.794, pickupLng: 90.407 });

    const [card] = (await jashim.get('/driver/requests')).body.requests;
    expect(card).toMatchObject({ rideType: 'PRIVATE', pickupStandId: null, pickupStandName: null, pickupZoneName: 'Banani' });
    expect(card).not.toHaveProperty('pickupLat');
    expect(card).not.toHaveProperty('pickupLng');
  });
});

describe('Scenario E: three destinations from one stand', () => {
  it('Nusrat, Rafiq and Shirin all fit; fares match the design exactly', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');

    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    const shirinReq = await requestRide(shirin, 's1', { drop: TEJGAON });

    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);
    const acceptShirin = await jashim.post(`/driver/ride/requests/${shirinReq}/accept`);
    expect(acceptShirin.status).toBe(200);

    const [nusratRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    const [rafiqRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, rafiqReq));
    const [shirinRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, shirinReq));
    expect(nusratRow.fareCapPoysha).toBe(9625);
    expect(rafiqRow.fareCapPoysha).toBe(7750);
    expect(shirinRow.fareCapPoysha).toBe(11500);

    const [ride] = await db.select().from(rides);
    expect(ride.seatsTaken).toBe(3);
  });
});

describe('database CHECK constraint (last line of defence)', () => {
  it('refuses seats_taken > capacity even via a direct update', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);

    const [ride] = await db.select().from(rides);
    await expect(db.update(rides).set({ seatsTaken: 4 }).where(eq(rides.id, ride.id))).rejects.toThrow();
  });
});

describe('driver cancels the whole ride', () => {
  it('sends every matched booking back to REQUESTED, not CANCELLED', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);

    const cancelRes = await jashim.post('/driver/ride/cancel');
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ride.status).toBe('CANCELLED');

    const [row] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    expect(row.status).toBe('REQUESTED');
    expect(row.rideId).toBeNull();
    expect(row.fareCapPoysha).toBeNull();
  });
});

describe('passenger cancels a MATCHED booking', () => {
  it('frees seats without cancelling the ride if others remain', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);

    const cancelRes = await rafiq.post(`/requests/${rafiqReq}/cancel`);
    expect(cancelRes.status).toBe(200);

    const [ride] = await db.select().from(rides);
    expect(ride.status).toBe('OPEN');
    expect(ride.seatsTaken).toBe(1);
  });

  it('auto-cancels the ride when the last passenger cancels', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);

    const cancelRes = await nusrat.post(`/requests/${nusratReq}/cancel`);
    expect(cancelRes.status).toBe(200);

    const [ride] = await db.select().from(rides);
    expect(ride.status).toBe('CANCELLED');
    expect(ride.seatsTaken).toBe(0);
  });
});

describe('seat invariant', () => {
  it('seats_taken always equals the sum of active bookings’ seats', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');

    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1, seats: 2 });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);

    const [ride] = await db.select().from(rides);
    const active = await db
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.rideId, ride.id));
    const activeSum = active.filter((r) => r.status === 'MATCHED').reduce((sum, r) => sum + r.seats, 0);
    expect(ride.seatsTaken).toBe(activeSum);

    await rafiq.post(`/requests/${rafiqReq}/cancel`);
    const [rideAfter] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(rideAfter.seatsTaken).toBe(1);
  });
});

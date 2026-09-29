import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides, zones } from '../db/schema.js';
import { listenOnLoopback, closeLoopbackServers } from '../test/loopback.js';
import { verifyPhone } from '../test/verifyPhone.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

const BANANI = { lat: 23.7937, lng: 90.4076 };
const MOHAKHALI = { lat: 23.7805, lng: 90.4053 };
const GULSHAN1 = { lat: 23.7808, lng: 90.4142 };

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

async function driverAgent(name = 'Jashim Uddin', phone = '01700000010', nid = '1000000001', plate = 'DHAKA-METRO-GA-11-1111') {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name, phone, password: 'password123', role: 'DRIVER', gender: 'MALE', nid });
  await verifyPhone(agent);
  await agent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: plate, capacity: 3 });
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

async function requestRide(agent, key, { drop, rideType = 'SHARED', pickup = BANANI }) {
  const res = await agent
    .post('/requests')
    .set('Idempotency-Key', key)
    .send({ pickupLat: pickup.lat, pickupLng: pickup.lng, dropLat: drop.lat, dropLng: drop.lng, seats: 1, rideType, womenOnly: false });
  return res.body.request.id;
}

async function pooledRide() {
  const jashim = await driverAgent();
  const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
  const rafiq = await passengerAgent('Rafiq Ahmed', '01700000031', 'MALE', '2000000002');
  const nusratId = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
  const rafiqId = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
  return { jashim, nusrat, rafiq, nusratId, rafiqId };
}

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000);

async function matchedRide() {
  const jashim = await driverAgent();
  const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
  const nusratId = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
  await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
  const [ride] = await db.select().from(rides);
  return { jashim, nusrat, nusratId, ride };
}

describe('a driver who accepts but never reaches the stand (15 minutes)', () => {
  it('leaves the ride alone at 14 minutes', async () => {
    const { nusrat, nusratId, ride } = await matchedRide();
    await db.update(rides).set({ createdAt: minutesAgo(14) }).where(eq(rides.id, ride.id));

    expect((await nusrat.get(`/requests/${nusratId}`)).body.request.status).toBe('MATCHED');
    const [still] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(still.status).toBe('OPEN');
  });

  it('after 15 minutes cancels the ride and puts the passenger back in the queue, not out of it', async () => {
    const { nusrat, nusratId, ride } = await matchedRide();
    await db.update(rides).set({ createdAt: minutesAgo(16) }).where(eq(rides.id, ride.id));

    const booking = (await nusrat.get(`/requests/${nusratId}`)).body.request;
    expect(booking.status).toBe('REQUESTED');
    expect(booking.rideId).toBeNull();
    expect(booking.fareCapPoysha).toBeNull();
    expect(Date.now() - new Date(booking.queuedAt).getTime()).toBeLessThan(60 * 1000);

    const [cancelled] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.seatsTaken).toBe(0);

    const timeline = (await nusrat.get(`/requests/${nusratId}/timeline`)).body.timeline.map((e) => e.type);
    expect(timeline).toContain('RIDE_ABANDONED');
  });

  it('frees the driver: no current ride, and his next accept starts a new one', async () => {
    const { jashim, ride } = await matchedRide();
    await db.update(rides).set({ createdAt: minutesAgo(16) }).where(eq(rides.id, ride.id));

    expect((await jashim.get('/driver/ride')).body.ride).toBeNull();
    const rafiq = await passengerAgent('Rafiq Ahmed', '01700000031', 'MALE', '2000000002');
    const rafiqId = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    const accept = await jashim.post(`/driver/ride/requests/${rafiqId}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.ride.id).not.toBe(ride.id);
  });

  it('gives the returned passenger to another driver', async () => {
    const { nusratId, ride } = await matchedRide();
    await db.update(rides).set({ createdAt: minutesAgo(16) }).where(eq(rides.id, ride.id));
    const mokbul = await driverAgent('Mokbul Hossain', '01700000011', '1000000002', 'DHAKA-METRO-GA-22-2222');

    const waiting = (await mokbul.get('/driver/requests')).body.requests.map((r) => r.id);
    expect(waiting).toContain(nusratId);
    expect((await mokbul.post(`/driver/ride/requests/${nusratId}/accept`)).status).toBe(200);
  });

  it('never touches a ride whose driver has arrived, however old', async () => {
    const { jashim, nusrat, nusratId, ride } = await matchedRide();
    await jashim.post('/driver/ride/arrived');
    await db.update(rides).set({ createdAt: minutesAgo(40) }).where(eq(rides.id, ride.id));

    expect((await nusrat.get(`/requests/${nusratId}`)).body.request.status).toBe('DRIVER_ARRIVED');
    const [still] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(still.status).toBe('ARRIVED');
  });
});

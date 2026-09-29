import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides, zones } from '../db/schema.js';
import { listenOnLoopback, closeLoopbackServers } from '../test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

const BANANI = { lat: 23.7937, lng: 90.4076 };
const MOHAKHALI = { lat: 23.7805, lng: 90.4053 };

let bananiZoneId;
let mohakhaliZoneId;

beforeAll(async () => {
  [{ id: bananiZoneId }] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
  [{ id: mohakhaliZoneId }] = await db.select().from(zones).where(eq(zones.name, 'Mohakhali'));
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

async function driverOnlineInBanani() {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name: 'Jashim Uddin', phone: '01700000010', password: 'password123', role: 'DRIVER', gender: 'MALE', nid: '1000000001' });
  await agent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 });
  await agent.post('/driver/online').send({ zoneId: bananiZoneId });
  return agent;
}

async function nusratWaiting() {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name: 'Nusrat Jahan', phone: '01700000030', password: 'password123', role: 'PASSENGER', gender: 'FEMALE', nid: '2000000001' });
  const sendRes = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
  const res = await agent
    .post('/requests')
    .set('Idempotency-Key', 'n1')
    .send({ pickupLat: BANANI.lat, pickupLng: BANANI.lng, dropLat: MOHAKHALI.lat, dropLng: MOHAKHALI.lng, seats: 1, rideType: 'SHARED', womenOnly: false });
  return res.body.request.id;
}

async function jashimsVehicle() {
  const [vehicle] = await db.select().from(vehicles);
  return vehicle;
}

describe('going offline or changing area during a ride', () => {
  it('is refused while the ride is open, and nothing changes', async () => {
    const jashim = await driverOnlineInBanani();
    const nusratId = await nusratWaiting();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);

    const offline = await jashim.post('/driver/offline');
    expect(offline.status).toBe(409);
    expect(offline.body.error.code).toBe('RIDE_IN_PROGRESS');

    const move = await jashim.post('/driver/online').send({ zoneId: mohakhaliZoneId });
    expect(move.status).toBe(409);
    expect(move.body.error.code).toBe('RIDE_IN_PROGRESS');

    const vehicle = await jashimsVehicle();
    expect(vehicle.isOnline).toBe(true);
    expect(vehicle.currentZoneId).toBe(bananiZoneId);
  });

  it('is refused once the trip has started', async () => {
    const jashim = await driverOnlineInBanani();
    const nusratId = await nusratWaiting();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);
    await jashim.post('/driver/ride/arrived').expect(200);
    await jashim.post(`/driver/ride/requests/${nusratId}/board`).expect(200);
    await jashim.post('/driver/ride/start').expect(200);

    expect((await jashim.post('/driver/offline')).status).toBe(409);
    expect((await jashim.post('/driver/online').send({ zoneId: mohakhaliZoneId })).status).toBe(409);
  });

  it('works again once the ride is over', async () => {
    const jashim = await driverOnlineInBanani();
    const nusratId = await nusratWaiting();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);
    await jashim.post('/driver/ride/arrived').expect(200);
    await jashim.post(`/driver/ride/requests/${nusratId}/board`).expect(200);
    await jashim.post('/driver/ride/start').expect(200);
    await jashim.post(`/driver/ride/requests/${nusratId}/drop`).expect(200);

    expect((await jashim.post('/driver/online').send({ zoneId: bananiZoneId })).status).toBe(200);
    expect((await jashim.post('/driver/offline')).status).toBe(200);
  });

  it('works when there is no ride at all', async () => {
    const jashim = await driverOnlineInBanani();
    expect((await jashim.post('/driver/online').send({ zoneId: mohakhaliZoneId })).status).toBe(200);
    expect((await jashim.post('/driver/offline')).status).toBe(200);
  });
});

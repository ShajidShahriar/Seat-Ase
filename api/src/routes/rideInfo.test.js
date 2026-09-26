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

async function driverAgent() {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name: 'Jashim Uddin', phone: '01700000010', password: 'password123', role: 'DRIVER', gender: 'MALE', nid: '1000000001' });
  await agent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 });
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

describe('GET /requests/:id/ride', () => {
  it('is null until a driver accepts', async () => {
    const { nusrat, nusratId } = await pooledRide();
    const res = await nusrat.get(`/requests/${nusratId}/ride`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ride: null });
  });

  it("shows the driver's full name, the car, the stand, and the co-riders by first name only", async () => {
    const { jashim, nusrat, nusratId, rafiqId } = await pooledRide();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqId}/accept`);

    const { body } = await nusrat.get(`/requests/${nusratId}/ride`);
    expect(body.ride).toEqual({
      isPrivate: false,
      seatsTaken: 2,
      capacity: 3,
      driverName: 'Jashim Uddin',
      vehicle: { name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111' },
      pickupStandName: 'Banani Road 11 police box',
      pickupZoneName: 'Banani',
      coRiders: [{ firstName: 'Rafiq', dropZoneName: 'Gulshan 1', seats: 1 }],
    });
  });

  it('never carries a co-rider surname, phone, gender, fare or id', async () => {
    const { jashim, nusrat, rafiq, nusratId, rafiqId } = await pooledRide();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqId}/accept`);

    const forNusrat = JSON.stringify((await nusrat.get(`/requests/${nusratId}/ride`)).body);
    for (const secret of ['Ahmed', '01700000031', '8801700000031', 'MALE', 'FEMALE', 'fare', 'Poysha', 'nid', 'passengerId', rafiqId]) {
      expect(forNusrat).not.toContain(secret);
    }

    const forRafiq = JSON.stringify((await rafiq.get(`/requests/${rafiqId}/ride`)).body);
    for (const secret of ['Jahan', '01700000030', '8801700000030', 'fare', 'Poysha', nusratId]) {
      expect(forRafiq).not.toContain(secret);
    }
    expect(forRafiq).toContain('"firstName":"Nusrat"');
  });

  it("is owner-only: someone else's booking is a 404, and a driver or a guest cannot call it", async () => {
    const { jashim, nusratId } = await pooledRide();
    const shirin = await passengerAgent('Shirin Akter', '01700000032', 'FEMALE', '2000000003');
    expect((await shirin.get(`/requests/${nusratId}/ride`)).status).toBe(404);
    expect((await jashim.get(`/requests/${nusratId}/ride`)).status).toBe(403);
    expect((await request(api).get(`/requests/${nusratId}/ride`)).status).toBe(401);
  });

  it('drops a co-rider from the list as soon as they cancel, and gives nothing to the one who left', async () => {
    const { jashim, nusrat, rafiq, nusratId, rafiqId } = await pooledRide();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqId}/accept`);

    await rafiq.post(`/requests/${rafiqId}/cancel`);

    const forNusrat = (await nusrat.get(`/requests/${nusratId}/ride`)).body.ride;
    expect(forNusrat.coRiders).toEqual([]);
    expect(forNusrat.seatsTaken).toBe(1);
    expect((await rafiq.get(`/requests/${rafiqId}/ride`)).body).toEqual({ ride: null });
  });

  it('a private ride shows its stand, and a finished trip keeps the driver and car but no co-riders', async () => {
    const jashim = await driverAgent();
    const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
    const nusratId = await requestRide(nusrat, 'n1', { drop: MOHAKHALI, rideType: 'PRIVATE', pickup: { lat: 23.794, lng: 90.407 } });
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
    expect((await nusrat.get(`/requests/${nusratId}/ride`)).body.ride).toMatchObject({ isPrivate: true, pickupStandName: 'Banani Road 11 police box', driverName: 'Jashim Uddin' });

    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratId}/board`);
    await jashim.post('/driver/ride/start');
    await jashim.post(`/driver/ride/requests/${nusratId}/drop`);

    const done = (await nusrat.get(`/requests/${nusratId}/ride`)).body.ride;
    expect(done).toMatchObject({ driverName: 'Jashim Uddin', vehicle: { name: 'Bullet' }, coRiders: [] });
  });
});

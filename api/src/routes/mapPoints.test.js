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
const MOHAKHALI_BUS_STAND = { lat: 23.7805, lng: 90.4063 };
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

describe('coordinates for the map', () => {
  it("stores the passenger's exact drop point and gives her the stand and the drop point back", async () => {
    const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
    const id = await requestRide(nusrat, 'n1', { drop: MOHAKHALI_BUS_STAND });

    const [row] = await db.select().from(rideRequests).where(eq(rideRequests.id, id));
    expect({ lat: row.dropLat, lng: row.dropLng }).toEqual(MOHAKHALI_BUS_STAND);

    const one = (await nusrat.get(`/requests/${id}`)).body.request;
    expect(one.pickupStand).toEqual({ name: 'Banani Road 11 police box', lat: 23.7937, lng: 90.4076 });
    expect(one.dropPoint).toEqual(MOHAKHALI_BUS_STAND);
    const [listed] = (await nusrat.get('/requests')).body.requests;
    expect(listed.dropPoint).toEqual(MOHAKHALI_BUS_STAND);
  });

  it('falls back to the drop zone centre for a booking made before drop points were stored', async () => {
    const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
    const id = await requestRide(nusrat, 'n1', { drop: MOHAKHALI_BUS_STAND });
    await db.update(rideRequests).set({ dropLat: null, dropLng: null }).where(eq(rideRequests.id, id));
    expect((await nusrat.get(`/requests/${id}`)).body.request.dropPoint).toEqual({ lat: 23.7805, lng: 90.4053 });
  });

  it('a driver sees the stand on the waiting list but no drop point until he accepts', async () => {
    const jashim = await driverAgent();
    const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
    await requestRide(nusrat, 'n1', { drop: MOHAKHALI_BUS_STAND });

    const [card] = (await jashim.get('/driver/requests')).body.requests;
    expect(card.pickupStand).toEqual({ name: 'Banani Road 11 police box', lat: 23.7937, lng: 90.4076 });
    const text = JSON.stringify(card);
    expect(text).not.toContain('dropPoint');
    expect(text).not.toContain(String(MOHAKHALI_BUS_STAND.lng));
  });

  it('after accepting, the driver gets the stand and each passenger\'s drop point', async () => {
    const jashim = await driverAgent();
    const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
    const id = await requestRide(nusrat, 'n1', { drop: MOHAKHALI_BUS_STAND });
    await jashim.post(`/driver/ride/requests/${id}/accept`);

    const { ride, passengers } = (await jashim.get('/driver/ride')).body;
    expect(ride.pickupStand).toEqual({ name: 'Banani Road 11 police box', lat: 23.7937, lng: 90.4076 });
    expect(passengers[0].dropPoint).toEqual(MOHAKHALI_BUS_STAND);
    expect(passengers[0]).not.toHaveProperty('dropZoneLat');
  });

  it("a co-rider's drop point never reaches another passenger", async () => {
    const jashim = await driverAgent();
    const nusrat = await passengerAgent('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq Ahmed', '01700000031', 'MALE', '2000000002');
    const rafiqDrop = { lat: 23.7818, lng: 90.4152 };
    const nusratId = await requestRide(nusrat, 'n1', { drop: MOHAKHALI_BUS_STAND });
    const rafiqId = await requestRide(rafiq, 'r1', { drop: rafiqDrop });
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqId}/accept`);

    const forNusrat = JSON.stringify((await nusrat.get(`/requests/${nusratId}/ride`)).body);
    expect(forNusrat).toContain('"pickupStand"');
    expect(forNusrat).not.toContain(String(rafiqDrop.lat));
    expect(forNusrat).not.toContain(String(rafiqDrop.lng));
  });
});

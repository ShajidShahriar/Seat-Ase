import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, zones, places, rideEvents, rideRequests, rides } from '../db/schema.js';

const nusrat = {
  name: 'Nusrat',
  phone: '01700000030',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'FEMALE',
  nid: '1234567890',
};

const jashim = {
  name: 'Jashim',
  phone: '01700000010',
  password: 'password123',
  role: 'DRIVER',
  gender: 'MALE',
  nid: '1234567891',
};

let bananiZoneId;
let mohakhaliZoneId;
let bananiStand;

beforeAll(async () => {
  const [banani] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
  const [mohakhali] = await db.select().from(zones).where(eq(zones.name, 'Mohakhali'));
  bananiZoneId = banani.id;
  mohakhaliZoneId = mohakhali.id;
  [bananiStand] = await db.select().from(places).where(eq(places.name, 'Banani Road 11 police box'));
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(users);
});

async function signedInAgent(user) {
  const agent = request.agent(app);
  await agent.post('/auth/signup').send(user);
  return agent;
}

describe('GET /places', () => {
  it('requires login', async () => {
    const res = await request(app).get('/places?q=banani');
    expect(res.status).toBe(401);
  });

  it('finds seeded Banani places', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.get('/places?q=banani');
    expect(res.status).toBe(200);
    expect(res.body.places.map((p) => p.name)).toContain('Banani Road 11 police box');
  });

  it('does not let a literal % match every place (fix #45)', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.get('/places').query({ q: '%' });
    expect(res.body.places).toEqual([]);
  });

  it('does not let a literal _ match every place', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.get('/places').query({ q: '_' });
    expect(res.body.places).toEqual([]);
  });
});

describe('POST /places/nearest-stand', () => {
  it('snaps a pin on the Banani stand to that exact stand', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/places/nearest-stand').send({ lat: bananiStand.lat, lng: bananiStand.lng });
    expect(res.status).toBe(200);
    expect(res.body.stand.name).toBe('Banani Road 11 police box');
    expect(res.body.zone.name).toBe('Banani');
    expect(res.body.distanceMeters).toBe(0);
  });

  it('rejects a pin far outside Dhaka (fix #39)', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/places/nearest-stand').send({ lat: 22.3569, lng: 91.7832 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });

  it('rejects an out-of-range latitude before touching the database', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/places/nearest-stand').send({ lat: 200, lng: 90 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /zones/:zoneId/online-count', () => {
  it('counts online, non-stale drivers in a zone', async () => {
    const passengerAgent = await signedInAgent(nusrat);
    const before = await passengerAgent.get(`/zones/${bananiZoneId}/online-count`);
    expect(before.body.count).toBe(0);

    const driverAgent = await signedInAgent(jashim);
    await driverAgent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 });
    await driverAgent.post('/driver/online').send({ zoneId: bananiZoneId });

    const after = await passengerAgent.get(`/zones/${bananiZoneId}/online-count`);
    expect(after.body.count).toBe(1);
  });

  it('excludes a stale driver even if isOnline is still true', async () => {
    const driverAgent = await signedInAgent(jashim);
    await driverAgent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 });
    await driverAgent.post('/driver/online').send({ zoneId: bananiZoneId });
    const [{ id: userId }] = await db.select({ id: users.id }).from(users).where(eq(users.phone, '+8801700000010'));
    await db.update(vehicles).set({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(vehicles.driverId, userId));

    const passengerAgent = await signedInAgent(nusrat);
    const res = await passengerAgent.get(`/zones/${bananiZoneId}/online-count`);
    expect(res.body.count).toBe(0);
  });

  it('does not count a driver online in a different zone', async () => {
    const driverAgent = await signedInAgent(jashim);
    await driverAgent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 });
    await driverAgent.post('/driver/online').send({ zoneId: mohakhaliZoneId });

    const passengerAgent = await signedInAgent(nusrat);
    const res = await passengerAgent.get(`/zones/${bananiZoneId}/online-count`);
    expect(res.body.count).toBe(0);
  });
});

describe('POST /fares/estimate', () => {
  it('matches Nusrat’s pooled and solo fares for Banani -> Mohakhali', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/fares/estimate').send({ pickupZoneId: bananiZoneId, dropZoneId: mohakhaliZoneId, seats: 1 });
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(3);
    expect(res.body.soloPoysha).toBe(11500);
    expect(res.body.pooledPoysha).toBe(9625);
    expect(res.body.privatePoysha).toBe(34500);
  });

  it('treats the same pickup and drop zone as 0km', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/fares/estimate').send({ pickupZoneId: bananiZoneId, dropZoneId: bananiZoneId, seats: 1 });
    expect(res.body.distanceKm).toBe(0);
    expect(res.body.soloPoysha).toBe(4000);
  });
});

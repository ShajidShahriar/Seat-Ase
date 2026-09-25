import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, zones, rideEvents, rideRequests, rides } from '../db/schema.js';
import { listenOnLoopback, closeLoopbackServers } from '../test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

const jashim = {
  name: 'Jashim',
  phone: '01700000010',
  password: 'password123',
  role: 'DRIVER',
  gender: 'MALE',
  nid: '1234567890',
};
const nusrat = {
  name: 'Nusrat',
  phone: '01700000030',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'FEMALE',
  nid: '1234567891',
};
const bullet = { name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 };

async function signedInAgent(user) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send(user);
  return agent;
}

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(users);
});

describe('POST /driver/vehicle', () => {
  it('rejects a passenger', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/driver/vehicle').send(bullet);
    expect(res.status).toBe(403);
  });

  it('registers a driver vehicle', async () => {
    const agent = await signedInAgent(jashim);
    const res = await agent.post('/driver/vehicle').send(bullet);
    expect(res.status).toBe(201);
    expect(res.body.vehicle.capacity).toBe(3);
    expect(res.body.vehicle.isOnline).toBe(false);
  });

  it('rejects a second vehicle for the same driver', async () => {
    const agent = await signedInAgent(jashim);
    await agent.post('/driver/vehicle').send(bullet);
    const res = await agent.post('/driver/vehicle').send({ ...bullet, registrationNo: 'DHAKA-METRO-GA-99-9999' });
    expect(res.status).toBe(409);
  });

  it('rejects a duplicate registration number across drivers', async () => {
    const jashimAgent = await signedInAgent(jashim);
    await jashimAgent.post('/driver/vehicle').send(bullet);

    const mokbulAgent = await signedInAgent({ ...jashim, name: 'Mokbul', phone: '01700000011', nid: '1234567892' });
    const res = await mokbulAgent.post('/driver/vehicle').send(bullet);
    expect(res.status).toBe(409);
  });

  it.each([0, 7])('rejects capacity %i outside 1-6', async (capacity) => {
    const agent = await signedInAgent(jashim);
    const res = await agent.post('/driver/vehicle').send({ ...bullet, capacity });
    expect(res.status).toBe(400);
  });
});

describe('online / offline', () => {
  it('refuses to go online with no vehicle', async () => {
    const agent = await signedInAgent(jashim);
    const zone = await db.select().from(zones).limit(1).then((rows) => rows[0]);
    const res = await agent.post('/driver/online').send({ zoneId: zone.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_VEHICLE');
  });

  it('goes online with a vehicle and a real zone', async () => {
    const agent = await signedInAgent(jashim);
    await agent.post('/driver/vehicle').send(bullet);
    const zone = await db.select().from(zones).limit(1).then((rows) => rows[0]);

    const res = await agent.post('/driver/online').send({ zoneId: zone.id });
    expect(res.status).toBe(200);
    expect(res.body.vehicle.isOnline).toBe(true);
    expect(res.body.vehicle.currentZoneId).toBe(zone.id);
  });

  it('rejects a zone id that does not exist', async () => {
    const agent = await signedInAgent(jashim);
    await agent.post('/driver/vehicle').send(bullet);
    const res = await agent.post('/driver/online').send({ zoneId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(400);
  });

  it('goes offline', async () => {
    const agent = await signedInAgent(jashim);
    await agent.post('/driver/vehicle').send(bullet);
    const zone = await db.select().from(zones).limit(1).then((rows) => rows[0]);
    await agent.post('/driver/online').send({ zoneId: zone.id });

    const res = await agent.post('/driver/offline');
    expect(res.status).toBe(200);
    expect(res.body.vehicle.isOnline).toBe(false);
  });
});

describe('GET /driver/vehicle', () => {
  it('404s when the driver has none yet', async () => {
    const agent = await signedInAgent(jashim);
    const res = await agent.get('/driver/vehicle');
    expect(res.status).toBe(404);
  });

  it('403s for a passenger before any vehicle check', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.get('/driver/vehicle');
    expect(res.status).toBe(403);
  });
});

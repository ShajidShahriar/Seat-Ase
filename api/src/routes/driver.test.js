import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles } from '../db/schema.js';

const jashim = { name: 'Jashim', phone: '01700000010', password: 'password123', role: 'DRIVER' };
const nusrat = { name: 'Nusrat', phone: '01700000030', password: 'password123', role: 'PASSENGER' };
const bullet = { name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 };

async function signedInAgent(user) {
  const agent = request.agent(app);
  await agent.post('/auth/signup').send(user);
  return agent;
}

beforeEach(async () => {
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

    const mokbulAgent = await signedInAgent({ ...jashim, name: 'Mokbul', phone: '01700000011' });
    const res = await mokbulAgent.post('/driver/vehicle').send(bullet);
    expect(res.status).toBe(409);
  });

  it.each([0, 7])('rejects capacity %i outside 1-6', async (capacity) => {
    const agent = await signedInAgent(jashim);
    const res = await agent.post('/driver/vehicle').send({ ...bullet, capacity });
    expect(res.status).toBe(400);
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

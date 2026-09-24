import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides, places } from '../db/schema.js';

const nusrat = {
  name: 'Nusrat',
  phone: '01700000030',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'FEMALE',
  nid: '1234567890',
};

const rafiq = {
  name: 'Rafiq',
  phone: '01700000031',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'MALE',
  nid: '1234567891',
};

let bananiStand;

beforeAll(async () => {
  [bananiStand] = await db.select().from(places).where(eq(places.name, 'Banani Road 11 police box'));
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

function nusratToMohakhaliBody(overrides = {}) {
  return {
    pickupLat: bananiStand.lat,
    pickupLng: bananiStand.lng,
    dropLat: 23.7805,
    dropLng: 90.4053,
    seats: 1,
    rideType: 'SHARED',
    ...overrides,
  };
}

async function verifiedAgent(user) {
  const agent = request.agent(app);
  await agent.post('/auth/signup').send(user);
  const sendRes = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
  return agent;
}

describe('POST /requests', () => {
  it('rejects an unverified passenger', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send(nusrat);
    const res = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
  });

  it('requires an Idempotency-Key header', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/requests').send(nusratToMohakhaliBody());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('creates a booking with the nearest stand for a shared ride', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    expect(res.status).toBe(201);
    expect(res.body.request.status).toBe('REQUESTED');
    expect(res.body.request.pickupStandId).toBe(bananiStand.id);
    expect(res.body.request.pickupLat).toBeNull();
  });

  it('stores the raw door pin for a private ride, not a stand', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent
      .post('/requests')
      .set('Idempotency-Key', 'k1')
      .send(nusratToMohakhaliBody({ rideType: 'PRIVATE', pickupLat: 23.794, pickupLng: 90.407 }));
    expect(res.status).toBe(201);
    expect(res.body.request.pickupStandId).toBeNull();
    expect(res.body.request.pickupLat).toBe(23.794);
  });

  it('replays the same booking for the same key and identical body', async () => {
    const agent = await verifiedAgent(nusrat);
    const first = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    const second = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.request.id).toBe(first.body.request.id);
  });

  it('rejects the same key reused with a different body', async () => {
    const agent = await verifiedAgent(nusrat);
    await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    const res = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody({ seats: 2 }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects a second active booking even with a fresh idempotency key', async () => {
    const agent = await verifiedAgent(nusrat);
    await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    const res = await agent.post('/requests').set('Idempotency-Key', 'k2').send(nusratToMohakhaliBody());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_BOOKING_EXISTS');
  });

  it('lets exactly one of two truly concurrent requests through (fix #14/#20 race)', async () => {
    const agent = await verifiedAgent(nusrat);
    const [a, b] = await Promise.all([
      agent.post('/requests').set('Idempotency-Key', 'race-a').send(nusratToMohakhaliBody()),
      agent.post('/requests').set('Idempotency-Key', 'race-b').send(nusratToMohakhaliBody()),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('rejects a women-only request from a male passenger', async () => {
    const agent = await verifiedAgent(rafiq);
    const res = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody({ womenOnly: true }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WOMEN_ONLY_REQUIRES_FEMALE');
  });

  it('allows a women-only request from a female passenger', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody({ womenOnly: true }));
    expect(res.status).toBe(201);
    expect(res.body.request.womenOnly).toBe(true);
  });
});

describe('GET /requests/:id', () => {
  it("returns 404 for another passenger's booking, not 403", async () => {
    const nusratAgent = await verifiedAgent(nusrat);
    const created = await nusratAgent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());

    const rafiqAgent = await verifiedAgent(rafiq);
    const res = await rafiqAgent.get(`/requests/${created.body.request.id}`);
    expect(res.status).toBe(404);
  });

  it('returns your own booking', async () => {
    const agent = await verifiedAgent(nusrat);
    const created = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    const res = await agent.get(`/requests/${created.body.request.id}`);
    expect(res.status).toBe(200);
    expect(res.body.request.id).toBe(created.body.request.id);
  });
});

describe('POST /requests/:id/cancel', () => {
  it("rejects cancelling another passenger's booking with 404", async () => {
    const nusratAgent = await verifiedAgent(nusrat);
    const created = await nusratAgent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());

    const rafiqAgent = await verifiedAgent(rafiq);
    const res = await rafiqAgent.post(`/requests/${created.body.request.id}/cancel`);
    expect(res.status).toBe(404);
  });

  it('cancels while REQUESTED', async () => {
    const agent = await verifiedAgent(nusrat);
    const created = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    const res = await agent.post(`/requests/${created.body.request.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('CANCELLED');
  });

  it('refuses to cancel an already-cancelled booking', async () => {
    const agent = await verifiedAgent(nusrat);
    const created = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    await agent.post(`/requests/${created.body.request.id}/cancel`);
    const res = await agent.post(`/requests/${created.body.request.id}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_CANCEL');
  });

  it('frees the passenger to book again after cancelling', async () => {
    const agent = await verifiedAgent(nusrat);
    const created = await agent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());
    await agent.post(`/requests/${created.body.request.id}/cancel`);
    const res = await agent.post('/requests').set('Idempotency-Key', 'k2').send(nusratToMohakhaliBody());
    expect(res.status).toBe(201);
  });
});

describe('GET /requests', () => {
  it('lists only the caller’s own bookings', async () => {
    const nusratAgent = await verifiedAgent(nusrat);
    await nusratAgent.post('/requests').set('Idempotency-Key', 'k1').send(nusratToMohakhaliBody());

    const rafiqAgent = await verifiedAgent(rafiq);
    const res = await rafiqAgent.get('/requests');
    expect(res.body.requests).toEqual([]);
  });
});

describe('service-area validation', () => {
  it('rejects a drop point far outside Dhaka', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent
      .post('/requests')
      .set('Idempotency-Key', 'k1')
      .send(nusratToMohakhaliBody({ dropLat: 22.3569, dropLng: 91.7832 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });
});

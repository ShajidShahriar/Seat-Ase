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

const nusrat = {
  name: 'Nusrat',
  phone: '01700000030',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'FEMALE',
  nid: '1234567890',
};

let bananiStand;
let zoneCentre;
let kemalAtaturk;

beforeAll(async () => {
  [bananiStand] = await db.select().from(places).where(eq(places.name, 'Banani Road 11 police box'));
  [kemalAtaturk] = await db.select().from(places).where(eq(places.name, 'Kemal Ataturk Avenue'));
  const rows = await db.select().from(zones);
  zoneCentre = Object.fromEntries(rows.map((z) => [z.name, z]));
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

async function verifiedAgent(user) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send(user);
  const sendRes = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
  return agent;
}

function fromBananiStandTo(zoneName, overrides = {}) {
  return {
    pickupLat: bananiStand.lat,
    pickupLng: bananiStand.lng,
    dropLat: zoneCentre[zoneName].centerLat,
    dropLng: zoneCentre[zoneName].centerLng,
    seats: 1,
    ...overrides,
  };
}

describe('POST /fares/quote: the fixed story numbers', () => {
  it('requires a login', async () => {
    const res = await request(api).post('/fares/quote').send(fromBananiStandTo('Mohakhali'));
    expect(res.status).toBe(401);
  });

  it('Banani to Mohakhali: pooled 9625, solo 11500, private 34500', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/fares/quote').send(fromBananiStandTo('Mohakhali'));
    expect(res.status).toBe(200);
    expect(res.body.shared).toMatchObject({ distanceKm: 3, pooledPoysha: 9625, soloPoysha: 11500 });
    expect(res.body.private).toMatchObject({ distanceKm: 3, privatePoysha: 34500 });
  });

  it('Banani to Gulshan 1: pooled 7750', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/fares/quote').send(fromBananiStandTo('Gulshan 1'));
    expect(res.body.shared).toMatchObject({ distanceKm: 2, pooledPoysha: 7750 });
  });

  it('Banani to Tejgaon: pooled 11500', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/fares/quote').send(fromBananiStandTo('Tejgaon'));
    expect(res.body.shared).toMatchObject({ distanceKm: 4, pooledPoysha: 11500 });
  });

  it('two seats double the per-seat fares and leave the private fare alone', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/fares/quote').send(fromBananiStandTo('Mohakhali', { seats: 2 }));
    expect(res.body.shared).toMatchObject({ pooledPoysha: 19250, soloPoysha: 23000 });
    expect(res.body.private.privatePoysha).toBe(34500);
  });

  it('rejects a drop off outside Dhaka', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/fares/quote').send(fromBananiStandTo('Mohakhali', { dropLat: 22.3569, dropLng: 91.7832 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });

  it('rejects seats outside 1 to 6', async () => {
    const agent = await verifiedAgent(nusrat);
    const res = await agent.post('/fares/quote').send(fromBananiStandTo('Mohakhali', { seats: 7 }));
    expect(res.status).toBe(400);
  });
});

describe('POST /fares/quote: the quote and the stored booking use the same zones', () => {
  it('a drop off whose seeded zone differs from its nearest zone centre', async () => {
    const [seededZone] = await db.select().from(zones).where(eq(zones.id, kemalAtaturk.zoneId));
    expect(seededZone.name).toBe('Banani');

    const agent = await verifiedAgent(nusrat);
    const body = { ...fromBananiStandTo('Mohakhali'), dropLat: kemalAtaturk.lat, dropLng: kemalAtaturk.lng };
    const quote = (await agent.post('/fares/quote').send(body)).body;
    expect(quote.dropZoneId).toBe(zoneCentre['Gulshan 2'].id);

    const created = await agent.post('/requests').set('Idempotency-Key', 'quote-shared').send({ ...body, rideType: 'SHARED' });
    expect(created.status).toBe(201);
    const [stored] = await db.select().from(rideRequests).where(eq(rideRequests.id, created.body.request.id));
    expect(stored.pickupZoneId).toBe(quote.shared.pickupZoneId);
    expect(stored.dropZoneId).toBe(quote.dropZoneId);
  });

  it('a pin where the stand zone and the nearest zone centre differ: shared and private both use the stand zone, the drop the nearest centre', async () => {
    const pin = { lat: 23.752, lng: 90.404 };
    const agent = await verifiedAgent(nusrat);
    const body = { ...fromBananiStandTo('Mohakhali'), pickupLat: pin.lat, pickupLng: pin.lng, dropLat: pin.lat, dropLng: pin.lng };
    const quote = (await agent.post('/fares/quote').send(body)).body;
    expect(quote.shared.pickupZoneId).toBe(zoneCentre.Tejgaon.id);
    expect(quote.private.pickupZoneId).toBe(zoneCentre.Tejgaon.id);
    expect(quote.dropZoneId).toBe(zoneCentre.Farmgate.id);

    const shared = await agent.post('/requests').set('Idempotency-Key', 'quote-pin-shared').send({ ...body, rideType: 'SHARED' });
    expect(shared.status).toBe(201);
    const [storedShared] = await db.select().from(rideRequests).where(eq(rideRequests.id, shared.body.request.id));
    expect(storedShared.pickupZoneId).toBe(quote.shared.pickupZoneId);
    expect(storedShared.dropZoneId).toBe(quote.dropZoneId);

    await agent.post(`/requests/${shared.body.request.id}/cancel`);
    const door = await agent.post('/requests').set('Idempotency-Key', 'quote-pin-private').send({ ...body, rideType: 'PRIVATE' });
    expect(door.status).toBe(201);
    const [storedPrivate] = await db.select().from(rideRequests).where(eq(rideRequests.id, door.body.request.id));
    expect(storedPrivate.pickupZoneId).toBe(quote.private.pickupZoneId);
    expect(storedPrivate.dropZoneId).toBe(quote.dropZoneId);
  });
});

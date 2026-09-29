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

let bananiZoneId;

beforeAll(async () => {
  [{ id: bananiZoneId }] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

async function driverWithSeats(capacity) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name: 'Jashim', phone: '01700000010', password: 'password123', role: 'DRIVER', gender: 'MALE', nid: '1000000001' });
  await verifyPhone(agent);
  await agent.post('/driver/vehicle').send({ name: 'Big Tesla', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity });
  await agent.post('/driver/online').send({ zoneId: bananiZoneId });
  return agent;
}

async function nusrat() {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name: 'Nusrat Jahan', phone: '01700000030', password: 'password123', role: 'PASSENGER', gender: 'FEMALE', nid: '2000000001' });
  const sendRes = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
  return agent;
}

const trip = { pickupLat: BANANI.lat, pickupLng: BANANI.lng, dropLat: MOHAKHALI.lat, dropLng: MOHAKHALI.lng };

async function privateTripFare(capacity) {
  const jashim = await driverWithSeats(capacity);
  const passenger = await nusrat();
  const quote = await passenger.post('/fares/quote').send({ ...trip, seats: 1 }).expect(200);
  const created = await passenger
    .post('/requests')
    .set('Idempotency-Key', 'p1')
    .send({ ...trip, seats: 1, rideType: 'PRIVATE', womenOnly: false })
    .expect(201);
  const id = created.body.request.id;
  await jashim.post(`/driver/ride/requests/${id}/accept`).expect(200);
  await jashim.post('/driver/ride/arrived').expect(200);
  await jashim.post(`/driver/ride/requests/${id}/board`).expect(200);
  await jashim.post('/driver/ride/start').expect(200);
  await jashim.post(`/driver/ride/requests/${id}/drop`).expect(200);
  const [booking] = await db.select().from(rideRequests).where(eq(rideRequests.id, id));
  return { quoted: quote.body.private.privatePoysha, charged: booking.farePoysha, breakdown: booking.fareBreakdown };
}

describe('a private ride in a Tesla with more than 3 seats', () => {
  it('costs what she was quoted, not more', async () => {
    const { quoted, charged } = await privateTripFare(6);
    expect(quoted).toBe(34500);
    expect(charged).toBe(34500);
  });
});

describe('the receipt can be checked by hand', () => {
  it('stores how the fare was worked out when the trip starts', async () => {
    const { charged, breakdown } = await privateTripFare(3);
    expect(breakdown).toEqual({
      kind: 'PRIVATE', distanceKm: 3, basePoysha: 4000, perKmPoysha: 2500, distancePoysha: 7500,
      poolDiscountPoysha: 0, seats: 3, perSeatPoysha: 11500, totalPoysha: 34500, capPoysha: 34500, finalPoysha: 34500,
    });
    expect(charged).toBe(breakdown.finalPoysha);
  });
});

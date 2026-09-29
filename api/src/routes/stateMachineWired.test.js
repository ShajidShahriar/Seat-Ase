import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides, zones } from '../db/schema.js';
import { RIDE_TRANSITIONS, BOOKING_TRANSITIONS } from '../services/rideStateMachine.js';
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

const saved = { rideOpenArrived: RIDE_TRANSITIONS.OPEN.ARRIVED, bookingRequestedCancelled: BOOKING_TRANSITIONS.REQUESTED.CANCELLED };

afterEach(() => {
  RIDE_TRANSITIONS.OPEN.ARRIVED = saved.rideOpenArrived;
  BOOKING_TRANSITIONS.REQUESTED.CANCELLED = saved.bookingRequestedCancelled;
});

async function jashimAndNusrat() {
  const jashim = request.agent(api);
  await jashim.post('/auth/signup').send({ name: 'Jashim', phone: '01700000010', password: 'password123', role: 'DRIVER', gender: 'MALE', nid: '1000000001' });
  await verifyPhone(jashim);
  await jashim.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: 'DHAKA-METRO-GA-11-1111', capacity: 3 });
  await jashim.post('/driver/online').send({ zoneId: bananiZoneId });
  const nusrat = request.agent(api);
  await nusrat.post('/auth/signup').send({ name: 'Nusrat Jahan', phone: '01700000030', password: 'password123', role: 'PASSENGER', gender: 'FEMALE', nid: '2000000001' });
  const sent = await nusrat.post('/auth/otp/send');
  await nusrat.post('/auth/otp/verify').send({ code: sent.body.demoCode });
  const res = await nusrat
    .post('/requests')
    .set('Idempotency-Key', 'n1')
    .send({ pickupLat: BANANI.lat, pickupLng: BANANI.lng, dropLat: MOHAKHALI.lat, dropLng: MOHAKHALI.lng, seats: 1, rideType: 'SHARED', womenOnly: false });
  return { jashim, nusrat, nusratId: res.body.request.id };
}

describe('the services ask the transition table before changing a status', () => {
  it('refuses "arrived" once the table no longer lets a driver move a ride from OPEN to ARRIVED', async () => {
    const { jashim, nusratId } = await jashimAndNusrat();
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);

    RIDE_TRANSITIONS.OPEN.ARRIVED = [];
    const res = await jashim.post('/driver/ride/arrived');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const [ride] = await db.select().from(rides);
    expect(ride.status).toBe('OPEN');
  });

  it('refuses a passenger cancel once the table no longer lets a passenger cancel a waiting booking', async () => {
    const { nusrat, nusratId } = await jashimAndNusrat();

    BOOKING_TRANSITIONS.REQUESTED.CANCELLED = ['DEMO'];
    const res = await nusrat.post(`/requests/${nusratId}/cancel`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const [booking] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratId));
    expect(booking.status).toBe('REQUESTED');
  });
});

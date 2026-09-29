import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
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

async function driverOnlineInBanani(name, phone, nid, plate) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name, phone, password: 'password123', role: 'DRIVER', gender: 'MALE', nid });
  await verifyPhone(agent);
  await agent.post('/driver/vehicle').send({ name: `${name}'s Tesla`, registrationNo: plate, capacity: 3 });
  await agent.post('/driver/online').send({ zoneId: bananiZoneId });
  return agent;
}

async function nusratWaiting() {
  return passengerWaiting('Nusrat Jahan', '01700000030', 'FEMALE', '2000000001');
}

async function passengerWaiting(name, phone, gender, nid) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name, phone, password: 'password123', role: 'PASSENGER', gender, nid });
  const sendRes = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
  const res = await agent
    .post('/requests')
    .set('Idempotency-Key', `${phone}-1`)
    .send({ pickupLat: BANANI.lat, pickupLng: BANANI.lng, dropLat: MOHAKHALI.lat, dropLng: MOHAKHALI.lng, seats: 1, rideType: 'SHARED', womenOnly: false });
  return res.body.request.id;
}

async function boardedThenCancelled() {
  const jashim = await driverOnlineInBanani('Jashim', '01700000010', '1000000001', 'DHAKA-METRO-GA-11-1111');
  const mokbul = await driverOnlineInBanani('Mokbul', '01700000011', '1000000002', 'DHAKA-METRO-GA-22-2222');
  const nusratId = await nusratWaiting();
  const accepted = await jashim.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);
  await jashim.post('/driver/ride/arrived').expect(200);
  await jashim.post(`/driver/ride/requests/${nusratId}/board`).expect(200);
  await jashim.post('/driver/ride/cancel').expect(200);
  return { mokbul, nusratId, firstRideId: accepted.body.ride.id };
}

describe('a driver cancels after ticking a passenger as boarded', () => {
  it('clears the boarded tick, so the next driver cannot start without her', async () => {
    const { mokbul, nusratId } = await boardedThenCancelled();

    const [booking] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratId));
    expect(booking.status).toBe('REQUESTED');
    expect(booking.boardedAt).toBeNull();

    await mokbul.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);
    await mokbul.post('/driver/ride/arrived').expect(200);
    const start = await mokbul.post('/driver/ride/start');
    expect(start.status).toBe(409);
    expect(start.body.error.code).toBe('NOBODY_BOARDED');
  });

  it("records the booking's real status in her timeline, and empties the cancelled ride's seats", async () => {
    const { nusratId, firstRideId } = await boardedThenCancelled();

    const [event] = await db
      .select()
      .from(rideEvents)
      .where(and(eq(rideEvents.requestId, nusratId), eq(rideEvents.type, 'RIDE_CANCELLED')));
    expect(event.fromStatus).toBe('DRIVER_ARRIVED');
    expect(event.toStatus).toBe('REQUESTED');

    const [ride] = await db.select().from(rides).where(eq(rides.id, firstRideId));
    expect(ride.status).toBe('CANCELLED');
    expect(ride.seatsTaken).toBe(0);
  });
});

describe('a driver cancels his ride and tries to take back only some of the passengers', () => {
  async function cancelledWithTwo() {
    const jashim = await driverOnlineInBanani('Jashim', '01700000010', '1000000001', 'DHAKA-METRO-GA-11-1111');
    const mokbul = await driverOnlineInBanani('Mokbul', '01700000011', '1000000002', 'DHAKA-METRO-GA-22-2222');
    const nusratId = await nusratWaiting();
    const rafiqId = await passengerWaiting('Rafiq Ahmed', '01700000031', 'MALE', '2000000002');
    await jashim.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);
    await jashim.post(`/driver/ride/requests/${rafiqId}/accept`).expect(200);
    await jashim.post('/driver/ride/arrived').expect(200);
    await jashim.post('/driver/ride/cancel').expect(200);
    return { jashim, mokbul, nusratId, rafiqId };
  }

  it('refuses to let him accept any of them again', async () => {
    const { jashim, nusratId } = await cancelledWithTwo();
    const res = await jashim.post(`/driver/ride/requests/${nusratId}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('YOU_CANCELLED_THIS_BOOKING');
    const [booking] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratId));
    expect(booking.status).toBe('REQUESTED');
  });

  it('hides them from his waiting list, but not from other drivers', async () => {
    const { jashim, mokbul, nusratId, rafiqId } = await cancelledWithTwo();
    const his = await jashim.get('/driver/requests').expect(200);
    expect(his.body.requests.map((r) => r.id)).toEqual([]);
    const theirs = await mokbul.get('/driver/requests').expect(200);
    expect(theirs.body.requests.map((r) => r.id).sort()).toEqual([nusratId, rafiqId].sort());
  });

  it('lets another driver accept them', async () => {
    const { mokbul, nusratId } = await cancelledWithTwo();
    await mokbul.post(`/driver/ride/requests/${nusratId}/accept`).expect(200);
  });

  it('still lets him accept new passengers', async () => {
    const { jashim } = await cancelledWithTwo();
    const shirinId = await passengerWaiting('Shirin Akter', '01700000032', 'FEMALE', '2000000003');
    await jashim.post(`/driver/ride/requests/${shirinId}/accept`).expect(200);
  });
});

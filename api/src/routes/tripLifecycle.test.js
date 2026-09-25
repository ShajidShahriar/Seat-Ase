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

const BANANI_LAT = 23.7937;
const BANANI_LNG = 90.4076;
const MOHAKHALI = { lat: 23.7805, lng: 90.4053 };
const GULSHAN1 = { lat: 23.7808, lng: 90.4142 };
const TEJGAON = { lat: 23.7644, lng: 90.3938 };

let bananiZoneId;
let tejgaonZoneId;

beforeAll(async () => {
  const [banani] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
  const [tejgaon] = await db.select().from(zones).where(eq(zones.name, 'Tejgaon'));
  bananiZoneId = banani.id;
  tejgaonZoneId = tejgaon.id;
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

async function driverAgent(name, phone, nid) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name, phone, password: 'password123', role: 'DRIVER', gender: 'MALE', nid });
  await agent.post('/driver/vehicle').send({ name: 'Bullet', registrationNo: `REG-${phone}`, capacity: 3 });
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

async function requestRide(agent, key, { drop, seats = 1 }) {
  const res = await agent
    .post('/requests')
    .set('Idempotency-Key', key)
    .send({ pickupLat: BANANI_LAT, pickupLng: BANANI_LNG, dropLat: drop.lat, dropLng: drop.lng, seats, rideType: 'SHARED' });
  return res.body.request.id;
}

async function backdateArrival(minutesAgo) {
  await db.update(rides).set({ arrivedAt: new Date(Date.now() - minutesAgo * 60 * 1000) });
}

describe('POST /driver/ride/arrived', () => {
  it('fails with no active ride', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const res = await jashim.post('/driver/ride/arrived');
    expect(res.status).toBe(404);
  });

  it('moves the ride to ARRIVED and every matched booking to DRIVER_ARRIVED', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);

    const res = await jashim.post('/driver/ride/arrived');
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('ARRIVED');

    const [row] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    expect(row.status).toBe('DRIVER_ARRIVED');
  });
});

describe('boarding and no-show', () => {
  it('sets boardedAt without changing status', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');

    const res = await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('DRIVER_ARRIVED');
    expect(res.body.request.boardedAt).not.toBeNull();
  });

  it('rejects a no-show before the 5-minute wait (fix #8/no-show)', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');

    const res = await jashim.post(`/driver/ride/requests/${nusratReq}/no-show`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SHOW_TOO_EARLY');
  });

  it('rejects a no-show on someone who already boarded', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    await backdateArrival(6);

    const res = await jashim.post(`/driver/ride/requests/${nusratReq}/no-show`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_BOARDED');
  });

  it('frees the seat after 5 minutes and auto-cancels an emptied ride', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');
    await backdateArrival(6);

    const res = await jashim.post(`/driver/ride/requests/${nusratReq}/no-show`);
    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('NO_SHOW');

    const [ride] = await db.select().from(rides);
    expect(ride.status).toBe('CANCELLED');
    expect(ride.seatsTaken).toBe(0);
  });
});

describe('POST /driver/ride/start', () => {
  it('fails before arriving', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const res = await jashim.post('/driver/ride/start');
    expect(res.status).toBe(404);
  });

  it('fails when nobody has boarded', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');

    const res = await jashim.post('/driver/ride/start');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOBODY_BOARDED');
  });

  it('sends an un-boarded passenger back to REQUESTED, not into the trip', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const shirinReq = await requestRide(shirin, 's1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${shirinReq}/accept`);
    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);

    await jashim.post('/driver/ride/start');

    const [nusratRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    const [shirinRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, shirinReq));
    expect(nusratRow.status).toBe('IN_PROGRESS');
    expect(shirinRow.status).toBe('REQUESTED');
    expect(shirinRow.rideId).toBeNull();
  });

  it("locks Nusrat's fare at her cap when Rafiq no-shows (Section 7's exact example)", async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);

    const [beforeStart] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    expect(beforeStart.fareCapPoysha).toBe(9625);

    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    await backdateArrival(6);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/no-show`);

    const startRes = await jashim.post('/driver/ride/start');
    expect(startRes.status).toBe(200);

    const [nusratRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    expect(nusratRow.status).toBe('IN_PROGRESS');
    expect(nusratRow.farePoysha).toBe(9625);

    const [ride] = await db.select().from(rides);
    expect(ride.seatsTaken).toBe(1);
  });
});

describe('per-passenger drop', () => {
  it("cannot be done by another driver, even one with their own active ride", async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const mokbul = await driverAgent('Mokbul', '01700000011', '1000000002');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');

    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const shirinReq = await requestRide(shirin, 's1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    await jashim.post('/driver/ride/start');

    await mokbul.post(`/driver/ride/requests/${shirinReq}/accept`);
    await mokbul.post('/driver/ride/arrived');
    await mokbul.post(`/driver/ride/requests/${shirinReq}/board`);
    await mokbul.post('/driver/ride/start');

    const res = await mokbul.post(`/driver/ride/requests/${nusratReq}/drop`);
    expect(res.status).toBe(404);

    const [row] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    expect(row.status).toBe('IN_PROGRESS');
  });

  it('Scenario E: suggested order, exact fares, ride completes, driver area moves to the last drop zone', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const shirin = await passengerAgent('Shirin', '01700000032', 'FEMALE', '2000000003');

    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    const shirinReq = await requestRide(shirin, 's1', { drop: TEJGAON });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);
    await jashim.post(`/driver/ride/requests/${shirinReq}/accept`);
    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/board`);
    await jashim.post(`/driver/ride/requests/${shirinReq}/board`);
    await jashim.post('/driver/ride/start');

    const rideView = await jashim.get('/driver/ride');
    expect(rideView.body.passengers.map((p) => p.passengerName)).toEqual(['Rafiq', 'Nusrat', 'Shirin']);

    await jashim.post(`/driver/ride/requests/${rafiqReq}/drop`);
    await jashim.post(`/driver/ride/requests/${nusratReq}/drop`);
    const lastDrop = await jashim.post(`/driver/ride/requests/${shirinReq}/drop`);
    expect(lastDrop.status).toBe(200);
    expect(lastDrop.body.ride.status).toBe('COMPLETED');

    const [nusratRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, nusratReq));
    const [rafiqRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, rafiqReq));
    const [shirinRow] = await db.select().from(rideRequests).where(eq(rideRequests.id, shirinReq));
    expect(nusratRow.farePoysha).toBe(9625);
    expect(rafiqRow.farePoysha).toBe(7750);
    expect(shirinRow.farePoysha).toBe(11500);

    const [vehicle] = await db.select().from(vehicles);
    expect(vehicle.currentZoneId).toBe(tejgaonZoneId);
  });
});

describe('stuck-state escapes', () => {
  it('rejects a passenger cancel right after arrival, allows it after 15 minutes', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');

    const tooEarly = await nusrat.post(`/requests/${nusratReq}/cancel`);
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('DRIVER_JUST_ARRIVED');

    await backdateArrival(16);
    const nowOk = await nusrat.post(`/requests/${nusratReq}/cancel`);
    expect(nowOk.status).toBe(200);
  });

  it('auto-closes a ride started more than 3 hours ago', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    await jashim.post('/driver/ride/start');

    await db.update(rides).set({ startedAt: new Date(Date.now() - (3 * 60 + 5) * 60 * 1000) });

    const res = await nusrat.get(`/requests/${nusratReq}`);
    expect(res.body.request.status).toBe('COMPLETED');

    const [ride] = await db.select().from(rides);
    expect(ride.status).toBe('COMPLETED');
  });
});

describe("passenger's own timeline", () => {
  it('never contains another passenger’s data', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    const rafiqReq = await requestRide(rafiq, 'r1', { drop: GULSHAN1 });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);
    await jashim.post(`/driver/ride/requests/${rafiqReq}/accept`);
    await jashim.post('/driver/ride/arrived');

    const res = await rafiq.get(`/requests/${rafiqReq}/timeline`);
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('9625');
    expect(raw).not.toContain(nusratReq);
    expect(res.body.timeline.map((e) => e.type)).toEqual(['REQUESTED', 'REQUEST_MATCHED', 'ARRIVED']);
  });

  it("404s for someone else's booking", async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await passengerAgent('Rafiq', '01700000031', 'MALE', '2000000002');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);

    const res = await rafiq.get(`/requests/${nusratReq}/timeline`);
    expect(res.status).toBe(404);
  });
});

describe('GET /driver/history', () => {
  it('shows completed rides, not the current active one', async () => {
    const jashim = await driverAgent('Jashim', '01700000010', '1000000001');
    const nusrat = await passengerAgent('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1', { drop: MOHAKHALI });
    await jashim.post(`/driver/ride/requests/${nusratReq}/accept`);

    const duringRide = await jashim.get('/driver/history');
    expect(duringRide.body.rides).toEqual([]);

    await jashim.post('/driver/ride/arrived');
    await jashim.post(`/driver/ride/requests/${nusratReq}/board`);
    await jashim.post('/driver/ride/start');
    await jashim.post(`/driver/ride/requests/${nusratReq}/drop`);

    const afterRide = await jashim.get('/driver/history');
    expect(afterRide.body.rides).toHaveLength(1);
    expect(afterRide.body.rides[0].status).toBe('COMPLETED');
  });
});

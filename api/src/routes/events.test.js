import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SSE_HEARTBEAT_MS = '300';
});

import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides, zones } from '../db/schema.js';
import { connectionCount } from '../realtime/notify.js';
import { nudge } from '../realtime/nudges.js';

const BANANI = { lat: 23.7937, lng: 90.4076 };
const MOHAKHALI = { lat: 23.7805, lng: 90.4053 };

let server;
let baseUrl;
let bananiZoneId;
const openStreams = [];

beforeAll(async () => {
  server = app.listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
  const [banani] = await db.select().from(zones).where(eq(zones.name, 'Banani'));
  bananiZoneId = banani.id;
});

afterAll(() => {
  server.close();
});

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

afterEach(async () => {
  for (const stream of openStreams.splice(0)) stream.close();
  await wait(50);
});

// ---- Helpers ----

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cookieFrom(res) {
  return res.headers['set-cookie'][0].split(';')[0];
}

async function signupDriver(name, phone, nid) {
  const res = await request(app)
    .post('/auth/signup')
    .send({ name, phone, password: 'password123', role: 'DRIVER', gender: 'MALE', nid });
  const cookie = cookieFrom(res);
  await request(app).post('/driver/vehicle').set('Cookie', cookie).send({ name, registrationNo: `REG-${phone}`, capacity: 3 });
  await request(app).post('/driver/online').set('Cookie', cookie).send({ zoneId: bananiZoneId });
  return { id: res.body.user.id, cookie };
}

async function signupPassenger(name, phone, gender, nid) {
  const res = await request(app)
    .post('/auth/signup')
    .send({ name, phone, password: 'password123', role: 'PASSENGER', gender, nid });
  const cookie = cookieFrom(res);
  const sendRes = await request(app).post('/auth/otp/send').set('Cookie', cookie);
  await request(app).post('/auth/otp/verify').set('Cookie', cookie).send({ code: sendRes.body.demoCode });
  return { id: res.body.user.id, cookie };
}

async function requestRide(passenger, key) {
  const res = await request(app)
    .post('/requests')
    .set('Cookie', passenger.cookie)
    .set('Idempotency-Key', key)
    .send({ pickupLat: BANANI.lat, pickupLng: BANANI.lng, dropLat: MOHAKHALI.lat, dropLng: MOHAKHALI.lng, seats: 1 });
  return res.body.request.id;
}

async function openStream(user, { onEvent } = {}) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/events/stream`, { headers: { cookie: user.cookie }, signal: controller.signal });
  const stream = { res, events: [], close: () => controller.abort() };
  openStreams.push(stream);

  (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = JSON.parse(frame.replace(/^data: /, ''));
          stream.events.push(event);
          await onEvent?.(event);
        }
      }
    } catch {
      stream.closed = true;
    }
  })();

  return stream;
}

async function waitFor(check, timeoutMs = 2000) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await wait(20);
  }
}

function nudgesOnly(stream) {
  return stream.events.filter((e) => e.type !== 'heartbeat');
}

// ---- The stream itself ----

describe('GET /events/stream', () => {
  it('rejects a request without a login cookie', async () => {
    const res = await request(app).get('/events/stream');
    expect(res.status).toBe(401);
  });

  it('opens an SSE stream and sends a heartbeat event straight away', async () => {
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const stream = await openStream(nusrat);

    expect(stream.res.status).toBe(200);
    expect(stream.res.headers.get('content-type')).toContain('text/event-stream');
    expect(stream.res.headers.get('cache-control')).toContain('no-cache');
    await waitFor(() => stream.events.length >= 1);
    expect(stream.events[0]).toEqual({ type: 'heartbeat' });
  });

  it('keeps sending heartbeats on an interval', async () => {
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const stream = await openStream(nusrat);

    await waitFor(() => stream.events.filter((e) => e.type === 'heartbeat').length >= 3);
  });

  it("updates the driver's last_seen_at on every heartbeat (fix #12)", async () => {
    const jashim = await signupDriver('Jashim', '01700000010', '1000000001');
    await db.update(vehicles).set({ lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) }).where(eq(vehicles.driverId, jashim.id));

    const stream = await openStream(jashim);
    await waitFor(() => stream.events.length >= 2);
    await wait(50);

    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, jashim.id));
    expect(Date.now() - vehicle.lastSeenAt.getTime()).toBeLessThan(2000);
  });

  it('removes a connection when its tab closes (fix #41)', async () => {
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const tab1 = await openStream(nusrat);
    const tab2 = await openStream(nusrat);
    await waitFor(() => connectionCount(nusrat.id) === 2);

    tab1.close();
    await waitFor(() => connectionCount(nusrat.id) === 1);
    tab2.close();
    await waitFor(() => connectionCount(nusrat.id) === 0);
  });
});

// ---- Who gets nudged (fix #42) ----

describe('live nudges', () => {
  it('Nusrat requests and Jashim accepts: the right people hear it, Rafiq hears nothing', async () => {
    const jashim = await signupDriver('Jashim', '01700000010', '1000000001');
    const mokbul = await signupDriver('Mokbul', '01700000011', '1000000002');
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await signupPassenger('Rafiq', '01700000031', 'MALE', '2000000002');

    const streams = {
      jashim: await openStream(jashim),
      mokbul: await openStream(mokbul),
      nusrat: await openStream(nusrat),
      rafiq: await openStream(rafiq),
    };

    const nusratReq = await requestRide(nusrat, 'n1');
    await waitFor(() => nudgesOnly(streams.mokbul).length === 1);
    expect(nudgesOnly(streams.nusrat)).toEqual([{ type: 'booking.updated', action: 'REQUEST_CREATED', requestId: nusratReq }]);
    expect(nudgesOnly(streams.jashim)).toEqual([
      { type: 'waiting-list.updated', action: 'REQUEST_CREATED', zoneId: bananiZoneId },
    ]);

    const accept = await request(app).post(`/driver/ride/requests/${nusratReq}/accept`).set('Cookie', jashim.cookie);
    const rideId = accept.body.ride.id;
    await waitFor(() => nudgesOnly(streams.mokbul).length === 2);

    expect(nudgesOnly(streams.nusrat).slice(1)).toEqual([
      { type: 'booking.updated', action: 'REQUEST_MATCHED', requestId: nusratReq },
      { type: 'ride.updated', action: 'REQUEST_MATCHED', rideId },
    ]);
    expect(nudgesOnly(streams.jashim).slice(1)).toEqual([
      { type: 'ride.updated', action: 'REQUEST_MATCHED', rideId },
      { type: 'waiting-list.updated', action: 'REQUEST_MATCHED', zoneId: bananiZoneId },
    ]);
    expect(nudgesOnly(streams.mokbul)[1]).toEqual({ type: 'waiting-list.updated', action: 'REQUEST_MATCHED', zoneId: bananiZoneId });
    expect(nudgesOnly(streams.rafiq)).toEqual([]);
  });

  it('only nudges after the transaction commits: a refetch on the nudge already sees MATCHED (fix #16)', async () => {
    const jashim = await signupDriver('Jashim', '01700000010', '1000000001');
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1');

    let seenOnNudge;
    await openStream(nusrat, {
      onEvent: async (event) => {
        if (event.action === 'REQUEST_MATCHED' && event.type === 'booking.updated') {
          const res = await request(app).get(`/requests/${nusratReq}`).set('Cookie', nusrat.cookie);
          seenOnNudge = res.body.request.status;
        }
      },
    });
    await wait(50);

    await request(app).post(`/driver/ride/requests/${nusratReq}/accept`).set('Cookie', jashim.cookie);
    await waitFor(() => seenOnNudge !== undefined);
    expect(seenOnNudge).toBe('MATCHED');
  });

  it("Rafiq cancelling nudges Jashim's ride and Nusrat, never Rafiq's booking id to her", async () => {
    const jashim = await signupDriver('Jashim', '01700000010', '1000000001');
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const rafiq = await signupPassenger('Rafiq', '01700000031', 'MALE', '2000000002');
    const nusratReq = await requestRide(nusrat, 'n1');
    const rafiqReq = await requestRide(rafiq, 'r1');
    await request(app).post(`/driver/ride/requests/${nusratReq}/accept`).set('Cookie', jashim.cookie);
    const accept = await request(app).post(`/driver/ride/requests/${rafiqReq}/accept`).set('Cookie', jashim.cookie);
    const rideId = accept.body.ride.id;

    const jashimStream = await openStream(jashim);
    const nusratStream = await openStream(nusrat);
    await wait(50);

    await request(app).post(`/requests/${rafiqReq}/cancel`).set('Cookie', rafiq.cookie);
    await waitFor(() => nudgesOnly(nusratStream).length === 1);

    expect(nudgesOnly(jashimStream)).toContainEqual({ type: 'ride.updated', action: 'REQUEST_CANCELLED', rideId });
    expect(nudgesOnly(nusratStream)).toEqual([{ type: 'ride.updated', action: 'REQUEST_CANCELLED', rideId }]);
    expect(JSON.stringify(nusratStream.events)).not.toContain(rafiqReq);
  });

  it('lazy expiry nudges the passenger whose request expired', async () => {
    const jashim = await signupDriver('Jashim', '01700000010', '1000000001');
    const nusrat = await signupPassenger('Nusrat', '01700000030', 'FEMALE', '2000000001');
    const nusratReq = await requestRide(nusrat, 'n1');
    await db.update(rideRequests).set({ queuedAt: new Date(Date.now() - 16 * 60 * 1000) }).where(eq(rideRequests.id, nusratReq));

    const nusratStream = await openStream(nusrat);
    await wait(50);

    await request(app).get('/driver/requests').set('Cookie', jashim.cookie);
    await waitFor(() => nudgesOnly(nusratStream).length === 1);
    expect(nudgesOnly(nusratStream)[0]).toEqual({ type: 'booking.updated', action: 'REQUEST_EXPIRED', requestId: nusratReq });
  });

  it('refuses an action missing from the table instead of silently nudging nobody', async () => {
    await expect(nudge('SOMETHING_NEW', {})).rejects.toThrow('No nudge rule');
  });
});

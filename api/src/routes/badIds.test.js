import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideRequests, rideEvents, rides } from '../db/schema.js';
import { listenOnLoopback, closeLoopbackServers } from '../test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(rides);
  await db.delete(vehicles);
  await db.delete(otpCodes);
  await db.delete(users);
});

async function signedUp(role, phone, nid) {
  const agent = request.agent(api);
  await agent.post('/auth/signup').send({ name: 'Test User', phone, password: 'password123', role, gender: 'FEMALE', nid });
  return agent;
}

const BAD_IDS = ['abc', '123', 'not-a-uuid-at-all', '00000000-0000-0000-0000-00000000000g'];

describe('a malformed id in the URL', () => {
  it('is a 400 on every passenger route, never a 500', async () => {
    const nusrat = await signedUp('PASSENGER', '01700000030', '2000000001');
    for (const id of BAD_IDS) {
      for (const [method, path] of [
        ['get', `/requests/${id}`],
        ['post', `/requests/${id}/cancel`],
        ['get', `/requests/${id}/timeline`],
        ['get', `/requests/${id}/ride`],
        ['get', `/zones/${id}/online-count`],
      ]) {
        const res = await nusrat[method](path);
        expect(res.status, `${method} ${path}`).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    }
  });

  it('is a 400 on every driver route, never a 500', async () => {
    const jashim = await signedUp('DRIVER', '01700000010', '1000000001');
    for (const id of BAD_IDS) {
      for (const action of ['accept', 'board', 'no-show', 'drop']) {
        const res = await jashim.post(`/driver/ride/requests/${id}/${action}`);
        expect(res.status, `${action} ${id}`).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
      }
    }
  });

  it('still checks the login first', async () => {
    const res = await request(api).get('/requests/abc');
    expect(res.status).toBe(401);
  });

  it('leaves well-formed unknown ids as a 404', async () => {
    const nusrat = await signedUp('PASSENGER', '01700000030', '2000000001');
    const res = await nusrat.get('/requests/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});

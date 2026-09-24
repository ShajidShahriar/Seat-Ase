import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import cookieParser from 'cookie-parser';

const jashim = {
  name: 'Jashim',
  phone: '01700000010',
  password: 'password123',
  role: 'DRIVER',
  gender: 'MALE',
  nid: '1234567890',
};

beforeEach(async () => {
  await db.delete(vehicles);
  await db.delete(users);
});

describe('POST /auth/signup', () => {
  it('creates a user and sets a session cookie', async () => {
    const res = await request(app).post('/auth/signup').send(jashim);
    expect(res.status).toBe(201);
    expect(res.body.user.phone).toBe('+8801700000010');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/seat_ase_session=/);
  });

  it('rejects a second signup with the same phone in a different format', async () => {
    await request(app).post('/auth/signup').send(jashim);
    const res = await request(app)
      .post('/auth/signup')
      .send({ ...jashim, phone: '+8801700000010' });
    expect(res.status).toBe(409);
  });

  it('rejects a weak password before touching the database', async () => {
    const res = await request(app).post('/auth/signup').send({ ...jashim, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['9 digits', '123456789', false],
    ['10 digits', '1234567890', true],
    ['13 digits', '1234567890123', true],
    ['17 digits', '12345678901234567', true],
    ['18 digits', '123456789012345678', false],
    ['contains letters', '12345abc90', false],
  ])('NID with %s is %s', async (_label, nid, shouldAccept) => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ ...jashim, phone: `0170000${nid.slice(0, 4)}`, nid });
    expect(res.status).toBe(shouldAccept ? 201 : 400);
  });

  it('returns gender and verification flags, but never the nid itself', async () => {
    const res = await request(app).post('/auth/signup').send(jashim);
    expect(res.body.user.gender).toBe('MALE');
    expect(res.body.user.nidVerified).toBe(true);
    expect(res.body.user.phoneVerified).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain(jashim.nid);
  });

  it('rejects a second signup that reuses the same NID with a different phone', async () => {
    await request(app).post('/auth/signup').send(jashim);
    const res = await request(app)
      .post('/auth/signup')
      .send({ ...jashim, name: 'Fake Jashim', phone: '01799999999' });
    expect(res.status).toBe(409);
  });

  it('stores only a hash and the last 4 digits of the NID, never the full number', async () => {
    await request(app).post('/auth/signup').send(jashim);
    const [user] = await db.select().from(users).where(eq(users.phone, '+8801700000010'));
    expect(user.nidLast4).toBe('7890');
    expect(user.nidHash).not.toBe(jashim.nid);
    expect(user.nidHash).toHaveLength(64); // hex sha256
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/signup').send(jashim);
  });

  it('logs in with the phone in a different format than signup used', async () => {
    const res = await request(app).post('/auth/login').send({ phone: '+8801700000010', password: 'password123' });
    expect(res.status).toBe(200);
  });

  it('gives the same error for a wrong password and an unknown phone', async () => {
    const wrongPassword = await request(app).post('/auth/login').send({ phone: jashim.phone, password: 'wrongpass' });
    const unknownPhone = await request(app).post('/auth/login').send({ phone: '01799999999', password: 'whatever' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownPhone.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe(unknownPhone.body.error.message);
  });
});

describe('GET /auth/me', () => {
  it('requires a session cookie', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the logged-in user', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send(jashim);
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Jashim');
  });
});

describe('POST /auth/logout', () => {
  it('clears the session so /auth/me stops working', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send(jashim);
    await agent.post('/auth/logout');
    const res = await agent.get('/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  // A tiny standalone app, not the shared `app` — mounting a route on `app` after this
  // file's earlier tests import it would land after notFound/errorHandler and 404 instead.
  function appWithDriverOnlyRoute() {
    const testApp = express();
    testApp.use(cookieParser());
    testApp.get('/driver-only', requireAuth, requireRole('DRIVER'), (req, res) => res.json({ ok: true }));
    return testApp;
  }

  it('blocks a passenger from a driver-only route', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send({ ...jashim, role: 'PASSENGER', phone: '01722222222' });
    const cookie = (await agent.get('/auth/me')).headers['set-cookie'];

    const res = await request(appWithDriverOnlyRoute()).get('/driver-only').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('lets a driver through', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send({ ...jashim, phone: '01733333333' });
    const cookie = (await agent.get('/auth/me')).headers['set-cookie'];

    const res = await request(appWithDriverOnlyRoute()).get('/driver-only').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

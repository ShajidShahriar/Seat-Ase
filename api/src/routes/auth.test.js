import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

const jashim = { name: 'Jashim', phone: '01700000010', password: 'password123', role: 'DRIVER' };

beforeEach(async () => {
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

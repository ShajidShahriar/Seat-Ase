import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles } from '../db/schema.js';
import { requireAuth } from './auth.js';
import { requireVerified } from './requireVerified.js';
import { errorHandler } from './errorHandler.js';

const nusrat = {
  name: 'Nusrat',
  phone: '01700000030',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'FEMALE',
  nid: '1234567890',
};

function verifiedOnlyApp() {
  const testApp = express();
  testApp.use(cookieParser());
  testApp.get('/verified-only', requireAuth, requireVerified, (req, res) => res.json({ ok: true }));
  testApp.use(errorHandler);
  return testApp;
}

beforeEach(async () => {
  await db.delete(vehicles);
  await db.delete(users);
});

describe('requireVerified', () => {
  it('blocks a user who has not verified their phone', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send(nusrat);
    const cookie = (await agent.get('/auth/me')).headers['set-cookie'];

    const res = await request(verifiedOnlyApp()).get('/verified-only').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
  });

  it('takes effect immediately after verifying, without a new login', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/signup').send(nusrat);
    const sendRes = await agent.post('/auth/otp/send');
    await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });

    const cookie = (await agent.get('/auth/me')).headers['set-cookie'];
    const res = await request(verifiedOnlyApp()).get('/verified-only').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

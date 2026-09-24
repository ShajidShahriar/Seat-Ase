import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../app.js';
import { db } from '../db/client.js';
import { users, vehicles, otpCodes, rideEvents, rideRequests } from '../db/schema.js';

const nusrat = {
  name: 'Nusrat',
  phone: '01700000030',
  password: 'password123',
  role: 'PASSENGER',
  gender: 'FEMALE',
  nid: '1234567890',
};

async function signedInAgent(user) {
  const agent = request.agent(app);
  await agent.post('/auth/signup').send(user);
  return agent;
}

beforeEach(async () => {
  await db.delete(rideEvents);
  await db.delete(rideRequests);
  await db.delete(otpCodes);
  await db.delete(vehicles);
  await db.delete(users);
});

describe('POST /auth/otp/send', () => {
  it('requires login', async () => {
    const res = await request(app).post('/auth/otp/send');
    expect(res.status).toBe(401);
  });

  it('returns the code in demo mode (NODE_ENV=test)', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/auth/otp/send');
    expect(res.status).toBe(200);
    expect(res.body.demoCode).toMatch(/^\d{6}$/);
  });

  it('blocks a 4th send within the window', async () => {
    const agent = await signedInAgent(nusrat);
    await agent.post('/auth/otp/send');
    await agent.post('/auth/otp/send');
    await agent.post('/auth/otp/send');
    const res = await agent.post('/auth/otp/send');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('OTP_SEND_LIMIT');
  });
});

describe('POST /auth/otp/verify', () => {
  it('rejects a code that is not 6 digits', async () => {
    const agent = await signedInAgent(nusrat);
    const res = await agent.post('/auth/otp/verify').send({ code: '12' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('verifies with the correct code and sets phoneVerified', async () => {
    const agent = await signedInAgent(nusrat);
    const sendRes = await agent.post('/auth/otp/send');
    const verifyRes = await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
    expect(verifyRes.status).toBe(204);

    const meRes = await agent.get('/auth/me');
    expect(meRes.body.user.phoneVerified).toBe(true);
  });

  it('rejects the wrong code', async () => {
    const agent = await signedInAgent(nusrat);
    await agent.post('/auth/otp/send');
    const res = await agent.post('/auth/otp/verify').send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_INCORRECT');
  });

  it('rejects an expired code', async () => {
    const agent = await signedInAgent(nusrat);
    await agent.post('/auth/otp/send');
    await db.update(otpCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(otpCodes.phone, '+8801700000030'));

    const res = await agent.post('/auth/otp/verify').send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('caps wrong attempts at 5, even with 20 fired in parallel (fix #15)', async () => {
    const agent = await signedInAgent(nusrat);
    await agent.post('/auth/otp/send');

    const results = await Promise.all(
      Array.from({ length: 20 }, () => agent.post('/auth/otp/verify').send({ code: '000000' })),
    );
    const counts = results.reduce((acc, r) => {
      acc[r.body.error.code] = (acc[r.body.error.code] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts.OTP_INCORRECT).toBe(5);
    expect(counts.OTP_TOO_MANY_ATTEMPTS).toBe(15);

    const [row] = await db.select().from(otpCodes).where(eq(otpCodes.phone, '+8801700000030'));
    expect(row.attempts).toBe(5);
  });

  it('rejects the 6th attempt even with the right code', async () => {
    const agent = await signedInAgent(nusrat);
    const sendRes = await agent.post('/auth/otp/send');
    for (let i = 0; i < 5; i++) {
      await agent.post('/auth/otp/verify').send({ code: '000000' });
    }
    const res = await agent.post('/auth/otp/verify').send({ code: sendRes.body.demoCode });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });
});

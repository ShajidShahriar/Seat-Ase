import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';
import { showsDemoCode } from '../services/otpService.js';

const BASE = { DATABASE_URL: 'postgres://seatase:seatase@localhost:5432/seatase' };
const PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  JWT_SECRET: 'a-real-production-secret-that-is-long-enough',
};

describe('DEMO_MODE', () => {
  it('is off unless set to true', () => {
    expect(loadEnv(BASE).DEMO_MODE).toBe(false);
    expect(loadEnv({ ...BASE, DEMO_MODE: 'true' }).DEMO_MODE).toBe(true);
  });

  it('rejects anything other than true or false', () => {
    expect(() => loadEnv({ ...BASE, DEMO_MODE: 'yes' })).toThrow('DEMO_MODE');
  });
});

describe('showing the OTP code instead of sending an SMS', () => {
  it('never shows it in production without DEMO_MODE', () => {
    expect(showsDemoCode(loadEnv(PRODUCTION))).toBe(false);
  });

  it('shows it in production when DEMO_MODE is on (the Docker and hosted demo)', () => {
    expect(showsDemoCode(loadEnv({ ...PRODUCTION, DEMO_MODE: 'true' }))).toBe(true);
  });

  it('always shows it on a laptop or in tests', () => {
    expect(showsDemoCode(loadEnv({ ...BASE, NODE_ENV: 'development' }))).toBe(true);
    expect(showsDemoCode(loadEnv({ ...BASE, NODE_ENV: 'test' }))).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { loadEnv } from './env.js';
import { showsDemoCode } from '../services/otpService.js';
import { hashNid } from '../lib/nid.js';

const BASE = { DATABASE_URL: 'postgres://seatase:seatase@localhost:5432/seatase' };
const PRODUCTION = {
  ...BASE,
  NODE_ENV: 'production',
  JWT_SECRET: 'a-real-production-secret-that-is-long-enough',
  NID_PEPPER: 'a-real-production-nid-pepper-that-is-long-enough',
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

describe('NID_PEPPER (one NID = one account)', () => {
  it('refuses to start in production without a real pepper', () => {
    expect(() => loadEnv({ ...PRODUCTION, NID_PEPPER: undefined })).toThrow('NID_PEPPER');
    expect(() => loadEnv({ ...PRODUCTION, NID_PEPPER: 'too-short' })).toThrow('NID_PEPPER');
  });

  it('gives the same NID the same fingerprint even after JWT_SECRET is rotated', () => {
    const before = loadEnv({ ...PRODUCTION, JWT_SECRET: 'the-original-jwt-secret-long-enough-000' });
    const afterRotation = loadEnv({ ...PRODUCTION, JWT_SECRET: 'a-brand-new-jwt-secret-after-a-leak-111' });
    expect(hashNid('1234567890', afterRotation)).toBe(hashNid('1234567890', before));
  });

  it('gives a different fingerprint under a different pepper', () => {
    const other = loadEnv({ ...PRODUCTION, NID_PEPPER: 'a-completely-different-pepper-value-222' });
    expect(hashNid('1234567890', other)).not.toBe(hashNid('1234567890', loadEnv(PRODUCTION)));
  });
});

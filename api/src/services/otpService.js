import bcrypt from 'bcrypt';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { otpCodes, users } from '../db/schema.js';
import { AppError } from '../lib/AppError.js';
import { env } from '../config/env.js';

const BCRYPT_COST = 10;
const CODE_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const SEND_LIMIT_WINDOW_MINUTES = 15;
const SEND_LIMIT = 3;

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtp(phone) {
  const windowStart = new Date(Date.now() - SEND_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recentSends = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, windowStart)));

  if (recentSends.length >= SEND_LIMIT) {
    throw new AppError(429, 'OTP_SEND_LIMIT', 'Too many codes requested. Try again later.');
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(otpCodes).values({ phone, codeHash, expiresAt });

  return env.NODE_ENV === 'production' ? {} : { demoCode: code };
}

export async function verifyOtp(phone, code) {
  const [latest] = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.phone, phone))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!latest || latest.expiresAt < new Date()) {
    throw new AppError(400, 'OTP_EXPIRED', 'That code has expired. Request a new one.');
  }

  // The increment and the limit check happen in one statement, so Postgres serialises
  // concurrent guesses through the row lock instead of racing on a value read in JS.
  const [claimed] = await db
    .update(otpCodes)
    .set({ attempts: sql`${otpCodes.attempts} + 1` })
    .where(and(eq(otpCodes.id, latest.id), lt(otpCodes.attempts, MAX_ATTEMPTS)))
    .returning();

  if (!claimed) {
    throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Request a new code.');
  }

  const matches = await bcrypt.compare(code, latest.codeHash);
  if (!matches) {
    throw new AppError(400, 'OTP_INCORRECT', 'That code is incorrect.');
  }

  await db.update(users).set({ phoneVerifiedAt: new Date() }).where(eq(users.phone, phone));
}

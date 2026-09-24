import { env } from '../config/env.js';

export const AUTH_COOKIE = 'seat_ase_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    maxAge: MAX_AGE_MS,
  };
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, cookieOptions());
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions());
}

import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { signupSchema, loginSchema, verifyOtpSchema } from '@seat-ase/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';
import * as authController from '../controllers/authController.js';
import * as otpController from '../controllers/otpController.js';

export const authRoutes = Router();

export const AUTH_RATE_LIMIT = 10;
export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

// Keyed by phone, not just IP: several users can share one IP behind Vercel/Render's proxies.
export function createAuthLimiter(limit) {
  return rateLimit({
    windowMs: AUTH_RATE_WINDOW_MS,
    limit,
    keyGenerator: (req) => req.body?.phone ?? ipKeyGenerator(req.ip),
    standardHeaders: true,
    legacyHeaders: false,
  });
}

const authLimiter = createAuthLimiter(env.NODE_ENV === 'test' ? Number.MAX_SAFE_INTEGER : AUTH_RATE_LIMIT);

authRoutes.post('/signup', authLimiter, validate({ body: signupSchema }), authController.signup);
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', requireAuth, authController.me);

authRoutes.post('/otp/send', requireAuth, otpController.send);
authRoutes.post('/otp/verify', requireAuth, validate({ body: verifyOtpSchema }), otpController.verify);

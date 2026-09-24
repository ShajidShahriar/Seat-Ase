import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { signupSchema, loginSchema, verifyOtpSchema } from '@seat-ase/shared';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';
import * as otpController from '../controllers/otpController.js';

export const authRoutes = Router();

// Keyed by phone, not just IP: several users can share one IP behind Vercel/Render's proxies.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.body?.phone ?? ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

authRoutes.post('/signup', authLimiter, validate({ body: signupSchema }), authController.signup);
authRoutes.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', requireAuth, authController.me);

authRoutes.post('/otp/send', requireAuth, otpController.send);
authRoutes.post('/otp/verify', requireAuth, validate({ body: verifyOtpSchema }), otpController.verify);

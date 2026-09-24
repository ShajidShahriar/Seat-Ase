import { z } from 'zod';
import { phoneSchema } from './phone.js';

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  password: z.string().min(8).max(72),
  role: z.enum(['PASSENGER', 'DRIVER']),
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

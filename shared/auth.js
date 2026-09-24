import { z } from 'zod';
import { phoneSchema } from './phone.js';

export const nidSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$|^\d{13}$|^\d{17}$/, 'NID must be 10, 13 or 17 digits');

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  password: z.string().min(8).max(72),
  role: z.enum(['PASSENGER', 'DRIVER']),
  gender: z.enum(['FEMALE', 'MALE', 'UNDISCLOSED']).default('UNDISCLOSED'),
  nid: nidSchema,
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});

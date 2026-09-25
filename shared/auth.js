import { z } from 'zod';
import { phoneSchema } from './phone.js';

export const nidSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$|^\d{13}$|^\d{17}$/, 'NID must be 10, 13 or 17 digits');

export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Keep your name under 100 characters'),
  phone: phoneSchema,
  password: z.string().min(8, 'Use at least 8 characters for your password').max(72, 'Keep your password under 72 characters'),
  role: z.enum(['PASSENGER', 'DRIVER'], 'Choose passenger or driver'),
  gender: z.enum(['FEMALE', 'MALE', 'UNDISCLOSED']).default('UNDISCLOSED'),
  nid: nidSchema,
});

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'Enter your password'),
});

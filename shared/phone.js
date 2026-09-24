import { z } from 'zod';

const BD_LOCAL = /^01[3-9]\d{8}$/; // e.g. 01700000001
const BD_INTL = /^\+8801[3-9]\d{8}$/; // e.g. +8801700000001

/**
 * Normalises a Bangladeshi phone number to one canonical form (+8801XXXXXXXXX),
 * so '01700000001' and '+8801700000001' are always the same stored value.
 */
export function normalizePhone(raw) {
  const trimmed = raw.trim().replace(/[\s-]/g, '');
  if (BD_INTL.test(trimmed)) return trimmed;
  if (BD_LOCAL.test(trimmed)) return `+880${trimmed.slice(1)}`;
  return null;
}

export const phoneSchema = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Bangladeshi phone number' });
      return z.NEVER;
    }
    return normalized;
  });

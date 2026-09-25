import { z } from 'zod';

// The placeholder shipped in .env.example. Fine on a laptop, never in production.
export const EXAMPLE_JWT_SECRET = 'dev-only-secret-change-me-at-least-32-chars';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().startsWith('postgres', 'DATABASE_URL must be a postgres:// URL'),
    JWT_SECRET: z.string().optional(),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('http'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(25000),
  })
  .superRefine((env, ctx) => {
    // Red-team #38: a missing or guessable secret lets anyone forge a login as Jashim.
    if (env.NODE_ENV !== 'production') return;
    const secret = env.JWT_SECRET ?? '';
    if (secret.length < 32 || secret === EXAMPLE_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'must be set to a real secret of at least 32 characters in production',
      });
    }
  });

/**
 * Checks the environment once at startup. Throws with every problem listed,
 * so a bad deploy dies immediately instead of failing on the first login.
 * @param {Record<string, string | undefined>} source
 */
export function loadEnv(source = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  const env = result.data;
  env.JWT_SECRET ??= EXAMPLE_JWT_SECRET; // only reachable outside production
  return env;
}

export const env = loadEnv();

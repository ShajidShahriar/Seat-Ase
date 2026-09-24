import { AppError } from '../lib/AppError.js';

/**
 * Checks req.body / req.query / req.params against Zod schemas before the controller runs.
 * Parsed (and coerced) values go on req.valid, because Express 5 makes req.query read-only.
 *
 *   router.post('/requests', validate({ body: rideRequestSchema }), controller)
 *
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid = {};
    const problems = [];

    for (const [part, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          problems.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (problems.length > 0) {
      const first = problems[0];
      return next(new AppError(400, 'VALIDATION_FAILED', `${first.field}: ${first.message}`, problems));
    }
    next();
  };
}

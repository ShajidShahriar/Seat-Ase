import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';

// Red-team #14: when the database itself refuses a write, the user gets a clear 409, not a 500.
const PG_CONFLICTS = {
  23505: ['ALREADY_EXISTS', 'That already exists.'], // unique_violation, e.g. a second active booking
  23514: ['RULE_VIOLATION', 'That change breaks a rule of the ride.'], // check_violation, e.g. seats_taken > capacity
};

/** Drizzle wraps driver errors, so the Postgres code may sit one level down on `cause`. */
function postgresCode(err) {
  return err?.code ?? err?.cause?.code;
}

/** Turns anything thrown into one response shape: { error: { code, message, details? } }. */
function toAppError(err) {
  if (err instanceof AppError) return err;

  const pg = PG_CONFLICTS[postgresCode(err)];
  if (pg) return new AppError(409, pg[0], pg[1]);

  // express.json() could not parse the body
  if (err?.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }

  return null; // unexpected: a bug on our side
}

export function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
}

// Express knows this is the error middleware because it takes 4 arguments,
// so `next` must stay in the signature even though it is unused.
export function errorHandler(err, req, res, next) {
  const log = req.log ?? logger;
  const known = toAppError(err);

  if (known) {
    if (postgresCode(err) in PG_CONFLICTS) {
      log.warn('database refused write', {
        errorCode: known.code,
        pgCode: postgresCode(err),
        constraint: err.constraint ?? err.cause?.constraint,
      });
    }
    const body = { code: known.code, message: known.message };
    if (known.details) body.details = known.details;
    return res.status(known.status).json({ error: body });
  }

  log.error('unhandled error', { error: err?.message, stack: err?.stack });
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong on our side.', requestId: req.id },
  });
}

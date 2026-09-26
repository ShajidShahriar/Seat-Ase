import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createDemoGuard } from '../middleware/demoGuard.js';
import { env } from '../config/env.js';
import * as devController from '../controllers/devController.js';

export const devRoutes = Router();

// ---- Guard first, so a stranger gets a 404 or 401 and never reaches the limiter or a scenario ----

const devLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.NODE_ENV === 'test' ? Number.MAX_SAFE_INTEGER : 30,
  standardHeaders: true,
  legacyHeaders: false,
});

devRoutes.use(createDemoGuard(), devLimiter);
devRoutes.post('/scenario/:name', devController.scenario);

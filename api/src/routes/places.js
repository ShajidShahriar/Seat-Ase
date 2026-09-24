import { Router } from 'express';
import { nearestStandSchema } from '@seat-ase/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as placesController from '../controllers/placesController.js';

export const placesRoutes = Router();

placesRoutes.get('/places', requireAuth, placesController.searchPlaces);
placesRoutes.get('/zones', requireAuth, placesController.listZones);
placesRoutes.get('/zones/:zoneId/online-count', requireAuth, placesController.onlineCount);
placesRoutes.post(
  '/places/nearest-stand',
  requireAuth,
  validate({ body: nearestStandSchema }),
  placesController.nearestStand,
);

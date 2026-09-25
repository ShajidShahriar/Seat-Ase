import { Router } from 'express';
import { fareEstimateSchema, fareQuoteSchema } from '@seat-ase/shared';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as fareController from '../controllers/fareController.js';

export const fareRoutes = Router();

fareRoutes.post('/fares/estimate', requireAuth, validate({ body: fareEstimateSchema }), fareController.estimate);
fareRoutes.post('/fares/quote', requireAuth, validate({ body: fareQuoteSchema }), fareController.quote);

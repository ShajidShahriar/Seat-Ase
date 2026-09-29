import { Router } from 'express';
import { createRideRequestSchema, idParamsSchema } from '@seat-ase/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { validate } from '../middleware/validate.js';
import * as rideRequestController from '../controllers/rideRequestController.js';

export const requestRoutes = Router();

const validId = validate({ params: idParamsSchema });

requestRoutes.post(
  '/requests',
  requireAuth,
  requireRole('PASSENGER'),
  requireVerified,
  validate({ body: createRideRequestSchema }),
  rideRequestController.create,
);
requestRoutes.get('/requests', requireAuth, requireRole('PASSENGER'), rideRequestController.list);
requestRoutes.get('/requests/:id', requireAuth, requireRole('PASSENGER'), validId, rideRequestController.getOne);
requestRoutes.post('/requests/:id/cancel', requireAuth, requireRole('PASSENGER'), validId, rideRequestController.cancel);
requestRoutes.get('/requests/:id/timeline', requireAuth, requireRole('PASSENGER'), validId, rideRequestController.getTimeline);
requestRoutes.get('/requests/:id/ride', requireAuth, requireRole('PASSENGER'), validId, rideRequestController.getRideInfo);

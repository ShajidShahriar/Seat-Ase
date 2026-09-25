import { Router } from 'express';
import { createRideRequestSchema } from '@seat-ase/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { validate } from '../middleware/validate.js';
import * as rideRequestController from '../controllers/rideRequestController.js';

export const requestRoutes = Router();

requestRoutes.post(
  '/requests',
  requireAuth,
  requireRole('PASSENGER'),
  requireVerified,
  validate({ body: createRideRequestSchema }),
  rideRequestController.create,
);
requestRoutes.get('/requests', requireAuth, requireRole('PASSENGER'), rideRequestController.list);
requestRoutes.get('/requests/:id', requireAuth, requireRole('PASSENGER'), rideRequestController.getOne);
requestRoutes.post('/requests/:id/cancel', requireAuth, requireRole('PASSENGER'), rideRequestController.cancel);
requestRoutes.get('/requests/:id/timeline', requireAuth, requireRole('PASSENGER'), rideRequestController.getTimeline);

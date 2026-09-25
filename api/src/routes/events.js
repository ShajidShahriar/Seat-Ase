import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as eventsController from '../controllers/eventsController.js';

export const eventRoutes = Router();

eventRoutes.get('/events/stream', requireAuth, eventsController.stream);

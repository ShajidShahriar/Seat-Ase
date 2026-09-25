import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { authRoutes } from './auth.js';
import { driverRoutes } from './driver.js';
import { placesRoutes } from './places.js';
import { fareRoutes } from './fares.js';
import { requestRoutes } from './requests.js';
import { eventRoutes } from './events.js';

// Maps URLs to controllers. No logic lives here.
export const routes = Router();

routes.get('/health', health);
routes.use('/auth', authRoutes);
routes.use('/driver', driverRoutes);
routes.use(placesRoutes);
routes.use(fareRoutes);
routes.use(requestRoutes);
routes.use(eventRoutes);

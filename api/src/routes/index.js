import { Router } from 'express';
import { health } from '../controllers/healthController.js';
import { authRoutes } from './auth.js';
import { driverRoutes } from './driver.js';

// Maps URLs to controllers. No logic lives here.
export const routes = Router();

routes.get('/health', health);
routes.use('/auth', authRoutes);
routes.use('/driver', driverRoutes);

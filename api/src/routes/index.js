import { Router } from 'express';
import { health } from '../controllers/healthController.js';

// Maps URLs to controllers. No logic lives here.
export const routes = Router();

routes.get('/health', health);

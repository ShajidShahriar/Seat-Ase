import { Router } from 'express';
import { addVehicleSchema } from '@seat-ase/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as vehicleController from '../controllers/vehicleController.js';

export const driverRoutes = Router();

driverRoutes.use(requireAuth, requireRole('DRIVER'));

driverRoutes.post('/vehicle', validate({ body: addVehicleSchema }), vehicleController.addVehicle);
driverRoutes.get('/vehicle', vehicleController.getVehicle);

import { Router } from 'express';
import { addVehicleSchema, goOnlineSchema } from '@seat-ase/shared';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as vehicleController from '../controllers/vehicleController.js';
import * as driverRideController from '../controllers/driverRideController.js';

export const driverRoutes = Router();

driverRoutes.use(requireAuth, requireRole('DRIVER'));

driverRoutes.post('/vehicle', validate({ body: addVehicleSchema }), vehicleController.addVehicle);
driverRoutes.get('/vehicle', vehicleController.getVehicle);
driverRoutes.post('/online', validate({ body: goOnlineSchema }), vehicleController.goOnline);
driverRoutes.post('/offline', vehicleController.goOffline);

driverRoutes.get('/requests', driverRideController.listRequests);
driverRoutes.post('/ride/requests/:id/accept', driverRideController.accept);
driverRoutes.post('/ride/cancel', driverRideController.cancelRide);
driverRoutes.post('/ride/arrived', driverRideController.arrive);
driverRoutes.post('/ride/requests/:id/board', driverRideController.board);
driverRoutes.post('/ride/requests/:id/no-show', driverRideController.noShow);
driverRoutes.post('/ride/start', driverRideController.start);
driverRoutes.post('/ride/requests/:id/drop', driverRideController.drop);
driverRoutes.get('/ride', driverRideController.getRide);
driverRoutes.get('/history', driverRideController.getHistory);

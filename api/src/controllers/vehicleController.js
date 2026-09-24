import * as vehicleService from '../services/vehicleService.js';
import { AppError } from '../lib/AppError.js';

export async function addVehicle(req, res) {
  const existing = await vehicleService.getVehicleByDriver(req.user.id);
  if (existing) {
    throw new AppError(409, 'VEHICLE_EXISTS', 'You already have a registered vehicle.');
  }
  const vehicle = await vehicleService.addVehicle(req.user.id, req.valid.body);
  res.status(201).json({ vehicle });
}

export async function getVehicle(req, res) {
  const vehicle = await vehicleService.getVehicleByDriver(req.user.id);
  if (!vehicle) {
    throw new AppError(404, 'NOT_FOUND', 'You have no registered vehicle yet.');
  }
  res.json({ vehicle });
}

export async function goOnline(req, res) {
  const vehicle = await vehicleService.goOnline(req.user.id, req.valid.body.zoneId);
  res.json({ vehicle });
}

export async function goOffline(req, res) {
  const vehicle = await vehicleService.goOffline(req.user.id);
  res.json({ vehicle });
}

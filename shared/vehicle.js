import { z } from 'zod';

export const addVehicleSchema = z.object({
  name: z.string().trim().min(1, 'Enter your car\'s name').max(50, 'Keep the name under 50 characters'),
  registrationNo: z.string().trim().min(1, 'Enter your number plate').max(30, 'Keep the plate under 30 characters'),
  capacity: z
    .number('Choose how many passenger seats you have')
    .int('Choose how many passenger seats you have')
    .min(1, 'You need at least 1 passenger seat')
    .max(6, 'The most we allow is 6 passenger seats'),
});

export const goOnlineSchema = z.object({
  zoneId: z.string().uuid(),
});

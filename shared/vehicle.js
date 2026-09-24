import { z } from 'zod';

export const addVehicleSchema = z.object({
  name: z.string().trim().min(1).max(50),
  registrationNo: z.string().trim().min(1).max(30),
  capacity: z.number().int().min(1).max(6),
});

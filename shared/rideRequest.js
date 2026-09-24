import { z } from 'zod';

export const createRideRequestSchema = z.object({
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  dropLat: z.number().min(-90).max(90),
  dropLng: z.number().min(-180).max(180),
  seats: z.number().int().min(1).max(6),
  rideType: z.enum(['SHARED', 'PRIVATE']).default('SHARED'),
  womenOnly: z.boolean().default(false),
});

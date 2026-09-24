import { z } from 'zod';

export const fareEstimateSchema = z.object({
  pickupZoneId: z.string().uuid(),
  dropZoneId: z.string().uuid(),
  seats: z.number().int().min(1).max(6).default(1),
});

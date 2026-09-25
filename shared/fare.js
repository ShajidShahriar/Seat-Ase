import { z } from 'zod';

export const fareEstimateSchema = z.object({
  pickupZoneId: z.string().uuid(),
  dropZoneId: z.string().uuid(),
  seats: z.number().int().min(1).max(6).default(1),
});

export const fareQuoteSchema = z.object({
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
  dropLat: z.number().min(-90).max(90),
  dropLng: z.number().min(-180).max(180),
  seats: z.number().int().min(1).max(6).default(1),
});

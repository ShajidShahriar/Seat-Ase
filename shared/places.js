import { z } from 'zod';

export const nearestStandSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const zoneIdParamsSchema = z.object({ zoneId: z.uuid('That id is not valid.') });

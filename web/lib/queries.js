'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from './api.js';

// ---- Who is logged in (null when nobody is) ----

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user } = await api.get('/auth/me');
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

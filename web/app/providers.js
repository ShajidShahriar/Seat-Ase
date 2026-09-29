'use client';

import { createContext, useContext, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../lib/api.js';
import { useMe } from '../lib/queries.js';
import { useLiveUpdates } from '../lib/useLiveUpdates.js';

// ---- Query defaults: never retry a 4xx, the answer won't change; keep retrying for about a minute while the server wakes ----

const wakingUp = (error) => error instanceof ApiError && error.code === 'WAKING_UP';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (wakingUp(error)) return failureCount < 6;
          return !(error instanceof ApiError && error.status < 500) && failureCount < 2;
        },
        retryDelay: (attempt, error) => (wakingUp(error) ? 10_000 : Math.min(1000 * 2 ** attempt, 30_000)),
      },
    },
  });
}

// ---- Live updates run for as long as someone is logged in ----

const LiveStatusContext = createContext('off');

export function useLiveStatus() {
  return useContext(LiveStatusContext);
}

function LiveUpdates({ children }) {
  const { data: me } = useMe();
  const status = useLiveUpdates(Boolean(me));
  return <LiveStatusContext.Provider value={status}>{children}</LiveStatusContext.Provider>;
}

export function Providers({ children }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <LiveUpdates>{children}</LiveUpdates>
    </QueryClientProvider>
  );
}

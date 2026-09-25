'use client';

import { createContext, useContext, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../lib/api.js';
import { useMe } from '../lib/queries.js';
import { useLiveUpdates } from '../lib/useLiveUpdates.js';

// ---- Query defaults: never retry a 4xx, the answer won't change ----

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
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

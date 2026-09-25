'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// ---- Which cached data each nudge makes stale ----

const STALE_KEYS = {
  'booking.updated': [['bookings']],
  'ride.updated': [['bookings'], ['driver']],
  'waiting-list.updated': [['driver', 'requests']],
};

const EVERYTHING_LIVE = [['bookings'], ['driver']];

const SILENCE_BEFORE_POLLING_MS = 30_000;
const POLL_EVERY_MS = 5_000;
const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

// ---- One EventSource per logged-in tab; polling takes over if it goes quiet, and we reconnect ourselves if the browser gives up ----

export function useLiveUpdates(enabled) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('off');

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return undefined;
    }

    const refetch = (keys) => keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    let lastMessageAt = Date.now();
    let hasOpenedBefore = false;
    let retryMs = FIRST_RETRY_MS;
    let source;
    let retryTimer;

    function connect() {
      source = new EventSource('/api/events/stream');

      source.onopen = () => {
        if (hasOpenedBefore) refetch(EVERYTHING_LIVE);
        hasOpenedBefore = true;
        retryMs = FIRST_RETRY_MS;
      };

      source.onmessage = (message) => {
        lastMessageAt = Date.now();
        setStatus('live');
        const nudge = JSON.parse(message.data);
        refetch(STALE_KEYS[nudge.type] ?? []);
      };

      source.onerror = () => {
        if (source.readyState !== EventSource.CLOSED) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      };
    }

    connect();

    const poller = setInterval(() => {
      if (Date.now() - lastMessageAt < SILENCE_BEFORE_POLLING_MS) return;
      setStatus('polling');
      refetch(EVERYTHING_LIVE);
    }, POLL_EVERY_MS);

    return () => {
      clearInterval(poller);
      clearTimeout(retryTimer);
      source.close();
    };
  }, [enabled, queryClient]);

  return status;
}

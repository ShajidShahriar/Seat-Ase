'use client';

import { useEffect, useState } from 'react';

// ---- The current time, refreshed on a timer so "waiting 3 min" keeps counting ----

export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

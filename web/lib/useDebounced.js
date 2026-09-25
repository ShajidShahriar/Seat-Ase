'use client';

import { useEffect, useState } from 'react';

// ---- A value that only settles after the user stops typing ----

export function useDebounced(value, delayMs = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

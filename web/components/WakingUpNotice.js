'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// ---- While the free server wakes up, say so at the top of the sheet instead of showing an empty page ----

function isWakingUp(queryCache) {
  return queryCache.getAll().some((query) => (query.state.fetchFailureReason ?? query.state.error)?.code === 'WAKING_UP');
}

export default function WakingUpNotice() {
  const queryCache = useQueryClient().getQueryCache();
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    setWaking(isWakingUp(queryCache));
    return queryCache.subscribe(() => setWaking(isWakingUp(queryCache)));
  }, [queryCache]);

  if (!waking) return null;
  return (
    <div role="status" className="mb-4 rounded-cell bg-grouped-cell px-4 py-3">
      <p className="text-headline">Waking up</p>
      <p className="mt-0.5 text-subhead text-label-secondary">Seat Ase? was asleep after a quiet spell. This takes up to a minute, and the page fills in by itself.</p>
    </div>
  );
}

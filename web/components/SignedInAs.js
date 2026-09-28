'use client';

import { useMe } from '../lib/queries.js';

// ---- Who is logged in on this browser, always in the top right corner ----

export default function SignedInAs() {
  const { data: me } = useMe();
  if (!me) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-20">
      <div className="rounded-cell bg-grouped-cell px-3 py-1.5 shadow-[0_2px_12px_rgb(0_0_0/0.14)]">
        <p className="max-w-[50vw] text-right" aria-label={`Logged in as ${me.name}`}>
          <span className="block truncate text-subhead font-semibold">{me.name}</span>
          <span className="block text-caption text-label-secondary">{me.role === 'DRIVER' ? 'Driver' : 'Passenger'}</span>
        </p>
      </div>
    </div>
  );
}

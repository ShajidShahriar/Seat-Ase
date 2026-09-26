'use client';

import { useMe } from '../lib/queries.js';

// ---- Who is logged in on this browser, always in the top right corner ----

export default function SignedInAs() {
  const { data: me } = useMe();
  if (!me) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-md justify-end px-4 pt-3">
        <p className="max-w-[60%] text-right" aria-label={`Logged in as ${me.name}`}>
          <span className="block truncate text-subhead font-semibold">{me.name}</span>
          <span className="block text-caption text-label-secondary">{me.role === 'DRIVER' ? 'Driver' : 'Passenger'}</span>
        </p>
      </div>
    </div>
  );
}

'use client';

import { Group, PrimaryButton, ErrorText } from './ui.js';
import { Seat } from './icons.js';
import { useNow } from '../lib/useNow.js';
import { useAcceptRequest, useZones } from '../lib/queries.js';

// ---- How long a request has been waiting, in words ----

function waitingText(queuedAt, now) {
  const minutes = Math.max(0, Math.floor((now - new Date(queuedAt).getTime()) / 60_000));
  return minutes === 0 ? 'Just now' : `${minutes} min`;
}

// ---- One waiting request, as the driver sees it before accepting ----

export default function RequestCard({ request }) {
  const zones = useZones();
  const now = useNow();
  const accept = useAcceptRequest();
  const dropName = zones.data?.find((zone) => zone.id === request.dropZoneId)?.name;
  const isPrivate = request.rideType === 'PRIVATE';

  const details = [isPrivate ? 'Private hire' : 'Shared', `${request.seats} ${request.seats === 1 ? 'seat' : 'seats'}`];
  if (request.womenOnly) details.push('Women-only');

  return (
    <Group>
      <div className="px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-headline">
            {request.pickupZoneName}
            {dropName ? ` to ${dropName}` : ''}
          </p>
          <span className="shrink-0 text-footnote text-label-secondary">{waitingText(request.queuedAt, now)}</span>
        </div>

        <p className="mt-0.5 text-subhead text-label-secondary">
          {isPrivate ? 'Pickup shown after you accept' : request.pickupStandName}
        </p>

        <div className="mt-2 flex items-center gap-2 text-subhead">
          <span className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: request.seats }, (_, index) => (
              <Seat key={index} />
            ))}
          </span>
          <span>{details.join(', ')}</span>
        </div>

        {request.fits ? (
          <div className="mt-3">
            <PrimaryButton onClick={() => accept.mutate(request.id)} loading={accept.isPending}>
              Accept
            </PrimaryButton>
            <ErrorText>{accept.error?.message}</ErrorText>
          </div>
        ) : (
          <div className="mt-3 border-t border-separator pt-2">
            <p className="text-footnote font-semibold text-red">Does not fit your ride</p>
            {request.reasons.map((reason) => (
              <p key={reason.rule} className="text-footnote text-label-secondary">
                {reason.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </Group>
  );
}

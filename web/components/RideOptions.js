'use client';

import { Group, Separator, Row, ErrorText, Segmented, Toggle } from './ui.js';
import { useOnlineCount, useZones } from '../lib/queries.js';
import { formatTaka } from '../lib/format.js';

const RIDE_TYPES = [
  { value: 'SHARED', label: 'Shared' },
  { value: 'PRIVATE', label: 'Private' },
];

const SEAT_OPTIONS = [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }));

// ---- How many Teslas are waiting where the passenger will be picked up ----

function OnlineCount({ zoneId }) {
  const count = useOnlineCount(zoneId);
  const zones = useZones();
  const zoneName = zones.data?.find((zone) => zone.id === zoneId)?.name;

  if (count.isPending || !zoneName) return null;
  if (count.isError) return null;
  if (count.data === 0) return <p className="px-4 pt-2 text-footnote text-label-secondary">No Teslas online in {zoneName} right now. You can still request and wait.</p>;
  return (
    <p className="px-4 pt-2 text-footnote text-label-secondary">
      {count.data} {count.data === 1 ? 'Tesla is' : 'Teslas are'} online in {zoneName}.
    </p>
  );
}

// ---- Shared or private, seats, women-only, and what it will cost ----

export default function RideOptions({ isFemale, options, onChange, quote }) {
  const set = (patch) => onChange({ ...options, ...patch });
  const isPrivate = options.rideType === 'PRIVATE';

  return (
    <div className="flex flex-col gap-6">
      <Segmented
        label="Ride type"
        options={RIDE_TYPES}
        value={options.rideType}
        onChange={(rideType) => set({ rideType, womenOnly: rideType === 'PRIVATE' ? false : options.womenOnly })}
      />

      {isPrivate ? null : (
        <Group header="Seats" footer={isFemale ? 'A women-only ride is shared only with other women.' : undefined}>
          <div className="p-2">
            <Segmented label="Seats" options={SEAT_OPTIONS} value={options.seats} onChange={(seats) => set({ seats })} />
          </div>
          {isFemale ? (
            <>
              <Separator />
              <Row>
                <span className="flex-1">Women-only ride</span>
                <Toggle label="Women-only ride" checked={options.womenOnly} onChange={(womenOnly) => set({ womenOnly })} />
              </Row>
            </>
          ) : null}
        </Group>
      )}

      {quote.isPending ? <p className="px-4 text-subhead text-label-secondary">Working out the fare</p> : null}
      {quote.isError ? <ErrorText>{quote.error.message}</ErrorText> : null}
      {quote.data ? (
        <div>
          <Group header="Fare">
            <Row>
              <span className="min-w-0 flex-1">
                <span className="block">{isPrivate ? 'Private ride' : options.seats === 1 ? 'Shared ride' : `Shared ride, ${options.seats} seats`}</span>
                <span className="block text-footnote text-label-secondary">
                  {isPrivate
                    ? 'The whole car, priced for a 3 seat Tesla'
                    : `${formatTaka(quote.data.shared.soloPoysha)} if nobody else joins. You pay cash to the driver.`}
                </span>
              </span>
              <span className="text-headline">{formatTaka(isPrivate ? quote.data.private.privatePoysha : quote.data.shared.pooledPoysha)}</span>
            </Row>
          </Group>
          <OnlineCount zoneId={isPrivate ? quote.data.private.pickupZoneId : quote.data.shared.pickupZoneId} />
        </div>
      ) : null}
    </div>
  );
}

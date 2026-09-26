'use client';

import { useEffect, useState } from 'react';
import { Group, Separator, Row, PrimaryButton, ErrorText } from './ui.js';
import { Seat } from './icons.js';
import { useArrive, useCancelRide, useZones } from '../lib/queries.js';
import { formatTaka } from '../lib/format.js';

// ---- Seats on this ride: filled for taken, outlined for free ----

function SeatRow({ taken, capacity }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: capacity }, (_, index) => (
          <Seat key={index} filled={index < taken} />
        ))}
      </span>
      <span className="text-label-secondary">
        {taken} of {capacity}
      </span>
    </span>
  );
}

// ---- The ride the driver has taken on, and what to do next ----

export default function DriverRide({ ride, passengers }) {
  const zones = useZones();
  const arrive = useArrive();
  const cancel = useCancelRide();
  const [confirming, setConfirming] = useState(false);
  const zoneName = zones.data?.find((zone) => zone.id === ride.zoneId)?.name;

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <div className="mt-8 flex flex-col gap-8">
      <Group header="Your ride">
        <Row>
          <span className="flex-1">Pickup area</span>
          <span className="text-label-secondary">{zoneName}</span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Seats</span>
          <SeatRow taken={ride.seatsTaken} capacity={ride.capacity} />
        </Row>
      </Group>

      <Group header="Passengers, in drop off order">
        {passengers.map((passenger, index) => (
          <div key={passenger.id}>
            {index > 0 ? <Separator /> : null}
            <Row>
              <span className="min-w-0 flex-1">
                <span className="block">{passenger.passengerName}</span>
                <span className="block text-footnote text-label-secondary">
                  {index + 1}. Drops at {passenger.dropZoneName}, {passenger.seats} {passenger.seats === 1 ? 'seat' : 'seats'}
                </span>
              </span>
              <span className="text-subhead text-label-secondary">
                {passenger.farePoysha ? formatTaka(passenger.farePoysha) : passenger.fareCapPoysha ? `Up to ${formatTaka(passenger.fareCapPoysha)}` : ''}
              </span>
            </Row>
          </div>
        ))}
      </Group>

      {ride.status === 'OPEN' ? (
        <div>
          <PrimaryButton onClick={() => arrive.mutate()} loading={arrive.isPending}>
            I have arrived at the stand
          </PrimaryButton>
          <ErrorText>{arrive.error?.message}</ErrorText>
        </div>
      ) : null}

      {ride.status === 'OPEN' ? (
        <div>
          <Group footer={confirming ? 'Everyone on this ride goes back to waiting for another driver.' : undefined}>
            <Row onClick={confirming ? () => cancel.mutate() : () => setConfirming(true)} disabled={cancel.isPending}>
              <span className="flex-1 text-red">{confirming ? 'Tap again to cancel this ride' : 'Cancel this ride'}</span>
            </Row>
          </Group>
          <ErrorText>{cancel.error?.message}</ErrorText>
        </div>
      ) : null}
    </div>
  );
}

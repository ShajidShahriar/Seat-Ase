'use client';

import { useEffect, useState } from 'react';
import { Group, Separator, Row, PrimaryButton, SmallButton, ErrorText } from './ui.js';
import { Seat } from './icons.js';
import { useArrive, useBoard, useCancelRide, useDrop, useNoShow, useStart, useZones } from '../lib/queries.js';
import { useNow } from '../lib/useNow.js';
import { formatTaka } from '../lib/format.js';

const NO_SHOW_WAIT_MS = 5 * 60 * 1000;

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

// ---- One passenger: who, where they get off, and what the driver can do about them ----

function PassengerRow({ passenger, index, arrived, waitOver, started, onDrop, dropError }) {
  const board = useBoard();
  const noShow = useNoShow();
  const boarded = Boolean(passenger.boardedAt);
  const fare = passenger.farePoysha ? formatTaka(passenger.farePoysha) : passenger.fareCapPoysha ? `Up to ${formatTaka(passenger.fareCapPoysha)}` : '';

  return (
    <>
      <Row>
        <span className="min-w-0 flex-1">
          <span className="block">{passenger.passengerName}</span>
          <span className="block text-footnote text-label-secondary">
            {index + 1}. Drops at {passenger.dropZoneName}, {passenger.seats} {passenger.seats === 1 ? 'seat' : 'seats'}
          </span>
          {arrived ? <span className="block text-footnote text-label-secondary">{fare}</span> : null}
          {started ? <span className="block text-subhead font-semibold">Collect {formatTaka(passenger.farePoysha)} in cash</span> : null}
          {arrived && !boarded ? (
            <span className="mt-2 flex gap-2">
              <SmallButton loading={board.isPending} onClick={() => board.mutate(passenger.id)}>
                Board
              </SmallButton>
              {waitOver ? (
                <SmallButton tone="red" loading={noShow.isPending} onClick={() => noShow.mutate(passenger.id)}>
                  No-show
                </SmallButton>
              ) : null}
            </span>
          ) : null}
        </span>

        {arrived && boarded ? <span className="text-subhead font-semibold text-green">On board</span> : null}
        {onDrop ? <SmallButton onClick={onDrop}>Drop</SmallButton> : null}
        {arrived || started ? null : <span className="text-subhead text-label-secondary">{fare}</span>}
      </Row>
      <ErrorText>{board.error?.message ?? noShow.error?.message ?? dropError}</ErrorText>
    </>
  );
}

// ---- Minutes and seconds left, like 3:05 ----

function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ---- The ride the driver has taken on, and what to do next ----

export default function DriverRide({ ride, passengers, onCompleted }) {
  const zones = useZones();
  const arrive = useArrive();
  const start = useStart();
  const cancel = useCancelRide();
  const drop = useDrop(onCompleted);
  const [confirming, setConfirming] = useState(false);
  const arrived = ride.status === 'ARRIVED';
  const started = ride.status === 'STARTED';
  const now = useNow(arrived ? 1000 : 60_000);
  const zoneName = zones.data?.find((zone) => zone.id === ride.zoneId)?.name;

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const boardedCount = passengers.filter((passenger) => passenger.boardedAt).length;
  const leftBehind = passengers.filter((passenger) => !passenger.boardedAt).map((passenger) => passenger.passengerName);
  const msUntilNoShow = arrived ? new Date(ride.arrivedAt).getTime() + NO_SHOW_WAIT_MS - now : 0;
  const waitOver = msUntilNoShow <= 0;

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

      <Group
        header={arrived ? 'Passengers at the stand' : 'Passengers, in drop off order'}
        footer={arrived && leftBehind.length > 0 && !waitOver ? `You can mark a no-show in ${clock(msUntilNoShow)}.` : undefined}
      >
        {passengers.map((passenger, index) => (
          <div key={passenger.id}>
            {index > 0 ? <Separator /> : null}
            <PassengerRow
              passenger={passenger}
              index={index}
              arrived={arrived}
              waitOver={waitOver}
              started={started}
              onDrop={started && passengers.length > 1 ? () => drop.mutate(passenger.id) : undefined}
              dropError={drop.variables === passenger.id ? drop.error?.message : undefined}
            />
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

      {arrived ? (
        <div>
          <PrimaryButton onClick={() => start.mutate()} loading={start.isPending} disabled={boardedCount === 0}>
            Start trip
          </PrimaryButton>
          {boardedCount > 0 && leftBehind.length > 0 ? (
            <p className="px-4 pt-2 text-footnote text-label-secondary">
              {leftBehind.join(' and ')} {leftBehind.length === 1 ? 'is' : 'are'} not on board and will go back to waiting when you start.
            </p>
          ) : null}
          {boardedCount === 0 ? <p className="px-4 pt-2 text-footnote text-label-secondary">Board at least one passenger to start.</p> : null}
          <ErrorText>{start.error?.message}</ErrorText>
        </div>
      ) : null}

      {started && passengers.length === 1 ? (
        <div>
          <PrimaryButton onClick={() => drop.mutate(passengers[0].id)} loading={drop.isPending}>
            Drop {passengers[0].passengerName} &amp; complete trip
          </PrimaryButton>
          <ErrorText>{drop.error?.message}</ErrorText>
        </div>
      ) : null}

      {ride.status === 'OPEN' || arrived ? (
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

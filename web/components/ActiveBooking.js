'use client';

import { useEffect, useState } from 'react';
import { Group, Separator, Row, ErrorText } from './ui.js';
import Stepper from './Stepper.js';
import { useCancelBooking, useRideInfo, useTimeline, useZones } from '../lib/queries.js';
import { EVENT_LABELS, STATUS_TITLES, STEPS, STEP_OF_STATUS } from '../lib/bookings.js';
import { formatDhakaTime, formatTaka } from '../lib/format.js';

// ---- One sentence about the step the passenger is on ----

function stepDetail(booking, ride, zoneName) {
  const stand = ride?.pickupStandName ?? 'the stand';
  switch (booking.status) {
    case 'REQUESTED':
      return `Waiting for a driver in ${zoneName(booking.pickupZoneId)}.`;
    case 'MATCHED':
      return ride ? `${ride.driverName} is heading to ${stand}.` : 'A driver is heading to you.';
    case 'DRIVER_ARRIVED':
      return booking.boardedAt ? 'You are on board. The trip starts soon.' : `Your Tesla is at ${stand}. Go there now.`;
    case 'IN_PROGRESS':
      return `Heading to ${zoneName(booking.dropZoneId)}. Pay the driver in cash when you get off.`;
    default:
      return undefined;
  }
}

// ---- What the passenger pays: a ceiling until the trip starts, then the exact fare ----

function fareText(booking) {
  if (booking.farePoysha) return formatTaka(booking.farePoysha);
  if (booking.fareCapPoysha) return `Up to ${formatTaka(booking.fareCapPoysha)}`;
  return null;
}

// ---- A booking in progress: where it is, who is coming, what it costs, what has happened ----

export default function ActiveBooking({ booking }) {
  const zones = useZones();
  const cancel = useCancelBooking();
  const hasRide = booking.status !== 'REQUESTED';
  const rideInfo = useRideInfo(booking.id, { enabled: hasRide });
  const timeline = useTimeline(booking.id);
  const [confirming, setConfirming] = useState(false);
  const zoneName = (id) => zones.data?.find((zone) => zone.id === id)?.name;
  const ride = rideInfo.data;
  const fare = fareText(booking);
  const canCancel = booking.status !== 'IN_PROGRESS';

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const askBeforeCancelling = booking.status !== 'REQUESTED';

  return (
    <>
      <h1 className="text-large-title">{STATUS_TITLES[booking.status]}</h1>

      <Group className="mt-8">
        <Stepper steps={STEPS} current={STEP_OF_STATUS[booking.status]} detail={stepDetail(booking, ride, zoneName)} />
      </Group>

      <Group className="mt-8" header="Your booking" footer={fare ? 'You pay the driver in cash.' : undefined}>
        <Row>
          <span className="flex-1">Route</span>
          <span className="text-label-secondary">
            {zoneName(booking.pickupZoneId)} to {zoneName(booking.dropZoneId)}
          </span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Ride</span>
          <span className="text-label-secondary">
            {booking.rideType === 'PRIVATE' ? 'Private' : booking.womenOnly ? 'Women-only shared' : 'Shared'}, {booking.seats} {booking.seats === 1 ? 'seat' : 'seats'}
          </span>
        </Row>
        {fare ? (
          <>
            <Separator />
            <Row>
              <span className="flex-1">Fare</span>
              <span className="font-semibold">{fare}</span>
            </Row>
          </>
        ) : null}
      </Group>

      {ride ? (
        <Group className="mt-8" header="Your Tesla">
          <Row>
            <span className="flex-1">Driver</span>
            <span className="text-label-secondary">{ride.driverName}</span>
          </Row>
          <Separator />
          <Row>
            <span className="flex-1">Car</span>
            <span className="text-label-secondary">{ride.vehicle.name}</span>
          </Row>
          <Separator />
          <Row>
            <span className="flex-1">Plate</span>
            <span className="text-label-secondary">{ride.vehicle.registrationNo}</span>
          </Row>
          <Separator />
          <Row>
            <span className="flex-1">Pickup</span>
            <span className="text-right text-label-secondary">{ride.pickupStandName}</span>
          </Row>
          <Separator />
          <Row>
            <span className="flex-1">Seats booked</span>
            <span className="text-label-secondary">
              {ride.seatsTaken} of {ride.capacity}
            </span>
          </Row>
        </Group>
      ) : null}

      {ride && ride.coRiders.length > 0 ? (
        <Group className="mt-8" header="Also on this ride" footer="You see first names only.">
          {ride.coRiders.map((coRider, index) => (
            <div key={`${coRider.firstName}-${index}`}>
              {index > 0 ? <Separator /> : null}
              <Row>
                <span className="flex-1">{coRider.firstName}</span>
                <span className="text-label-secondary">Drops at {coRider.dropZoneName}</span>
              </Row>
            </div>
          ))}
        </Group>
      ) : null}

      {timeline.data && timeline.data.length > 0 ? (
        <Group className="mt-8" header="What has happened">
          {timeline.data.map((event, index) => (
            <div key={`${event.type}-${event.createdAt}-${index}`}>
              {index > 0 ? <Separator /> : null}
              <Row>
                <span className="min-w-0 flex-1">{EVENT_LABELS[event.type] ?? event.type}</span>
                <span className="shrink-0 text-footnote text-label-secondary">{formatDhakaTime(event.createdAt)}</span>
              </Row>
            </div>
          ))}
        </Group>
      ) : null}

      {canCancel ? (
        <div className="mt-8">
          <Group
            footer={
              confirming
                ? 'Your seat is given up and the driver is told.'
                : booking.status === 'REQUESTED'
                  ? 'Drivers in your area can see your request. It expires after 15 minutes.'
                  : undefined
            }
          >
            <Row
              onClick={askBeforeCancelling && !confirming ? () => setConfirming(true) : () => cancel.mutate(booking.id, { onSettled: () => setConfirming(false) })}
              disabled={cancel.isPending}
            >
              <span className="flex-1 text-red">{confirming ? 'Tap again to cancel your ride' : booking.status === 'REQUESTED' ? 'Cancel request' : 'Cancel my ride'}</span>
            </Row>
          </Group>
          <ErrorText>{cancel.error?.message}</ErrorText>
        </div>
      ) : null}
    </>
  );
}

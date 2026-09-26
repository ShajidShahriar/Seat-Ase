'use client';

import { Group, Separator, Row } from './ui.js';
import { useRideInfo, useZones } from '../lib/queries.js';
import { formatDhakaTime, formatTaka } from '../lib/format.js';

const OUTCOMES = { CANCELLED: 'Cancelled', EXPIRED: 'Expired', NO_SHOW: 'No-show' };

// ---- The receipt for the trip that just finished ----

export function Receipt({ booking, onDone }) {
  const zones = useZones();
  const rideInfo = useRideInfo(booking.id, { enabled: true });
  const zoneName = (id) => zones.data?.find((zone) => zone.id === id)?.name;
  const ride = rideInfo.data;

  return (
    <div className="mb-10 flex flex-col gap-4">
      <h1 className="text-large-title">Trip complete</h1>

      <Group header="Receipt" footer={ride ? `Paid in cash to ${ride.driverName}.` : undefined}>
        <Row>
          <span className="flex-1">Route</span>
          <span className="text-label-secondary">
            {zoneName(booking.pickupZoneId)} to {zoneName(booking.dropZoneId)}
          </span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Dropped off</span>
          <span className="text-label-secondary">{formatDhakaTime(booking.droppedAt)}</span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Ride</span>
          <span className="text-label-secondary">
            {booking.rideType === 'PRIVATE' ? 'Private' : booking.womenOnly ? 'Women-only shared' : 'Shared'}, {booking.seats} {booking.seats === 1 ? 'seat' : 'seats'}
          </span>
        </Row>
        {ride ? (
          <>
            <Separator />
            <Row>
              <span className="flex-1">Driver</span>
              <span className="text-label-secondary">{ride.driverName}</span>
            </Row>
            <Separator />
            <Row>
              <span className="flex-1">Car</span>
              <span className="text-right text-label-secondary">
                {ride.vehicle.name}, {ride.vehicle.registrationNo}
              </span>
            </Row>
          </>
        ) : null}
        <Separator />
        <Row>
          <span className="flex-1 text-headline">Total</span>
          <span className="text-headline">{formatTaka(booking.farePoysha)}</span>
        </Row>
      </Group>

      <Group>
        <Row onClick={onDone}>
          <span className="flex-1 text-blue">Done</span>
        </Row>
      </Group>
    </div>
  );
}

// ---- Finished bookings, newest first, in Dhaka time ----

export function PastBookings({ bookings }) {
  const zones = useZones();
  const zoneName = (id) => zones.data?.find((zone) => zone.id === id)?.name;

  if (bookings.length === 0) return null;

  return (
    <Group className="mt-8" header="Your past rides">
      {bookings.slice(0, 5).map((booking, index) => (
        <div key={booking.id}>
          {index > 0 ? <Separator /> : null}
          <Row>
            <span className="min-w-0 flex-1">
              <span className="block">
                {zoneName(booking.pickupZoneId)} to {zoneName(booking.dropZoneId)}
              </span>
              <span className="block text-footnote text-label-secondary">{formatDhakaTime(booking.droppedAt ?? booking.createdAt)}</span>
            </span>
            <span className={booking.status === 'COMPLETED' ? 'font-semibold' : 'text-label-secondary'}>
              {booking.status === 'COMPLETED' ? formatTaka(booking.farePoysha) : (OUTCOMES[booking.status] ?? booking.status)}
            </span>
          </Row>
        </div>
      ))}
    </Group>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Group, Separator, Row, Field, PrimaryButton, ErrorText } from '../../components/ui.js';
import { useBookings, useCreateRequest, useFareQuote, useLogout, useMe, useNearestStand, usePlaceSearch, useZones } from '../../lib/queries.js';
import { useDebounced } from '../../lib/useDebounced.js';
import RideOptions from '../../components/RideOptions.js';
import ActiveBooking from '../../components/ActiveBooking.js';
import { ACTIVE_STATUSES, newIdempotencyKey } from '../../lib/bookings.js';

const RideMap = dynamic(() => import('../../components/RideMap.js'), {
  ssr: false,
  loading: () => <div className="h-56 rounded-cell bg-fill" />,
});

const KIND_LABELS = { STAND: 'Tesla stand', LANDMARK: 'Landmark' };

// ---- Results for whichever field is being typed in ----

function PlaceResults({ text, onPick }) {
  const settled = useDebounced(text);
  const search = usePlaceSearch(settled);
  const zones = useZones();

  if (text.trim().length < 2) return null;
  if (settled !== text || search.isPending) return <p className="px-4 text-subhead text-label-secondary">Searching</p>;
  if (search.isError) return <ErrorText>{search.error.message}</ErrorText>;

  if (search.data.length === 0) {
    return <p className="px-4 text-subhead text-label-secondary">No places match &ldquo;{text.trim()}&rdquo;. Try a road name or a landmark.</p>;
  }

  const zoneName = (id) => zones.data?.find((zone) => zone.id === id)?.name;
  return (
    <Group header="Places">
      {search.data.map((place, index) => (
        <div key={place.id}>
          {index > 0 ? <Separator /> : null}
          <Row onClick={() => onPick(place)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{place.name}</span>
              <span className="block text-footnote text-label-secondary">
                {KIND_LABELS[place.kind]}
                {zoneName(place.zoneId) ? `, ${zoneName(place.zoneId)}` : ''}
              </span>
            </span>
          </Row>
        </div>
      ))}
    </Group>
  );
}

// ---- The stand the passenger will board at, and the walk to it ----

function PickupPoint({ place }) {
  const nearest = useNearestStand(place);

  if (nearest.isPending) return <p className="px-4 text-subhead text-label-secondary">Finding the nearest stand</p>;
  if (nearest.isError) return <ErrorText>{nearest.error.message}</ErrorText>;

  const { stand, zone, distanceMeters, walkMinutes } = nearest.data;
  const boardsHere = place.kind === 'STAND' && place.id === stand.id;

  return (
    <Group header="Pickup point" footer={`${zone.name}. Your driver stops at the stand, not at your door.`}>
      <Row>
        <span className="min-w-0 flex-1">
          <span className="block">{boardsHere ? `Board at ${stand.name}` : `Walk ${walkMinutes} min to ${stand.name}`}</span>
          <span className="block text-footnote text-label-secondary">{boardsHere ? 'Tesla stand' : `${distanceMeters} m from ${place.kind === 'PIN' ? 'your pin' : place.name}`}</span>
        </span>
      </Row>
    </Group>
  );
}

// ---- Where are you, and where to ----

function PlanRide({ me }) {
  const [active, setActive] = useState('pickup');
  const [fields, setFields] = useState({ pickup: { text: '', place: null }, drop: { text: '', place: null } });
  const [options, setOptions] = useState({ rideType: 'SHARED', seats: 1, womenOnly: false });
  const nearest = useNearestStand(fields.pickup.place);
  const quote = useFareQuote({ pickup: fields.pickup.place, drop: fields.drop.place, seats: options.seats });
  const createRequest = useCreateRequest();
  const attempt = useRef({ signature: null, key: null });

  const type = (key) => (event) => setFields((f) => ({ ...f, [key]: { text: event.target.value, place: null } }));
  const pick = (place) => {
    setFields((f) => ({ ...f, [active]: { text: place.name, place } }));
    setActive(active === 'pickup' && !fields.drop.place ? 'drop' : active);
  };
  const dropPin = ({ lat, lng }) => pick({ id: null, kind: 'PIN', name: 'Pin on the map', lat, lng });
  const shown = fields[active];
  const isPrivate = options.rideType === 'PRIVATE';

  function requestRide() {
    const body = {
      pickupLat: fields.pickup.place.lat,
      pickupLng: fields.pickup.place.lng,
      dropLat: fields.drop.place.lat,
      dropLng: fields.drop.place.lng,
      seats: isPrivate ? 1 : options.seats,
      rideType: options.rideType,
      womenOnly: isPrivate ? false : options.womenOnly,
    };
    const signature = JSON.stringify(body);
    if (attempt.current.signature !== signature) attempt.current = { signature, key: newIdempotencyKey() };
    createRequest.mutate({ body, key: attempt.current.key });
  }

  return (
    <>
      <h1 className="text-large-title">Where to?</h1>

      <div className="mt-6">
        <RideMap pickup={fields.pickup.place} stand={nearest.data?.stand} drop={fields.drop.place} onTap={dropPin} />
      </div>
      <p className="px-4 pt-1.5 text-footnote text-label-secondary">Search for a place, or tap the map to drop a pin.</p>

      <Group className="mt-6">
        <Field id="pickup" label="Pickup" placeholder="Search a place" autoComplete="off" value={fields.pickup.text} onChange={type('pickup')} onFocus={() => setActive('pickup')} />
        <Separator />
        <Field id="drop" label="Drop off" placeholder="Search a place" autoComplete="off" value={fields.drop.text} onChange={type('drop')} onFocus={() => setActive('drop')} />
      </Group>

      {fields.pickup.place ? (
        <div className="mt-6">
          <PickupPoint place={fields.pickup.place} />
        </div>
      ) : null}

      <div className="mt-6">{shown.place ? null : <PlaceResults key={active} text={shown.text} onPick={pick} />}</div>

      {fields.pickup.place && fields.drop.place ? (
        <>
          <div className="mt-6">
            <RideOptions isFemale={me.gender === 'FEMALE'} options={options} onChange={setOptions} quote={quote} />
          </div>
          <div className="mt-6">
            <PrimaryButton onClick={requestRide} loading={createRequest.isPending} disabled={!quote.data}>
              {isPrivate ? 'Request a private ride' : 'Request a ride'}
            </PrimaryButton>
            <ErrorText>{createRequest.error?.message}</ErrorText>
          </div>
        </>
      ) : null}
    </>
  );
}

// ---- The passenger's home: an active booking if there is one, otherwise the search ----

export default function RidePage() {
  const router = useRouter();
  const { data: me, isPending } = useMe();
  const logout = useLogout();
  const bookings = useBookings();

  useEffect(() => {
    if (isPending) return;
    if (!me) router.replace('/login');
    else if (me.role === 'DRIVER') router.replace('/driver');
    else if (!me.phoneVerified) router.replace('/verify');
  }, [isPending, me, router]);

  if (!me || me.role === 'DRIVER' || !me.phoneVerified) return null;

  const activeBooking = bookings.data?.find((booking) => ACTIVE_STATUSES.includes(booking.status));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      {bookings.isPending ? null : bookings.isError ? (
        <ErrorText>{bookings.error.message}</ErrorText>
      ) : activeBooking ? (
        <ActiveBooking booking={activeBooking} />
      ) : (
        <PlanRide me={me} />
      )}

      <Group className="mt-8">
        <Row onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })} disabled={logout.isPending}>
          <span className="flex-1 text-red">Log out</span>
        </Row>
      </Group>
    </main>
  );
}

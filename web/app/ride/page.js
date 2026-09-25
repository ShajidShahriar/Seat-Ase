'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Group, Separator, Row, Field, ErrorText } from '../../components/ui.js';
import { useLogout, useMe, usePlaceSearch, useZones } from '../../lib/queries.js';
import { useDebounced } from '../../lib/useDebounced.js';

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

// ---- Where are you, and where to ----

export default function RidePage() {
  const router = useRouter();
  const { data: me, isPending } = useMe();
  const logout = useLogout();
  const [active, setActive] = useState('pickup');
  const [fields, setFields] = useState({ pickup: { text: '', place: null }, drop: { text: '', place: null } });

  useEffect(() => {
    if (isPending) return;
    if (!me) router.replace('/login');
    else if (me.role === 'DRIVER') router.replace('/driver');
    else if (!me.phoneVerified) router.replace('/verify');
  }, [isPending, me, router]);

  if (!me || me.role === 'DRIVER' || !me.phoneVerified) return null;

  const type = (key) => (event) => setFields((f) => ({ ...f, [key]: { text: event.target.value, place: null } }));
  const pick = (place) => {
    setFields((f) => ({ ...f, [active]: { text: place.name, place } }));
    setActive(active === 'pickup' && !fields.drop.place ? 'drop' : active);
  };
  const shown = fields[active];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      <h1 className="text-large-title">Where to?</h1>
      <p className="mt-1 text-subhead text-label-secondary">Hi {me.name}. Pick where you are and where you are going.</p>

      <Group className="mt-8">
        <Field id="pickup" label="Pickup" placeholder="Search a place" autoComplete="off" value={fields.pickup.text} onChange={type('pickup')} onFocus={() => setActive('pickup')} />
        <Separator />
        <Field id="drop" label="Drop off" placeholder="Search a place" autoComplete="off" value={fields.drop.text} onChange={type('drop')} onFocus={() => setActive('drop')} />
      </Group>

      <div className="mt-6">{shown.place ? null : <PlaceResults key={active} text={shown.text} onPick={pick} />}</div>

      <Group className="mt-8">
        <Row onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })} disabled={logout.isPending}>
          <span className="flex-1 text-red">Log out</span>
        </Row>
      </Group>
    </main>
  );
}

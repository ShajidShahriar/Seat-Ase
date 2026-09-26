'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addVehicleSchema } from '@seat-ase/shared';
import { Group, Separator, Row, Field, PrimaryButton, ErrorText, Segmented } from '../../components/ui.js';
import { Checkmark } from '../../components/icons.js';
import RequestCard from '../../components/RequestCard.js';
import DriverRide from '../../components/DriverRide.js';
import { useAddVehicle, useGoOffline, useDriverRequests, useDriverRide, useGoOnline, useLogout, useMe, useVehicle, useZones } from '../../lib/queries.js';

const SEAT_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }));

// ---- The add-your-Tesla form, shown until the driver has a vehicle ----

function VehicleForm() {
  const addVehicle = useAddVehicle();
  const [form, setForm] = useState({ name: '', registrationNo: '', capacity: null });
  const [formError, setFormError] = useState(null);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function submit(event) {
    event.preventDefault();
    const parsed = addVehicleSchema.safeParse({ ...form, capacity: form.capacity ?? undefined });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    setFormError(null);
    addVehicle.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-8" noValidate>
      <Group header="Your Tesla">
        <Field id="name" label="Name" placeholder="Model 3" autoComplete="off" value={form.name} onChange={set('name')} />
        <Separator />
        <Field id="registrationNo" label="Plate" placeholder="Dhaka Metro Ga 12-3456" autoComplete="off" value={form.registrationNo} onChange={set('registrationNo')} />
      </Group>

      <Group header="Passenger seats" footer="Seats for passengers, not counting you. You can't change this while a ride is in progress.">
        <div className="p-2">
          <Segmented label="Passenger seats" options={SEAT_OPTIONS} value={form.capacity} onChange={(capacity) => setForm((f) => ({ ...f, capacity }))} />
        </div>
      </Group>

      <div>
        <PrimaryButton type="submit" loading={addVehicle.isPending}>
          Add my Tesla
        </PrimaryButton>
        <ErrorText>{formError ?? addVehicle.error?.message}</ErrorText>
      </div>
    </form>
  );
}

// ---- Waiting passengers: the empty state, or one card per request ----

function RequestList({ areaName }) {
  const requests = useDriverRequests({ enabled: true });

  if (requests.isPending) return null;
  if (requests.isError) return <ErrorText>{requests.error.message}</ErrorText>;

  if (requests.data.length === 0) {
    return (
      <Group header="Requests">
        <div className="px-4 py-8 text-center">
          <p className="text-headline">No requests in {areaName ?? 'your area'} yet</p>
          <p className="mt-1 text-subhead text-label-secondary">New requests show up here on their own. Keep this screen open.</p>
        </div>
      </Group>
    );
  }

  const ordered = [...requests.data].sort((a, b) => Number(b.fits) - Number(a.fits) || new Date(a.queuedAt) - new Date(b.queuedAt));
  return (
    <section>
      <h2 className="px-4 pb-1.5 text-footnote uppercase text-label-secondary">Requests</h2>
      <div className="flex flex-col gap-3">
        {ordered.map((request) => (
          <RequestCard key={request.id} request={request} />
        ))}
      </div>
    </section>
  );
}

// ---- Online toggle: pick the area you are in, then go online there ----

function OnlinePanel({ vehicle, ride }) {
  const zones = useZones();
  const goOnline = useGoOnline();
  const goOffline = useGoOffline();
  const [picked, setPicked] = useState(null);

  const zoneId = picked ?? vehicle.currentZoneId;
  const zoneName = zones.data?.find((zone) => zone.id === zoneId)?.name;
  const currentName = zones.data?.find((zone) => zone.id === vehicle.currentZoneId)?.name;
  const moving = vehicle.isOnline && zoneId !== vehicle.currentZoneId;
  const error = goOnline.error ?? goOffline.error;
  const showRequests = vehicle.isOnline && (!ride || ride.status === 'OPEN');

  function pick(id) {
    goOnline.reset();
    goOffline.reset();
    setPicked(id);
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      {showRequests ? <RequestList areaName={currentName} /> : null}

      {ride ? null : (
        <>
          {vehicle.isOnline ? (
            <Group>
              <Row onClick={() => goOffline.mutate()} disabled={goOffline.isPending}>
                <span className="flex-1 text-red">Go offline</span>
              </Row>
            </Group>
          ) : null}

          <Group
            header="Your area"
            footer={vehicle.isOnline ? `Passengers in ${currentName ?? 'your area'} can see you are online.` : 'Passengers near this area can see you once you go online.'}
          >
            {zones.data?.map((zone, index) => (
              <div key={zone.id}>
                {index > 0 ? <Separator /> : null}
                <Row onClick={() => pick(zone.id)}>
                  <span className="flex-1">{zone.name}</span>
                  {zoneId === zone.id ? <Checkmark /> : null}
                </Row>
              </div>
            ))}
          </Group>

          <div>
            {!vehicle.isOnline || moving ? (
              <PrimaryButton disabled={!zoneId} loading={goOnline.isPending} onClick={() => goOnline.mutate(zoneId, { onSuccess: () => setPicked(null) })}>
                {moving ? `Move to ${zoneName}` : zoneName ? `Go online in ${zoneName}` : 'Go online'}
              </PrimaryButton>
            ) : null}
            <ErrorText>{error?.message}</ErrorText>
          </div>
        </>
      )}
    </div>
  );
}

// ---- The driver's home ----

export default function DriverPage() {
  const router = useRouter();
  const { data: me, isPending: meLoading } = useMe();
  const vehicle = useVehicle();
  const logout = useLogout();
  const driverRide = useDriverRide({ enabled: Boolean(vehicle.data) });

  useEffect(() => {
    if (meLoading) return;
    if (!me) router.replace('/login');
    else if (me.role !== 'DRIVER') router.replace('/');
  }, [meLoading, me, router]);

  if (!me || me.role !== 'DRIVER') return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      <h1 className="text-large-title">{vehicle.data ? vehicle.data.name : 'Add your Tesla'}</h1>
      {vehicle.data === null ? (
        <p className="mt-1 text-subhead text-label-secondary">Passengers can only be matched with a registered car.</p>
      ) : null}

      {vehicle.isPending ? null : vehicle.isError ? (
        <ErrorText>{vehicle.error.message}</ErrorText>
      ) : vehicle.data === null ? (
        <VehicleForm />
      ) : (
        <>
          <p className={`mt-1 text-subhead ${vehicle.data.isOnline ? 'text-green' : 'text-label-secondary'}`}>{vehicle.data.isOnline ? 'You are online' : 'You are offline'}</p>
          {driverRide.data?.ride ? <DriverRide ride={driverRide.data.ride} passengers={driverRide.data.passengers} /> : null}
          <OnlinePanel vehicle={vehicle.data} ride={driverRide.data?.ride} />
          <Group className="mt-8">
            <Row>
              <span className="flex-1">Plate</span>
              <span className="text-label-secondary">{vehicle.data.registrationNo}</span>
            </Row>
            <Separator />
            <Row>
              <span className="flex-1">Passenger seats</span>
              <span className="text-label-secondary">{vehicle.data.capacity}</span>
            </Row>
          </Group>
        </>
      )}

      <Group className="mt-8">
        <Row onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })} disabled={logout.isPending}>
          <span className="flex-1 text-red">Log out</span>
        </Row>
      </Group>
    </main>
  );
}

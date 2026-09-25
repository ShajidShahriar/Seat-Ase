'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addVehicleSchema } from '@seat-ase/shared';
import { Group, Separator, Row, Field, PrimaryButton, ErrorText, Segmented } from '../../components/ui.js';
import { useAddVehicle, useMe, useVehicle } from '../../lib/queries.js';

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

// ---- The driver's home ----

export default function DriverPage() {
  const router = useRouter();
  const { data: me, isPending: meLoading } = useMe();
  const vehicle = useVehicle();

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
      )}
    </main>
  );
}

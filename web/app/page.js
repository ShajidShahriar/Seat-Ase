'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Group, Row, Separator } from '../components/ui.js';
import { useLogout, useMe } from '../lib/queries.js';
import { useLiveStatus } from './providers.js';

// ---- Temporary signed-in home until the passenger and driver screens exist (Phases 10-11) ----

export default function Home() {
  const router = useRouter();
  const { data: me, isPending } = useMe();
  const logout = useLogout();
  const live = useLiveStatus();

  useEffect(() => {
    if (isPending) return;
    if (!me) router.replace('/login');
    else if (me.role === 'DRIVER') router.replace('/driver');
  }, [isPending, me, router]);

  if (!me || me.role === 'DRIVER') return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-16">
      <h1 className="text-large-title">Hi, {me.name}</h1>
      <p className="mt-1 text-subhead text-label-secondary">
        {me.role === 'DRIVER' ? 'Driver' : 'Passenger'} · live updates {live}
      </p>

      <Group className="mt-8">
        <Row>
          <span className="flex-1">Phone</span>
          <span className="text-label-secondary">{me.phone}</span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Phone verified</span>
          <span className={me.phoneVerified ? 'text-green' : 'text-label-secondary'}>{me.phoneVerified ? 'Yes' : 'Not yet'}</span>
        </Row>
      </Group>

      {me.role === 'PASSENGER' && !me.phoneVerified ? (
        <Group className="mt-8" footer="You need a verified phone before you can request a ride.">
          <Row onClick={() => router.push('/verify')}>
            <span className="flex-1 text-blue">Verify your phone</span>
          </Row>
        </Group>
      ) : null}

      <Group className="mt-8">
        <Row onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })} disabled={logout.isPending}>
          <span className="flex-1 text-red">Log out</span>
        </Row>
      </Group>
    </main>
  );
}

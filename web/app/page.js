'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMe } from '../lib/queries.js';

// ---- Home is only a router: everyone is sent to the screen for their role ----

export default function Home() {
  const router = useRouter();
  const { data: me, isPending } = useMe();

  useEffect(() => {
    if (isPending) return;
    if (!me) router.replace('/login');
    else if (me.role === 'DRIVER') router.replace('/driver');
    else router.replace(me.phoneVerified ? '/ride' : '/verify');
  }, [isPending, me, router]);

  return null;
}

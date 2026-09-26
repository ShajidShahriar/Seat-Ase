'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginSchema } from '@seat-ase/shared';
import { Group, Separator, Row, Field, PrimaryButton, ErrorText } from '../../components/ui.js';
import { Chevron } from '../../components/icons.js';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../lib/demoAccounts.js';
import { useLogin, useMe } from '../../lib/queries.js';

export default function LoginPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const login = useLogin();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (me) router.replace('/');
  }, [me, router]);

  // ---- Check the form with the same Zod schema the API uses, then log in ----

  function submit(event) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ phone, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    setFormError(null);
    login.mutate({ phone, password });
  }

  function loginAs(account) {
    setFormError(null);
    login.mutate({ phone: account.phone, password: DEMO_PASSWORD });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      <h1 className="text-large-title">Seat Ase?</h1>
      <p className="mt-1 text-subhead text-label-secondary">Log in to find a seat, or to drive.</p>

      <form onSubmit={submit} className="mt-8" noValidate>
        <Group>
          <Field
            id="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Separator />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Required"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Group>
        <ErrorText>{formError ?? login.error?.message}</ErrorText>

        <div className="mt-6">
          <PrimaryButton type="submit" loading={login.isPending}>
            Log in
          </PrimaryButton>
        </div>
      </form>

      <p className="mt-4 text-center text-subhead text-label-secondary">
        New here?{' '}
        <Link href="/signup" className="text-blue active:opacity-60">
          Create an account
        </Link>
      </p>

      <Group header="Demo accounts" footer="Every demo account uses the password password123." className="mt-10">
        {DEMO_ACCOUNTS.map((account, index) => (
          <div key={account.phone}>
            {index > 0 ? <Separator /> : null}
            <Row onClick={() => loginAs(account)} disabled={login.isPending}>
              <span className="flex-1">
                <span className="block">{account.name}</span>
                <span className="block text-subhead text-label-secondary">{account.detail}</span>
              </span>
              <Chevron />
            </Row>
          </div>
        ))}
      </Group>

      <Group header="For reviewers" className="mt-8">
        <Row onClick={() => router.push('/seat-race')}>
          <span className="flex-1">
            <span className="block">Seat race</span>
            <span className="block text-subhead text-label-secondary">Two accepts, one last seat, run live</span>
          </span>
          <Chevron />
        </Row>
      </Group>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signupSchema } from '@seat-ase/shared';
import { Group, Separator, Row, Field, PrimaryButton, ErrorText, Segmented } from '../../components/ui.js';
import { Checkmark } from '../../components/icons.js';
import { useMe, useSignup } from '../../lib/queries.js';

const ROLES = [
  { value: 'PASSENGER', label: 'I need a ride' },
  { value: 'DRIVER', label: 'I drive a Tesla' },
];

const GENDERS = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
];

export default function SignupPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const signup = useSignup();
  const [form, setForm] = useState({ role: 'PASSENGER', name: '', phone: '', password: '', nid: '', gender: null });
  const [formError, setFormError] = useState(null);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  useEffect(() => {
    if (me && !signup.isSuccess) router.replace('/');
  }, [me, signup.isSuccess, router]);

  // ---- Same Zod schema as the API; gender must be an explicit choice because it can never change ----

  function submit(event) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({ ...form, gender: form.gender ?? undefined });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    if (!form.gender) {
      setFormError("Choose your gender. You can't change it later.");
      return;
    }
    setFormError(null);
    signup.mutate(form, {
      onSuccess: ({ user }) => router.replace(user.role === 'PASSENGER' ? '/verify' : '/'),
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      <h1 className="text-large-title">Create account</h1>
      <p className="mt-1 text-subhead text-label-secondary">It takes a minute. Your phone and NID keep Seat Ase? safe.</p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-8" noValidate>
        <Segmented label="Account type" options={ROLES} value={form.role} onChange={(role) => setForm((f) => ({ ...f, role }))} />

        <Group header="Your details">
          <Field id="name" label="Name" autoComplete="given-name" placeholder="Nusrat" value={form.name} onChange={set('name')} />
          <Separator />
          <Field id="phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={set('phone')} />
          <Separator />
          <Field id="password" label="Password" type="password" autoComplete="new-password" placeholder="8 or more characters" value={form.password} onChange={set('password')} />
        </Group>

        <Group header="National ID" footer="Checked once when you sign up. We never store the full number, only a secure fingerprint and the last 4 digits. One NID, one account.">
          <Field id="nid" label="NID" inputMode="numeric" autoComplete="off" placeholder="10, 13 or 17 digits" value={form.nid} onChange={set('nid')} />
        </Group>

        <Group header="Gender" footer="You can't change this later. Only women can ask for a women-only ride, and it's how we keep those rides safe.">
          {GENDERS.map((gender, index) => (
            <div key={gender.value}>
              {index > 0 ? <Separator /> : null}
              <Row onClick={() => setForm((f) => ({ ...f, gender: gender.value }))}>
                <span className="flex-1">{gender.label}</span>
                {form.gender === gender.value ? <Checkmark /> : null}
              </Row>
            </div>
          ))}
        </Group>

        <div>
          <PrimaryButton type="submit" loading={signup.isPending}>
            Create account
          </PrimaryButton>
          <ErrorText>{formError ?? signup.error?.message}</ErrorText>
        </div>
      </form>

      <p className="mt-4 text-center text-subhead text-label-secondary">
        Already have an account?{' '}
        <Link href="/login" className="text-blue active:opacity-60">
          Log in
        </Link>
      </p>
    </main>
  );
}

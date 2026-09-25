'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Group, Row, Field, PrimaryButton, ErrorText } from '../../components/ui.js';
import { useMe, useSendOtp, useVerifyOtp } from '../../lib/queries.js';

export default function VerifyPage() {
  const router = useRouter();
  const { data: me, isPending } = useMe();
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const [code, setCode] = useState('');
  const sentOnce = useRef(false);

  // ---- Send the first code once, as soon as we know who this is ----

  useEffect(() => {
    if (isPending) return;
    if (!me) router.replace('/login');
    else if (me.phoneVerified) router.replace('/');
    else if (!sentOnce.current) {
      sentOnce.current = true;
      sendOtp.mutate();
    }
  }, [isPending, me, router, sendOtp]);

  function submit(event) {
    event.preventDefault();
    verifyOtp.mutate(code, { onSuccess: () => router.replace('/') });
  }

  if (!me || me.phoneVerified) return null;

  const demoCode = sendOtp.data?.demoCode;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      <h1 className="text-large-title">Verify your phone</h1>
      <p className="mt-1 text-subhead text-label-secondary">Enter the 6-digit code sent to {me.phone}.</p>

      {demoCode ? (
        <Group header="Demo mode" footer="There's no SMS in this demo, so your code is shown here instead." className="mt-8">
          <Row>
            <span className="flex-1">Your code</span>
            <span className="font-mono text-headline tracking-[0.2em]">{demoCode}</span>
          </Row>
        </Group>
      ) : null}

      <form onSubmit={submit} className="mt-8" noValidate>
        <Group>
          <Field
            id="code"
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </Group>
        <ErrorText>{verifyOtp.error?.message ?? sendOtp.error?.message}</ErrorText>

        <div className="mt-6">
          <PrimaryButton type="submit" loading={verifyOtp.isPending} disabled={code.length !== 6}>
            Verify
          </PrimaryButton>
        </div>
      </form>

      <button
        type="button"
        onClick={() => {
          setCode('');
          verifyOtp.reset();
          sendOtp.mutate();
        }}
        disabled={sendOtp.isPending}
        className="mt-4 self-center text-subhead text-blue active:opacity-60 disabled:opacity-40"
      >
        Send a new code
      </button>
    </main>
  );
}

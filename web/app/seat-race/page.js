'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Group, Separator, Row, Field, PrimaryButton, ErrorText, Segmented } from '../../components/ui.js';
import { Seat } from '../../components/icons.js';
import { useRunScenario } from '../../lib/queries.js';
import { formatDhakaClockMs } from '../../lib/format.js';

const KEY_STORAGE = 'seatase.demoKey';

const SCENARIOS = {
  'seat-race': {
    tab: 'Last seat',
    blurb: 'Jashim has one seat left. Nusrat and Shirin both ask for it, and Jashim accepts both at the same instant.',
  },
  'two-drivers': {
    tab: 'Two drivers',
    blurb: 'Shirin asks for a ride. Jashim and Mokbul both accept her request at the same instant.',
  },
};

const TABS = Object.entries(SCENARIOS).map(([value, { tab }]) => ({ value, label: tab }));

const EVENT_LABELS = { REQUEST_MATCHED: 'Accepted' };

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

// ---- The result of one race: who won, when each accept began, and what the database wrote down ----

function RaceResult({ result }) {
  const { contenders, ride } = result;

  return (
    <div className="mt-8 flex flex-col gap-8">
      <Group header="Result">
        {contenders.map((contender, index) => (
          <div key={contender.label}>
            {index > 0 ? <Separator /> : null}
            <Row>
              <span className="min-w-0 flex-1">
                <span className="block text-headline">{contender.label}</span>
                <span className="block text-footnote text-label-secondary">
                  {contender.outcome === 'won' ? 'Got it' : contender.message}
                </span>
              </span>
              <span className={`font-semibold ${contender.outcome === 'won' ? 'text-green' : 'text-red'}`}>
                {contender.outcome === 'won' ? 'Won' : 'Lost'}
              </span>
            </Row>
          </div>
        ))}
      </Group>

      <Group header="When each accept began" footer="Dhaka time, taken inside each database transaction the moment it started.">
        {contenders.map((contender, index) => (
          <div key={contender.label}>
            {index > 0 ? <Separator /> : null}
            <Row>
              <span className="min-w-0 flex-1">
                <span className="block">{contender.label}</span>
                <span className="block text-footnote text-label-secondary">
                  Connection {contender.backendPid}, took {contender.durationMs.toFixed(1)} ms
                </span>
              </span>
              <span className="font-mono text-subhead">{formatDhakaClockMs(contender.startedAt)}</span>
            </Row>
          </div>
        ))}
        <Separator />
        <Row>
          <span className="flex-1">Started apart</span>
          <span className="text-label-secondary">{result.startsApartMs} ms</span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Ran at the same time</span>
          <span className="text-label-secondary">{yesNo(result.overlapped)}</span>
        </Row>
        <Separator />
        <Row>
          <span className="flex-1">Separate connections</span>
          <span className="text-label-secondary">{yesNo(result.distinctConnections)}</span>
        </Row>
      </Group>

      {ride ? (
        <Group header="The car" footer="A car can never hold more passengers than it has seats.">
          <Row>
            <span className="flex-1">Seats booked</span>
            <span className="flex items-center gap-2">
              <span className="flex gap-0.5" aria-hidden="true">
                {Array.from({ length: ride.capacity }, (_, index) => (
                  <Seat key={index} filled={index < ride.seatsBooked} />
                ))}
              </span>
              <span className="text-label-secondary">
                {ride.seatsBooked} of {ride.capacity}
              </span>
            </span>
          </Row>
          {result.ridesCreated !== undefined ? (
            <>
              <Separator />
              <Row>
                <span className="flex-1">Rides created</span>
                <span className="text-label-secondary">{result.ridesCreated}</span>
              </Row>
            </>
          ) : null}
          <Separator />
          <Row>
            <span className="flex-1">Seats add up</span>
            <span className={result.seatInvariantHolds ? 'font-semibold text-green' : 'font-semibold text-red'}>{yesNo(result.seatInvariantHolds)}</span>
          </Row>
        </Group>
      ) : null}

      <Group header="What the database recorded" footer="The loser's attempt was rolled back, so it left no line here.">
        {result.events.map((event, index) => (
          <div key={`${event.type}-${event.at}-${index}`}>
            {index > 0 ? <Separator /> : null}
            <Row>
              <span className="min-w-0 flex-1">
                {EVENT_LABELS[event.type] ?? event.type}
                {event.passenger ? `: ${event.passenger}` : ''}
              </span>
              <span className="font-mono text-footnote text-label-secondary">{formatDhakaClockMs(event.at)}</span>
            </Row>
          </div>
        ))}
      </Group>
    </div>
  );
}

// ---- The demo page: public, but the server only answers to the demo key ----

export default function SeatRacePage() {
  const run = useRunScenario();
  const [scenario, setScenario] = useState('seat-race');
  const [key, setKey] = useState('');

  useEffect(() => {
    try {
      setKey(window.sessionStorage.getItem(KEY_STORAGE) ?? '');
    } catch {}
  }, []);

  function start() {
    try {
      window.sessionStorage.setItem(KEY_STORAGE, key);
    } catch {}
    run.mutate({ name: scenario, key: key.trim() });
  }

  const error =
    run.error?.status === 404
      ? 'Demo mode is switched off on this server.'
      : run.error?.status === 401
        ? 'That demo key is not right.'
        : run.error?.message;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-16">
      <h1 className="text-large-title">Seat race</h1>
      <p className="mt-1 text-subhead text-label-secondary">{SCENARIOS[scenario].blurb} The database lets exactly one of them win.</p>

      <div className="mt-8">
        <Segmented
          label="Which race"
          options={TABS}
          value={scenario}
          onChange={(next) => {
            setScenario(next);
            run.reset();
          }}
        />
      </div>

      <Group className="mt-6" footer="It runs the real accept code twice at once. Each run clears the demo rides first.">
        <Field id="demo-key" label="Demo key" type="password" autoComplete="off" placeholder="From the README" value={key} onChange={(event) => setKey(event.target.value)} />
      </Group>

      <div className="mt-6">
        <PrimaryButton onClick={start} loading={run.isPending} disabled={key.trim().length === 0}>
          Run the race
        </PrimaryButton>
        <ErrorText>{error}</ErrorText>
      </div>

      {run.data && run.data.scenario === scenario ? <RaceResult result={run.data} /> : null}

      <p className="mt-10 text-center text-subhead text-label-secondary">
        <Link href="/login" className="text-blue active:opacity-60">
          Back to the app
        </Link>
      </p>
    </main>
  );
}

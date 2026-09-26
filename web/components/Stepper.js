// ---- A vertical progress list: filled dots are done, the ring is where you are ----

export default function Stepper({ steps, current, detail }) {
  return (
    <ol className="px-4 py-4">
      {steps.map((label, index) => {
        const done = index < current;
        const here = index === current;
        const last = index === steps.length - 1;
        return (
          <li key={label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${done ? 'bg-primary' : here ? 'border-[3px] border-primary bg-background' : 'bg-fill'}`} />
              {last ? null : <span className={`my-1 w-0.5 flex-1 ${done ? 'bg-primary' : 'bg-fill'}`} />}
            </div>
            <div className={last ? '' : 'pb-4'}>
              <p className={here ? 'text-headline' : done ? 'text-body' : 'text-body text-label-tertiary'}>{label}</p>
              {here && detail ? <p className="mt-0.5 text-subhead text-label-secondary">{detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

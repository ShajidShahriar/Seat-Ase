// ---- The few icons the app needs, drawn by hand ----

export function Chevron() {
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden="true" className="shrink-0 text-label-tertiary">
      <path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Checkmark() {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" className="shrink-0 text-blue">
      <path d="M1.5 6.5 5 10 12.5 1.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Seat({ filled = true }) {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true" className="shrink-0">
      <rect x="3.5" y="1" width="9" height="9" rx="3" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.75" y="11.5" width="12.5" height="5" rx="2.5" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

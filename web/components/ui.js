// ---- Grouped lists: Apple's inset grouped table, the backbone of every screen ----

export function Group({ header, footer, children, className = '' }) {
  return (
    <section className={className}>
      {header ? <h2 className="px-4 pb-1.5 text-footnote uppercase text-label-secondary">{header}</h2> : null}
      <div className="overflow-hidden rounded-cell bg-grouped-cell">{children}</div>
      {footer ? <p className="px-4 pt-1.5 text-footnote text-label-secondary">{footer}</p> : null}
    </section>
  );
}

export function Separator() {
  return <div className="ml-4 h-px bg-separator" />;
}

export function Row({ children, onClick, disabled = false }) {
  if (!onClick) return <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-fill disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// ---- Form fields inside a group ----

export function Field({ label, id, ...inputProps }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 px-4">
      <span className="w-24 shrink-0">{label}</span>
      <input
        id={id}
        className="h-11 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-label-tertiary"
        {...inputProps}
      />
    </label>
  );
}

// ---- Buttons: pressed state instead of hover fades ----

export function PrimaryButton({ children, loading = false, disabled = false, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className="h-12 w-full rounded-control bg-primary text-headline text-on-primary active:opacity-80 disabled:opacity-40"
      {...props}
    >
      {loading ? 'Please wait' : children}
    </button>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="px-4 pt-2 text-footnote text-red">
      {children}
    </p>
  );
}

// ---- Segmented control: Apple's two-or-three-way switch ----

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-[9px] bg-fill p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`h-8 flex-1 rounded-[7px] text-subhead font-medium ${selected ? 'bg-grouped-cell shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'active:opacity-60'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-16">
      <h1 className="text-large-title">Seat Ase?</h1>
      <p className="mt-2 text-subhead text-label-secondary">Shared Teslas from your nearest stand.</p>

      <section className="mt-8 overflow-hidden rounded-cell bg-grouped-cell">
        <div className="flex items-center justify-between px-4 py-3">
          <span>Banani Road 11 police box</span>
          <span className="text-label-secondary">350 m</span>
        </div>
        <div className="ml-4 h-px bg-separator" />
        <div className="flex items-center justify-between px-4 py-3">
          <span>Teslas nearby</span>
          <span className="text-green">1 online</span>
        </div>
      </section>

      <button className="mt-8 h-12 rounded-control bg-primary text-headline text-on-primary active:opacity-80">
        Find a seat
      </button>
    </main>
  );
}

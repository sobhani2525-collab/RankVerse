/**
 * Page skeleton shown by Next while a route's server data loads, instead of
 * a blank screen. Covers every route below the root layout.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="در حال بارگذاری" className="mx-auto max-w-6xl animate-pulse space-y-6 px-4 py-8">
      <div className="h-8 w-1/3 rounded bg-white/10" />
      <div className="h-4 w-2/3 rounded bg-white/10" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[2/3] rounded-lg bg-white/10" />
            <div className="h-3 w-3/4 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

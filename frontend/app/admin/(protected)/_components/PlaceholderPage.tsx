export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <div className="mt-6 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        این بخش هنوز پیاده‌سازی نشده است.
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="space-y-4 py-8">
      <div className="h-8 w-64 animate-pulse rounded-sm bg-surface-2" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded-sm bg-surface" />
      <div className="mt-6 space-y-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-surface" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}

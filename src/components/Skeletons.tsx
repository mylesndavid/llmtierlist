/** Shared building blocks for route loading states. */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

export function BoardSkeleton() {
  const widths = ["w-3/4", "w-1/2", "w-2/3", "w-1/3", "w-1/2", "w-1/4"];
  return (
    <div className="border border-black/60 bg-black/60">
      {widths.map((w, i) => (
        <div key={i} className="flex min-h-16 border-b border-black/60 last:border-b-0 sm:min-h-20">
          <div className="w-10 shrink-0 animate-pulse bg-surface-2 sm:w-24" />
          <div className={`flex ${w} gap-px bg-surface p-1`}>
            {Array.from({ length: 4 }).map((_, j) => (
              <Bar key={j} className="h-14 w-1/4 sm:h-[72px]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border border-edge">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-edge bg-surface px-4 py-3 last:border-b-0">
          <Bar className="h-4 w-6" />
          <Bar className="h-9 w-9 rounded-sm" />
          <div className="flex-1 space-y-1.5">
            <Bar className="h-3.5 w-40 max-w-[45%]" />
            <Bar className="h-3 w-24 max-w-[25%]" />
          </div>
          <Bar className="h-9 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="space-y-3 border border-edge bg-surface p-4">
          <div className="flex items-start gap-3">
            <Bar className="h-10 w-10 rounded-sm" />
            <div className="flex-1 space-y-1.5">
              <Bar className="h-3.5 w-32" />
              <Bar className="h-3 w-20" />
            </div>
            <Bar className="h-9 w-20 rounded-full" />
          </div>
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

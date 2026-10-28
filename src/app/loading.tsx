import { Bar, RowsSkeleton } from "@/components/Skeletons";

/** Matches the home page layout (headline, presets, scatter, table) so content lands in place. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bar className="h-8 w-[min(22rem,80%)]" />
        <Bar className="h-4 w-[min(30rem,90%)]" />
        <Bar className="h-3 w-48" />
      </div>
      <Bar className="h-10 w-[min(28rem,100%)]" />
      <Bar className="h-[340px] w-full sm:h-[460px] lg:h-[520px]" />
      <section className="space-y-3">
        <Bar className="h-6 w-32" />
        <RowsSkeleton rows={8} />
      </section>
    </div>
  );
}

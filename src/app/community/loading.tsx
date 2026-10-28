import { Bar, RowsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-10">
      <section className="flex flex-col items-center gap-4 pt-6">
        <Bar className="h-11 w-[min(36rem,90%)]" />
        <Bar className="h-4 w-[min(28rem,80%)]" />
        <div className="mt-2 flex gap-3">
          <Bar className="h-11 w-40" />
          <Bar className="h-11 w-40" />
        </div>
      </section>
      <section className="space-y-4">
        <Bar className="h-6 w-40" />
        <RowsSkeleton rows={8} />
      </section>
    </div>
  );
}

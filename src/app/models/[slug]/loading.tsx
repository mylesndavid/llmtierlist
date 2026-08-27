import { Bar } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <section className="border border-edge bg-surface p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Bar className="h-11 w-11 rounded-sm sm:h-16 sm:w-16" />
          <div className="flex-1 space-y-2">
            <Bar className="h-5 w-48 max-w-[70%]" />
            <Bar className="h-3.5 w-32" />
          </div>
          <Bar className="h-10 w-24 rounded-full" />
        </div>
        <div className="mt-4 space-y-2">
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-5/6" />
        </div>
      </section>
      <section className="space-y-3">
        <Bar className="h-6 w-32" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2 border border-edge bg-surface p-4">
            <Bar className="h-8 w-8 rounded-full" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-2/3" />
          </div>
        ))}
      </section>
    </div>
  );
}

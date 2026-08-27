import { Bar, CardsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bar className="h-7 w-52" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Bar className="h-10 flex-1 min-w-48" />
        <Bar className="h-10 w-36" />
        <Bar className="h-10 w-32" />
      </div>
      <CardsSkeleton cards={6} />
    </div>
  );
}

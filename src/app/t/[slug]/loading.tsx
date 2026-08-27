import { Bar, BoardSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Bar className="h-7 w-64" />
          <Bar className="h-3.5 w-40" />
        </div>
        <Bar className="h-9 w-24 rounded-full" />
      </div>
      <BoardSkeleton />
    </div>
  );
}

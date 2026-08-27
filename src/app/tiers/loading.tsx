import { Bar, BoardSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bar className="h-7 w-64" />
        <Bar className="h-4 w-96 max-w-full" />
      </div>
      <BoardSkeleton />
    </div>
  );
}

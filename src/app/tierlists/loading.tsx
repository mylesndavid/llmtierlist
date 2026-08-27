import { Bar, CardsSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Bar className="h-7 w-60" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <Bar className="h-10 w-full max-w-md" />
      <CardsSkeleton cards={6} />
    </div>
  );
}

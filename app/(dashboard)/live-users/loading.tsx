import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading Live User Intelligence">
      <div className="flex items-center justify-between pb-4">
        <div>
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-2 h-3.5 w-96" />
        </div>
        <Skeleton className="hidden h-7 w-56 xl:block" />
      </div>
      <Skeleton className="mb-3 h-8 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <Skeleton className="hidden h-[31rem] rounded-xl wide:block" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 wide:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-60 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors the page grid so nothing shifts when the workspace arrives.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading Sales Command Center">
      <div className="flex flex-col gap-3 pb-4 wide:flex-row wide:items-center wide:justify-between">
        <div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-3 w-96" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-[10.5rem]" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 wide:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-[5.25rem]" />
            ))}
          </div>
          <Skeleton className="h-36" />
          <Skeleton className="h-64" />
          <Skeleton className="h-80" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-[38rem]" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors the page grid so nothing shifts when the data arrives.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading PQL & Auto Apply Intelligence">
      <div className="flex flex-col gap-3 pb-4 wide:flex-row wide:items-center wide:justify-between">
        <div>
          <Skeleton className="h-7 w-72" />
          <Skeleton className="mt-2 h-3 w-96" />
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-[8.75rem]" />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {[0, 1].map((row) => (
          <div key={row} className="card px-4 pt-3.5 pb-4">
            <Skeleton className="h-4 w-48" />
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 wide:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[6.25rem]" />
              ))}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_21rem]">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
        <Skeleton className="h-96" />
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[112.5rem]:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading user profile">
      <div className="flex items-center justify-between pb-4">
        <div>
          <Skeleton className="h-6 w-72" />
          <Skeleton className="mt-2 h-3.5 w-96" />
        </div>
        <Skeleton className="hidden h-7 w-48 lg:block" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 wide:grid-cols-8">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-11 rounded-xl" />
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[19rem_minmax(0,1fr)_20rem]">
          <Skeleton className="h-[30rem] rounded-xl" />
          <Skeleton className="h-[30rem] rounded-xl" />
          <Skeleton className="h-[30rem] rounded-xl" />
        </div>
      </div>
    </div>
  );
}

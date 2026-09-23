import { Skeleton } from "@/components/ui/Skeleton";

// Same grid as the page so nothing jumps when data arrives.
export default function Loading() {
  const cards = (n: number, h: string) =>
    Array.from({ length: n }, (_, i) => (
      <div key={i} className={`card p-4 ${h}`}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-6 w-16" />
      </div>
    ));
  return (
    <div aria-busy="true" aria-label="Loading Revenue Command Center">
      <div className="flex items-center justify-between pb-4">
        <div>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="mt-2 h-3.5 w-96" />
        </div>
        <Skeleton className="hidden h-8 w-[30rem] xl:block" />
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">{cards(6, "h-[6.75rem]")}</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 wide:grid-cols-6">{cards(6, "h-16")}</div>
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[7fr_3fr]">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-[8fr_5fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

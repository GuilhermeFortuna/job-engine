import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-6"
    >
      <span className="sr-only">Loading job opportunities...</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[19rem_1fr] lg:gap-8">
        <Skeleton className="h-[28rem] rounded-xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

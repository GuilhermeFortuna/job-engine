import { Skeleton } from "@/components/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex flex-col gap-6"
    >
      <span className="sr-only">Loading job details...</span>
      <Skeleton className="h-9 w-32" />
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-6 w-64 max-w-full" />
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

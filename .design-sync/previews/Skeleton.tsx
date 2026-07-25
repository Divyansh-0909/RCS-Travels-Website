import { Skeleton } from 'rcs-travels-frontend';

// Shimmer placeholder block; compose several to mirror a real layout.
// tone="dark" for panels and the tracking page, tone="light" for the
// ride-history cards on the account surface. Layouts ported from
// TrackingSkeleton.jsx and RideHistorySkeleton.jsx.

export const OnDarkSurface = () => (
  <div className="bg-[var(--background)] p-6 w-[340px] flex flex-col gap-3">
    <Skeleton className="h-8 w-[80%]" />
    <Skeleton className="h-6 w-[55%]" />
    <Skeleton className="h-4 w-12" />
  </div>
);

export const OnLightSurface = () => (
  <div className="bg-[var(--foreground)] p-6 w-[340px] flex flex-col gap-3">
    <Skeleton tone="light" className="h-8 w-[80%]" />
    <Skeleton tone="light" className="h-6 w-[55%]" />
    <Skeleton tone="light" className="h-4 w-12" />
  </div>
);

export const RideCardLayout = () => (
  <div className="bg-[var(--background)] p-6 w-[340px]">
    <div className="rounded-xl bg-[var(--background-muted)] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3.5 w-[70%]" />
    </div>
  </div>
);

export const Shapes = () => (
  <div className="bg-[var(--background)] p-6 w-[340px] flex items-center gap-3">
    <Skeleton rounded="rounded-full" className="h-12 w-12" />
    <div className="flex-1 flex flex-col gap-2">
      <Skeleton className="h-4 w-[80%]" />
      <Skeleton className="h-3 w-[50%]" />
    </div>
  </div>
);

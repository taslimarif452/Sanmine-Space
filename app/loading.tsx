import { DelayedSkeleton, PageLoadingSkeleton } from "@/components/loading-skeleton";

export default function Loading() {
  return <DelayedSkeleton><PageLoadingSkeleton /></DelayedSkeleton>;
}

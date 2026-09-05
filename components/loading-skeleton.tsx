"use client";

import { useEffect, useState, type ReactNode } from "react";

export function DelayedSkeleton({ children, delay = 350 }: { children: ReactNode; delay?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  if (!visible) return null;
  return <>{children}</>;
}

export function ChatLoadingSkeleton() {
  return <div className="mx-auto w-full max-w-[860px] px-3 py-7 sm:px-5 sm:py-10" aria-label="Loading chat" role="status">
    <div className="mx-auto max-w-[850px] space-y-8">
      <div className="ml-auto h-12 w-[42%] animate-pulse rounded-[20px] bg-[#ebe9e3]" />
      <div className="space-y-3">
        <div className="h-4 w-[92%] animate-pulse rounded bg-[#e9e7e1]" />
        <div className="h-4 w-[78%] animate-pulse rounded bg-[#e9e7e1]" />
        <div className="h-4 w-[86%] animate-pulse rounded bg-[#e9e7e1]" />
      </div>
    </div>
  </div>;
}

export function PageLoadingSkeleton() {
  return <div className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12" aria-label="Loading page" role="status">
    <div className="space-y-4">
      <div className="h-3 w-32 animate-pulse rounded bg-[#e9e7e1]" />
      <div className="h-14 w-72 animate-pulse rounded-xl bg-[#e9e7e1]" />
      <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-[#e9e7e1]" />
      <div className="mt-10 h-44 w-full animate-pulse rounded-2xl bg-[#ebe9e3]" />
      <div className="h-36 w-full animate-pulse rounded-2xl bg-[#ebe9e3]" />
    </div>
  </div>;
}

export function EmailListSkeleton() {
  return <div className="divide-y divide-[#e8e4dc]" aria-label="Loading sent emails" role="status">
    {[0,1,2,3].map(i=><div key={i} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.7fr)_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-6">
      <div className="h-4 w-[80%] animate-pulse rounded bg-[#e9e7e1]" />
      <div className="h-4 w-[90%] animate-pulse rounded bg-[#e9e7e1]" />
      <div className="h-3 w-[70%] animate-pulse rounded bg-[#e9e7e1]" />
      <div className="h-3 w-20 animate-pulse rounded bg-[#e9e7e1]" />
    </div>)}
  </div>;
}

export function ConnectionListSkeleton() {
  return <div className="space-y-2" aria-label="Loading Gmail connections" role="status">
    <div className="h-14 animate-pulse rounded-xl bg-[#e9e7e1]" />
    <div className="h-14 animate-pulse rounded-xl bg-[#e9e7e1]" />
  </div>;
}

export function SidebarLoadingSkeleton() {
  return <div className="mt-2 space-y-2 px-1" aria-label="Loading recent chats" role="status">
    <div className="h-8 w-full animate-pulse rounded-lg bg-[#e9e7e1]" />
    <div className="h-8 w-[88%] animate-pulse rounded-lg bg-[#e9e7e1]" />
    <div className="h-8 w-[94%] animate-pulse rounded-lg bg-[#e9e7e1]" />
  </div>;
}

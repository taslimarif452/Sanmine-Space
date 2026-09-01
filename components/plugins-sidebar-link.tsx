"use client";

import Link from "next/link";
import { PlugZap, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export function PluginsSidebarLink() {
  const pathname = usePathname();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let host: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const attach = () => {
      if (cancelled) return;
      const aside = document.querySelector("aside");
      if (!aside) return;
      const newChat = aside.querySelector(":scope > button");
      if (!newChat) return;

      const existing = aside.querySelector<HTMLElement>("[data-sanmine-plugins-link]");
      if (existing) {
        host = existing as HTMLDivElement;
      } else {
        host = document.createElement("div");
        host.setAttribute("data-sanmine-plugins-link", "true");
        aside.insertBefore(host, newChat.nextSibling);
      }

      setTarget(host);
      const update = () => setCollapsed(aside.getBoundingClientRect().width < 120);
      update();
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(aside);
    };

    attach();
    mutationObserver = new MutationObserver(() => {
      const aside = document.querySelector("aside");
      const existing = aside?.querySelector("[data-sanmine-plugins-link]");
      if (!existing) attach();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (host && host.parentElement) host.remove();
      setTarget(null);
    };
  }, [pathname]);

  if (!target) return null;
  return createPortal(
    <div className="mt-0.5 flex flex-col gap-0.5">
      <Link href="/plugins" className={`flex items-center rounded-lg py-2.5 text-sm font-medium hover:bg-black/5 ${collapsed ? "justify-center" : "gap-2 px-3"}`} aria-label="Plugins">
        <PlugZap size={17} />
        {!collapsed && <span>Plugins</span>}
      </Link>
      <Link href="/campaigns" className={`flex items-center rounded-lg py-2.5 text-sm font-medium hover:bg-black/5 ${collapsed ? "justify-center" : "gap-2 px-3"}`} aria-label="Campaigns">
        <Send size={17} />
        {!collapsed && <span>Campaigns</span>}
      </Link>
    </div>,
    target
  );
}

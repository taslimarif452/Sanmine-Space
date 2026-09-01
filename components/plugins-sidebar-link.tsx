"use client";

import Link from "next/link";
import { PlugZap } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PluginsSidebarLink() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (window.location.pathname === "/plugins") return;
    const aside = document.querySelector("aside");
    const newChat = aside?.querySelector(":scope > button");
    if (!aside || !newChat) return;

    const host = document.createElement("div");
    host.setAttribute("data-sanmine-plugins-link", "true");
    aside.insertBefore(host, newChat.nextSibling);
    setTarget(host);

    const update = () => setCollapsed(aside.getBoundingClientRect().width < 120);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(aside);
    return () => { observer.disconnect(); host.remove(); };
  }, []);

  if (!target) return null;
  return createPortal(
    <Link href="/plugins" onClick={() => { if (window.innerWidth < 768) document.querySelector("[data-sanmine-plugins-link]")?.dispatchEvent(new Event("sanmine-close-drawer")); }} className={`mt-0.5 flex items-center rounded-lg py-2.5 text-sm font-medium hover:bg-black/5 ${collapsed ? "justify-center" : "gap-2 px-3"}`} aria-label="Plugins">
      <PlugZap size={17} />
      {!collapsed && <span>Plugins</span>}
    </Link>,
    target
  );
}

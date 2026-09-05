"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Home from "@/app/page";
import { useAuthUser } from "@/components/auth-gate";

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "chat";
}

export default function ChatPage() {
  const params = useParams<{ id?: string }>();
  const user = useAuthUser();
  const id = typeof params?.id === "string" ? params.id : "";

  useEffect(() => {
    if (!user || !id || id === "new" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/chats", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const chat = Array.isArray(data.chats) ? data.chats.find((item: { id?: string }) => item.id === id) : null;
        if (!chat?.title || cancelled) return;
        const slug = slugify(String(chat.title));
        if (window.location.pathname !== `/chat/${slug}`) window.history.replaceState(window.history.state, "", `/chat/${slug}`);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user, id]);

  return <Home />;
}

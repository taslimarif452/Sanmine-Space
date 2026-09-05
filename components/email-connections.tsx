"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Mail, PlugZap, Unplug } from "lucide-react";
import type { User } from "firebase/auth";
import { usePathname } from "next/navigation";
import { ConnectionListSkeleton, DelayedSkeleton } from "@/components/loading-skeleton";

type Connection = { id: string; provider: string; email: string; display_name?: string | null };

export function EmailConnections({ user }: { user: User }) {
  const pathname = usePathname();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (pathname !== "/plugins") return;
    setLoading(true);
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/email/connections", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load connected email accounts.");
      const rows = Array.isArray(data.connections) ? data.connections : [];
      setConnections(rows.filter((x: Connection) => ["google", "gmail"].includes(String(x.provider || "").trim().toLowerCase())));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load email accounts.");
    } finally {
      setLoading(false);
    }
  }, [pathname, user]);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setBusy(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/email/google", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Unable to connect Gmail.");
      window.location.assign(String(data.url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start Gmail connection.");
      setBusy(false);
    }
  };

  const disconnect = async (id: string) => {
    setBusy(true); setError("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/email/connections", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to disconnect Gmail.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to disconnect Gmail.");
    } finally { setBusy(false); }
  };

  if (pathname !== "/plugins") return null;

  return <div className="mt-2">
    <div className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[.11em] text-[#969188]"><Mail size={13}/>Gmail</div>
    <div className="space-y-1">
      {loading ? <DelayedSkeleton><ConnectionListSkeleton /></DelayedSkeleton> : <>
        {connections.map(c => <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[#e8e4dc] bg-white/60 px-3 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f0eee8]"><Check size={14}/></span>
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.display_name || "Gmail"}</div><div className="truncate text-xs text-[#969188]">{c.email}</div></div>
          <button onClick={() => void disconnect(c.id)} disabled={busy} className="grid h-8 w-8 place-items-center rounded-lg text-[#817c73] hover:bg-black/5 disabled:opacity-40" aria-label={`Disconnect ${c.email}`} title="Disconnect"><Unplug size={14}/></button>
        </div>)}
        {!connections.length && <div className="rounded-xl border border-[#e8e4dc] bg-white/60 px-3 py-3 text-sm text-[#77736b]">No Gmail account connected.</div>}
      </>}
      <button onClick={() => void connect()} disabled={busy} className="flex w-full items-center gap-3 rounded-xl border border-[#e8e4dc] bg-white/60 px-3 py-3 text-sm hover:bg-white disabled:opacity-40"><span className="grid h-8 w-8 place-items-center rounded-full bg-white"><GoogleMark/></span><span className="flex-1 text-left">{busy ? "Connecting…" : connections.length ? "Connect another Gmail" : "Connect Gmail"}</span><PlugZap size={14}/></button>
    </div>
    <p className="mt-3 text-xs leading-5 text-[#969188]">Gmail is the active sending provider for approvals and campaigns.</p>
    {error && <div className="mt-3 rounded-xl bg-[#fff6f2] px-3 py-2 text-xs leading-5 text-[#8b5145]">{error}</div>}
  </div>;
}

function GoogleMark() { return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.25-.2-1.82H12v3.45h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.73-4.33 2.73-7.16z"/><path fill="#34A853" d="M12 21.5c2.7 0 4.97-.9 6.62-2.44l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-4.8-4.12H3.06v2.59A9.98 9.98 0 0 0 12 21.5z"/><path fill="#FBBC05" d="M6.41 13.39A5.75 5.75 0 0 1 6.1 11.5c0-.66.11-1.3.31-1.89V7.02H3.06A9.98 9.98 0 0 0 2 11.5c0 1.61.39 3.13 1.06 4.48l3.35-2.59z"/><path fill="#EA4335" d="M12 5.49c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.97 2.52 14.7 1.5 12 1.5a10 10 0 0 0-8.94 5.52l3.35 2.59C6.2 7.25 8.4 5.49 12 5.49z"/></svg>; }

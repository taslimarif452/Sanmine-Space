"use client";

import { useEffect, useState } from "react";
import { Check, Mail, PlugZap, Unplug } from "lucide-react";
import type { User } from "firebase/auth";

type Connection = { id: string; provider: "google" | "microsoft"; email: string; display_name?: string | null };

export function EmailConnections({ user }: { user: User }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [busy, setBusy] = useState<"google" | "microsoft" | string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/email/connections", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load connected email accounts.");
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load email accounts."); }
  };

  useEffect(() => { void load(); }, [user.uid]);

  const connect = async (provider: "google" | "microsoft") => {
    setBusy(provider); setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/email/${provider}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || `Unable to connect ${provider === "google" ? "Gmail" : "Outlook"}.`);
      window.location.assign(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start email connection."); setBusy(null); }
  };

  const disconnect = async (id: string) => {
    setBusy(id); setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/email/connections", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to disconnect account.");
      setConnections(xs => xs.filter(x => x.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to disconnect account."); }
    finally { setBusy(null); }
  };

  return <div className="mt-2 border-t border-[#e8e4dc] pt-2">
    <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[.11em] text-[#969188]"><Mail size={13}/>Email accounts</div>
    <div className="space-y-1">
      {connections.map(c => <div key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f0eee8]"><Check size={13}/></span>
        <div className="min-w-0 flex-1"><div className="truncate font-medium">{c.display_name || (c.provider === "google" ? "Gmail" : "Outlook")}</div><div className="truncate text-[10px] text-[#969188]">{c.email}</div></div>
        <button onClick={() => void disconnect(c.id)} disabled={busy === c.id} className="grid h-7 w-7 place-items-center rounded-md text-[#817c73] hover:bg-black/5 disabled:opacity-40" aria-label={`Disconnect ${c.email}`} title="Disconnect"><Unplug size={13}/></button>
      </div>)}
      <button onClick={() => void connect("google")} disabled={busy !== null} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-black/5 disabled:opacity-40"><span className="grid h-6 w-6 place-items-center rounded-full bg-white"><GoogleMark/></span><span className="flex-1 text-left">{busy === "google" ? "Connecting…" : "Connect Gmail"}</span><PlugZap size={13}/></button>
      <button onClick={() => void connect("microsoft")} disabled={busy !== null} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-black/5 disabled:opacity-40"><span className="grid h-6 w-6 place-items-center rounded-full bg-white"><MicrosoftMark/></span><span className="flex-1 text-left">{busy === "microsoft" ? "Connecting…" : "Connect Outlook"}</span><PlugZap size={13}/></button>
    </div>
    {error && <div className="mt-2 rounded-lg bg-[#fff6f2] px-2.5 py-2 text-[10px] leading-4 text-[#8b5145]">{error}</div>}
  </div>;
}

function GoogleMark() { return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.25-.2-1.82H12v3.45h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.73-4.33 2.73-7.16z"/><path fill="#34A853" d="M12 21.5c2.7 0 4.97-.9 6.62-2.44l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A9.98 9.98 0 0 0 12 21.5z"/><path fill="#FBBC05" d="M6.41 13.39A5.75 5.75 0 0 1 6.1 11.5c0-.66.11-1.3.31-1.89V7.02H3.06A9.98 9.98 0 0 0 2 11.5c0 1.61.39 3.13 1.06 4.48l3.35-2.59z"/><path fill="#EA4335" d="M12 5.49c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.97 2.52 14.7 1.5 12 1.5a10 10 0 0 0-8.94 5.52l3.35 2.59C6.2 7.25 8.4 5.49 12 5.49z"/></svg>; }
function MicrosoftMark() { return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#f25022" d="M2 2h9.5v9.5H2z"/><path fill="#7fba00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00a4ef" d="M2 12.5h9.5V22H2z"/><path fill="#ffb900" d="M12.5 12.5H22V22h-9.5z"/></svg>; }

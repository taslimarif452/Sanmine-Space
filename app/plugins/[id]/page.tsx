"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronRight, Link2, RefreshCw, Settings, Trash2, Unplug } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";

const pluginCatalog = [
  { id: "web", name: "Web Search", description: "Search the web for research and source-backed answers.", category: "Research", logo: "https://cdn.simpleicons.org/googlechrome", oauth: false },
  { id: "github", name: "GitHub", description: "Connect repositories, issues, pull requests and code.", category: "Developer", logo: "https://cdn.simpleicons.org/github", oauth: true },
  { id: "youtube", name: "YouTube", description: "Search channels and videos for creator research.", category: "Research", logo: "https://cdn.simpleicons.org/youtube", oauth: false },
  { id: "drive", name: "Google Drive", description: "Work with files the user explicitly authorizes.", category: "Workspace", logo: "https://cdn.simpleicons.org/googledrive", oauth: true },
  { id: "docs", name: "Google Docs", description: "Read and create documents through Google OAuth.", category: "Workspace", logo: "https://cdn.simpleicons.org/googledocs", oauth: true },
  { id: "sheets", name: "Google Sheets", description: "Read and update spreadsheets for structured data.", category: "Workspace", logo: "https://cdn.simpleicons.org/googlesheets", oauth: true },
  { id: "calendar", name: "Google Calendar", description: "Manage events after explicit user approval.", category: "Workspace", logo: "https://cdn.simpleicons.org/googlecalendar", oauth: true },
  { id: "canva", name: "Canva", description: "Connect approved design and creative workflows.", category: "Workspace", logo: "https://cdn.simpleicons.org/canva/00C4CC", oauth: true },
  { id: "discord", name: "Discord", description: "Connect Discord communities and approved bot workflows.", category: "Communication", logo: "https://cdn.simpleicons.org/discord", oauth: true },
  { id: "vercel", name: "Vercel", description: "Inspect projects and deployments through authorization.", category: "Developer", logo: "https://cdn.simpleicons.org/vercel", oauth: true },
  { id: "firebase", name: "Firebase", description: "Connect Firebase project workflows.", category: "Developer", logo: "https://cdn.simpleicons.org/firebase", oauth: true },
  { id: "notion", name: "Notion", description: "Connect pages and databases for project context.", category: "Workspace", logo: "https://cdn.simpleicons.org/notion", oauth: true },
  { id: "rss", name: "RSS / News", description: "Read public RSS feeds without a paid news API.", category: "Research", logo: "https://cdn.simpleicons.org/rss", oauth: false },
  { id: "gmail", name: "Gmail", description: "Read and manage Gmail", category: "Communication", logo: "https://cdn.simpleicons.org/gmail", oauth: true },
] as const;

const storageKey = (uid: string) => `sanmine:installed-plugins:${uid}`;
type Connection = { id: string; provider: string; email: string; display_name?: string | null };

type PluginManagePageProps = {
  params: Promise<{ id: string }>;
};

export default function PluginManagePage({ params }: PluginManagePageProps) {
  const { id } = use(params);
  const user = useAuthUser();
  const plugin = useMemo(() => pluginCatalog.find((item) => item.id === id), [id]);
  const [installed, setInstalled] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(user.uid)) ?? "[]");
      setInstalled(Array.isArray(saved) && saved.includes(id));
    } catch { setInstalled(false); }
  }, [id, user?.uid]);

  useEffect(() => {
    if (!user || id !== "gmail") return;
    void loadGmailConnection();
  }, [id, user]);

  const loadGmailConnection = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/email/connections", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const rows = Array.isArray(data.connections) ? data.connections : [];
      setConnection(rows.find((x: Connection) => ["google", "gmail"].includes(String(x.provider || "").toLowerCase())) ?? null);
    } catch { setConnection(null); }
  };

  if (!user || !plugin) return null;

  const uninstall = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey(user.uid)) ?? "[]");
      const next = Array.isArray(saved) ? saved.filter((pluginId) => pluginId !== plugin.id) : [];
      window.localStorage.setItem(storageKey(user.uid), JSON.stringify(next));
    } catch { window.localStorage.setItem(storageKey(user.uid), "[]"); }
    setInstalled(false);
    setMessage(`${plugin.name} has been uninstalled.`);
  };

  const connectGmail = async () => {
    setBusy(true); setMessage("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/email/google", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Unable to start Gmail authentication.");
      window.location.assign(String(data.url));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect Gmail.");
      setBusy(false);
    }
  };

  const disconnectGmail = async () => {
    if (!connection) return;
    setBusy(true); setMessage("");
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/email/connections", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: connection.id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to disconnect Gmail.");
      setConnection(null);
      setMessage("Gmail has been disconnected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect Gmail.");
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-[900px] px-5 pb-12 pt-6 sm:px-8 md:pt-10">
        <Link href="/plugins" className="inline-flex items-center gap-2 text-sm text-[#77736b] hover:text-[#282721]"><ArrowLeft size={17} />Back to Plugins</Link>
        <header className="mt-8 flex items-center gap-4 border-b border-[#e7e4df] pb-7">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-[#e7e4df] bg-white"><img src={plugin.logo} alt={`${plugin.name} logo`} className="h-10 w-10 object-contain" /></div>
          <div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold tracking-[-.025em] text-[#282721]">{plugin.name}</h1><p className="mt-1 text-sm text-[#858078]">{plugin.description}</p></div>
          <Settings className="hidden text-[#8b877f] sm:block" size={21} />
        </header>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-[#302e29]">Connection</h2>
          <div className="mt-3 rounded-2xl border border-[#e3e0da] bg-white p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${connection ? "bg-[#eef7ee] text-[#28743c]" : "bg-[#f3f1ec] text-[#77736b]"}`}>{connection ? <Check size={18} /> : <Link2 size={18} />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-[#302e29]">Authentication</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${connection ? "bg-[#eef7ee] text-[#28743c]" : "bg-[#f4f2ee] text-[#77736b]"}`}>{connection ? "Connected" : "Not connected"}</span></div>
                {connection ? <><p className="mt-2 text-sm text-[#555148]">{connection.display_name || plugin.name}</p><p className="mt-0.5 truncate text-xs text-[#969188]">{connection.email}</p><p className="mt-3 text-xs leading-5 text-[#969188]">This is the account currently authorized to Sanmine Space for this plugin.</p></> : <p className="mt-2 text-sm leading-6 text-[#858078]">No provider account is currently authenticated for this plugin.</p>}
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 border-t border-[#eeeae4] pt-5 sm:flex-row">
              {plugin.id === "gmail" ? <><button type="button" onClick={connectGmail} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#282721] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"><RefreshCw size={15} />{connection ? "Reconnect account" : "Connect account"}</button>{connection && <button type="button" onClick={() => void disconnectGmail()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#ddd9d2] px-4 py-2.5 text-sm text-[#5f5b54] disabled:opacity-50"><Unplug size={15} />Disconnect</button>}</> : <button type="button" disabled className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#ddd9d2] px-4 py-2.5 text-sm text-[#77736b] disabled:cursor-not-allowed"><Link2 size={15} />Provider authentication setup required</button>}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-[#302e29]">Plugin access</h2>
          <div className="mt-3 divide-y divide-[#eeeae4] rounded-2xl border border-[#e3e0da] bg-white px-5 sm:px-6">
            <div className="flex items-center gap-4 py-5"><div className="min-w-0 flex-1"><h3 className="text-sm font-medium text-[#302e29]">Installed for this account</h3><p className="mt-1 text-xs leading-5 text-[#969188]">Controls whether {plugin.name} appears in your Installed plugins list.</p></div><span className="text-sm font-medium text-[#555148]">{installed ? "Installed" : "Not installed"}</span></div>
            <div className="flex items-center gap-4 py-5"><div className="min-w-0 flex-1"><h3 className="text-sm font-medium text-[#302e29]">Provider access</h3><p className="mt-1 text-xs leading-5 text-[#969188]">Sanmine only uses the provider account after you explicitly authorize it.</p></div><ChevronRight size={17} className="text-[#aaa59d]" /></div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-[#eaded9] bg-[#fffaf8] p-5 sm:p-6">
          <div className="flex items-start gap-3"><Trash2 size={18} className="mt-0.5 shrink-0 text-[#9a6559]" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-[#6e4037]">Remove plugin</h2><p className="mt-1 text-xs leading-5 text-[#8b6961]">Uninstall removes this plugin from your Installed list. Disconnect separately removes its provider account authorization when supported.</p><button type="button" onClick={uninstall} disabled={!installed} className="mt-4 rounded-xl border border-[#dfcfc9] px-4 py-2 text-sm font-medium text-[#75473e] disabled:cursor-not-allowed disabled:opacity-40">Uninstall plugin</button></div></div>
        </section>
        {message && <p className="mt-5 rounded-xl bg-[#f4f2ee] px-4 py-3 text-sm text-[#6f6a62]">{message}</p>}
      </div>
    </main>
  );
}

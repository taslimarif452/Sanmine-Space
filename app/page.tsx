"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ExternalLink, Globe, Loader2, LogOut, Menu, Plus, Search, UserCircle } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { signOutCurrentUser } from "@/lib/auth/firebase-client";

type Source = { title: string; url: string; snippet?: string; type?: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };
type RecentChat = { id: string; title: string; created_at: string; updated_at: string };
type StreamEvent = { type?: string; event?: { type?: string; name?: string; result?: unknown }; response?: string; events?: unknown[]; error?: string };

const BRAND_LOGO = "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";
const examples = [
  "Find 10 small businesses that could use a better website",
  "Research 10 Indian EdTech businesses and prepare outreach",
  "Find promising leads from YouTube and summarize them",
];

function SidebarToggleIcon({ direction }: { direction: "open" | "close" }) {
  return <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M9 4.5V19.5" stroke="currentColor" strokeWidth="1.7" />{direction === "close" ? <path d="M13 9L16 12L13 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M16 9L13 12L16 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}</svg>;
}

function sourcesFromEvents(events: unknown[]): Source[] {
  const found: Source[] = [];
  for (const event of events ?? []) {
    const e = event as { type?: string; name?: string; result?: unknown };
    if (e.type !== "tool_result" || !e.result) continue;
    const result = e.result as Record<string, unknown>;
    if (e.name === "search_web" && Array.isArray(result.results)) for (const item of result.results as Array<Record<string, unknown>>) if (typeof item.url === "string") found.push({ title: String(item.title || "Web source"), url: item.url, snippet: typeof item.snippet === "string" ? item.snippet : undefined, type: "Web" });
    if (e.name === "open_page" && typeof result.url === "string") found.push({ title: String(result.title || "Web page"), url: result.url, snippet: typeof result.text === "string" ? result.text.slice(0, 180) : undefined, type: "Page" });
    if (e.name === "website_analyze" && Array.isArray(result.pages_scanned)) for (const item of result.pages_scanned as Array<Record<string, unknown>>) if (typeof item.url === "string") found.push({ title: String(item.title || item.type || "Website page"), url: item.url, type: String(item.type || "Website") });
  }
  return [...new Map(found.map((s) => [s.url, s])).values()].slice(0, 12);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    thinking: "Thinking",
    searching: "Searching the web",
    opening: "Opening website",
    analyzing: "Analyzing",
    youtube: "Searching YouTube",
    researching: "Researching",
  };
  return labels[status] || "Thinking";
}

function toolStatus(name?: string) {
  if (!name) return "thinking";
  if (name === "search_web") return "searching";
  if (name === "open_page") return "opening";
  if (name === "website_analyze") return "analyzing";
  if (name.includes("youtube")) return "youtube";
  return "researching";
}

export default function Home() {
  const user = useAuthUser();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("thinking");
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const loadRecentChats = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/chats", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setRecentChats(Array.isArray(data.chats) ? data.chats : []);
    } catch (err) { console.error("Recent chats load failed", err); }
  };

  useEffect(() => { void loadRecentChats(); }, [user]);

  const submit = async () => {
    const text = message.trim();
    if (!text || loading || !user) return;
    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setMessage("");
    setError("");
    setLoading(true);
    setStatus("thinking");

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, history: messages }),
      });

      if (!response.ok) {
        const raw = await response.text();
        let detail = `Chat request failed (${response.status}).`;
        try { const parsed = raw ? JSON.parse(raw) : {}; detail = parsed.error || detail; } catch { /* keep fallback */ }
        throw new Error(detail);
      }
      if (!response.body) throw new Error("The server did not return a response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResponse = "";
      let finalEvents: unknown[] = [];

      const consume = (line: string) => {
        if (!line.trim()) return;
        const data = JSON.parse(line) as StreamEvent;
        if (data.type === "status") setStatus(data.status || "thinking");
        if (data.type === "event" && data.event) {
          if (data.event.type === "tool_start") setStatus(toolStatus(data.event.name));
          if (data.event.type === "tool_result") setStatus("thinking");
        }
        if (data.type === "done") {
          finalResponse = data.response || "I’m ready. What would you like me to do?";
          finalEvents = data.events || [];
        }
        if (data.type === "error") throw new Error(data.error || "Something went wrong while processing the chat request.");
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) consume(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (!finalResponse) throw new Error("The AI did not return a response.");

      setMessages([...nextMessages, { role: "assistant", content: finalResponse, sources: sourcesFromEvents(finalEvents) }]);
      await loadRecentChats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
      setStatus("thinking");
    }
  };

  const newChat = () => { setMessages([]); setMessage(""); setError(""); setStatus("thinking"); };
  const logout = async () => { setProfileOpen(false); await signOutCurrentUser(); };
  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";

  if (!user) return null;

  return <main className="flex h-screen min-h-0 overflow-hidden bg-[var(--bg)]">
    <aside className={`hidden h-screen min-h-0 shrink-0 flex-col border-r border-[var(--line)] bg-[#f2f1ed] py-4 transition-[width] duration-200 md:flex ${sidebar ? "w-[270px] px-3" : "w-[72px] px-2"}`}>
      <div className={`flex shrink-0 items-center pb-5 ${sidebar ? "justify-between px-2" : "justify-center"}`}>
        {sidebar ? <button onClick={newChat} className="flex items-center gap-2.5 text-left" aria-label="New chat"><span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md"><img src={BRAND_LOGO} alt="Sanmine Space" className="h-full w-full object-cover" /></span><span className="text-[15px] font-semibold tracking-[-0.02em]">Sanmine Space</span></button> : <div className="group relative h-7 w-7"><img src={BRAND_LOGO} alt="Sanmine Space" className="h-7 w-7 rounded-md object-cover transition-opacity group-hover:opacity-0" /><button onClick={() => setSidebar(true)} className="absolute inset-0 grid h-7 w-7 place-items-center rounded-md text-[#77746d] opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100" aria-label="Expand sidebar"><SidebarToggleIcon direction="open" /></button></div>}
        {sidebar && <button onClick={() => setSidebar(false)} className="rounded-md p-1.5 text-[#77746d] hover:bg-black/5" aria-label="Collapse sidebar"><SidebarToggleIcon direction="close" /></button>}
      </div>
      <button onClick={newChat} className={`flex shrink-0 items-center rounded-lg py-2.5 text-sm font-medium hover:bg-black/5 ${sidebar ? "gap-2 px-3" : "justify-center px-0"}`} aria-label="New chat"><Plus size={17} />{sidebar && "New chat"}</button>
      {sidebar ? <div className="mt-7 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"><div className="px-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99958c]">Recent</div><div className="mt-2 space-y-0.5">{recentChats.map((chat) => <button key={chat.id} className="block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] text-[#5e5b54] hover:bg-black/5" title={chat.title}>{chat.title}</button>)}{recentChats.length === 0 && <div className="px-3 py-2 text-[12px] text-[#aaa69d]">No recent chats yet.</div>}</div></div> : <div className="min-h-0 flex-1" />}
      <div className="relative mt-3 shrink-0 border-t border-[var(--line)] pt-3">
        {profileOpen && <div className={`absolute z-50 bottom-[calc(100%+10px)] rounded-xl border border-[var(--line)] bg-white p-2 shadow-[0_12px_32px_rgba(30,27,20,0.16)] ${sidebar ? "left-0 right-0" : "left-[calc(100%+10px)] w-[250px]"}`}><div className="flex items-center gap-3 px-2 py-2"><Avatar user={user} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-[#302e29]">{displayName}</div><div className="truncate text-xs text-[#858178]">{user.email}</div></div></div><div className="my-1 h-px bg-[var(--line)]" /><button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[#6d4b42] hover:bg-[#fff5f2]"><LogOut size={15} /> Log out</button></div>}
        <button onClick={() => setProfileOpen((v) => !v)} className={`flex w-full items-center rounded-xl py-2.5 text-left hover:bg-black/5 ${sidebar ? "gap-3 px-2" : "justify-center px-0"}`} aria-label="Profile" aria-expanded={profileOpen} title={!sidebar ? displayName : undefined}><Avatar user={user} />{sidebar && <div className="min-w-0"><div className="truncate text-[13px] font-medium text-[#45423c]">{displayName}</div><div className="truncate text-[11px] text-[#949087]">{user.email}</div></div>}</button>
      </div>
    </aside>

    <section className="relative flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="absolute right-4 top-4 z-20 md:right-7 md:top-5"><button onClick={newChat} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-[#4d4a44] transition hover:bg-black/5" aria-label="New chat"><Plus size={18} /><span className="hidden sm:inline">New chat</span></button></div>
      <button onClick={() => setSidebar(!sidebar)} className="absolute left-4 top-4 z-20 rounded-lg p-2 text-[var(--muted)] hover:bg-black/5 md:hidden" aria-label="Toggle sidebar"><Menu size={19} /></button>
      {messages.length === 0 ? <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden px-4 pb-8 pt-[15vh]"><div className="w-full max-w-[760px]"><div className="mb-8 text-center"><div className="mx-auto mb-5 grid h-11 w-11 place-items-center overflow-hidden rounded-2xl"><img src={BRAND_LOGO} alt="Sanmine Space" className="h-full w-full object-cover" /></div><h1 className="font-serif text-4xl tracking-[-0.035em] text-[#282721] md:text-[46px]">How can I help?</h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">Research leads, build outreach campaigns, and get work done from one simple conversation.</p></div><Composer message={message} setMessage={setMessage} submit={submit} loading={loading} /><Suggestions setMessage={setMessage} />{error && <ErrorMessage message={error} />}</div></div> : <div className="flex min-h-0 flex-1 flex-col overflow-hidden"><div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-10"><div className="mx-auto w-full max-w-[820px] space-y-8">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>{item.role === "user" ? <div className="max-w-[75%] rounded-2xl bg-[#ebe9e3] px-4 py-3 text-[15px] leading-6 text-[#282721]">{item.content}</div> : <div className="w-full max-w-[85%] text-[15px] leading-7 text-[#37352f]"><div className="flex gap-3"><div className="mt-1 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg"><img src={BRAND_LOGO} alt="" className="h-full w-full object-cover" /></div><div className="whitespace-pre-wrap">{item.content}</div></div>{item.sources?.length ? <SourceCards sources={item.sources} /> : null}</div>}</div>)}{loading && <div className="flex items-center gap-3 text-sm text-[var(--muted)]"><div className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg"><img src={BRAND_LOGO} alt="" className="h-full w-full object-cover" /></div><span className="flex items-center gap-2"><span>{statusLabel(status)}</span><Loader2 size={14} className="animate-spin" /></span></div>}{error && <ErrorMessage message={error} />}</div></div><div className="mx-auto w-full max-w-[820px] shrink-0 px-4 pb-6 pt-2"><Composer message={message} setMessage={setMessage} submit={submit} loading={loading} /></div></div>}
    </section>
  </main>;
}

function Avatar({ user }: { user: { photoURL?: string | null } }) { return user.photoURL ? <img src={user.photoURL} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" /> : <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e4e1d9] text-[#5b5850]"><UserCircle size={19} /></div>; }

function SourceCards({ sources }: { sources: Source[] }) { return <div className="mt-5 border-t border-[var(--line)] pt-4"><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#969188]"><Globe size={13} /> Sources</div><div className="grid gap-2 sm:grid-cols-2">{sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="group rounded-xl border border-[var(--line)] bg-white/45 p-3 transition hover:border-[#c8c4ba] hover:bg-white"><div className="flex items-start gap-2.5"><div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#ebe9e3] text-[#716d64]"><Search size={13} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1 text-[13px] font-medium text-[#39362f]"><span className="truncate">{source.title}</span><ExternalLink size={12} className="shrink-0 opacity-0 transition group-hover:opacity-100" /></div><div className="mt-0.5 truncate text-[10px] text-[#a09c93]">{source.url}</div>{source.snippet && <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[#77736a]">{source.snippet}</p>}</div></div></a>)}</div></div>; }

function Composer({ message, setMessage, submit, loading }: { message: string; setMessage: (value: string) => void; submit: () => void; loading: boolean }) { return <div className="rounded-[22px] border border-[#dcd9d1] bg-[#fbfaf7] p-2 shadow-[0_2px_10px_rgba(30,27,20,0.04)]"><textarea value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder="Ask Sanmine Space anything..." rows={1} disabled={loading} className="max-h-32 min-h-[48px] w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] leading-6 text-[#282721] outline-none placeholder:text-[#aaa69d]" /><div className="flex items-center justify-end px-1 pb-1"><button onClick={() => void submit()} disabled={!message.trim() || loading} className="grid h-9 w-9 place-items-center rounded-full bg-[#282721] text-white transition hover:bg-[#3c3a34] disabled:cursor-not-allowed disabled:opacity-30" aria-label="Send"><ArrowUp size={17} /></button></div></div>; }

function Suggestions({ setMessage }: { setMessage: (value: string) => void }) { return <div className="mt-4 grid gap-2 sm:grid-cols-3">{examples.map((item) => <button key={item} onClick={() => setMessage(item)} className="rounded-xl border border-[var(--line)] bg-white/35 px-3 py-2.5 text-left text-xs leading-5 text-[#716d64] transition hover:bg-white">{item}</button>)}</div>; }
function ErrorMessage({ message }: { message: string }) { return <div className="mt-4 rounded-xl border border-[#ead5cf] bg-[#fff7f4] px-3 py-2 text-sm text-[#8b5145]">{message}</div>; }

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileText, LayoutGrid, LogOut, Mail, Menu, Plus, PlugZap, Search, Send, Settings, UserCircle, X } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { EmailConnections } from "@/components/email-connections";
import { signOutCurrentUser } from "@/lib/auth/firebase-client";

type Chat = { id: string; title: string; created_at?: string; updated_at?: string };
const LOGO = "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";

export default function PluginsPage() {
  const user = useAuthUser();
  const [chats, setChats] = useState<Chat[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = async () => { try { const token = await user.getIdToken(); const r = await fetch("/api/chats", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); if (!r.ok) return; const d = await r.json(); if (alive) setChats(Array.isArray(d.chats) ? d.chats : []); } catch {} };
    void load(); return () => { alive = false; };
  }, [user]);
  if (!user) return null;
  const filtered = chats.filter((chat) => chat.title.toLowerCase().includes(search.toLowerCase()));
  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  return <main className="flex h-screen min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
    <div className={`fixed inset-0 z-40 bg-black/20 transition-opacity md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[286px] shrink-0 flex-col border-r border-[#e4e1da] bg-[#f7f6f2] transition-transform duration-200 md:static md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-.02em]"><span className="h-7 w-7 overflow-hidden rounded-lg"><img src={LOGO} alt="Sanmine Space" className="h-full w-full object-cover" /></span><span>Sanmine Space</span></Link>
        <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[#77736a] hover:bg-black/5 md:hidden" aria-label="Close sidebar"><X size={19} /></button>
      </div>
      <div className="px-3 pt-2">
        <Link href="/" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#393731] hover:bg-black/[.045]"><Plus size={18} /> New chat</Link>
        <Link href="/plugins" className="mt-1 flex h-10 items-center gap-3 rounded-xl bg-black/[.055] px-3 text-sm font-medium text-[#282721]"><PlugZap size={18} /> Plugins</Link>
        <Link href="/campaigns" className="mt-1 flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#393731] hover:bg-black/[.045]"><Send size={18} /> Campaigns</Link>
      </div>
      <div className="mt-5 px-3">
        <div className="mb-2 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#99958c]"><span>Recent chats</span><button onClick={() => setSearch((v) => v ? "" : " ")} className="rounded-md p-1 hover:bg-black/5" aria-label="Search chats"><Search size={14} /></button></div>
        {search !== "" && <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#ddd9d1] bg-white px-2.5"><Search size={14} className="text-[#aaa59b]"/><input autoFocus value={search.trim()} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none"/></div>}
        <div className="max-h-[calc(100vh-270px)] space-y-0.5 overflow-y-auto pr-1">{filtered.slice(0, 30).map((chat) => <Link key={chat.id} href={`/?chat=${encodeURIComponent(chat.id)}`} className="block truncate rounded-lg px-2.5 py-2 text-sm text-[#5f5b53] hover:bg-black/[.045]">{chat.title || "New chat"}</Link>)}{!filtered.length && <p className="px-2.5 py-3 text-xs text-[#aaa59b]">No recent chats</p>}</div>
      </div>
      <div className="relative mt-auto border-t border-[#e4e1da] p-3">
        <button onClick={() => setProfileOpen((v) => !v)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-black/[.045]">{user.photoURL ? <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e4e1d9]"><UserCircle size={18}/></span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{displayName}</span><span className="block truncate text-[11px] text-[#969188]">{user.email}</span></span><ChevronDown size={15} className="text-[#8d8981]" /></button>
        {profileOpen && <div className="absolute bottom-[62px] left-3 right-3 overflow-hidden rounded-xl border border-[#ddd9d1] bg-white p-1.5 shadow-lg"><button onClick={() => void signOutCurrentUser()} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[#5f5b53] hover:bg-black/5"><LogOut size={15}/> Sign out</button></div>}
      </div>
    </aside>
    <section className="min-w-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e8e5de]/80 bg-[var(--bg)]/95 px-4 backdrop-blur sm:px-7"><button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#5f5b53] hover:bg-black/5 md:hidden" aria-label="Open sidebar"><Menu size={21}/></button><div className="hidden md:block" /><Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#6d6961] hover:bg-black/5"><ChevronRight size={15} className="rotate-180"/> Back to chat</Link></header>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">Workspace connections</p><h1 className="font-serif text-5xl tracking-[-.045em] text-[#282721] sm:text-6xl">Plugins</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#77736a]">Connect the services you actually use with Sanmine Space. Keep your tools in one quiet workspace and choose exactly which accounts are connected.</p></div><div className="flex h-11 w-full items-center gap-2 rounded-xl border border-[#dcd9d1] bg-[#fbfaf7] px-3 shadow-sm md:w-64"><Search size={17} className="text-[#9b978e]"/><input placeholder="Search plugins" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#aaa59d]" /></div></div>
        <div className="mt-12"><div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#3d3a34]"><span>Installed</span><ChevronRight size={16} className="text-[#aaa59d]" /></div><section className="rounded-2xl border border-[#dfdcd5] bg-[#fbfaf7] p-3 shadow-sm sm:p-4"><div className="flex items-center gap-4 rounded-xl px-2 py-3 sm:px-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#f0eee8] text-[#38362f]"><Mail size={22}/></div><div className="min-w-0"><h2 className="text-[15px] font-semibold text-[#302e29]">Gmail</h2><p className="mt-1 text-sm text-[#88837a]">Read, prepare and manage Gmail for your outreach workflow.</p></div><div className="ml-auto hidden shrink-0 rounded-full bg-[#e9e6de] px-2.5 py-1 text-[11px] font-medium text-[#6c685f] sm:block">Connected</div></div><div className="mt-2 border-t border-[#e8e4dc] px-1 pt-4 sm:px-2"><EmailConnections user={user}/></div></section></div>
        <div className="mt-12"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">Available in Sanmine Space</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><PluginCard icon={<FileText size={20}/>} title="Research" text="Web research and prospect analysis are built into your workspace." /><PluginCard icon={<LayoutGrid size={20}/>} title="Lead workspace" text="Turn research into organized lead records and focused next steps." /><PluginCard icon={<Settings size={20}/>} title="Outreach" text="Prepare proposals and emails with approval kept in your hands." /></div></div>
      </div>
    </section>
  </main>;
}
function PluginCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-[#e0ddd6] bg-[#fbfaf7] p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eeece6] text-[#4d4941]">{icon}</div><h3 className="mt-4 text-sm font-semibold text-[#302e29]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#858078]">{text}</p></div>; }

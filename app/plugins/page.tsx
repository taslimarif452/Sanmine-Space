"use client";

import Link from "next/link";
import { FileText, LayoutGrid, Menu, Search, Settings } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { EmailConnections } from "@/components/email-connections";

export default function PluginsPage() {
  const user = useAuthUser();
  if (!user) return null;
  return <main className="flex h-screen min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
    <WorkspaceSidebar user={user}/>
    <section className="min-w-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e8e5de]/80 bg-[var(--bg)]/95 px-4 backdrop-blur sm:px-7"><button onClick={()=>window.dispatchEvent(new Event("sanmine:open-sidebar"))} className="rounded-lg p-2 text-[#5f5b53] hover:bg-black/5 md:hidden" aria-label="Open sidebar"><Menu size={21}/></button><div className="hidden md:block"/><Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#6d6961] hover:bg-black/5">Back to chat</Link></header>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">Workspace connections</p><h1 className="font-serif text-5xl tracking-[-.045em] text-[#282721] sm:text-6xl">Plugins</h1><p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#77736a]">Connect the services you actually use with Sanmine Space. Keep your tools in one quiet workspace and choose exactly which accounts are connected.</p></div><div className="flex h-11 w-full items-center gap-2 rounded-xl border border-[#dcd9d1] bg-[#fbfaf7] px-3 shadow-sm md:w-64"><Search size={17} className="text-[#9b978e]"/><input placeholder="Search plugins" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#aaa59d]" /></div></div>
        <div className="mt-12"><div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#3d3a34]"><span>Installed</span><span className="text-[#aaa59d]">›</span></div><section className="rounded-2xl border border-[#dfdcd5] bg-[#fbfaf7] p-3 shadow-sm sm:p-4"><div className="flex items-center gap-4 rounded-xl px-2 py-3 sm:px-3"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#f0eee8] text-[#38362f] text-sm font-semibold">G</div><div className="min-w-0"><h2 className="text-[15px] font-semibold text-[#302e29]">Gmail</h2><p className="mt-1 text-sm text-[#88837a]">Read, prepare and manage Gmail for your outreach workflow.</p></div><div className="ml-auto hidden shrink-0 rounded-full bg-[#e9e6de] px-2.5 py-1 text-[11px] font-medium text-[#6c685f] sm:block">Connected</div></div><div className="mt-2 border-t border-[#e8e4dc] px-1 pt-4 sm:px-2"><EmailConnections user={user}/></div></section></div>
        <div className="mt-12"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">Available in Sanmine Space</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><PluginCard icon={<FileText size={20}/>} title="Research" text="Web research and prospect analysis are built into your workspace." /><PluginCard icon={<LayoutGrid size={20}/>} title="Lead workspace" text="Turn research into organized lead records and focused next steps." /><PluginCard icon={<Settings size={20}/>} title="Outreach" text="Prepare proposals and emails with approval kept in your hands." /></div></div>
      </div>
    </section>
  </main>;
}
function PluginCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-2xl border border-[#e0ddd6] bg-[#fbfaf7] p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eeece6] text-[#4d4941]">{icon}</div><h3 className="mt-4 text-sm font-semibold text-[#302e29]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#858078]">{text}</p></div>; }

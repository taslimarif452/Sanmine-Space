"use client";

import Link from "next/link";
import { ArrowLeft, Mail, PlugZap, Send } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { EmailConnections } from "@/components/email-connections";

export default function PluginsPage() {
  const user = useAuthUser();
  if (!user) return null;
  return <main className="min-h-screen bg-[var(--bg)] px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#625e56] hover:bg-black/5"><ArrowLeft size={17}/>Back to chat</Link>
        <Link href="/campaigns" className="flex items-center gap-2 rounded-xl bg-[#282721] px-3.5 py-2.5 text-sm font-medium text-white hover:opacity-90"><Send size={15}/>Approvals & campaigns</Link>
      </div>
      <div className="mb-8">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ebe9e3]"><PlugZap size={21}/></div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#282721]">Plugins</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#77736a]">Connect services to give Sanmine Space access to the tools you choose. Your connected accounts stay private to your account.</p>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#dedbd4] bg-[#fbfaf7] shadow-sm">
        <div className="border-b border-[#e8e4dc] px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f0eee8]"><Mail size={17}/></span><div><h2 className="text-sm font-semibold">Email</h2><p className="text-xs text-[#8c887f]">Connect an inbox for outreach and sending.</p></div></div></div>
        <div className="p-4 sm:p-5"><EmailConnections user={user}/></div>
      </section>
    </div>
  </main>;
}

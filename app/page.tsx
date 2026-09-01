"use client";

import { useState } from "react";
import { ArrowUp, ChevronDown, Menu, Plus, Search, Settings2, Sparkles } from "lucide-react";

const examples = [
  "Find 10 small businesses that could use a better website",
  "Research 10 Indian EdTech businesses and prepare outreach",
  "Find promising leads from YouTube and summarize them",
];

export default function Home() {
  const [message, setMessage] = useState("");
  const [sidebar, setSidebar] = useState(true);

  const submit = () => {
    if (!message.trim()) return;
    setMessage("");
  };

  return (
    <main className="flex min-h-screen bg-[var(--bg)]">
      {sidebar && (
        <aside className="hidden w-[270px] shrink-0 flex-col border-r border-[var(--line)] bg-[#f2f1ed] px-3 py-4 md:flex">
          <div className="flex items-center justify-between px-2 pb-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#24231f] text-sm font-semibold text-white">S</div>
              <span className="text-[15px] font-semibold tracking-[-0.02em]">Sanmine Space</span>
            </div>
            <button className="rounded-md p-1.5 text-[#77746d] hover:bg-black/5" aria-label="Settings"><Settings2 size={17} /></button>
          </div>
          <button className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-black/5"><Plus size={17} /> New chat</button>
          <div className="mt-7 px-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99958c]">Recent</div>
          <div className="mt-2 space-y-0.5">
            {["Lead research ideas", "Website outreach plan", "EdTech prospects"].map((item) => (
              <button key={item} className="block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] text-[#5e5b54] hover:bg-black/5">{item}</button>
            ))}
          </div>
          <div className="mt-auto rounded-xl border border-[var(--line)] bg-white/60 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles size={14} /> Agent workspace</div>
            <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">Connect research and outreach tools as you build.</p>
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4 md:px-7">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebar(!sidebar)} className="rounded-lg p-2 text-[var(--muted)] hover:bg-black/5 md:hidden"><Menu size={19} /></button>
            <span className="text-sm font-semibold md:hidden">Sanmine Space</span>
            <button className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-[#4d4a44] hover:bg-black/5 md:flex">New chat <ChevronDown size={14} /></button>
          </div>
          <button className="rounded-lg p-2 text-[var(--muted)] hover:bg-black/5" aria-label="Search"><Search size={18} /></button>
        </header>

        <div className="flex flex-1 flex-col items-center px-4 pb-8 pt-[15vh]">
          <div className="w-full max-w-[760px]">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-[#24231f] text-white shadow-sm"><Sparkles size={20} /></div>
              <h1 className="font-serif text-4xl tracking-[-0.035em] text-[#282721] md:text-[46px]">How can I help?</h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">Research leads, build outreach campaigns, and get work done from one simple conversation.</p>
            </div>

            <div className="rounded-[22px] border border-[#dcd9d1] bg-[var(--panel)] p-2 shadow-[0_8px_35px_rgba(30,27,20,0.06)] focus-within:border-[#c8c4ba] focus-within:shadow-[0_10px_40px_rgba(30,27,20,0.09)]">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                rows={3}
                placeholder="Ask Sanmine Space to do something..."
                className="min-h-[92px] w-full resize-none border-0 bg-transparent px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-[#aaa69d]"
              />
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="px-2 text-[11px] text-[#aaa69d]">Enter to send · Shift + Enter for new line</span>
                <button onClick={submit} disabled={!message.trim()} className="grid h-9 w-9 place-items-center rounded-xl bg-[#24231f] text-white transition hover:bg-[#3a3832] disabled:cursor-not-allowed disabled:opacity-25" aria-label="Send"><ArrowUp size={17} /></button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {examples.map((example) => (
                <button key={example} onClick={() => setMessage(example)} className="rounded-full border border-[var(--line)] bg-white/40 px-3.5 py-2 text-xs text-[#68655e] transition hover:border-[#cbc7bd] hover:bg-white">{example}</button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import { ArrowRight, Check, Search, Sparkles, Workflow } from "lucide-react";

const LOGO = "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";

export function LandingPage({ onLogin, busy, error }: { onLogin: () => void; busy: boolean; error?: string }) {
  const capabilities = [
    { icon: Search, title: "Research with context", text: "Turn a question into focused web research, useful sources, and clear findings." },
    { icon: Sparkles, title: "Create better outreach", text: "Move from a prospect to a thoughtful proposal or personalized email in one flow." },
    { icon: Workflow, title: "Keep work together", text: "Chats, leads, research, and outreach stay connected in one workspace." },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7f6f2] text-[#24231f]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-8">
        <div className="flex items-center gap-2.5">
          <img src={LOGO} alt="Sanmine Space" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Sanmine Space</span>
        </div>
        <button onClick={onLogin} disabled={busy} className="rounded-full px-4 py-2 text-sm font-medium transition hover:bg-black/[.045] disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-5xl flex-col items-center justify-center px-6 pb-24 pt-12 text-center md:px-8 md:pt-4">
        <div className="mb-7 flex items-center gap-2 rounded-full border border-[#dfdcd4] bg-white/55 px-3.5 py-1.5 text-xs text-[#706d66]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c96f51]" /> AI workspace for research & outreach
        </div>
        <h1 className="max-w-4xl font-serif text-[clamp(3.2rem,8vw,6.8rem)] leading-[.92] tracking-[-0.055em] text-[#24231f]">
          From research to<br /><em>real conversations.</em>
        </h1>
        <p className="mt-7 max-w-2xl text-[17px] leading-7 text-[#706d66] md:text-[18px]">
          Research prospects, find opportunities, and create thoughtful outreach with one focused AI workspace.
        </p>
        <button onClick={onLogin} disabled={busy} className="group mt-9 inline-flex items-center gap-2 rounded-full bg-[#282721] px-5 py-3.5 text-[15px] font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#1f1e1a] disabled:opacity-50">
          {busy ? "Signing in…" : "Continue with Google"}
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
        {error && <p className="mt-3 max-w-md text-xs text-[#8c4b36]">{error}</p>}
        <div className="mt-20 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs text-[#77746d]">
          {["Web research", "Lead discovery", "Personalized outreach"].map((item) => (
            <span key={item} className="flex items-center gap-1.5"><Check size={13} />{item}</span>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e6e3dc] bg-[#f1f0eb]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-28">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b877f]">One workspace</p>
          <div className="mt-5 grid gap-10 md:grid-cols-[1fr_1.25fr] md:gap-20">
            <h2 className="max-w-xl font-serif text-4xl leading-[1.02] tracking-[-0.04em] md:text-5xl">Less switching.<br />More meaningful work.</h2>
            <p className="max-w-2xl text-[17px] leading-8 text-[#706d66]">Sanmine Space brings the parts of prospecting and outreach that usually live across many tools into one calm, conversational workflow.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-28">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b877f]">What you can do</p>
          <h2 className="mt-5 font-serif text-4xl leading-[1.02] tracking-[-0.04em] md:text-5xl">A focused path from idea to action.</h2>
        </div>
        <div className="mt-14 grid gap-10 border-t border-[#e2dfd7] pt-10 md:grid-cols-3 md:gap-8">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <div key={title} className="pr-4">
              <Icon size={20} strokeWidth={1.6} className="text-[#c96f51]" />
              <h3 className="mt-7 text-lg font-medium tracking-[-0.02em]">{title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-[#77746d]">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#282721] text-[#f7f6f2]">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-8 md:py-28">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#bdb9af]">Built for momentum</p>
            <h2 className="mt-5 font-serif text-4xl leading-[1.02] tracking-[-0.04em] md:text-6xl">Start with a conversation.<br /><em>Finish with work done.</em></h2>
            <p className="mt-7 max-w-2xl text-[16px] leading-7 text-[#bdb9af]">Ask for research, a lead list, a proposal, or an outreach draft. Sanmine Space helps turn the request into a useful next step.</p>
            <button onClick={onLogin} disabled={busy} className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#f7f6f2] px-5 py-3.5 text-[15px] font-medium text-[#282721] transition hover:bg-white disabled:opacity-50">
              {busy ? "Signing in…" : "Get started"}<ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8 text-xs text-[#8a877f] md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2"><img src={LOGO} alt="" className="h-5 w-5 rounded-md" /><span>Sanmine Space</span></div>
        <div className="flex items-center gap-5"><a href="/privacy" className="transition hover:text-[#4b4943]">Privacy Policy</a><span>AI workspace for research & outreach</span></div>
      </footer>
    </main>
  );
}

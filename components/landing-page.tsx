"use client";

import { ArrowRight, Check } from "lucide-react";

const LOGO = "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";

export function LandingPage({ onLogin, busy, error }: { onLogin: () => void; busy: boolean; error?: string }) {
  return (
    <main className="min-h-screen overflow-auto bg-[#f7f6f2] text-[#24231f]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-8">
        <div className="flex items-center gap-2.5">
          <img src={LOGO} alt="Sanmine Space" className="h-8 w-8 rounded-lg object-cover" />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Sanmine Space</span>
        </div>
        <button onClick={onLogin} disabled={busy} className="rounded-full px-4 py-2 text-sm font-medium transition hover:bg-black/[.045] disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-5xl flex-col items-center justify-center px-6 pb-20 pt-12 text-center md:px-8 md:pt-4">
        <div className="mb-7 flex items-center gap-2 rounded-full border border-[#dfdcd4] bg-white/55 px-3.5 py-1.5 text-xs text-[#706d66]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#c96f51]" /> AI workspace for research & outreach
        </div>
        <h1 className="max-w-4xl font-serif text-[clamp(3.2rem,8vw,6.8rem)] leading-[.92] tracking-[-0.055em] text-[#24231f]">
          From research to<br /><em>real conversations.</em>
        </h1>
        <p className="mt-7 max-w-2xl text-[17px] leading-7 text-[#706d66] md:text-[18px]">
          Research prospects, find opportunities, and create thoughtful outreach with one focused AI workspace.
        </p>
        <button onClick={onLogin} disabled={busy} className="group mt-9 inline-flex items-center gap-2 rounded-full bg-[#282721] px-5 py-3.5 text-[15px] font-medium text-white shadow-sm transition hover:translate-y-[-1px] hover:bg-[#1f1e1a] disabled:opacity-50">
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

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-center px-6 pb-7 text-xs text-[#8a877f]">
        <a href="/privacy" className="transition hover:text-[#4b4943]">Privacy Policy</a>
      </footer>
    </main>
  );
}

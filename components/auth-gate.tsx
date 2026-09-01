"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname } from "next/navigation";
import { getFirebaseAuth, signInWithGoogle } from "@/lib/auth/firebase-client";

const AuthUserContext = createContext<User | null>(null);
export function useAuthUser() { return useContext(AuthUserContext); }

const PUBLIC_PATHS = new Set(["/", "/privacy", "/terms", "/about", "/contact"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (next) => {
        setUser(next); setLoading(false);
        if (next) {
          try { const token = await next.getIdToken(); await fetch("/api/users/sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } }); }
          catch (e) { console.error("User sync failed", e); }
        }
      });
    } catch (e) { console.error(e); setError(e instanceof Error ? e.message : "Firebase configuration is missing."); setLoading(false); }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const originalFetch = window.fetch.bind(window);
    const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith("/api/")) return originalFetch(input, init);
      const token = await user.getIdToken();
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${token}`);
      return originalFetch(input, { ...init, headers });
    };
    window.fetch = wrapped as typeof window.fetch;
    return () => { window.fetch = originalFetch; };
  }, [user]);

  if (loading) return <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-sm text-[var(--muted)]">Loading Sanmine Space…</div>;
  if (!user && PUBLIC_PATHS.has(pathname)) return <LandingLogin error={error} busy={busy} setBusy={setBusy} setError={setError} pathname={pathname} />;
  if (!user) return <LandingLogin error={error} busy={busy} setBusy={setBusy} setError={setError} pathname="/" />;
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}

function LandingLogin({ error, busy, setBusy, setError, pathname }: { error: string; busy: boolean; setBusy: (v: boolean) => void; setError: (v: string) => void; pathname: string }) {
  const login = async () => { setBusy(true); setError(""); try { await signInWithGoogle(); } catch (e) { setError(e instanceof Error ? e.message : "Google sign-in failed."); } finally { setBusy(false); } };
  const logo = "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";
  if (pathname !== "/") return <PublicPageShell logo={logo}><div className="mx-auto max-w-3xl px-6 py-16 md:py-24"><a href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Sanmine Space</a><div className="mt-12">{pathname === "/privacy" ? <PrivacyContent/> : pathname === "/terms" ? <TermsContent/> : pathname === "/about" ? <AboutContent/> : <ContactContent/>}</div></div></PublicPageShell>;
  return <main className="min-h-screen overflow-y-auto bg-[var(--bg)] text-[var(--text)]">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
      <a href="/" className="flex items-center gap-3"><span className="h-8 w-8 overflow-hidden rounded-lg"><img src={logo} alt="Sanmine Space" className="h-full w-full object-cover" /></span><span className="font-serif text-xl tracking-[-.035em]">Sanmine Space</span></a>
      <nav className="flex items-center gap-4 text-sm"><a href="/about" className="hidden text-[var(--muted)] hover:text-[var(--text)] sm:block">About</a><a href="/contact" className="hidden text-[var(--muted)] hover:text-[var(--text)] sm:block">Contact</a><a href="/privacy" className="text-[var(--muted)] hover:text-[var(--text)]">Privacy</a><button onClick={login} disabled={busy} className="rounded-lg border border-[#d8d5cd] bg-white px-4 py-2 font-medium text-[#302e29] shadow-sm hover:bg-[#faf9f6]">Log in</button></nav>
    </header>
    <section className="mx-auto flex min-h-[78vh] max-w-5xl flex-col items-center justify-center px-6 pb-24 pt-10 text-center">
      <div className="mb-7 h-14 w-14 overflow-hidden rounded-2xl shadow-sm"><img src={logo} alt="" className="h-full w-full object-cover" /></div>
      <p className="mb-5 text-xs font-semibold uppercase tracking-[.2em] text-[var(--muted)]">AI workspace for research & outreach</p>
      <h1 className="max-w-4xl font-serif text-5xl leading-[.96] tracking-[-.05em] md:text-7xl">From research to outreach, in one focused workspace.</h1>
      <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">Research leads, understand prospects, create proposals and prepare thoughtful outreach with AI.</p>
      <button onClick={login} disabled={busy} className="mt-9 inline-flex items-center gap-3 rounded-xl bg-[#292822] px-6 py-3.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"><GoogleIcon />{busy ? "Signing in…" : "Continue with Google"}</button>
      {error && <p className="mt-4 max-w-md text-xs text-[#8c4b36]">{error}</p>}
      <p className="mt-5 text-xs text-[var(--muted)]">Private workspace · Google sign-in · Your data stays associated with your account</p>
    </section>
    <section className="border-y border-[#e5e1d9] bg-[#f7f5f0] px-6 py-20"><div className="mx-auto max-w-5xl"><p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--muted)]">One workflow</p><h2 className="mt-4 max-w-2xl font-serif text-4xl tracking-[-.04em] md:text-5xl">Less context switching. More useful work.</h2><div className="mt-12 grid gap-10 md:grid-cols-3"><Feature title="Research" text="Find and understand prospects using web research and focused AI analysis."/><Feature title="Build" text="Turn findings into lead records, proposals and outreach drafts without leaving the workspace."/><Feature title="Reach" text="Connect your email, review the work, and keep sending under your control."/></div></div></section>
    <section className="px-6 py-24"><div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-[1.1fr_.9fr] md:items-center"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Designed for focused execution</p><h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-.04em] md:text-5xl">A calm interface for work that usually takes five tools.</h2></div><p className="text-base leading-7 text-[var(--muted)]">Sanmine Space keeps research, lead discovery, proposals and outreach in one continuous conversation, so the useful context stays close to the work.</p></div></section>
    <section className="bg-[#282721] px-6 py-20 text-[#f8f6f0]"><div className="mx-auto max-w-5xl md:flex md:items-end md:justify-between md:gap-12"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#b9b5ab]">Your workspace, your approval</p><h2 className="mt-4 max-w-2xl font-serif text-4xl tracking-[-.04em] md:text-5xl">AI can prepare the work. You stay in control.</h2></div><button onClick={login} disabled={busy} className="mt-8 rounded-xl bg-white px-5 py-3 text-sm font-medium text-[#282721] md:mt-0">{busy ? "Signing in…" : "Get started"}</button></div></section>
    <Footer logo={logo}/>
  </main>;
}

function Feature({title,text}:{title:string;text:string}){return <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{text}</p></div>}
function PublicPageShell({children,logo}:{children:React.ReactNode;logo:string}){return <main className="min-h-screen overflow-y-auto bg-[var(--bg)] text-[var(--text)]"><header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10"><a href="/" className="flex items-center gap-3"><span className="h-8 w-8 overflow-hidden rounded-lg"><img src={logo} alt="" className="h-full w-full object-cover"/></span><span className="font-serif text-xl">Sanmine Space</span></a><a href="/" className="rounded-lg border border-[#d8d5cd] bg-white px-4 py-2 text-sm font-medium shadow-sm">Home</a></header>{children}<Footer logo={logo}/></main>}
function Footer({logo}:{logo:string}){return <footer className="border-t border-[#e5e1d9] px-6 py-10"><div className="mx-auto flex max-w-5xl flex-col gap-7 text-sm md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-2.5"><span className="h-7 w-7 overflow-hidden rounded-lg"><img src={logo} alt="" className="h-full w-full object-cover"/></span><span className="font-medium">Sanmine Space</span></div><div className="flex flex-wrap gap-x-5 gap-y-2 text-[var(--muted)]"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div><p className="text-xs text-[var(--muted)]">© 2026 Sanmine Space</p></div></footer>}
function PrivacyContent(){return <><h1 className="font-serif text-5xl tracking-[-.04em]">Privacy Policy</h1><p className="mt-4 text-sm text-[var(--muted)]">Last updated: September 2, 2026</p><div className="mt-10 space-y-8 text-[15px] leading-7 text-[#4f4c45]"><section><h2 className="font-semibold text-[var(--text)]">1. Overview</h2><p className="mt-2">Sanmine Space is an AI workspace for research, lead discovery, analysis, proposals and outreach. This policy explains what information we collect, why we use it, how we protect it, and the choices available to you.</p></section><section><h2 className="font-semibold text-[var(--text)]">2. Information we collect</h2><p className="mt-2">We may receive your name, email address, profile image and provider identifier when you sign in. We may store prompts, conversations, generated responses, research results, leads, proposal or email drafts, timestamps and workspace metadata. We also process basic technical information needed to operate and secure the service.</p></section><section><h2 className="font-semibold text-[var(--text)]">3. Connected services</h2><p className="mt-2">If you connect Gmail, we use Google OAuth permissions needed for the features you choose, such as preparing drafts or sending an approved email. Connected-service data is used to provide the requested integration and is not sold or used for advertising profiles.</p></section><section><h2 className="font-semibold text-[var(--text)]">4. AI and research processing</h2><p className="mt-2">Prompts and relevant content may be processed by configured AI providers to generate requested responses. When you request web research, public pages may be retrieved and summarized. Third-party sites remain subject to their own policies and terms.</p></section><section><h2 className="font-semibold text-[var(--text)]">5. Storage, sharing and security</h2><p className="mt-2">We use service providers for authentication, storage, AI processing, research and email features when needed to deliver the service. We do not sell personal information. We use reasonable safeguards, though no internet service can guarantee absolute security.</p></section><section><h2 className="font-semibold text-[var(--text)]">6. Retention and choices</h2><p className="mt-2">We retain information as needed to provide the service, operate your workspace, meet legitimate operational needs or comply with law. You can delete chats and disconnect supported services using product controls. You may contact us for privacy or deletion requests.</p></section><section><h2 className="font-semibold text-[var(--text)]">7. Changes and contact</h2><p className="mt-2">We may update this policy when our service or legal requirements change. Questions or privacy requests can be sent to support.sanminespace@gmail.com.</p></section></div></>}
function TermsContent(){return <><h1 className="font-serif text-5xl tracking-[-.04em]">Terms & Conditions</h1><p className="mt-4 text-sm text-[var(--muted)]">Last updated: September 2, 2026</p><div className="mt-10 space-y-8 text-[15px] leading-7 text-[#4f4c45]"><section><h2 className="font-semibold text-[var(--text)]">1. Using Sanmine Space</h2><p className="mt-2">By using Sanmine Space, you agree to use the service lawfully, protect your account, and not interfere with the service or attempt unauthorized access.</p></section><section><h2 className="font-semibold text-[var(--text)]">2. AI-generated work</h2><p className="mt-2">AI outputs can contain errors and should be reviewed before you rely on them. You are responsible for checking research, claims, contact details, proposals and outreach before use.</p></section><section><h2 className="font-semibold text-[var(--text)]">3. Email and connected accounts</h2><p className="mt-2">When you connect an email account, you authorize Sanmine Space to perform the actions covered by the permissions you approve. Sending features should be used responsibly and in compliance with applicable email, privacy and anti-spam laws.</p></section><section><h2 className="font-semibold text-[var(--text)]">4. Your content</h2><p className="mt-2">You retain rights to content you provide, subject to rights needed for us and our providers to operate requested features. Do not submit content you do not have the right to process.</p></section><section><h2 className="font-semibold text-[var(--text)]">5. Availability and changes</h2><p className="mt-2">Features may change, be improved, limited or discontinued. We aim for reliable service but do not guarantee uninterrupted availability or that every AI result will be accurate.</p></section><section><h2 className="font-semibold text-[var(--text)]">6. Contact</h2><p className="mt-2">For questions about these terms, contact support.sanminespace@gmail.com.</p></section></div></>}
function AboutContent(){return <><p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--muted)]">About</p><h1 className="mt-4 font-serif text-5xl tracking-[-.04em]">A focused workspace for turning research into action.</h1><div className="mt-10 space-y-6 text-[15px] leading-7 text-[#4f4c45]"><p>Sanmine Space brings research, lead discovery, analysis, proposals and outreach into one AI-assisted workspace. The goal is simple: reduce the busywork around finding and understanding prospects so you can spend more time on the conversations that matter.</p><p>We believe useful AI should feel calm, transparent and controllable. Sanmine Space is designed around that principle: the system can research, organize and prepare work, while important actions such as outreach remain reviewable and user-directed.</p><p>Our product is evolving through practical workflows rather than a crowded collection of features. We focus on making each step—from first research to final message—clear and useful.</p></div></>}
function ContactContent(){return <><p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Contact</p><h1 className="mt-4 font-serif text-5xl tracking-[-.04em]">We’d like to hear from you.</h1><div className="mt-10 space-y-6 text-[15px] leading-7 text-[#4f4c45]"><p>For product questions, privacy requests, account help, feedback or partnership enquiries, email us and include enough context for us to understand your request.</p><a href="mailto:support.sanminespace@gmail.com" className="inline-flex rounded-xl bg-[#282721] px-5 py-3 text-sm font-medium text-white">support.sanminespace@gmail.com</a><p className="text-sm text-[var(--muted)]">For account-related requests, please contact us from the email associated with your Sanmine Space account whenever possible.</p></div></>}
function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.25-.2-1.82H12v3.45h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.73-4.33 2.73-7.16z"/><path fill="#34A853" d="M12 21.5c2.7 0 4.97-.9 6.62-2.44l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A9.98 9.98 0 0 0 12 21.5z"/><path fill="#FBBC05" d="M6.41 13.39A5.75 5.75 0 0 1 6.1 11.5c0-.66.11-1.3.31-1.89V7.02H3.06A9.98 9.98 0 0 0 2 11.5c0 1.61.39 3.13 1.06 4.48l3.35-2.59z"/><path fill="#EA4335" d="M12 5.49c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.97 2.52 14.7 1.5 12 1.5a10 10 0 0 0-8.94 5.52l3.35 2.59C6.2 7.25 8.4 5.49 12 5.49z"/></svg>; }

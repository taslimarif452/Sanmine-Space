"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, signInWithGoogle } from "@/lib/auth/firebase-client";

const AuthUserContext = createContext<User | null>(null);
export function useAuthUser() { return useContext(AuthUserContext); }

export function AuthGate({ children }: { children: React.ReactNode }) {
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
  if (!user) return <LandingLogin error={error} busy={busy} setBusy={setBusy} setError={setError} />;
  return <AuthUserContext.Provider value={user}>{children}</AuthUserContext.Provider>;
}

function LandingLogin({ error, busy, setBusy, setError }: { error: string; busy: boolean; setBusy: (v: boolean) => void; setError: (v: string) => void }) {
  const login = async () => { setBusy(true); setError(""); try { await signInWithGoogle(); } catch (e) { setError(e instanceof Error ? e.message : "Google sign-in failed."); } finally { setBusy(false); } };
  return <main className="min-h-screen overflow-y-auto bg-[var(--bg)] text-[var(--text)]">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10"><div className="font-serif text-2xl tracking-[-.035em]">Sanmine Space</div><a href="/privacy" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">Privacy</a></header>
    <section className="mx-auto flex min-h-[calc(100vh-88px)] max-w-5xl flex-col items-center justify-center px-6 pb-20 text-center">
      <p className="mb-6 text-xs font-semibold uppercase tracking-[.2em] text-[var(--muted)]">AI workspace for modern outreach</p>
      <h1 className="max-w-4xl font-serif text-5xl leading-[.98] tracking-[-.045em] md:text-7xl">Research smarter. Reach the right people.</h1>
      <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">A focused workspace for AI research, leads, proposals and thoughtful outreach.</p>
      <button onClick={login} disabled={busy || Boolean(error && error.startsWith("Firebase is not configured"))} className="mt-9 inline-flex items-center gap-3 rounded-xl bg-[#292822] px-6 py-3.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"><GoogleIcon />{busy ? "Signing in…" : "Continue with Google"}</button>
      {error && <p className="mt-4 max-w-md text-xs text-[#8c4b36]">{error}</p>}
      <p className="mt-5 text-xs text-[var(--muted)]">Sign in to access your private workspace and saved chats.</p>
    </section>
  </main>;
}

function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.25-.2-1.82H12v3.45h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.73-4.33 2.73-7.16z"/><path fill="#34A853" d="M12 21.5c2.7 0 4.97-.9 6.62-2.44l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A9.98 9.98 0 0 0 12 21.5z"/><path fill="#FBBC05" d="M6.41 13.39A5.75 5.75 0 0 1 6.1 11.5c0-.66.11-1.3.31-1.89V7.02H3.06A9.98 9.98 0 0 0 2 11.5c0 1.61.39 3.13 1.06 4.48l3.35-2.59z"/><path fill="#EA4335" d="M12 5.49c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.97 2.52 14.7 1.5 12 1.5a10 10 0 0 0-8.94 5.52l3.35 2.59C6.2 7.25 8.4 5.49 12 5.49z"/></svg>; }

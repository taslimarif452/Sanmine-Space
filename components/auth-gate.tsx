"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, googleProvider, signInWithPopup, signOut } from "@/lib/auth/firebase-client";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => onAuthStateChanged(auth, async (next) => {
    setUser(next);
    setLoading(false);
    if (next) {
      try {
        const token = await next.getIdToken();
        await fetch("/api/users/sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      } catch (e) { console.error("User sync failed", e); }
    }
  }), []);

  const login = async () => {
    setBusy(true); setError("");
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { setError(e instanceof Error ? e.message : "Google sign-in failed."); }
    finally { setBusy(false); }
  };

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
  if (!user) return <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-5"><div className="w-full max-w-sm text-center"><div className="mx-auto mb-6 h-14 w-14 overflow-hidden rounded-2xl"><img src="https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png" alt="Sanmine Space" className="h-full w-full object-cover" /></div><h1 className="font-serif text-4xl tracking-[-0.035em] text-[#282721]">Sanmine Space</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Sign in to keep your chats, research and leads synced.</p><button onClick={login} disabled={busy} className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-[#d8d5cd] bg-white px-4 py-3 text-sm font-medium text-[#302e29] shadow-sm transition hover:bg-[#faf9f6] disabled:opacity-50"><GoogleIcon />{busy ? "Signing in…" : "Continue with Google"}</button>{error && <p className="mt-3 text-xs text-[#8c4b36]">{error}</p>}<button onClick={() => signOut(auth)} className="mt-4 hidden" /> </div></main>;
  return <>{children}</>;
}

function GoogleIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.25-.2-1.82H12v3.45h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.73-4.33 2.73-7.16z"/><path fill="#34A853" d="M12 21.5c2.7 0 4.97-.9 6.62-2.44l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.59A10 10 0 0 0 12 21.5z"/><path fill="#FBBC05" d="M6.41 13.39A5.75 5.75 0 0 1 6.1 11.5c0-.66.11-1.3.31-1.89V7.02H3.06A9.98 9.98 0 0 0 2 11.5c0 1.61.39 3.13 1.06 4.48l3.35-2.59z"/><path fill="#EA4335" d="M12 5.49c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.97 2.52 14.7 1.5 12 1.5a10 10 0 0 0-8.94 5.52l3.35 2.59C6.2 7.25 8.4 5.49 12 5.49z"/></svg>; }

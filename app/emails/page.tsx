"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Mail, Menu, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useAuthUser } from "@/components/auth-gate";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

type SentEmail = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  sent_at?: string | null;
  created_at?: string | null;
  campaign_name?: string | null;
  sender_email?: string | null;
  provider_message_id?: string | null;
};

export default function EmailsPage() {
  const user = useAuthUser();
  if (!user) return null;
  return <EmailsContent user={user} />;
}

function EmailsContent({ user }: { user: User }) {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = async (refresh = false) => {
    try {
      setError("");
      refresh ? setRefreshing(true) : setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch("/api/emails", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load sent emails.");
      setEmails(Array.isArray(data.emails) ? data.emails : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load sent emails.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, [user.uid]);

  return <main className="flex h-screen min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
    <WorkspaceSidebar user={user} />
    <section className="min-w-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#e8e5de]/80 bg-[var(--bg)]/95 px-4 backdrop-blur sm:px-7">
        <button onClick={() => window.dispatchEvent(new Event("sanmine:open-sidebar"))} className="rounded-lg p-2 text-[#5f5b53] hover:bg-black/5 md:hidden" aria-label="Open sidebar"><Menu size={21} /></button>
        <div className="hidden md:block" />
        <Link href="/" className="rounded-lg px-3 py-2 text-sm text-[#6d6961] hover:bg-black/5">Back to chat</Link>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">Outreach workspace</p>
            <h1 className="font-serif text-5xl tracking-[-.045em] text-[#282721] sm:text-6xl">Emails</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#77736a]">Emails sent by Sanmine Space through your connected outreach account.</p>
          </div>
          <button onClick={() => void load(true)} disabled={loading || refreshing} className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#dcd9d1] bg-[#fbfaf7] px-3.5 text-sm font-medium text-[#4b4840] shadow-sm hover:bg-[#f3f1ec] disabled:opacity-50">
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {error && <div className="mt-7 rounded-xl border border-[#ead6cf] bg-[#fff7f3] px-4 py-3 text-sm text-[#8b5145]">{error}</div>}

        <section className="mt-12">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#3d3a34]">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#efede7]"><Mail size={15} /></span>
            Sent emails <span className="text-xs font-normal text-[#99958c]">{emails.length}</span>
          </div>

          <div className="divide-y divide-[#e8e4dc] overflow-hidden rounded-2xl border border-[#dedbd4] bg-[#fbfaf7] shadow-sm">
            {loading ? (
              <div className="px-5 py-12 text-sm text-[#8b877e]">Loading sent emails…</div>
            ) : emails.length === 0 ? (
              <div className="px-5 py-14 text-center sm:px-10">
                <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#efede7] text-[#77736a]"><Mail size={19} /></div>
                <h2 className="mt-4 text-sm font-semibold text-[#38352f]">No sent emails yet</h2>
                <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[#8b877e]">When Sanmine Space successfully sends an outreach email, it will appear here.</p>
              </div>
            ) : emails.map((email) => (
              <article key={email.id} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-[#282721]">{email.recipient}</span>
                      {email.campaign_name && <span className="text-xs text-[#969188]">· {email.campaign_name}</span>}
                    </div>
                    <h2 className="mt-2 text-[15px] font-medium text-[#4b4840]">{email.subject}</h2>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#77736a]">{email.body}</p>
                  </div>
                  <time className="shrink-0 text-xs text-[#99958c]" dateTime={email.sent_at || email.created_at || undefined}>
                    {formatDate(email.sent_at || email.created_at)}
                  </time>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#eeeae3] pt-3 text-[11px] text-[#99958c]">
                  <span>From {email.sender_email || "connected Gmail"}</span>
                  <span className="text-[#b1ada5]">·</span>
                  <span className="font-medium text-[#77736a]">Sent successfully</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  </main>;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

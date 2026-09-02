"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";

type Campaign = { id: string; name: string };
type Step = {
  stepOrder: number;
  delayMinutes: number;
  subject: string;
  body: string;
};
type ApiStep = {
  stepOrder?: number;
  step_order?: number;
  delayMinutes?: number;
  delay_minutes?: number;
  subject: string;
  body: string;
};

export default function SequencesPage() {
  const user = useAuthUser();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [steps, setSteps] = useState<Step[]>([
    { stepOrder: 1, delayMinutes: 0, subject: "", body: "" },
  ]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const token = await user.getIdToken();
      const response = await fetch("/api/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      setCampaigns(data.campaigns || []);
      if (data.campaigns?.[0]) setCampaignId(data.campaigns[0].id);
    })();
  }, [user?.uid]);

  useEffect(() => {
    if (!user || !campaignId) return;
    void (async () => {
      const token = await user.getIdToken();
      const response = await fetch(`/api/campaigns/${campaignId}/sequence`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (data.steps?.length) {
        setSteps(
          data.steps.map((step: ApiStep) => ({
            stepOrder: step.stepOrder ?? step.step_order ?? 1,
            delayMinutes: step.delayMinutes ?? step.delay_minutes ?? 0,
            subject: step.subject,
            body: step.body,
          })),
        );
      }
    })();
  }, [campaignId, user?.uid]);

  const save = async () => {
    if (!user || !campaignId) return;
    const token = await user.getIdToken();
    const response = await fetch(`/api/campaigns/${campaignId}/sequence`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ steps }),
    });
    setMessage(response.ok ? "Sequence saved." : "Unable to save sequence.");
  };

  if (!user) return null;

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-16 items-center justify-between border-b border-[#e8e5de] px-5">
        <Link
          href="/campaigns"
          className="flex items-center gap-2 text-sm text-[#6d6961]"
        >
          <ArrowLeft size={16} /> Campaigns
        </Link>
        <button
          onClick={() => void save()}
          className="flex items-center gap-2 rounded-lg bg-[#282721] px-3 py-2 text-xs font-medium text-white"
        >
          <Save size={14} /> Save sequence
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#8b877f]">
          Automation
        </p>
        <h1 className="mt-2 font-serif text-5xl tracking-[-0.045em]">
          Campaign Sequences
        </h1>
        <p className="mt-3 text-sm text-[#77736a]">
          Build multi-step follow-ups. Every subsequent step enters the Approval
          Center before sending.
        </p>

        <select
          value={campaignId}
          onChange={(event) => setCampaignId(event.target.value)}
          className="mt-7 w-full rounded-xl border border-[#ddd9d1] bg-white px-4 py-3 text-sm"
        >
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>

        {message && <p className="mt-3 text-sm text-[#6b7468]">{message}</p>}

        <div className="mt-5 space-y-4">
          {steps.map((step, index) => (
            <div
              key={index}
              className="rounded-2xl border border-[#dedbd4] bg-[#fbfaf7] p-5"
            >
              <div className="flex items-center justify-between">
                <b className="text-sm">Step {index + 1}</b>
                {steps.length > 1 && (
                  <button
                    onClick={() =>
                      setSteps((current) =>
                        current
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item, itemIndex) => ({
                            ...item,
                            stepOrder: itemIndex + 1,
                          })),
                      )
                    }
                    className="rounded-lg p-2 text-[#8b5145]"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr]">
                <label className="text-xs text-[#77736a]">
                  Delay (minutes)
                  <input
                    type="number"
                    min={0}
                    value={step.delayMinutes}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                delayMinutes: Number(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd9d1] bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-[#77736a]">
                  Subject
                  <input
                    value={step.subject}
                    onChange={(event) =>
                      setSteps((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, subject: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-[#ddd9d1] bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs text-[#77736a]">
                Body
                <textarea
                  value={step.body}
                  onChange={(event) =>
                    setSteps((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, body: event.target.value }
                          : item,
                      ),
                    )
                  }
                  rows={6}
                  className="mt-1 w-full resize-y rounded-lg border border-[#ddd9d1] bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
          ))}

          <button
            onClick={() =>
              setSteps((current) => [
                ...current,
                {
                  stepOrder: current.length + 1,
                  delayMinutes: 4320,
                  subject: "",
                  body: "",
                },
              ])
            }
            className="flex items-center gap-2 rounded-xl border border-[#ddd9d1] bg-white px-4 py-3 text-sm"
          >
            <Plus size={15} /> Add follow-up step
          </button>
        </div>
      </div>
    </main>
  );
}

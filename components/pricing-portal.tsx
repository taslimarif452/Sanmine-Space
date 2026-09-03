"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MessageCircle, Sparkles } from "lucide-react";

const WHATSAPP_NUMBER = "917209394252";

const plans = [
  {
    name: "Free",
    eyebrow: "Get started",
    price: "₹0",
    description: "Explore Sanmine Space and start working with AI-powered research.",
    features: ["AI chat", "Basic web research", "Limited lead discovery", "Reviewable AI output"],
  },
  {
    name: "Pro",
    eyebrow: "For everyday productivity",
    price: "Custom",
    description: "For people who need deeper research, lead intelligence and outreach workflows.",
    features: ["Everything in Free", "Deeper web research", "Lead scoring & intelligence", "Personalized outreach", "Research sources & evidence"],
    featured: true,
  },
  {
    name: "Business",
    eyebrow: "For teams and campaigns",
    price: "Custom",
    description: "Higher limits and workflow support for serious prospecting and outreach.",
    features: ["Everything in Pro", "Campaign workflows", "Team workspace", "Approval workflows", "Higher usage limits"],
  },
] as const;

function purchase(plan: (typeof plans)[number]) {
  const message = [
    "Hello Tavqeer, I want to purchase a Sanmine Space plan.",
    "",
    `Plan: ${plan.name}`,
    `Plan type: ${plan.eyebrow}`,
    `Price: ${plan.price}`,
    "",
    "Please share the purchase details, payment information, and next steps.",
    "",
    "Thank you!",
  ].join("\n");

  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

function PricingContent() {
  return (
    <div className="pricing-portal px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[.22em] text-[#8b867d]">Simple pricing</p>
          <h2 className="mt-4 font-serif text-[42px] leading-[1.02] tracking-[-.05em] md:text-[58px]">Start simple. Scale when you need to.</h2>
          <p className="mt-5 text-[15px] leading-7 text-[#77736b]">Choose the workspace that fits how you use Sanmine Space. Talk to us on WhatsApp to purchase a plan.</p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {plans.map((plan) => (
            <article key={plan.name} className={`relative flex flex-col rounded-[24px] border bg-[#fbfaf7] p-6 shadow-[0_8px_30px_rgba(45,42,35,.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_38px_rgba(45,42,35,.09)] md:p-7 ${plan.featured ? "border-[#cfc9bd] ring-1 ring-[#e6e1d8]" : "border-[#dedad2]"}`}>
              {plan.featured && <div className="absolute right-6 top-6 rounded-full border border-[#dedad2] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#555149]">Popular</div>}
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#dedad2] bg-white text-[#292822]"><Sparkles size={19} strokeWidth={1.7}/></div>
              <p className="mt-8 text-[11px] font-semibold uppercase tracking-[.16em] text-[#8b867d]">{plan.eyebrow}</p>
              <h3 className="mt-2 font-serif text-3xl tracking-[-.035em]">{plan.name}</h3>
              <div className="mt-6 flex items-baseline gap-2"><span className="text-2xl font-semibold tracking-[-.03em]">{plan.price}</span>{plan.price !== "₹0" && <span className="text-xs text-[#8b867d]">/ month</span>}</div>
              <p className="mt-2 min-h-[48px] text-sm leading-6 text-[#77736b]">{plan.description}</p>
              <button onClick={() => purchase(plan)} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#181816] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-px hover:bg-[#292822] hover:shadow-md"><MessageCircle size={16}/>{plan.name === "Free" ? "Get started" : `Purchase ${plan.name}`}</button>
              <div className="my-7 h-px bg-[#e5e1d9]"/>
              <p className="text-xs font-semibold text-[#393630]">Included</p>
              <ul className="mt-3 space-y-3">{plan.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm leading-5 text-[#555149]"><Check size={15} className="mt-0.5 shrink-0 text-[#77736b]"/>{feature}</li>)}</ul>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-5 text-[#99948b]">Clicking a plan opens WhatsApp with the selected plan and purchase request details. A team member can then share the exact payment and activation steps.</p>
      </div>
    </div>
  );
}

export function PricingPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const node = document.getElementById("pricing");
    if (!node) return;
    node.classList.add("pricing-host");
    setTarget(node);
    return () => node.classList.remove("pricing-host");
  }, []);

  if (!target) return null;
  return createPortal(<PricingContent />, target);
}

import type { AgentTool } from "@/lib/agent/tools/types";
import { openPageTool } from "@/lib/agent/tools/open-page";

export const websiteAnalyzeTool: AgentTool = {
  name: "website_analyze",
  description:
    "Analyze a public business website for identity, services, contact signals, calls to action, and obvious website-quality or conversion opportunities. Use open_page internally to inspect the site.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The public business website URL to analyze." },
    },
    required: ["url"],
  },
  execute: async (args) => {
    const page = await openPageTool.execute({ url: args.url, max_chars: 12000 });
    if ((page as { status?: string }).status !== "success") return page;

    const data = page as { url: string; title: string; text: string };
    const text = data.text;
    const lower = text.toLowerCase();
    const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])].slice(0, 10);
    const phones = [...new Set(text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [])].slice(0, 10);
    const keywords = ["services", "about", "contact", "pricing", "book", "quote", "portfolio", "testimonials", "case studies", "appointment"];
    const signals = keywords.filter((keyword) => lower.includes(keyword));

    return {
      status: "success",
      url: data.url,
      title: data.title,
      contact_signals: { emails, phones },
      page_signals: signals,
      content_excerpt: text.slice(0, 6000),
      notes: [
        emails.length ? "A public email address was detected on the page." : "No email address was detected in the fetched text.",
        phones.length ? "A phone number was detected on the page." : "No phone number was detected in the fetched text.",
        signals.includes("pricing") ? "Pricing language is present." : "No obvious pricing language was detected.",
        signals.includes("contact") ? "A contact signal is present." : "No obvious contact signal was detected in the fetched text.",
      ],
      limitation: "This is a lightweight public-page analysis, not a security, accessibility, legal, or full-site audit.",
    };
  },
};

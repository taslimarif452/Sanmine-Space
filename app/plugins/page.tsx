"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Plus, Search, Settings, X } from "lucide-react";
import { useAuthUser } from "@/components/auth-gate";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { EmailConnections } from "@/components/email-connections";

type Plugin = {
  id: string;
  name: string;
  description: string;
  category: string;
  logo: string;
  status: "Ready" | "Setup required";
  billing: "No card" | "Free quota" | "OAuth";
};

const plugins: Plugin[] = [
  { id: "web", name: "Web Search", description: "Search the web for research and source-backed answers.", category: "Research", logo: "https://cdn.simpleicons.org/googlechrome", status: "Ready", billing: "Free quota" },
  { id: "github", name: "GitHub", description: "Connect repositories, issues, pull requests and code.", category: "Developer", logo: "https://cdn.simpleicons.org/github", status: "Setup required", billing: "OAuth" },
  { id: "youtube", name: "YouTube", description: "Search channels and videos for creator research.", category: "Research", logo: "https://cdn.simpleicons.org/youtube", status: "Ready", billing: "Free quota" },
  { id: "drive", name: "Google Drive", description: "Work with files the user explicitly authorizes.", category: "Workspace", logo: "https://cdn.simpleicons.org/googledrive", status: "Setup required", billing: "OAuth" },
  { id: "docs", name: "Google Docs", description: "Read and create documents through Google OAuth.", category: "Workspace", logo: "https://cdn.simpleicons.org/googledocs", status: "Setup required", billing: "OAuth" },
  { id: "sheets", name: "Google Sheets", description: "Read and update spreadsheets for structured data.", category: "Workspace", logo: "https://cdn.simpleicons.org/googlesheets", status: "Setup required", billing: "OAuth" },
  { id: "calendar", name: "Google Calendar", description: "Manage events after explicit user approval.", category: "Workspace", logo: "https://cdn.simpleicons.org/googlecalendar", status: "Setup required", billing: "OAuth" },
  { id: "canva", name: "Canva", description: "Connect approved design and creative workflows.", category: "Workspace", logo: "https://cdn.simpleicons.org/canva", status: "Setup required", billing: "OAuth" },
  { id: "discord", name: "Discord", description: "Connect Discord communities and approved bot workflows.", category: "Communication", logo: "https://cdn.simpleicons.org/discord", status: "Setup required", billing: "OAuth" },
  { id: "vercel", name: "Vercel", description: "Inspect projects and deployments through authorization.", category: "Developer", logo: "https://cdn.simpleicons.org/vercel", status: "Setup required", billing: "OAuth" },
  { id: "firebase", name: "Firebase", description: "Connect Firebase project workflows.", category: "Developer", logo: "https://cdn.simpleicons.org/firebase", status: "Setup required", billing: "OAuth" },
  { id: "notion", name: "Notion", description: "Connect pages and databases for project context.", category: "Workspace", logo: "https://cdn.simpleicons.org/notion", status: "Setup required", billing: "OAuth" },
  { id: "rss", name: "RSS / News", description: "Read public RSS feeds without a paid news API.", category: "Research", logo: "https://cdn.simpleicons.org/rss", status: "Ready", billing: "No card" },
];

const categories = ["All", "Research", "Workspace", "Developer", "Communication"];

export default function PluginsPage() {
  const user = useAuthUser();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [categoryOpen, setCategoryOpen] = useState(false);

  const filtered = useMemo(
    () =>
      plugins.filter(
        (p) =>
          (cat === "All" || p.category === cat) &&
          (!q || `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [q, cat],
  );

  if (!user) return null;

  return (
    <main className="flex h-screen min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <WorkspaceSidebar user={user} />

      <section className="min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between bg-[var(--bg)] px-5 sm:px-7 md:hidden">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#171614] shadow-[0_1px_5px_rgba(0,0,0,.06)]"
            aria-label="Go back"
          >
            <ArrowLeft size={25} strokeWidth={2.2} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setCategoryOpen((open) => !open)}
              className="flex items-center gap-1 text-[31px] font-semibold tracking-[-.04em] text-[#171614]"
              aria-haspopup="menu"
              aria-expanded={categoryOpen}
            >
              Plugins
              <ChevronDown size={19} strokeWidth={2.4} className="mt-1" />
            </button>
            {categoryOpen && <CategoryMenu cat={cat} setCat={setCat} close={() => setCategoryOpen(false)} />}
          </div>

          <button
            type="button"
            className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#171614] shadow-[0_1px_5px_rgba(0,0,0,.06)]"
            aria-label="Plugin settings"
          >
            <Settings size={25} strokeWidth={2.2} />
          </button>
        </header>

        <div className="mx-auto w-full max-w-[1120px] px-5 pb-12 pt-5 sm:px-8 sm:pt-8 md:px-10 md:pb-16 md:pt-12">
          <div className="hidden items-center justify-between md:flex">
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryOpen((open) => !open)}
                className="flex items-center gap-1 text-3xl font-semibold tracking-[-.035em] text-[#282721]"
                aria-haspopup="menu"
                aria-expanded={categoryOpen}
              >
                Plugins
                <ChevronDown size={18} strokeWidth={2.3} className="mt-1" />
              </button>
              {categoryOpen && <CategoryMenu cat={cat} setCat={setCat} close={() => setCategoryOpen(false)} />}
            </div>
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#38352f] shadow-[0_1px_5px_rgba(0,0,0,.05)]"
              aria-label="Plugin settings"
            >
              <Settings size={21} />
            </button>
          </div>

          <div className="mt-7 md:mt-6">
            <label className="flex h-[56px] w-full items-center gap-3 rounded-[28px] border border-[#dedbd5] bg-white px-5 shadow-[0_1px_3px_rgba(0,0,0,.025)] md:h-12 md:max-w-[420px] md:rounded-2xl md:px-4">
              <Search size={22} strokeWidth={1.9} className="shrink-0 text-[#8e8b86] md:h-[18px] md:w-[18px]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search plugins"
                className="min-w-0 flex-1 bg-transparent text-[17px] text-[#302e29] outline-none placeholder:text-[#999792] md:text-sm"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="text-[#96928b]" aria-label="Clear search">
                  <X size={17} />
                </button>
              )}
            </label>
          </div>

          <section className="mt-12 md:mt-10">
            <h2 className="text-[25px] font-medium tracking-[-.025em] text-[#22211f] md:text-[15px] md:font-semibold md:tracking-normal">Installed</h2>

            <div className="mt-5 flex min-h-[78px] items-center gap-4 overflow-x-auto pb-1 md:mt-4 md:min-h-0">
              <div className="grid h-[78px] w-[78px] shrink-0 place-items-center rounded-[22px] border border-[#e7e4df] bg-white shadow-[0_2px_8px_rgba(0,0,0,.035)] md:h-14 md:w-14 md:rounded-2xl">
                <img src="https://cdn.simpleicons.org/gmail" alt="Gmail logo" className="h-11 w-11 object-contain md:h-8 md:w-8" />
              </div>
            </div>

            <div className="mt-5 md:mt-4">
              <EmailConnections user={user} />
            </div>
          </section>

          <section className="mt-12 md:mt-10">
            <div className="mb-5 flex items-end justify-between md:mb-4">
              <div>
                <h2 className="text-[25px] font-medium tracking-[-.025em] text-[#22211f] md:text-[15px] md:font-semibold md:tracking-normal">Popular</h2>
                <p className="mt-1 hidden text-xs text-[#9a958c] md:block">Available in Sanmine Space</p>
              </div>
              <span className="text-xs text-[#9a958c]">{filtered.length} plugins</span>
            </div>

            <div className="grid grid-cols-1 gap-0 md:grid-cols-2 md:gap-x-12 lg:gap-x-20">
              {filtered.map((plugin) => (
                <article key={plugin.id} className="group flex min-h-[84px] items-center gap-4 border-b border-[#eeeae4] py-4 first:border-t md:min-h-[76px] md:border-t md:border-b-0 md:py-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-[15px] border border-[#e8e5df] bg-white md:h-11 md:w-11 md:rounded-[14px]">
                    <img src={plugin.logo} alt={`${plugin.name} logo`} className="h-8 w-8 object-contain" loading="lazy" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16px] font-medium text-[#24231f] md:text-[13px] md:font-medium">{plugin.name}</h3>
                    <p className="mt-0.5 truncate text-[14px] leading-6 text-[#99958f] md:text-[11px] md:leading-5">{plugin.description}</p>
                  </div>

                  <span className="grid h-9 w-9 shrink-0 place-items-center text-[#171614] md:h-8 md:w-8" aria-label={plugin.status} title={plugin.status}>
                    {plugin.status === "Ready" ? <Check size={21} strokeWidth={1.8} /> : <Plus size={25} strokeWidth={1.7} />}
                  </span>
                </article>
              ))}
            </div>

            {!filtered.length && <p className="py-12 text-center text-sm text-[#858078]">No plugins found.</p>}
          </section>

          <div className="mt-10 rounded-2xl border border-[#dfdcd5] bg-[#f5f3ed] p-5 sm:p-6">
            <div className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e8e5dc] text-[#555148]"><Settings size={18} /></div>
              <div>
                <h2 className="text-sm font-semibold text-[#302e29]">Payment & security</h2>
                <p className="mt-1 text-sm leading-6 text-[#77736a]">Sanmine does not collect card details for these connections. Provider quotas and billing policies still apply independently. Sanmine never silently enables paid billing.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function CategoryMenu({ cat, setCat, close }: { cat: string; setCat: (value: string) => void; close: () => void }) {
  return (
    <div className="absolute left-1/2 top-full z-40 mt-3 w-48 -translate-x-1/2 rounded-2xl border border-[#e4e1db] bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.08)]" role="menu">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => {
            setCat(category);
            close();
          }}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${cat === category ? "bg-[#f2f0eb] font-medium text-[#282721]" : "text-[#6d6961] hover:bg-[#f7f6f3]"}`}
          role="menuitem"
        >
          <span>{category}</span>
          {cat === category && <Check size={15} />}
        </button>
      ))}
    </div>
  );
}

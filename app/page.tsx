"use client";

import { useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  Menu,
  Plus,
  Search,
  Sparkles,
  Loader2,
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const BRAND_LOGO =
  "https://res.cloudinary.com/dbqmhnahl/image/upload/v1787531960/file_00000000eed481f795676cc974695840_nh7jee.png";

const examples = [
  "Find 10 small businesses that could use a better website",
  "Research 10 Indian EdTech businesses and prepare outreach",
  "Find promising leads from YouTube and summarize them",
];

function SidebarToggleIcon({ direction }: { direction: "open" | "close" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <rect x="3.5" y="4" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 4.5V19.5" stroke="currentColor" strokeWidth="1.7" />
      {direction === "close" ? (
        <path d="M13 9L16 12L13 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M16 9L13 12L16 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const text = message.trim();
    if (!text || loading) return;

    const nextMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(nextMessages);
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to get a response.");

      setMessages([...nextMessages, { role: "assistant", content: data.response }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const newChat = () => {
    setMessages([]);
    setMessage("");
    setError("");
  };

  return (
    <main className="flex min-h-screen bg-[var(--bg)]">
      <aside
        className={`hidden shrink-0 flex-col border-r border-[var(--line)] bg-[#f2f1ed] py-4 transition-[width] duration-200 md:flex ${
          sidebar ? "w-[270px] px-3" : "w-[72px] px-2"
        }`}
      >
        <div className={`flex items-center pb-5 ${sidebar ? "justify-between px-2" : "justify-center"}`}>
          {sidebar ? (
            <button
              onClick={newChat}
              className="flex items-center gap-2.5 text-left"
              aria-label="New chat"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg">
                <img src={BRAND_LOGO} alt="Sanmine Space" className="h-full w-full object-cover" />
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.02em]">Sanmine Space</span>
            </button>
          ) : (
            <div className="group relative h-8 w-8">
              <img
                src={BRAND_LOGO}
                alt="Sanmine Space"
                className="h-8 w-8 rounded-lg object-cover transition-opacity group-hover:opacity-0"
              />
              <button
                onClick={() => setSidebar(true)}
                className="absolute inset-0 grid h-8 w-8 place-items-center rounded-lg text-[#77746d] opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <SidebarToggleIcon direction="open" />
              </button>
            </div>
          )}

          {sidebar && (
            <button
              onClick={() => setSidebar(false)}
              className="rounded-md p-1.5 text-[#77746d] hover:bg-black/5"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <SidebarToggleIcon direction="close" />
            </button>
          )}
        </div>

        <button
          onClick={newChat}
          className={`flex items-center rounded-lg py-2.5 text-sm font-medium hover:bg-black/5 ${
            sidebar ? "gap-2 px-3" : "justify-center px-0"
          }`}
          title={!sidebar ? "New chat" : undefined}
          aria-label="New chat"
        >
          <Plus size={17} />
          {sidebar && "New chat"}
        </button>

        {sidebar && (
          <>
            <div className="mt-7 px-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#99958c]">Recent</div>
            <div className="mt-2 space-y-0.5">
              {["Lead research ideas", "Website outreach plan", "EdTech prospects"].map((item) => (
                <button key={item} className="block w-full truncate rounded-lg px-3 py-2 text-left text-[13px] text-[#5e5b54] hover:bg-black/5">
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-auto rounded-xl border border-[var(--line)] bg-white/60 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles size={14} /> Agent workspace</div>
              <p className="mt-1.5 text-[11px] leading-4 text-[var(--muted)]">Research and outreach tools will live here as the agent grows.</p>
            </div>
          </>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] px-4 md:px-7">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebar(!sidebar)} className="rounded-lg p-2 text-[var(--muted)] hover:bg-black/5 md:hidden" aria-label="Toggle sidebar">
              <Menu size={19} />
            </button>
            <span className="text-sm font-semibold md:hidden">Sanmine Space</span>
            <button onClick={newChat} className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-[#4d4a44] hover:bg-black/5 md:flex">
              New chat <ChevronDown size={14} />
            </button>
          </div>
          <button className="rounded-lg p-2 text-[var(--muted)] hover:bg-black/5" aria-label="Search">
            <Search size={18} />
          </button>
        </header>

        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center px-4 pb-8 pt-[15vh]">
            <div className="w-full max-w-[760px]">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-5 grid h-11 w-11 place-items-center overflow-hidden rounded-2xl">
                  <img src={BRAND_LOGO} alt="Sanmine Space" className="h-full w-full object-cover" />
                </div>
                <h1 className="font-serif text-4xl tracking-[-0.035em] text-[#282721] md:text-[46px]">How can I help?</h1>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">Research leads, build outreach campaigns, and get work done from one simple conversation.</p>
              </div>
              <Composer message={message} setMessage={setMessage} submit={submit} loading={loading} />
              <Suggestions setMessage={setMessage} />
              {error && <ErrorMessage message={error} />}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-auto w-full max-w-[820px] flex-1 overflow-y-auto px-4 py-10">
              <div className="space-y-8">
                {messages.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={item.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    {item.role === "user" ? (
                      <div className="max-w-[75%] rounded-2xl bg-[#ebe9e3] px-4 py-3 text-[15px] leading-6 text-[#282721]">
                        {item.content}
                      </div>
                    ) : (
                      <div className="flex max-w-[85%] gap-3 text-[15px] leading-7 text-[#37352f]">
                        <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg"><img src={BRAND_LOGO} alt="" className="h-full w-full object-cover" /></div>
                        <div className="whitespace-pre-wrap">{item.content}</div>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
                    <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg"><img src={BRAND_LOGO} alt="" className="h-full w-full object-cover" /></div>
                    <span className="flex items-center gap-2">Thinking <Loader2 size={14} className="animate-spin" /></span>
                  </div>
                )}
                {error && <ErrorMessage message={error} />}
              </div>
            </div>
            <div className="mx-auto w-full max-w-[820px] px-4 pb-6 pt-2">
              <Composer message={message} setMessage={setMessage} submit={submit} loading={loading} />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Composer({
  message,
  setMessage,
  submit,
  loading,
}: {
  message: string;
  setMessage: (value: string) => void;
  submit: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-[#dcd9d1] bg-[var(--panel)] p-2 shadow-[0_8px_35px_rgba(30,27,20,0.06)] focus-within:border-[#c8c4ba] focus-within:shadow-[0_10px_40px_rgba(30,27,20,0.09)]">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        rows={3}
        placeholder="Ask Sanmine Space to do something..."
        className="min-h-[92px] w-full resize-none border-0 bg-transparent px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-[#aaa69d]"
        disabled={loading}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="px-2 text-[11px] text-[#aaa69d]">Enter to send · Shift + Enter for new line</span>
        <button onClick={submit} disabled={!message.trim() || loading} className="grid h-9 w-9 place-items-center rounded-xl bg-[#24231f] text-white transition hover:bg-[#3a3832] disabled:cursor-not-allowed disabled:opacity-25" aria-label="Send">
          {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={17} />}
        </button>
      </div>
    </div>
  );
}

function Suggestions({ setMessage }: { setMessage: (value: string) => void }) {
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {examples.map((example) => (
        <button key={example} onClick={() => setMessage(example)} className="rounded-full border border-[var(--line)] bg-white/40 px-3.5 py-2 text-xs text-[#68655e] transition hover:border-[#cbc7bd] hover:bg-white">
          {example}
        </button>
      ))}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="mt-3 rounded-xl border border-[#e7c9bd] bg-[#fff8f5] px-4 py-3 text-sm text-[#8c4b36]">{message}</div>;
}

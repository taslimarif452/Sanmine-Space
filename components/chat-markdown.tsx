"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\)]+\))/g);
  return <>{parts.map((p, i) => {
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="rounded-md bg-black/[.06] px-1.5 py-0.5 font-mono text-[.9em]">{p.slice(1, -1)}</code>;
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    const m = p.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (m) return <a key={i} href={m[2]} target="_blank" rel="noreferrer" className="font-medium text-[#6f5a4f] underline decoration-[#b8a79e] underline-offset-2 hover:decoration-current">{m[1]}</a>;
    return <span key={i}>{p}</span>;
  })}</>;
}

function Code({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return <div className="my-5 overflow-hidden rounded-2xl border border-[#35342f] bg-[#1f1f1c] text-[#f4f1e9] shadow-sm">
    <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2 text-xs text-white/60">
      <span className="font-mono">{lang || "code"}</span>
      <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white">
        {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
      </button>
    </div>
    <pre className="max-h-[520px] overflow-auto p-4 text-[13px] leading-6"><code>{code}</code></pre>
  </div>;
}

function Table({ lines }: { lines: string[] }) {
  const rows = lines.filter(Boolean).map((line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  if (rows.length < 2) return <div className="space-y-2">{lines.map((line, i) => <p key={i}><Inline text={line} /></p>)}</div>;
  const header = rows[0];
  const body = rows.slice(2);
  return <div className="my-5 overflow-x-auto rounded-2xl border border-[#dedbd3] bg-white/60 shadow-sm">
    <table className="w-full min-w-[560px] border-collapse text-left text-[13px] leading-5">
      <thead className="bg-[#f1f0eb] text-[#4c4942]"><tr>{header.map((cell, i) => <th key={i} className="border-b border-[#dedbd3] px-3.5 py-3 font-semibold"> <Inline text={cell} /> </th>)}</tr></thead>
      <tbody>{body.map((row, r) => <tr key={r} className="border-b border-[#ebe8e1] last:border-0 hover:bg-black/[.018]">{header.map((_, c) => <td key={c} className="px-3.5 py-3 align-top text-[#5f5b54]">{row[c] ? <Inline text={row[c]} /> : "—"}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

function TextBlocks({ content }: { content: string }) {
  const lines = content.split("\n");
  const output: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const tableLines: string[] = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) { tableLines.push(lines[i]); i += 1; }
      output.push(<Table key={`table-${i}`} lines={tableLines} />);
      continue;
    }
    if (/^###\s+/.test(line)) output.push(<h3 key={i} className="pt-3 text-base font-semibold tracking-[-0.01em]"><Inline text={line.replace(/^###\s+/, "")} /></h3>);
    else if (/^##\s+/.test(line)) output.push(<h2 key={i} className="pt-4 text-lg font-semibold tracking-[-0.02em]"><Inline text={line.replace(/^##\s+/, "")} /></h2>);
    else if (/^#\s+/.test(line)) output.push(<h1 key={i} className="pt-4 text-xl font-semibold tracking-[-0.025em]"><Inline text={line.replace(/^#\s+/, "")} /></h1>);
    else if (/^>\s?/.test(line)) output.push(<blockquote key={i} className="my-3 border-l-2 border-[#c9c2b9] pl-4 text-[#77736b]"><Inline text={line.replace(/^>\s?/, "")} /></blockquote>);
    else if (/^[-*]\s+/.test(line)) output.push(<div key={i} className="flex gap-2 pl-1"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9b948a]" /><span><Inline text={line.replace(/^[-*]\s+/, "")} /></span></div>);
    else if (/^\d+\.\s+/.test(line)) output.push(<div key={i} className="flex gap-2 pl-1"><span className="min-w-5 font-medium text-[#77736b]">{line.match(/^\d+/)?.[0]}.</span><span><Inline text={line.replace(/^\d+\.\s+/, "")} /></span></div>);
    else if (/^---+$/.test(line.trim())) output.push(<hr key={i} className="my-5 border-[#e2dfd7]" />);
    else output.push(<p key={i}><Inline text={line} /></p>);
    i += 1;
  }
  return <>{output}</>;
}

export function ChatMarkdown({ content }: { content: string }) {
  const blocks = useMemo(() => content.split(/(```[\w+-]*\n?[\s\S]*?```)/g), [content]);
  return <div className="space-y-2 text-[15px] leading-7 text-[#3f3d38]">
    {blocks.map((block, i) => {
      if (block.startsWith("```")) {
        const m = block.match(/^```([\w+-]*)\n?([\s\S]*?)```$/);
        return <Code key={i} lang={m?.[1]} code={(m?.[2] || block).replace(/\n$/, "")} />;
      }
      return <TextBlocks key={i} content={block} />;
    })}
  </div>;
}

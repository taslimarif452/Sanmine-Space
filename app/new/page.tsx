"use client";

import { useEffect } from "react";
import Home from "@/app/page";

const STARTERS = [
  "Research this topic and give me the key findings.",
  "Help me plan and organize this task step by step.",
  "Find the best options for what I am looking for.",
  "Analyze this information and give me a clear summary.",
];

function setComposerValue(value: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

function StarterPrompts() {
  useEffect(() => {
    const root = document.createElement("div");
    root.setAttribute("data-new-chat-starters", "true");
    root.className = "fixed left-1/2 top-[calc(50%+150px)] z-10 flex w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 flex-wrap justify-center gap-2 px-2";
    STARTERS.forEach((starter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = starter;
      button.className = "rounded-full border border-[#ddd9d0] bg-white px-3 py-1.5 text-xs text-[#68645d] shadow-sm transition hover:bg-[#faf9f6]";
      button.addEventListener("click", () => setComposerValue(starter));
      root.appendChild(button);
    });
    document.body.appendChild(root);
    return () => root.remove();
  }, []);

  return null;
}

export default function NewChatPage() {
  return <><Home /><StarterPrompts /></>;
}

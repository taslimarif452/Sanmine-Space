"use client";

import { useEffect } from "react";

let installed = false;
const listenerMap = new WeakMap<Function, Map<string, EventListener>>();
const actionEvents = new Set(["pointerdown", "mousedown", "touchstart", "click"]);

function isChatActionTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const button = target.closest("button");
  if (!button) return false;
  const text = (button.textContent || "").trim().toLowerCase();
  return text === "delete" || text === "rename" || text.includes("delete chat") || text.includes("rename chat");
}

function install() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const proto = Document.prototype as any;
  const add = proto.addEventListener;
  const remove = proto.removeEventListener;

  proto.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (this === document && typeof listener === "function" && actionEvents.has(type)) {
      const original = listener as Function;
      const wrapped: EventListener = (event) => {
        if (isChatActionTarget(event.target)) return;
        original.call(this, event);
      };
      let byType = listenerMap.get(original);
      if (!byType) {
        byType = new Map();
        listenerMap.set(original, byType);
      }
      byType.set(type, wrapped);
      return add.call(this, type, wrapped, options);
    }
    return add.call(this, type, listener, options);
  };

  proto.removeEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    if (this === document && typeof listener === "function" && actionEvents.has(type)) {
      const wrapped = listenerMap.get(listener)?.get(type);
      return remove.call(this, type, wrapped || listener, options);
    }
    return remove.call(this, type, listener, options);
  };
}

install();

export function MenuEventBridge() {
  useEffect(() => install(), []);
  return null;
}

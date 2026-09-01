"use client";

import { useEffect } from "react";

let installed = false;
const listenerMap = new WeakMap<Function, Map<string, EventListener>>();

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

  const add = Document.prototype.addEventListener;
  const remove = Document.prototype.removeEventListener;

  Document.prototype.addEventListener = function (type, listener, options) {
    if (this === document && typeof listener === "function" && ["pointerdown", "mousedown", "touchstart", "click"].includes(type)) {
      const wrapped: EventListener = (event) => {
        if (isChatActionTarget(event.target)) return;
        listener.call(this, event);
      };
      let byType = listenerMap.get(listener);
      if (!byType) {
        byType = new Map();
        listenerMap.set(listener, byType);
      }
      byType.set(type, wrapped);
      return add.call(this, type, wrapped, options);
    }
    return add.call(this, type, listener, options);
  };

  Document.prototype.removeEventListener = function (type, listener, options) {
    if (this === document && typeof listener === "function" && ["pointerdown", "mousedown", "touchstart", "click"].includes(type)) {
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

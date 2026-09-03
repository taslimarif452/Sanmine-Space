import { AsyncLocalStorage } from "node:async_hooks";
import type { ProviderTask } from "@/lib/ai/provider";

const storage = new AsyncLocalStorage<ProviderTask>();

export function withProviderTask<T>(task: ProviderTask, fn: () => T): T {
  return storage.run(task, fn);
}

export function getProviderTask(): ProviderTask {
  return storage.getStore() || "balanced";
}

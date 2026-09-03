import { AsyncLocalStorage } from "node:async_hooks";

/** The supported model-routing tasks for a request. Kept local to avoid a runtime/module dependency. */
export type ProviderTask = "fast" | "balanced" | "deep";

const storage = new AsyncLocalStorage<ProviderTask>();

export function withProviderTask<T>(task: ProviderTask, fn: () => T): T {
  return storage.run(task, fn);
}

export function getProviderTask(): ProviderTask {
  return storage.getStore() || "balanced";
}

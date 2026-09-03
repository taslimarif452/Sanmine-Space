export function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(String(text || "").length / 4));
}

export function estimateCost(provider: string, model: string, inputTokens: number, outputTokens: number) {
  const p = provider.toLowerCase();
  const m = model.toLowerCase();
  const inputRate = Number(process.env.AI_INPUT_COST_PER_1M || (p === "openrouter" ? "0.50" : m.includes("flash") ? "0.30" : "1.00"));
  const outputRate = Number(process.env.AI_OUTPUT_COST_PER_1M || (p === "openrouter" ? "2.00" : m.includes("flash") ? "2.50" : "5.00"));
  const inputCostUsd = (inputTokens / 1_000_000) * inputRate;
  const outputCostUsd = (outputTokens / 1_000_000) * outputRate;
  return { inputTokens, outputTokens, inputCostUsd, outputCostUsd, totalCostUsd: inputCostUsd + outputCostUsd };
}

export function isToolTestRequestForEval(text: string): boolean {
  return /(?:test|check|verify|try|run|use)\s+(?:all|every|each|the)?\s*(?:available\s*)?(?:tools|tool)|(?:tools|toolkit).*(?:test|check|verify)|sab(?:hi|hi)?\s*(?:tools|tool).*test/i.test(text);
}

export function chooseModel(kind: "chat" | "research" | "tool_test" | "background_research", complexity: "fast" | "balanced" | "deep" = "balanced") {
  const env = kind === "research" || kind === "background_research" || complexity === "deep" ? process.env.AI_DEEP_MODEL : complexity === "fast" ? process.env.AI_FAST_MODEL : process.env.AI_BALANCED_MODEL;
  return env?.trim() || process.env.GEMINI_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || "default";
}

export function recoveryDelay(attempt: number) {
  return Math.min(8000, 500 * 2 ** Math.max(0, attempt - 1));
}

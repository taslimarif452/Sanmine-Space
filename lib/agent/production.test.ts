import { describe, expect, it } from "vitest";
import { estimateCost, estimateTokens, isToolTestRequestForEval, chooseModel, recoveryDelay } from "./production-evals";

describe("production AI evals", () => {
  it("estimates tokens deterministically", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("1234")).toBe(1);
  });

  it("keeps cost estimates bounded and numeric", () => {
    const cost = estimateCost("gemini", "flash", 1000, 2000);
    expect(cost.totalCostUsd).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(cost.totalCostUsd)).toBe(true);
  });

  it("recognizes tool-test requests", () => {
    expect(isToolTestRequestForEval("test all available tools")).toBe(true);
    expect(isToolTestRequestForEval("please test every tool")).toBe(true);
    expect(isToolTestRequestForEval("hello there")).toBe(false);
  });

  it("routes deep work to a deep model configuration", () => {
    const old = process.env.AI_DEEP_MODEL;
    process.env.AI_DEEP_MODEL = "deep-test-model";
    expect(chooseModel("research", "deep")).toBe("deep-test-model");
    if (old === undefined) delete process.env.AI_DEEP_MODEL; else process.env.AI_DEEP_MODEL = old;
  });

  it("uses bounded exponential recovery delays", () => {
    expect(recoveryDelay(1)).toBe(500);
    expect(recoveryDelay(2)).toBe(1000);
    expect(recoveryDelay(10)).toBeLessThanOrEqual(8000);
  });
});

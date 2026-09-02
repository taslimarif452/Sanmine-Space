import { describe, expect, it } from "vitest";
import { AppError, errorResponse, errorStatus } from "@/lib/api/errors";

describe("AppError", () => {
  it("serializes a typed application error", () => {
    const error = new AppError("RATE_LIMITED", "Slow down.", 429);
    expect(errorStatus(error)).toBe(429);
    expect(errorResponse(error)).toEqual({ error: "Slow down.", code: "RATE_LIMITED" });
  });

  it("does not leak unknown error objects", () => {
    expect(errorResponse({ secret: "value" })).toEqual({ error: "Something went wrong.", code: "INTERNAL_ERROR" });
    expect(errorStatus(new Error("boom"))).toBe(500);
  });
});

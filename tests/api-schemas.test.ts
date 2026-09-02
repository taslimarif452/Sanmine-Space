import { describe, expect, it } from "vitest";
import { CreateCampaignSchema } from "@/lib/api/schemas";

const valid = {
  name: "Creator outreach",
  connectionId: "123e4567-e89b-12d3-a456-426614174000",
  subject: "Website proposal",
  body: "Hello there",
  recipients: ["person@example.com", "other@example.com"],
  intervalMinutes: 60,
};

describe("CreateCampaignSchema", () => {
  it("accepts a valid campaign", () => {
    expect(CreateCampaignSchema.parse(valid).recipients).toEqual(valid.recipients);
  });

  it("rejects malformed recipients", () => {
    expect(CreateCampaignSchema.safeParse({ ...valid, recipients: ["not-an-email"] }).success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(CreateCampaignSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
  });

  it("rejects more than 500 recipients", () => {
    const recipients = Array.from({ length: 501 }, (_, i) => `user${i}@example.com`);
    expect(CreateCampaignSchema.safeParse({ ...valid, recipients }).success).toBe(false);
  });
});

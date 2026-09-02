import { z } from "zod";

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(20_000),
  history: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string().max(50_000) })).max(100).default([]),
  chatId: z.string().uuid().nullable().optional(),
});

export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  connectionId: z.string().uuid(),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(100_000),
  recipients: z.array(z.string().trim().toLowerCase().email()).min(1).max(500),
  intervalMinutes: z.coerce.number().int().min(1).max(10_080).default(60),
  startAt: z.string().datetime().optional(),
});

export const ApprovalActionSchema = z.object({
  action: z.enum(["approve", "reject", "send", "retry"]),
});

export const DeleteConnectionSchema = z.object({ id: z.string().uuid() });

export const SendProposalSchema = z.object({
  user_id: z.string().min(1),
  sender_name: z.string().trim().min(1).max(120),
  offer: z.string().trim().min(1).max(5_000),
  user_language: z.enum(["en", "hi", "bn", "es", "fr", "zh", "ja", "ko"]).default("en"),
  targets: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
});

export type ToolParameterType = "string" | "number" | "boolean" | "object" | "array";

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResult = {
  toolCallId: string;
  name: string;
  result: unknown;
};

export type AgentEvent =
  | { type: "thinking" }
  | { type: "tool_start"; name: string; toolCallId: string }
  | { type: "tool_result"; name: string; toolCallId: string; result: unknown };

export type AgentTool = ToolDefinition & {
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

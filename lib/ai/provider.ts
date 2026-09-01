export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AIProviderName = "gemini" | "openrouter";

export interface AIProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}

export function getProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || "gemini";
  if (provider === "openrouter") return new OpenRouterProvider();
  return new GeminiProvider();
}

class GeminiProvider implements AIProvider {
  async chat(messages: ChatMessage[]) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured");

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

    const system = messages.find((m) => m.role === "system")?.content;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents,
          generationConfig: { temperature: 0.4 },
        }),
      },
    );

    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "No response returned.";
  }
}

class OpenRouterProvider implements AIProvider {
  async chat(messages: ChatMessage[]) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OPENROUTER_API_KEY is not configured");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Sanmine Space",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openrouter/free",
        messages,
        temperature: 0.4,
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No response returned.";
  }
}

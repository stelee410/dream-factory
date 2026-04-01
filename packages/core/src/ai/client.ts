import type { ChatMessage, ChatRequest, ChatResponse } from "./types.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

export class AIClient {
  readonly apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? DEFAULT_MODEL;
  }

  async chat(
    messages: ChatMessage[],
    opts?: { temperature?: number; max_tokens?: number; model?: string }
  ): Promise<string> {
    const body: ChatRequest = {
      model: opts?.model ?? this.model,
      messages,
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.max_tokens ?? 4096,
    };

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`OpenRouter API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response content from AI");
    return content;
  }
}

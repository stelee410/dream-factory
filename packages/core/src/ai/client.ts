import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ToolDefinition,
  ToolChatMessage,
  ToolChatRequest,
  ToolChatResponse,
} from "./types.js";
import { safeFetch } from "../api.js";
import type { LlmClientConfig } from "./llm-config.js";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "./llm-config.js";

export class AIClient {
  readonly apiKey: string;
  private readonly baseUrl: string;
  private model: string;

  constructor(config: LlmClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_LLM_BASE_URL).replace(/\/$/, "");
    this.model = config.model || DEFAULT_LLM_MODEL;
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

    const res = await safeFetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LLM API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No response content from AI");
    return content;
  }

  async chatWithTools(
    messages: ToolChatMessage[],
    tools: ToolDefinition[],
    opts?: {
      temperature?: number;
      max_tokens?: number;
      model?: string;
      tool_choice?: ToolChatRequest["tool_choice"];
    }
  ): Promise<ToolChatResponse> {
    const body: ToolChatRequest = {
      model: opts?.model ?? this.model,
      messages,
      tools,
      tool_choice: opts?.tool_choice ?? "auto",
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.max_tokens ?? 4096,
    };

    const res = await safeFetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LLM API error (${res.status}): ${err}`);
    }

    return (await res.json()) as ToolChatResponse;
  }
}

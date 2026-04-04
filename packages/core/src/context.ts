import { AuthClient } from "./auth/index.js";
import { CharacterClient } from "./character/index.js";
import { AIClient } from "./ai/index.js";
import {
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  type LlmClientConfig,
} from "./ai/llm-config.js";

export type { LlmClientConfig };

export interface DreamFactoryConfig {
  linkyunApiBase: string;
  /** Preferred: base URL, model, and API key for OpenAI-compatible chat APIs. */
  llm?: LlmClientConfig | null;
  /** @deprecated Use `llm` or env `LLM_API_KEY`. */
  openrouterApiKey?: string;
  /** @deprecated Use `llm.model` or env `LLM_MODEL`. */
  aiModel?: string;
}

function resolveLlm(config: DreamFactoryConfig): LlmClientConfig | null {
  if (config.llm?.apiKey?.trim()) {
    return {
      apiKey: config.llm.apiKey.trim(),
      baseUrl: (config.llm.baseUrl ?? DEFAULT_LLM_BASE_URL).replace(/\/$/, ""),
      model: config.llm.model?.trim() || DEFAULT_LLM_MODEL,
    };
  }
  const apiKey = config.openrouterApiKey?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: DEFAULT_LLM_BASE_URL.replace(/\/$/, ""),
    model: config.aiModel?.trim() || DEFAULT_LLM_MODEL,
  };
}

export class DreamFactory {
  readonly auth: AuthClient;
  readonly character: CharacterClient;
  readonly ai: AIClient | null;

  constructor(config: DreamFactoryConfig) {
    const base = config.linkyunApiBase;
    this.auth = new AuthClient(base);
    this.character = new CharacterClient(base, () => this.auth.getHeaders());
    const llm = resolveLlm(config);
    this.ai = llm ? new AIClient(llm) : null;
  }
}

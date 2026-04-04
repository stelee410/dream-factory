export const DEFAULT_LLM_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_LLM_MODEL = "anthropic/claude-sonnet-4";

export type LlmClientConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * Resolve LLM settings from environment.
 * `LLM_API_KEY` wins; if unset, `OPENROUTER_API_KEY` is accepted for backward compatibility.
 */
export function resolveLlmFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LlmClientConfig | null {
  const apiKey = (env.LLM_API_KEY ?? env.OPENROUTER_API_KEY)?.trim();
  if (!apiKey) return null;
  const baseUrl = (env.LLM_BASE_URL?.trim() || DEFAULT_LLM_BASE_URL).replace(/\/$/, "");
  const model = env.LLM_MODEL?.trim() || DEFAULT_LLM_MODEL;
  return { apiKey, baseUrl, model };
}

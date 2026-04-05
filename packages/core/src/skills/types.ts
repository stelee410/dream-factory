import type { ToolDefinition } from "../ai/types.js";

export interface SkillContext {
  projectDir: string;
  onProgress: (message: string) => void;
}

export interface Skill {
  readonly name: string;
  readonly description: string;

  /** Whether this skill is configured and ready to use (e.g. API keys present). */
  isAvailable(): boolean;

  /** Tool definitions contributed by this skill (OpenAI function calling schema). */
  getTools(): ToolDefinition[];

  /**
   * Execute one of this skill's tools.
   * Returns a result string that gets sent back to the LLM as a tool response.
   */
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<string>;
}

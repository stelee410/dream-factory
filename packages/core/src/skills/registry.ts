import type { ToolDefinition } from "../ai/types.js";
import type { Skill, SkillContext } from "./types.js";

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private toolOwner: Map<string, string> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);

    if (skill.isAvailable()) {
      for (const tool of skill.getTools()) {
        this.toolOwner.set(tool.function.name, skill.name);
      }
    }
  }

  getAvailableSkills(): Skill[] {
    return [...this.skills.values()].filter((s) => s.isAvailable());
  }

  /** Collect tool definitions from all available skills. */
  getAllTools(): ToolDefinition[] {
    return this.getAvailableSkills().flatMap((s) => s.getTools());
  }

  /** Find the skill that owns a given tool name. */
  findSkillForTool(toolName: string): Skill | undefined {
    const ownerName = this.toolOwner.get(toolName);
    if (!ownerName) return undefined;
    const skill = this.skills.get(ownerName);
    return skill?.isAvailable() ? skill : undefined;
  }

  /** Execute a skill tool by name. Returns undefined if no skill owns this tool. */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<string | undefined> {
    const skill = this.findSkillForTool(toolName);
    if (!skill) return undefined;
    return skill.executeTool(toolName, args, ctx);
  }

  /** Build a summary of available skills for the system prompt. */
  describeAvailable(): string {
    const available = this.getAvailableSkills();
    if (available.length === 0) return "";
    const lines = available.map((s) => `- **${s.name}**: ${s.description}`);
    return `\n\n## 已加载的 Skills\n${lines.join("\n")}`;
  }
}

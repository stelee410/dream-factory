import type { Agent, AgentListResponse, CharacterProfile } from "./types.js";
import { apiRequest } from "../api.js";

export class CharacterClient {
  private baseUrl: string;
  private headers: () => Record<string, string>;

  constructor(baseUrl: string, headers: () => Record<string, string>) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.headers = headers;
  }

  async list(
    opts: { status?: string; limit?: number; offset?: number } = {}
  ): Promise<AgentListResponse> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.offset) params.set("offset", String(opts.offset));

    const qs = params.toString();
    const url = `${this.baseUrl}/api/v1/agents${qs ? `?${qs}` : ""}`;

    return apiRequest<AgentListResponse>(url, { headers: this.headers() });
  }

  async getById(id: number): Promise<Agent> {
    return apiRequest<Agent>(`${this.baseUrl}/api/v1/agents/${id}`, {
      headers: this.headers(),
    });
  }

  async getByCode(code: string): Promise<Agent> {
    return apiRequest<Agent>(
      `${this.baseUrl}/api/v1/agents/by-code/${code}`,
      { headers: this.headers() }
    );
  }

  getAvatarUrl(filename: string): string {
    return `${this.baseUrl}/api/v1/avatars/${filename}`;
  }

  getCharacterSheetUrl(filename: string): string {
    return `${this.baseUrl}/api/v1/character-sheets/${filename}`;
  }

  toProfile(agent: Agent): CharacterProfile {
    const meta = agent.config.metadata ?? {};
    const avatar = meta.avatar as string | undefined;
    const sheet = meta.character_design_sheet as string | undefined;

    return {
      id: agent.id,
      code: agent.code,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.system_prompt || agent.config.system_prompt,
      avatarUrl: avatar ? this.getAvatarUrl(avatar) : null,
      characterDesignSpec:
        (meta.character_design_spec as string) ?? null,
      characterDesignSheetUrl: sheet
        ? this.getCharacterSheetUrl(sheet)
        : null,
    };
  }
}

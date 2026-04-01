export interface AgentConfig {
  system_prompt: string;
  temperature?: number;
  max_tokens?: number;
  examples?: Array<{ role: string; content: string }>;
  skills?: string[];
  metadata?: Record<string, unknown>;
}

export interface Agent {
  id: number;
  uuid: string;
  code: string;
  creator_id: number;
  workspace_id?: number;
  name: string;
  description: string;
  system_prompt: string;
  temperature: number;
  config: AgentConfig;
  status: string;
  agent_type: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

export interface CharacterProfile {
  id: number;
  code: string;
  name: string;
  description: string;
  systemPrompt: string;
  avatarUrl: string | null;
  characterDesignSpec: string | null;
  characterDesignSheetUrl: string | null;
}

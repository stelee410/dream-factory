import { AuthClient } from "./auth/index.js";
import { CharacterClient } from "./character/index.js";
import { AIClient } from "./ai/index.js";

export interface DreamFactoryConfig {
  linkyunApiBase: string;
  openrouterApiKey?: string;
  aiModel?: string;
}

export class DreamFactory {
  readonly auth: AuthClient;
  readonly character: CharacterClient;
  readonly ai: AIClient | null;

  constructor(config: DreamFactoryConfig) {
    const base = config.linkyunApiBase;
    this.auth = new AuthClient(base);
    this.character = new CharacterClient(base, () => this.auth.getHeaders());
    this.ai = config.openrouterApiKey
      ? new AIClient(config.openrouterApiKey, config.aiModel)
      : null;
  }
}

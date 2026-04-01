import type { LoginRequest, LoginResponse, AuthSession } from "./types.js";
import { apiRequest } from "../api.js";

export class AuthClient {
  private baseUrl: string;
  private session: AuthSession | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async login(req: LoginRequest): Promise<LoginResponse> {
    const data = await apiRequest<LoginResponse>(
      `${this.baseUrl}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }
    );

    this.session = {
      apiKey: data.api_key,
      username: data.account.username,
      workspaceCode: data.workspace.code,
    };

    return data;
  }

  getSession(): AuthSession | null {
    return this.session;
  }

  getApiKey(): string {
    if (!this.session) throw new Error("Not logged in");
    return this.session.apiKey;
  }

  getHeaders(): Record<string, string> {
    if (!this.session) throw new Error("Not logged in");
    return {
      "X-API-Key": this.session.apiKey,
      "X-Workspace-Code": this.session.workspaceCode,
    };
  }

  isLoggedIn(): boolean {
    return this.session !== null;
  }

  logout(): void {
    this.session = null;
  }
}

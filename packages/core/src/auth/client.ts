import type { LoginRequest, LoginResponse, AuthSession, WorkspaceInfo, SwitchWorkspaceResponse } from "./types.js";
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

    // Top-level data.api_key matches data.creator.api_key (linkyun-agent Login handler).
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

  /**
   * Restore session from environment (after CLI load-env).
   * Expects LINKYUN_API_KEY + LINKYUN_WORKSPACE_CODE. LINKYUN_USERNAME is optional (display only).
   * Does not use password — prefer this over storing passwords in .env.
   */
  tryRestoreFromEnv(): boolean {
    const apiKey = process.env.LINKYUN_API_KEY?.trim();
    const workspaceCode = process.env.LINKYUN_WORKSPACE_CODE?.trim();
    const username = process.env.LINKYUN_USERNAME?.trim();
    if (!apiKey || !workspaceCode) return false;
    this.session = {
      apiKey,
      workspaceCode,
      username: username && username.length > 0 ? username : "",
    };
    return true;
  }

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    if (!this.session) throw new Error("Not logged in");
    return apiRequest<WorkspaceInfo[]>(
      `${this.baseUrl}/api/v1/workspaces`,
      { headers: this.getHeaders() }
    );
  }

  async switchWorkspace(workspaceCode: string): Promise<AuthSession> {
    if (!this.session) throw new Error("Not logged in");
    const data = await apiRequest<SwitchWorkspaceResponse>(
      `${this.baseUrl}/api/v1/auth/switch-workspace`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.getHeaders(),
        },
        body: JSON.stringify({ workspace_code: workspaceCode }),
      }
    );
    this.session = {
      apiKey: data.api_key,
      username: this.session.username,
      workspaceCode: data.workspace.code,
    };
    return this.session;
  }
}

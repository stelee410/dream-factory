export interface LoginRequest {
  username: string;
  password: string;
  workspace_code?: string;
}

export interface LoginResponse {
  account: {
    id: number;
    username: string;
    email: string;
  };
  api_key: string;
  creator: {
    id: number;
    uuid: string;
    account_id: number;
    username: string;
    email: string;
    api_key: string;
    status: string;
  };
  user: {
    id: number;
    username: string;
  };
  workspace: {
    id: number;
    name: string;
    code: string;
    status: string;
  };
}

export interface AuthSession {
  apiKey: string;
  username: string;
  workspaceCode: string;
}

export interface WorkspaceInfo {
  id: number;
  name: string;
  code: string;
  status: string;
  /** GET /api/v1/user/workspaces 含成员角色时存在 */
  role?: string;
}

/** POST /api/v1/user/workspace/switch — 会话 API Key 不变，仅切换 X-Workspace-Code 上下文 */
export interface SwitchWorkspaceResponse {
  workspace: WorkspaceInfo;
  message?: string;
}

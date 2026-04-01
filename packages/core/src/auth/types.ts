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

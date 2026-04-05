export interface CreateSessionRequest {
  sessionId?: string;
  message?: string;
}

export interface CreateSessionResponse {
  projectUuid: string;
  sessionId: string;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  seq?: number;
}

export interface QuerySessionResponse {
  messages: SessionMessage[];
}

export interface ChangeProjectResponse {
  projectUuid: string;
}

export interface UploadFileResponse {
  url: string;
}

export interface LibTVClientConfig {
  accessKey: string;
  baseUrl?: string;
}

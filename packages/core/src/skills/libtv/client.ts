import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { safeFetch } from "../../api.js";
import type {
  LibTVClientConfig,
  CreateSessionRequest,
  CreateSessionResponse,
  QuerySessionResponse,
  ChangeProjectResponse,
  UploadFileResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://im.liblib.tv";

export class LibTVClient {
  private accessKey: string;
  private baseUrl: string;

  constructor(config: LibTVClientConfig) {
    this.accessKey = config.accessKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${this.accessKey}`, ...extra };
  }

  async createSession(
    message?: string,
    sessionId?: string,
  ): Promise<CreateSessionResponse> {
    const body: CreateSessionRequest = {};
    if (sessionId) body.sessionId = sessionId;
    if (message) body.message = message;

    const res = await safeFetch(`${this.baseUrl}/openapi/session`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LibTV createSession failed (${res.status}): ${err}`);
    }

    const json = (await res.json()) as { data?: CreateSessionResponse };
    if (!json.data?.sessionId) {
      throw new Error("LibTV createSession: missing sessionId in response");
    }
    return json.data;
  }

  async querySession(
    sessionId: string,
    afterSeq?: number,
  ): Promise<QuerySessionResponse> {
    const url = new URL(`${this.baseUrl}/openapi/session/${sessionId}`);
    if (afterSeq !== undefined) url.searchParams.set("afterSeq", String(afterSeq));

    const res = await safeFetch(url.toString(), { headers: this.headers() });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LibTV querySession failed (${res.status}): ${err}`);
    }
    const json = (await res.json()) as { data?: QuerySessionResponse };
    return json.data ?? { messages: [] };
  }

  async changeProject(): Promise<ChangeProjectResponse> {
    const res = await safeFetch(`${this.baseUrl}/openapi/session/change-project`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: "{}",
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LibTV changeProject failed (${res.status}): ${err}`);
    }
    const json = (await res.json()) as { data?: ChangeProjectResponse };
    if (!json.data?.projectUuid) {
      throw new Error("LibTV changeProject: missing projectUuid in response");
    }
    return json.data;
  }

  async uploadFile(filePath: string): Promise<UploadFileResponse> {
    const fileData = readFileSync(filePath);
    const fileName = basename(filePath);
    const ext = extname(filePath).toLowerCase();
    const mimeType = [".mp4", ".webm", ".mov"].includes(ext)
      ? `video/${ext.slice(1)}`
      : `image/${ext.slice(1) || "png"}`;

    const boundary = `----DFBoundary${Date.now()}`;
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const res = await safeFetch(`${this.baseUrl}/openapi/file/upload`, {
      method: "POST",
      headers: this.headers({ "Content-Type": `multipart/form-data; boundary=${boundary}` }),
      body,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`LibTV uploadFile failed (${res.status}): ${err}`);
    }
    const json = (await res.json()) as { data?: UploadFileResponse };
    if (!json.data?.url) throw new Error("LibTV uploadFile: missing url in response");
    return json.data;
  }

  async downloadResults(
    sessionId: string,
    outputDir: string,
    prefix = "",
  ): Promise<{ outputDir: string; downloaded: string[]; total: number }> {
    mkdirSync(outputDir, { recursive: true });
    const { messages } = await this.querySession(sessionId);
    const urls = extractMediaUrls(messages.map((m) => m.content));

    const downloaded: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      const ext = guessExtension(url);
      const filePath = join(outputDir, `${prefix}${String(i + 1).padStart(2, "0")}${ext}`);
      const res = await safeFetch(url);
      if (!res.ok) continue;
      writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
      downloaded.push(filePath);
    }
    return { outputDir, downloaded, total: downloaded.length };
  }

  static projectUrl(projectUuid: string): string {
    return `https://www.liblib.tv/canvas?projectId=${projectUuid}`;
  }
}

function extractMediaUrls(contents: string[]): string[] {
  const pattern = /https?:\/\/[^\s"'<>)]+\.(?:png|jpg|jpeg|webp|gif|mp4|webm|mov)/gi;
  const urls: string[] = [];
  for (const c of contents) {
    const m = c.match(pattern);
    if (m) urls.push(...m);
  }
  return [...new Set(urls)];
}

function guessExtension(url: string): string {
  const m = url.match(/\.(png|jpg|jpeg|webp|gif|mp4|webm|mov)/i);
  return m ? `.${m[1]!.toLowerCase()}` : ".bin";
}

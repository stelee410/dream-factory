import type { ToolDefinition } from "../../ai/types.js";
import type { Skill, SkillContext } from "../types.js";
import { LibTVClient } from "./client.js";
import type { LibTVClientConfig } from "./types.js";

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "libtv_create_session",
      description:
        "创建一个 LibTV 会话并发送创作指令（如「生一个30秒的漫剧」）。返回 sessionId 和项目画布链接。也可追加消息到已有会话。",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "要发送的创作指令（可选）" },
          session_id: { type: "string", description: "已有会话 ID（可选，填写则追加消息）" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "libtv_send_message",
      description: "向已有的 LibTV 会话发送追加消息（追加创作指令或修改要求）。",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "会话 ID" },
          message: { type: "string", description: "要发送的消息内容" },
        },
        required: ["session_id", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "libtv_query_progress",
      description: "查询 LibTV 会话的生成进度和消息列表。可用 after_seq 做增量拉取。",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "会话 ID" },
          after_seq: { type: "number", description: "只返回 seq 大于该值的新消息（可选）" },
        },
        required: ["session_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "libtv_upload_file",
      description: "上传本地图片或视频文件到 LibTV，返回 OSS URL。可在发送创作指令前先上传参考素材。",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "本地文件路径（图片或视频）" },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "libtv_download_results",
      description: "批量下载 LibTV 会话中生成的图片/视频结果到项目目录。",
      parameters: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "会话 ID" },
          prefix: { type: "string", description: "下载文件名前缀（可选）" },
        },
        required: ["session_id"],
      },
    },
  },
];

export class LibTVSkill implements Skill {
  readonly name = "libtv";
  readonly description =
    "LibTV 创作平台 — 通过会话式指令生成短视频、动画漫剧、MV 等 AIGC 内容（支持 Seedance 2.0、Kling 等模型）";

  private config: LibTVClientConfig | null;
  private client: LibTVClient | null = null;

  constructor(config?: LibTVClientConfig) {
    const accessKey = config?.accessKey || process.env.LIBTV_ACCESS_KEY || "";
    this.config = accessKey
      ? { accessKey, baseUrl: config?.baseUrl ?? process.env.OPENAPI_IM_BASE }
      : null;
  }

  isAvailable(): boolean {
    return this.config !== null;
  }

  getTools(): ToolDefinition[] {
    return TOOL_DEFINITIONS;
  }

  private getClient(): LibTVClient {
    if (!this.client) {
      if (!this.config) throw new Error("LibTV skill 未配置: 请设置 LIBTV_ACCESS_KEY 环境变量");
      this.client = new LibTVClient(this.config);
    }
    return this.client;
  }

  async executeTool(toolName: string, args: Record<string, unknown>, ctx: SkillContext): Promise<string> {
    const client = this.getClient();
    switch (toolName) {
      case "libtv_create_session": {
        const message = args.message as string | undefined;
        const sessionId = args.session_id as string | undefined;
        ctx.onProgress(message ? "正在向 LibTV 发送创作指令..." : "正在创建 LibTV 会话...");
        const result = await client.createSession(message, sessionId);
        return JSON.stringify({
          sessionId: result.sessionId,
          projectUuid: result.projectUuid,
          projectUrl: LibTVClient.projectUrl(result.projectUuid),
          message: message
            ? "会话已创建，创作指令已发送。可通过 libtv_query_progress 查询进度。"
            : "会话已创建（未发送消息）。使用 libtv_send_message 发送创作指令。",
        });
      }
      case "libtv_send_message": {
        const sid = args.session_id as string;
        const msg = args.message as string;
        if (!sid || !msg) return "错误: session_id 和 message 都是必填参数。";
        ctx.onProgress("正在向 LibTV 会话发送消息...");
        const result = await client.createSession(msg, sid);
        return JSON.stringify({
          sessionId: result.sessionId,
          projectUrl: LibTVClient.projectUrl(result.projectUuid),
          message: "消息已发送。可通过 libtv_query_progress 查询进度。",
        });
      }
      case "libtv_query_progress": {
        const sid = args.session_id as string;
        if (!sid) return "错误: session_id 是必填参数。";
        const result = await client.querySession(sid, args.after_seq as number | undefined);
        return JSON.stringify({ messageCount: result.messages.length, messages: result.messages });
      }
      case "libtv_upload_file": {
        const fp = args.file_path as string;
        if (!fp) return "错误: file_path 是必填参数。";
        ctx.onProgress(`正在上传文件到 LibTV: ${fp}...`);
        const result = await client.uploadFile(fp);
        return JSON.stringify({ url: result.url, message: "文件已上传。可在创作指令中引用该 URL。" });
      }
      case "libtv_download_results": {
        const sid = args.session_id as string;
        if (!sid) return "错误: session_id 是必填参数。";
        ctx.onProgress("正在从 LibTV 下载生成结果...");
        const result = await client.downloadResults(sid, ctx.projectDir, (args.prefix as string) ?? "");
        return JSON.stringify({
          outputDir: result.outputDir,
          downloaded: result.downloaded,
          total: result.total,
          message: result.total > 0
            ? `已下载 ${result.total} 个文件到 ${result.outputDir}`
            : "暂无可下载的结果，任务可能仍在生成中。",
        });
      }
      default:
        return `未知 LibTV 工具: ${toolName}`;
    }
  }
}

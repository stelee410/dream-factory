import { AGENT_TOOLS } from "@dreamfactory/core";

type AgentTool = (typeof AGENT_TOOLS)[number];

export type SlashPaletteCommand = {
  value: string;
  description: string;
  /** 仅在访谈模式显示 */
  interviewOnly?: boolean;
};

export type ToolPaletteRow = {
  name: string;
  description: string;
};

/** 终端内可直接输入的斜杠命令（客户端处理，非模型工具） */
export const SLASH_COMMANDS: SlashPaletteCommand[] = [
  { value: "/status", description: "打印当前项目目录中产物的加载状态（角色/档案/剧本/分镜/视频）" },
  { value: "/loop", description: "创建定时任务: /loop <间隔> [次数x] <prompt>  例: /loop 1m 查询进度" },
  { value: "/loops", description: "列出所有活跃的定时任务" },
  { value: "/login", description: "清除当前会话并回到登录界面（不删 .env 里的已存凭据）" },
  { value: "/logout", description: "退出登录并从当前目录 .env 移除 Linkyun API Key 等已存凭据" },
  { value: "/workspace", description: "查看并切换当前 Linkyun 工作区" },
  { value: "/quit", description: "退出 DreamFactory CLI" },
  { value: "/exit", description: "同 /quit，退出程序" },
  { value: "/done", description: "结束访谈并生成角色档案（访谈模式下至少需 3 轮对话）", interviewOnly: true },
];

function normalizeQuery(raw: string): string {
  return raw.slice(1).trim().toLowerCase();
}

function filterSlashCommands(query: string, interviewMode: boolean): SlashPaletteCommand[] {
  return SLASH_COMMANDS.filter((c) => {
    if (c.interviewOnly && !interviewMode) return false;
    const v = c.value.toLowerCase();
    if (!query) return true;
    return v.startsWith("/" + query) || v.replace(/^\//, "").startsWith(query);
  });
}

function filterTools(agentTools: readonly AgentTool[], query: string): ToolPaletteRow[] {
  const rows: ToolPaletteRow[] = agentTools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
  }));

  if (!query) return rows;

  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query)
  );
}

export function isSlashPaletteActive(rawInput: string): boolean {
  const t = rawInput.trimStart();
  return t.startsWith("/") && !t.includes(" ");
}

export function buildSlashPalette(
  rawInput: string,
  interviewMode: boolean,
  agentTools: readonly AgentTool[] = AGENT_TOOLS
): { commands: SlashPaletteCommand[]; tools: ToolPaletteRow[] } {
  const q = normalizeQuery(rawInput);
  return {
    commands: filterSlashCommands(q, interviewMode),
    tools: filterTools(agentTools, q),
  };
}

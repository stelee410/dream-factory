import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute, dirname } from "node:path";
import { execSync } from "node:child_process";
import type { ToolDefinition } from "../ai/index.js";
import type { DreamFactory } from "../context.js";
import type { CharacterProfile } from "../character/index.js";
import type { Outline } from "../script/index.js";
import { safeFetch } from "../api.js";
import { InterviewEngine } from "../interview/index.js";
import { ScriptEngine } from "../script/index.js";
import { StoryboardEngine } from "../storyboard/index.js";
import { VideoEngine } from "../video/index.js";
import { DIRECTOR_STYLES, mergeDirectorStyles, describeDirectorStyles } from "../director/index.js";
import { ProjectState, type DirectorStyleData } from "./project-state.js";
import type { SkillRegistry } from "../skills/index.js";

// ---- Tool definitions (OpenAI function calling schema) ----

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_project_status",
      description: "查看当前项目状态，包括哪些产物已生成（角色、档案、剧本、分镜、视频等）",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_characters",
      description: "列出可用的角色列表。需要先登录。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "select_character",
      description: "选择一个角色用于当前项目。传入角色的 code。",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "角色的 code 标识" },
        },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_interview",
      description: "开始/重新开始与角色的访谈。进入访谈模式后，用户的消息会直接与角色对话。需要先选择角色。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "end_interview",
      description: "结束当前访谈，根据对话记录生成角色档案（dossier）。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_theme",
      description: "设置短剧主题。",
      parameters: {
        type: "object",
        properties: {
          theme: { type: "string", description: "短剧主题描述" },
        },
        required: ["theme"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_director_style",
      description: `设置导演风格。可选的风格 id: ${DIRECTOR_STYLES.map((s) => `"${s.id}" (${s.name})`).join(", ")}。可多选，也可传入自定义描述。`,
      parameters: {
        type: "object",
        properties: {
          style_ids: {
            type: "array",
            items: { type: "string" },
            description: `风格 id 列表，可选值: ${DIRECTOR_STYLES.map((s) => s.id).join(", ")}`,
          },
          custom_description: {
            type: "string",
            description: "自定义风格描述（可选，当选择 custom 时填写）",
          },
        },
        required: ["style_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_outlines",
      description: "根据角色档案和主题生成 3 个剧本大纲候选。需要先有档案和主题。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_script",
      description: "根据选中的大纲生成完整剧本。传入大纲的索引（从 0 开始）。",
      parameters: {
        type: "object",
        properties: {
          outline_index: {
            type: "number",
            description: "选择的大纲索引（0, 1, 2）",
          },
        },
        required: ["outline_index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_storyboard",
      description: "根据剧本生成分镜图（包括每个镜头的 AI 图片）。需要先有剧本。这是一个耗时操作。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "regenerate_shot",
      description: "重新生成单个镜头的分镜图。传入镜头编号。",
      parameters: {
        type: "object",
        properties: {
          shot_number: {
            type: "number",
            description: "要重新生成的镜头编号（从 1 开始）",
          },
        },
        required: ["shot_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description: "根据分镜图生成视频。需要先有分镜图。这是一个非常耗时的操作（每个镜头需要几分钟）。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "regenerate_video_shot",
      description: "重新生成单个镜头的视频片段，然后自动重新拼接 final.mp4。传入镜头编号。需要先有分镜图和对应的分镜图片。",
      parameters: {
        type: "object",
        properties: {
          shot_number: {
            type: "number",
            description: "要重新生成视频的镜头编号（从 1 开始）",
          },
        },
        required: ["shot_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_shots",
      description: "调整分镜/视频的镜头顺序。传入新的镜头编号数组，表示期望的播放顺序。会同时更新分镜表和重新拼接 final.mp4（如果已有视频）。例如交换镜头6和7：传入 [1,2,3,4,5,7,6]。",
      parameters: {
        type: "object",
        properties: {
          shot_order: {
            type: "array",
            items: { type: "number" },
            description: "新的镜头编号顺序数组，必须包含所有现有镜头编号，例如 [1,2,3,5,4,6,7]",
          },
        },
        required: ["shot_order"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "view_dossier",
      description: "查看当前角色档案的详细内容。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "view_script",
      description: "查看当前剧本的详细内容。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "view_storyboard",
      description: "查看当前分镜表的概要信息。",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },

  // ---- File, Network & Shell tools ----

  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取工作目录下的文件内容。支持 .env、DREAMER.md 等配置文件及项目目录下的任意文本文件。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径（相对于工作目录）" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "写入或更新工作目录下的文件。可用于修改 .env、DREAMER.md 等配置文件。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件路径（相对于工作目录）" },
          content: { type: "string", description: "要写入的文件内容" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "列出工作目录下某个路径的文件和子目录。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "目录路径（相对于工作目录，默认 '.'）" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "http_request",
      description: "发送 HTTP 请求并返回响应。支持 GET/POST/PUT/PATCH/DELETE 等方法。可用于访问网页、调用 API、发送数据等。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "完整 URL" },
          method: { type: "string", description: "HTTP 方法（默认 GET）", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          headers: { type: "object", description: "自定义请求头（键值对）" },
          body: { type: "string", description: "请求体（POST/PUT/PATCH 时使用）" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_shell",
      description: "在工作目录下执行 shell 命令并返回输出。对于 rm、mv、sudo 等危险操作需用户确认（传入 confirmed=true）。超时 60 秒。",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "要执行的 shell 命令" },
          confirmed: { type: "boolean", description: "危险操作需设为 true 表示用户已确认（默认 false）" },
        },
        required: ["command"],
      },
    },
  },
];

// ---- Tool executor ----

export interface ToolContext {
  df: DreamFactory;
  state: ProjectState;
  interviewEngine: InterviewEngine | null;
  onInterviewStart: (engine: InterviewEngine) => void;
  onInterviewEnd: () => void;
  onProgress: (message: string) => void;
  skills?: SkillRegistry;
  workingDir: string;
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  switch (toolName) {
    case "get_project_status":
      return ctx.state.getStatusSummary();

    case "list_characters":
      return await listCharacters(ctx);

    case "select_character":
      return await selectCharacter(args.code as string, ctx);

    case "start_interview":
      return startInterview(ctx);

    case "end_interview":
      return await endInterview(ctx);

    case "set_theme":
      return setTheme(args.theme as string, ctx);

    case "set_director_style":
      return setDirectorStyle(
        args.style_ids as string[],
        args.custom_description as string | undefined,
        ctx
      );

    case "generate_outlines":
      return await generateOutlines(ctx);

    case "generate_script":
      return await generateScript(args.outline_index as number, ctx);

    case "generate_storyboard":
      return await generateStoryboard(ctx);

    case "regenerate_shot":
      return await regenerateShot(args.shot_number as number, ctx);

    case "generate_video":
      return await generateVideo(ctx);

    case "regenerate_video_shot":
      return await regenerateVideoShot(args.shot_number as number, ctx);

    case "reorder_shots":
      return await reorderShots(args.shot_order as number[], ctx);

    case "view_dossier":
      return viewDossier(ctx);

    case "view_script":
      return viewScript(ctx);

    case "view_storyboard":
      return viewStoryboard(ctx);

    case "read_file":
      return readLocalFile(args.path as string, ctx);

    case "write_file":
      return writeLocalFile(args.path as string, args.content as string, ctx);

    case "list_files":
      return listLocalFiles((args.path as string) ?? ".", ctx);

    case "http_request":
      return await httpRequest(
        args.url as string,
        (args.method as string) ?? "GET",
        (args.headers as Record<string, string>) ?? {},
        args.body as string | undefined,
      );

    case "run_shell":
      return runShell(args.command as string, !!args.confirmed, ctx);

    default: {
      if (ctx.skills) {
        const skillResult = await ctx.skills.executeTool(toolName, args, {
          projectDir: ctx.state.projectDir,
          onProgress: ctx.onProgress,
        });
        if (skillResult !== undefined) return skillResult;
      }
      return `未知工具: ${toolName}`;
    }
  }
}

// ---- Tool implementations ----

async function listCharacters(ctx: ToolContext): Promise<string> {
  if (!ctx.df.auth.isLoggedIn()) {
    return "错误: 尚未登录。请先让用户提供登录信息。";
  }
  const result = await ctx.df.character.list({ status: "active" });
  if (result.agents.length === 0) return "没有找到可用的角色。";

  const lines = result.agents.map(
    (a) => `- ${a.name} (code: ${a.code}): ${a.description}`
  );
  return `可用角色 (共 ${result.total} 个):\n${lines.join("\n")}`;
}

async function selectCharacter(code: string, ctx: ToolContext): Promise<string> {
  if (!ctx.df.auth.isLoggedIn()) {
    return "错误: 尚未登录。请先让用户提供登录信息。";
  }
  try {
    const agent = await ctx.df.character.getByCode(code);
    const profile = ctx.df.character.toProfile(agent);
    ctx.state.saveCharacter(profile);
    return `已选择角色: ${profile.name} (${profile.code})\n${profile.description}`;
  } catch (e: any) {
    return `选择角色失败: ${e.message}`;
  }
}

function startInterview(ctx: ToolContext): string {
  if (!ctx.state.character) {
    return "错误: 尚未选择角色。请先调用 select_character。";
  }
  if (!ctx.df.ai) {
    return "错误: AI 客户端未初始化（缺少 LLM_API_KEY，或沿用 OPENROUTER_API_KEY）。";
  }
  const engine = new InterviewEngine(ctx.df.ai, ctx.state.character);
  ctx.onInterviewStart(engine);
  return `已进入访谈模式。用户现在可以直接与「${ctx.state.character.name}」对话。用户输入 /done 或你判断访谈充分后，调用 end_interview 结束并生成档案。`;
}

async function endInterview(ctx: ToolContext): Promise<string> {
  if (!ctx.interviewEngine) {
    return "错误: 当前不在访谈模式中。";
  }
  if (ctx.interviewEngine.getTurnCount() < 3) {
    return "访谈轮数太少（至少需要 3 轮），请继续对话后再结束。";
  }
  ctx.onProgress("正在根据访谈记录生成角色档案...");
  const dossier = await ctx.interviewEngine.generateDossier();
  ctx.state.saveDossier(dossier);
  ctx.onInterviewEnd();
  return `角色档案已生成并保存。\n\n${JSON.stringify(dossier, null, 2)}`;
}

function setTheme(theme: string, ctx: ToolContext): string {
  ctx.state.saveTheme(theme);
  return `主题已设置: ${theme}`;
}

function setDirectorStyle(
  styleIds: string[],
  customDescription: string | undefined,
  ctx: ToolContext
): string {
  const selectedStyles = styleIds
    .map((id) => DIRECTOR_STYLES.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  if (selectedStyles.length === 0 && !customDescription) {
    return "错误: 未找到有效的风格 id。可选值: " + DIRECTOR_STYLES.map((s) => s.id).join(", ");
  }

  const prompt = mergeDirectorStyles(selectedStyles, customDescription);
  const label = describeDirectorStyles(selectedStyles, customDescription);

  const data: DirectorStyleData = {
    styles: styleIds,
    customDescription,
    prompt,
    label,
  };

  ctx.state.saveDirectorStyle(data);
  return `导演风格已设置: ${label}`;
}

async function generateOutlines(ctx: ToolContext): Promise<string> {
  if (!ctx.state.dossier || !ctx.state.character) {
    return "错误: 需要先有角色档案。请先完成访谈。";
  }
  if (!ctx.state.theme) {
    return "错误: 需要先设置主题。请调用 set_theme。";
  }
  if (!ctx.df.ai) {
    return "错误: AI 客户端未初始化。";
  }

  ctx.onProgress("正在生成剧本大纲...");
  const directorPrompt = ctx.state.directorStyle?.prompt ?? "";
  const engine = new ScriptEngine(ctx.df.ai, ctx.state.character, ctx.state.dossier, directorPrompt);
  const outlines = await engine.generateOutlines(ctx.state.theme);
  ctx.state.saveOutlines(outlines);

  const lines = outlines.map(
    (o, i) => `[${i}] 「${o.title}」 (${o.genre})\n    ${o.synopsis}\n    场景: ${o.scene_summaries.join(" → ")}`
  );
  return `已生成 ${outlines.length} 个大纲:\n\n${lines.join("\n\n")}`;
}

async function generateScript(outlineIndex: number, ctx: ToolContext): Promise<string> {
  if (!ctx.state.outlines || ctx.state.outlines.length === 0) {
    return "错误: 没有可用的大纲。请先调用 generate_outlines。";
  }
  if (outlineIndex < 0 || outlineIndex >= ctx.state.outlines.length) {
    return `错误: 大纲索引无效。有效范围: 0-${ctx.state.outlines.length - 1}`;
  }
  if (!ctx.state.dossier || !ctx.state.character || !ctx.df.ai) {
    return "错误: 缺少必要的上下文（角色/档案/AI）。";
  }

  ctx.onProgress("正在生成剧本...");
  const directorPrompt = ctx.state.directorStyle?.prompt ?? "";
  const engine = new ScriptEngine(ctx.df.ai, ctx.state.character, ctx.state.dossier, directorPrompt);
  const outline = ctx.state.outlines[outlineIndex]!;
  const script = await engine.generateScript(outline);
  const markdown = ScriptEngine.toMarkdown(script);
  ctx.state.saveScript(script, markdown);

  return `剧本已生成: 「${script.title}」\n${script.scenes.length} 个场景\n\n${markdown}`;
}

async function generateStoryboard(ctx: ToolContext): Promise<string> {
  if (!ctx.state.script) {
    return "错误: 没有剧本。请先生成剧本。";
  }
  if (!ctx.state.dossier || !ctx.state.character || !ctx.df.ai) {
    return "错误: 缺少必要的上下文。";
  }

  ctx.onProgress("正在生成分镜图（这可能需要几分钟）...");
  const directorPrompt = ctx.state.directorStyle?.prompt ?? "";
  const engine = new StoryboardEngine(ctx.df.ai, ctx.state.dossier, ctx.state.character, directorPrompt);
  const storyboard = await engine.generateStoryboard(
    ctx.state.script,
    ctx.state.storyboardDir,
    (shotNum, total) => ctx.onProgress(`生成分镜 ${shotNum}/${total}...`)
  );
  const markdown = StoryboardEngine.toMarkdown(storyboard);
  ctx.state.saveStoryboard(storyboard, markdown);

  return `分镜图已生成: ${storyboard.shots.length} 个镜头，总时长 ${storyboard.total_duration}s\n保存至: ${ctx.state.storyboardDir}`;
}

async function regenerateShot(shotNumber: number, ctx: ToolContext): Promise<string> {
  if (!ctx.state.storyboard) {
    return "错误: 没有分镜图。请先生成分镜图。";
  }
  if (!ctx.state.dossier || !ctx.state.character || !ctx.df.ai) {
    return "错误: 缺少必要的上下文。";
  }

  const shotIndex = ctx.state.storyboard.shots.findIndex((s) => s.shot_number === shotNumber);
  if (shotIndex === -1) {
    return `错误: 未找到镜头 #${shotNumber}。可用镜头: ${ctx.state.storyboard.shots.map((s) => s.shot_number).join(", ")}`;
  }

  ctx.onProgress(`正在重新生成镜头 #${shotNumber}...`);
  const directorPrompt = ctx.state.directorStyle?.prompt ?? "";
  const engine = new StoryboardEngine(ctx.df.ai, ctx.state.dossier, ctx.state.character, directorPrompt);
  const shot = ctx.state.storyboard.shots[shotIndex]!;
  const imageData = await engine.generateImage(shot);

  const { writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const filename = `shot_${String(shotNumber).padStart(2, "0")}.png`;
  const filePath = join(ctx.state.storyboardDir, filename);
  writeFileSync(filePath, imageData);
  shot.image_path = filePath;

  const markdown = StoryboardEngine.toMarkdown(ctx.state.storyboard);
  ctx.state.saveStoryboard(ctx.state.storyboard, markdown);

  return `镜头 #${shotNumber} 已重新生成，图片保存至: ${filePath}`;
}

async function regenerateVideoShot(shotNumber: number, ctx: ToolContext): Promise<string> {
  if (!ctx.state.storyboard) {
    return "错误: 没有分镜图。请先生成分镜图。";
  }

  const shot = ctx.state.storyboard.shots.find((s) => s.shot_number === shotNumber);
  if (!shot) {
    return `错误: 未找到镜头 #${shotNumber}。可用镜头: ${ctx.state.storyboard.shots.map((s) => s.shot_number).join(", ")}`;
  }
  if (!shot.image_path) {
    return `错误: 镜头 #${shotNumber} 没有分镜图片，请先生成分镜图。`;
  }

  ctx.onProgress(`正在重新生成镜头 #${shotNumber} 的视频（需要几分钟）...`);
  const engine = new VideoEngine();
  const clipPath = await engine.generateShotVideoPublic(
    shot,
    ctx.state.videosDir,
    (phase) => ctx.onProgress(`镜头 #${shotNumber} 视频: ${phase}`)
  );

  ctx.onProgress("正在重新拼接最终视频...");
  const finalPath = engine.recombineFinal(ctx.state.storyboard, ctx.state.videosDir);

  const videoOutput = ctx.state.videoOutput;
  if (videoOutput) {
    const clipEntry = videoOutput.clips.find((c) => c.shot_number === shotNumber);
    if (clipEntry) {
      clipEntry.clip_path = clipPath;
    }
    videoOutput.final_path = finalPath;
    ctx.state.saveVideoOutput(videoOutput);
  }

  return `镜头 #${shotNumber} 的视频已重新生成: ${clipPath}\n最终视频已重新拼接: ${finalPath}`;
}

async function reorderShots(shotOrder: number[], ctx: ToolContext): Promise<string> {
  if (!ctx.state.storyboard) {
    return "错误: 没有分镜图。请先生成分镜图。";
  }

  const storyboard = ctx.state.storyboard;
  const existingNumbers = storyboard.shots.map((s) => s.shot_number).sort((a, b) => a - b);
  const sortedOrder = [...shotOrder].sort((a, b) => a - b);

  if (sortedOrder.length !== existingNumbers.length ||
      sortedOrder.some((n, i) => n !== existingNumbers[i])) {
    return `错误: 传入的镜头编号必须包含所有现有镜头且不重复。\n现有镜头: [${existingNumbers.join(", ")}]\n传入: [${shotOrder.join(", ")}]`;
  }

  const shotMap = new Map(storyboard.shots.map((s) => [s.shot_number, s]));
  storyboard.shots = shotOrder.map((num) => shotMap.get(num)!);

  const markdown = StoryboardEngine.toMarkdown(storyboard);
  ctx.state.saveStoryboard(storyboard, markdown);

  const orderDesc = shotOrder.map((n) => `#${n}`).join(" → ");

  if (ctx.state.videoOutput) {
    ctx.onProgress("正在按新顺序重新拼接视频...");
    const engine = new VideoEngine();
    const finalPath = engine.recombineFinal(storyboard, ctx.state.videosDir);

    const videoOutput = ctx.state.videoOutput;
    const clipMap = new Map(videoOutput.clips.map((c) => [c.shot_number, c]));
    videoOutput.clips = shotOrder
      .map((num) => clipMap.get(num))
      .filter((c): c is NonNullable<typeof c> => c !== null);
    videoOutput.final_path = finalPath;
    ctx.state.saveVideoOutput(videoOutput);

    return `镜头顺序已调整: ${orderDesc}\n分镜表已更新，视频已按新顺序重新拼接: ${finalPath}`;
  }

  return `镜头顺序已调整: ${orderDesc}\n分镜表已更新。`;
}

async function generateVideo(ctx: ToolContext): Promise<string> {
  if (!ctx.state.storyboard) {
    return "错误: 没有分镜图。请先生成分镜图。";
  }

  ctx.onProgress("正在生成视频（每个镜头需要几分钟）...");
  const engine = new VideoEngine();
  const output = await engine.generateVideo(
    ctx.state.storyboard,
    ctx.state.videosDir,
    (shotNum, total, phase) => {
      if (shotNum === 0) {
        ctx.onProgress("正在拼接最终视频...");
      } else {
        ctx.onProgress(`视频生成 ${shotNum}/${total} (${phase})...`);
      }
    }
  );
  ctx.state.saveVideoOutput(output);

  return `视频已生成!\n${output.clips.length} 个镜头，总时长 ${output.total_duration}s\n最终视频: ${output.final_path}`;
}

function viewDossier(ctx: ToolContext): string {
  if (!ctx.state.dossier) return "尚未生成角色档案。";
  return JSON.stringify(ctx.state.dossier, null, 2);
}

function viewScript(ctx: ToolContext): string {
  if (!ctx.state.script) return "尚未生成剧本。";
  return ScriptEngine.toMarkdown(ctx.state.script);
}

function viewStoryboard(ctx: ToolContext): string {
  if (!ctx.state.storyboard) return "尚未生成分镜图。";
  return StoryboardEngine.toMarkdown(ctx.state.storyboard);
}

// ---- File tools ----

function resolveSafePath(relativePath: string, ctx: ToolContext): string | null {
  const base = resolve(ctx.workingDir);
  const target = resolve(base, relativePath);
  if (!target.startsWith(base)) return null;
  return target;
}

function readLocalFile(path: string, ctx: ToolContext): string {
  const target = resolveSafePath(path, ctx);
  if (!target) return "错误: 路径不能超出工作目录范围。";
  if (!existsSync(target)) return `错误: 文件不存在: ${path}`;
  try {
    return readFileSync(target, "utf-8");
  } catch (e: any) {
    return `读取文件失败: ${e.message}`;
  }
}

function writeLocalFile(path: string, content: string, ctx: ToolContext): string {
  const target = resolveSafePath(path, ctx);
  if (!target) return "错误: 路径不能超出工作目录范围。";
  try {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf-8");
    return `文件已写入: ${path}`;
  } catch (e: any) {
    return `写入文件失败: ${e.message}`;
  }
}

function listLocalFiles(path: string, ctx: ToolContext): string {
  const target = resolveSafePath(path, ctx);
  if (!target) return "错误: 路径不能超出工作目录范围。";
  if (!existsSync(target)) return `错误: 目录不存在: ${path}`;
  try {
    const entries = readdirSync(target);
    const lines = entries.map((name) => {
      try {
        const stat = statSync(join(target, name));
        return stat.isDirectory() ? `📁 ${name}/` : `📄 ${name}`;
      } catch {
        return `   ${name}`;
      }
    });
    return lines.length > 0 ? lines.join("\n") : "(空目录)";
  } catch (e: any) {
    return `列出文件失败: ${e.message}`;
  }
}

// ---- HTTP request tool ----

async function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<string> {
  try {
    const opts: RequestInit = { method, headers };
    if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      opts.body = body;
    }
    const res = await safeFetch(url, opts);
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const truncated = text.length > 8000 ? text.slice(0, 8000) + "\n...(truncated)" : text;
    return `HTTP ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\n${truncated}`;
  } catch (e: any) {
    return `HTTP 请求失败: ${e.message}`;
  }
}

// ---- Shell tool ----

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[^\s]*\s+)*\//,
  /\brm\s+-[^\s]*r/,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\b\s+/,
  /\b(chmod|chown)\s+(-[^\s]+\s+)*[0-7]{3,4}\s+\//,
  />\s*\/dev\//,
  /\bshutdown\b/,
  /\breboot\b/,
];

function isDangerous(cmd: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(cmd));
}

function runShell(command: string, confirmed: boolean, ctx: ToolContext): string {
  if (isDangerous(command) && !confirmed) {
    return `⚠️ 检测到危险命令: "${command}"\n请确认后使用 confirmed=true 参数重新调用。`;
  }
  try {
    const output = execSync(command, {
      cwd: ctx.workingDir,
      timeout: 60_000,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output || "(命令执行成功，无输出)";
  } catch (e: any) {
    const stderr = e.stderr ? `\nstderr: ${e.stderr}` : "";
    const stdout = e.stdout ? `\nstdout: ${e.stdout}` : "";
    return `命令执行失败 (exit ${e.status ?? "unknown"}):${stderr}${stdout}`;
  }
}

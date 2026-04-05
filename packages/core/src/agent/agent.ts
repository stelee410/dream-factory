import type { ToolChatMessage, AssistantToolMessage } from "../ai/index.js";
import type { DreamFactory } from "../context.js";
import { InterviewEngine } from "../interview/index.js";
import { ProjectState } from "./project-state.js";
import { AGENT_TOOLS, executeTool, type ToolContext } from "./tools.js";
import type { SkillRegistry } from "../skills/index.js";
import type { LoopScheduler } from "./loop-scheduler.js";
import { formatInterval as formatLoopInterval } from "./loop-scheduler.js";

const SYSTEM_PROMPT = `你是 DreamFactory 的 AI 导演助手。你帮助用户完成短剧制作的全流程：选角 → 访谈 → 设置主题和导演风格 → 生成剧本 → 生成分镜图 → 生成视频。

你的能力：
- 查看和管理项目状态
- 列出和选择角色（需要用户先登录）
- 与角色进行访谈以生成角色档案
- 设置短剧主题和导演风格
- 生成剧本大纲和完整剧本
- 生成分镜图（AI 图片）
- 生成视频（图片转视频）
- 查看已有的档案、剧本、分镜等产物
- 读写工作目录下的文件（.env、DREAMER.md 等配置文件）
- 发送 HTTP 请求（访问网页、调用 API）
- 执行 Shell 命令（在工作目录下运行系统命令）
- 创建定时任务（定期执行 prompt，如每分钟查询进度）

管道依赖关系：
1. 先选择角色 (select_character)
2. 进行访谈 (start_interview → 对话 → end_interview) 生成角色档案
3. 设置主题 (set_theme) 和导演风格 (set_director_style，可选)
4. 生成大纲 (generate_outlines) → 选择大纲生成剧本 (generate_script)
5. 生成分镜图 (generate_storyboard)
6. 生成视频 (generate_video)

如果用户想要修改中间环节（如重写剧本、重新生成分镜），可以直接调用对应工具。后续环节的产物会需要重新生成。

重要：DreamFactory 使用自己的身份文件命名：
- SOUL.md — 存放身份、system_prompt、邮箱协议
- DREAMER.md — 产品配置入口，引用 SOUL.md
每次启动时会自动加载这两个文件来确认身份。

请用中文与用户交流。当执行耗时操作时，先告知用户预计耗时。`;

export interface AgentCallbacks {
  onAssistantMessage: (message: string) => void;
  onToolProgress: (message: string) => void;
  onInterviewModeChange: (active: boolean, characterName?: string) => void;
}

export interface AgentOptions {
  skills?: SkillRegistry;
  dreamerPrompt?: string | null;
  soulPrompt?: string | null;
  loopScheduler?: LoopScheduler;
}

export class DreamFactoryAgent {
  private df: DreamFactory;
  private state: ProjectState;
  private callbacks: AgentCallbacks;
  private history: ToolChatMessage[] = [];
  private interviewEngine: InterviewEngine | null = null;
  private interviewMode = false;
  private skills?: SkillRegistry;
  private dreamerPrompt?: string | null;
  private soulPrompt?: string | null;
  loopScheduler?: LoopScheduler;

  // Async mutex: serialises processMessage calls so history stays consistent
  private _queue: Promise<string> = Promise.resolve("");

  constructor(df: DreamFactory, state: ProjectState, callbacks: AgentCallbacks, options?: AgentOptions) {
    this.df = df;
    this.state = state;
    this.callbacks = callbacks;
    this.skills = options?.skills;
    this.dreamerPrompt = options?.dreamerPrompt;
    this.soulPrompt = options?.soulPrompt;
    this.loopScheduler = options?.loopScheduler;
  }

  isInInterviewMode(): boolean {
    return this.interviewMode;
  }

  /**
   * Process a user message. Serialised via async mutex so concurrent
   * callers (user input + loop tasks) never interleave history writes.
   */
  async processMessage(userInput: string): Promise<string> {
    const prev = this._queue;
    let resolve!: (v: string) => void;
    this._queue = new Promise<string>((r) => { resolve = r; });

    // Wait for any previous call to finish
    await prev.catch(() => {});

    try {
      let result: string;
      if (this.interviewMode && this.interviewEngine) {
        result = await this.handleInterviewMessage(userInput);
      } else {
        result = await this.handleAgentMessage(userInput);
      }
      resolve(result);
      return result;
    } catch (e) {
      resolve("");
      throw e;
    }
  }

  private async handleInterviewMessage(userInput: string): Promise<string> {
    if (userInput.trim().toLowerCase() === "/done") {
      if (this.interviewEngine!.getTurnCount() < 3) {
        return "访谈轮数太少（至少需要 3 轮），请继续对话。";
      }
      this.callbacks.onToolProgress("正在根据访谈记录生成角色档案...");
      const dossier = await this.interviewEngine!.generateDossier();
      this.state.saveDossier(dossier);
      this.interviewMode = false;
      this.interviewEngine = null;
      this.callbacks.onInterviewModeChange(false);
      return `角色档案已生成并保存！\n\n基本信息: ${dossier.basics.name} (${dossier.basics.age}, ${dossier.basics.identity})\n性格: ${dossier.personality.map((p) => p.trait).join("、")}\n口头禅: ${dossier.speech_style.catchphrases.join("、")}\n\n你可以继续下一步操作（设置主题、导演风格等），或输入 /done 以外的内容与我交流。`;
    }

    const reply = await this.interviewEngine!.chat(userInput);
    return reply;
  }

  private async handleAgentMessage(userInput: string): Promise<string> {
    let systemContent = SYSTEM_PROMPT;

    if (this.skills) {
      systemContent += this.skills.describeAvailable();
    }
    if (this.soulPrompt) {
      systemContent += `\n\n## 身份定义 (SOUL.md)\n${this.soulPrompt}`;
    }
    if (this.dreamerPrompt) {
      systemContent += `\n\n## 产品配置 (DREAMER.md)\n${this.dreamerPrompt}`;
    }
    systemContent += `\n\n## 当前项目状态\n${this.state.getStatusSummary()}`;

    if (this.loopScheduler && this.loopScheduler.size > 0) {
      const loops = this.loopScheduler.list();
      const lines = loops.map(
        (t) => `- ${t.id}: 每${formatLoopInterval(t.intervalMs)}执行「${t.prompt}」(已运行 ${t.runCount} 次${t.maxRuns ? `/${t.maxRuns}` : ""})`,
      );
      systemContent += `\n\n## 活跃定时任务 (${loops.length} 个)\n${lines.join("\n")}`;
    }

    const systemMsg: ToolChatMessage = { role: "system", content: systemContent };

    this.history.push({ role: "user", content: userInput });

    const messages: ToolChatMessage[] = [systemMsg, ...this.history];

    const allTools = this.skills
      ? [...AGENT_TOOLS, ...this.skills.getAllTools()]
      : AGENT_TOOLS;

    const toolCtx: ToolContext = {
      df: this.df,
      state: this.state,
      interviewEngine: this.interviewEngine,
      onInterviewStart: (engine) => {
        this.interviewEngine = engine;
        this.interviewMode = true;
        this.callbacks.onInterviewModeChange(true, this.state.character?.name);
      },
      onInterviewEnd: () => {
        this.interviewMode = false;
        this.interviewEngine = null;
        this.callbacks.onInterviewModeChange(false);
      },
      onProgress: (msg) => this.callbacks.onToolProgress(msg),
      skills: this.skills,
      workingDir: this.state.projectDir,
      loopScheduler: this.loopScheduler,
    };

    let response = await this.df.ai!.chatWithTools(messages, allTools, {
      temperature: 0.5,
      max_tokens: 4096,
    });

    let assistantMsg = response.choices[0]?.message;
    if (!assistantMsg) throw new Error("No response from AI");

    // Tool calling loop — keep executing until the model stops requesting tools
    while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      this.history.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {}

        this.callbacks.onToolProgress(`执行工具: ${fnName}...`);

        let result: string;
        try {
          result = await executeTool(fnName, args, toolCtx);
        } catch (e: any) {
          result = `工具执行出错: ${e.message}`;
        }

        this.history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // If interview mode was just activated, break out so user can start chatting
      if (this.interviewMode) {
        const introMsg = assistantMsg.content ?? `已进入访谈模式。请开始与「${this.state.character?.name}」对话吧！输入 /done 结束访谈。`;
        this.history.push({ role: "assistant", content: introMsg });
        return introMsg;
      }

      response = await this.df.ai!.chatWithTools(
        [systemMsg, ...this.history],
        allTools,
        { temperature: 0.5, max_tokens: 4096 }
      );

      assistantMsg = response.choices[0]?.message;
      if (!assistantMsg) throw new Error("No response from AI");
    }

    const textContent = assistantMsg.content ?? "";
    this.history.push({ role: "assistant", content: textContent });
    return textContent;
  }

  /**
   * Login helper — sets auth session on the DreamFactory instance.
   */
  async login(username: string, password: string, workspaceCode?: string): Promise<string> {
    try {
      await this.df.auth.login({ username, password, workspace_code: workspaceCode });
      return `登录成功！欢迎 ${username}`;
    } catch (e: any) {
      return `登录失败: ${e.message}`;
    }
  }
}

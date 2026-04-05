import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import {
  DreamFactory,
  DreamFactoryAgent,
  ProjectState,
  resolveLlmFromEnv,
  AGENT_TOOLS,
  loadDreamerPrompt,
} from "@dreamfactory/core";
import type { AgentCallbacks } from "@dreamfactory/core";
import { SkillRegistry, LibTVSkill } from "@dreamfactory/core";
import { SplashBranding } from "./screens/StartupSplash.js";
import { Login } from "./screens/Login.js";
import { WorkspaceSelect } from "./screens/WorkspaceSelect.js";
import { removeLinkyunCredentialsFromLocalEnv } from "./linkyun-env.js";
import {
  buildSlashPalette,
  isSlashPaletteActive,
} from "./slash-palette.js";

interface Props {
  projectDirArg?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "progress";
  content: string;
}

const MAX_HISTORY = 100;

const PALETTE_DESC_MAX = 96;
/** 仅输入 `/` 时最多展示的 AI 工具行数，避免占满屏幕 */
const TOOL_PREVIEW_LIMIT = 12;

function truncatePaletteDesc(s: string, max = PALETTE_DESC_MAX): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function useInputHistory() {
  const historyRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const draftRef = useRef("");

  const push = useCallback((entry: string) => {
    const trimmed = entry.trim();
    if (!trimmed) return;
    const h = historyRef.current;
    if (h.length > 0 && h[h.length - 1] === trimmed) {
      indexRef.current = -1;
      return;
    }
    h.push(trimmed);
    if (h.length > MAX_HISTORY) h.shift();
    indexRef.current = -1;
  }, []);

  const up = useCallback((currentInput: string): string | null => {
    const h = historyRef.current;
    if (h.length === 0) return null;

    if (indexRef.current === -1) {
      draftRef.current = currentInput;
      indexRef.current = h.length - 1;
    } else if (indexRef.current > 0) {
      indexRef.current--;
    } else {
      return null;
    }
    return h[indexRef.current]!;
  }, []);

  const down = useCallback((): string | null => {
    const h = historyRef.current;
    if (indexRef.current === -1) return null;

    if (indexRef.current < h.length - 1) {
      indexRef.current++;
      return h[indexRef.current]!;
    }
    indexRef.current = -1;
    return draftRef.current;
  }, []);

  const reset = useCallback(() => {
    indexRef.current = -1;
  }, []);

  return { push, up, down, reset };
}

// ---- Main agent chat screen ----

export function AgentChat({ projectDirArg }: Props) {
  const { exit } = useApp();
  const [splashIntroDone, setSplashIntroDone] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [showWorkspaceSelect, setShowWorkspaceSelect] = useState(false);
  const envRestoreAttemptedRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashIntroDone(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const projectDir = useMemo(
    () => ProjectState.resolveProjectDir(projectDirArg),
    [projectDirArg]
  );

  const df = useMemo(
    () =>
      new DreamFactory({
        linkyunApiBase: process.env.LINKYUN_API_BASE ?? "https://linkyun.co",
        llm: resolveLlmFromEnv() ?? undefined,
      }),
    []
  );

  const state = useMemo(() => {
    const s = new ProjectState(projectDir);
    s.load();
    return s;
  }, [projectDir]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [interviewMode, setInterviewMode] = useState(false);
  const [interviewCharacter, setInterviewCharacter] = useState<string | null>(null);
  const history = useInputHistory();
  const [paletteHighlight, setPaletteHighlight] = useState(0);

  const skillRegistry = useMemo(() => {
    const registry = new SkillRegistry();
    registry.register(new LibTVSkill());
    return registry;
  }, []);

  const dreamerPrompt = useMemo(
    () => loadDreamerPrompt(projectDir),
    [projectDir]
  );

  const allTools = useMemo(
    () => [...AGENT_TOOLS, ...skillRegistry.getAllTools()],
    [skillRegistry]
  );

  const slashPalette = useMemo(
    () => buildSlashPalette(input, interviewMode, allTools),
    [input, interviewMode, allTools]
  );

  const slashPaletteOpen =
    loggedIn && !loading && isSlashPaletteActive(input);

  const slashPaletteVisible =
    slashPaletteOpen &&
    (slashPalette.commands.length > 0 || slashPalette.tools.length > 0);

  const toolQuery = input.slice(1).trim().toLowerCase();
  const toolsPreviewTruncated =
    !toolQuery && slashPalette.tools.length > TOOL_PREVIEW_LIMIT;
  const toolsToShow = toolsPreviewTruncated
    ? slashPalette.tools.slice(0, TOOL_PREVIEW_LIMIT)
    : slashPalette.tools;

  useEffect(() => {
    setPaletteHighlight(0);
  }, [input]);

  const callbacks: AgentCallbacks = useMemo(
    () => ({
      onAssistantMessage: (message: string) => {
        setMessages((prev) => [...prev, { role: "assistant", content: message }]);
      },
      onToolProgress: (message: string) => {
        setMessages((prev) => [...prev, { role: "progress", content: message }]);
      },
      onInterviewModeChange: (active: boolean, characterName?: string) => {
        setInterviewMode(active);
        setInterviewCharacter(active ? (characterName ?? null) : null);
      },
    }),
    []
  );

  const agent = useMemo(
    () =>
      new DreamFactoryAgent(df, state, callbacks, {
        skills: skillRegistry,
        dreamerPrompt,
      }),
    [df, state, callbacks, skillRegistry, dreamerPrompt]
  );

  // Show welcome messages after login
  useEffect(() => {
    if (!loggedIn) return;

    const welcomeLines: ChatMessage[] = [
      { role: "system", content: `项目目录: ${projectDir}` },
    ];

    const status = state.getStatus();
    if (status.hasCharacter || status.hasDossier || status.hasScript) {
      const parts: string[] = [];
      if (status.hasCharacter) parts.push("角色");
      if (status.hasDossier) parts.push("档案");
      if (status.hasScript) parts.push("剧本");
      if (status.hasStoryboard) parts.push("分镜");
      if (status.hasVideos) parts.push("视频");
      welcomeLines.push({
        role: "system",
        content: `已加载项目状态 — ${parts.join(" / ")}`,
      });
    }

    const availableSkills = skillRegistry.getAvailableSkills();
    if (availableSkills.length > 0) {
      welcomeLines.push({
        role: "system",
        content: `已加载 Skills: ${availableSkills.map((s) => s.name).join(", ")}`,
      });
    }

    if (dreamerPrompt) {
      welcomeLines.push({
        role: "system",
        content: "已加载 DREAMER.md 人格定义",
      });
    }

    welcomeLines.push({
      role: "system",
      content:
        "输入 / 打开命令与工具提示（Tab / ↑↓ 选择 · Enter 补全）；亦可自然语言与 AI 对话",
    });

    setMessages(welcomeLines);
  }, [loggedIn]);

  useInput((_, key) => {
    if (key.escape) exit();
    if (loading) return;

    const pal = buildSlashPalette(input, interviewMode, allTools);
    const paletteNav =
      slashPaletteOpen && pal.commands.length > 0;

    if (paletteNav) {
      const n = pal.commands.length;
      if (key.tab) {
        setPaletteHighlight((h) => (h + (key.shift ? -1 : 1) + n) % n);
        return;
      }
      if (key.upArrow) {
        setPaletteHighlight((h) => (h - 1 + n) % n);
        return;
      }
      if (key.downArrow) {
        setPaletteHighlight((h) => (h + 1) % n);
        return;
      }
    }

    if (key.upArrow) {
      const prev = history.up(input);
      if (prev !== null) setInput(prev);
    }
    if (key.downArrow) {
      const next = history.down();
      if (next !== null) setInput(next);
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || loading) return;
      history.push(trimmed);
      history.reset();
      setInput("");

      if (trimmed === "/quit" || trimmed === "/exit") {
        exit();
        return;
      }

      if (trimmed === "/logout") {
        df.auth.logout();
        removeLinkyunCredentialsFromLocalEnv(process.cwd());
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "已退出登录，并已从当前目录 .env 移除 Linkyun 凭据。" },
        ]);
        setLoggedIn(false);
        return;
      }

      if (trimmed === "/login") {
        df.auth.logout();
        setLoggedIn(false);
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "请重新登录（会话已清除，未自动修改 .env）。" },
        ]);
        return;
      }

      if (trimmed === "/workspace") {
        setShowWorkspaceSelect(true);
        return;
      }

      if (trimmed === "/status") {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: state.getStatusSummary() },
        ]);
        return;
      }

      if (!df.ai) {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "错误: 缺少 LLM_API_KEY（或未设置兼容项 OPENROUTER_API_KEY）。" },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setLoading(true);

      try {
        const reply = await agent.processMessage(trimmed);
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : "未知错误";
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `错误: ${errMsg}` },
        ]);
      }

      setLoading(false);
    },
    [loading, df, agent, state, exit]
  );

  const onChatInputChange = useCallback((v: string) => {
    setInput(v.replace(/\t/g, ""));
  }, []);

  const onChatInputSubmit = useCallback(
    (value: string) => {
      if (loading) return;
      const pal = buildSlashPalette(value, interviewMode, allTools);
      const trimmedLead = value.trimStart();
      if (
        isSlashPaletteActive(value) &&
        pal.commands.length > 0 &&
        !pal.commands.some((c) => c.value === trimmedLead)
      ) {
        const n = pal.commands.length;
        const pick = pal.commands[paletteHighlight % n]!;
        setInput(pick.value);
        return;
      }
      void handleSubmit(value);
    },
    [loading, interviewMode, paletteHighlight, handleSubmit]
  );

  useEffect(() => {
    if (!splashIntroDone || loggedIn || envRestoreAttemptedRef.current) return;
    envRestoreAttemptedRef.current = true;
    if (df.auth.tryRestoreFromEnv()) {
      setLoggedIn(true);
    }
  }, [splashIntroDone, loggedIn, df]);

  if (!loggedIn) {
    return (
      <Box flexDirection="column">
        <SplashBranding />
        {!splashIntroDone ? (
          <Box paddingLeft={3} paddingBottom={1}>
            <Text color="gray">
              <Spinner type="dots" /> 正在就绪…
            </Text>
          </Box>
        ) : (
          <Login
            df={df}
            compact
            onSuccess={() => setLoggedIn(true)}
          />
        )}
      </Box>
    );
  }

  if (showWorkspaceSelect) {
    return (
      <Box flexDirection="column" padding={1}>
        <WorkspaceSelect
          df={df}
          onDone={(switched, session) => {
            setShowWorkspaceSelect(false);
            if (switched && session) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `已切换工作区至 ${session.workspaceCode}`,
                },
              ]);
            }
          }}
        />
      </Box>
    );
  }

  const visibleMessages = messages.slice(-20);

  const modeLabel = interviewMode
    ? `访谈模式 — 与「${interviewCharacter ?? "角色"}」对话中 (输入 /done 结束)`
    : "Agent 模式";

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        DreamFactory AI Agent
      </Text>
      <Text dimColor>{modeLabel}</Text>
      <Box height={1} />

      {visibleMessages.map((msg, i) => (
        <Box key={i} marginBottom={msg.role === "assistant" ? 1 : 0}>
          {msg.role === "system" ? (
            <Text dimColor>{msg.content}</Text>
          ) : msg.role === "progress" ? (
            <Text color="blue">[...] {msg.content}</Text>
          ) : msg.role === "user" ? (
            <Text>
              <Text color="yellow" bold>
                你:{" "}
              </Text>
              {msg.content}
            </Text>
          ) : (
            <Text>
              <Text color="green" bold>
                {interviewMode && interviewCharacter
                  ? `${interviewCharacter}: `
                  : "AI: "}
              </Text>
              {msg.content}
            </Text>
          )}
        </Box>
      ))}

      {loading && (
        <Box>
          <Text>
            <Spinner type="dots" />{" "}
            <Text dimColor>
              {interviewMode ? `${interviewCharacter ?? "角色"}正在思考...` : "AI 正在处理..."}
            </Text>
          </Text>
        </Box>
      )}

      {!loading && (
        <Box flexDirection="column">
          {slashPaletteVisible && (
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="gray"
              paddingX={1}
              paddingY={0}
              marginBottom={1}
            >
              <Text dimColor>
                命令与工具 · Tab / Shift+Tab / ↑↓ 选择斜杠命令 · Enter
                补全 · 再 Enter 执行
              </Text>
              <Box height={1} />
              {slashPalette.commands.length > 0 && (
                <Box flexDirection="column">
                  <Text bold color="cyan">
                    斜杠命令
                  </Text>
                  {slashPalette.commands.map((c, i) => {
                    const hi =
                      slashPalette.commands.length > 0 &&
                      i ===
                        paletteHighlight %
                          slashPalette.commands.length;
                    return (
                      <Box key={c.value} flexDirection="row" flexWrap="wrap">
                        <Text color={hi ? "yellow" : "white"} bold={hi}>
                          {hi ? "› " : "  "}
                          {c.value}
                        </Text>
                        <Text dimColor>
                          {" "}
                          — {truncatePaletteDesc(c.description)}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              )}
              {slashPalette.tools.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color="magenta">
                    AI 工具（口语描述即可，以下为内部名称）
                  </Text>
                  {toolsToShow.map((t) => (
                    <Box key={t.name} flexDirection="column" marginBottom={0}>
                      <Text color="cyan">{t.name}</Text>
                      <Text dimColor>
                        {"  "}
                        {truncatePaletteDesc(t.description, 120)}
                      </Text>
                    </Box>
                  ))}
                  {toolsPreviewTruncated && (
                    <Text dimColor>
                      … 另有{" "}
                      {slashPalette.tools.length - TOOL_PREVIEW_LIMIT}{" "}
                      项，请继续输入以筛选（例如 /get、/video）
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          )}
          <Box>
            <Text color="yellow" bold>
              {">"}{" "}
            </Text>
            <TextInput
              value={input}
              onChange={onChatInputChange}
              onSubmit={onChatInputSubmit}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}

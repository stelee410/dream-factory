import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import {
  DreamFactory,
  DreamFactoryAgent,
  ProjectState,
} from "@dreamfactory/core";
import type { AgentCallbacks } from "@dreamfactory/core";

interface Props {
  projectDirArg?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "progress";
  content: string;
}

const MAX_HISTORY = 100;

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

// ---- Login sub-screen (shown before agent chat) ----

function AgentLogin({
  df,
  onSuccess,
}: {
  df: DreamFactory;
  onSuccess: () => void;
}) {
  const { exit } = useApp();
  const [field, setField] = useState<"username" | "password">("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((_, key) => {
    if (key.escape) exit();
  });

  const submit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await df.auth.login({ username, password });
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登录失败");
      setLoading(false);
    }
  }, [df, username, password, onSuccess]);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> 正在登录...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        DreamFactory AI Agent — 登录
      </Text>
      <Text dimColor>连接到 linkyun.co</Text>
      <Box height={1} />

      {error && (
        <Box>
          <Text color="red">x {error}</Text>
        </Box>
      )}

      <Box>
        <Text>用户名: </Text>
        {field === "username" ? (
          <TextInput
            value={username}
            onChange={setUsername}
            onSubmit={() => setField("password")}
          />
        ) : (
          <Text>{username}</Text>
        )}
      </Box>

      <Box>
        <Text>密码: </Text>
        {field === "password" ? (
          <TextInput
            value={password}
            onChange={setPassword}
            onSubmit={submit}
            mask="*"
          />
        ) : (
          <Text dimColor>{"·".repeat(password.length || 0)}</Text>
        )}
      </Box>

      <Box height={1} />
      <Text dimColor>按 Enter 继续，Esc 退出</Text>
    </Box>
  );
}

// ---- Main agent chat screen ----

export function AgentChat({ projectDirArg }: Props) {
  const { exit } = useApp();
  const [loggedIn, setLoggedIn] = useState(false);

  const projectDir = useMemo(
    () => ProjectState.resolveProjectDir(projectDirArg),
    [projectDirArg]
  );

  const df = useMemo(
    () =>
      new DreamFactory({
        linkyunApiBase: process.env.LINKYUN_API_BASE ?? "https://linkyun.co",
        openrouterApiKey: process.env.OPENROUTER_API_KEY,
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
    () => new DreamFactoryAgent(df, state, callbacks),
    [df, state, callbacks]
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

    welcomeLines.push({
      role: "system",
      content: "/status 查看状态 | /quit 退出 | 直接输入消息与 AI 助手对话",
    });

    setMessages(welcomeLines);
  }, [loggedIn]);

  useInput((_, key) => {
    if (key.escape) exit();
    if (loading) return;
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
          { role: "system", content: "错误: 缺少 OPENROUTER_API_KEY 环境变量。" },
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

  // Show login screen first
  if (!loggedIn) {
    return <AgentLogin df={df} onSuccess={() => setLoggedIn(true)} />;
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
        <Box>
          <Text color="yellow" bold>
            {">"}{" "}
          </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
          />
        </Box>
      )}
    </Box>
  );
}

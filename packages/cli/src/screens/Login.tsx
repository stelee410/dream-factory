import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type { DreamFactory, AuthSession } from "@dreamfactory/core";
import { saveLinkyunCredentialsToLocalEnv } from "../linkyun-env.js";

interface Props {
  df: DreamFactory;
  onSuccess: (session: AuthSession) => void;
  /** 为 true 时不渲染顶部标题（由上方的 SplashBranding 承担） */
  compact?: boolean;
}

type Field = "username" | "password";
type Phase = "credentials" | "savePrompt";

export function Login({ df, onSuccess, compact = false }: Props) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>("credentials");
  const [field, setField] = useState<Field>("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((_, key) => {
    if (!key.escape) return;
    if (phase === "savePrompt") {
      setPhase("credentials");
      setField("password");
      return;
    }
    exit();
  });

  const runLogin = useCallback(
    async (saveToEnv: boolean) => {
      setLoading(true);
      setError(null);
      try {
        await df.auth.login({ username, password });
        const session = df.auth.getSession()!;
        if (saveToEnv) {
          saveLinkyunCredentialsToLocalEnv(process.cwd(), session);
        }
        onSuccess(session);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Login failed");
        setLoading(false);
        setPhase("credentials");
        setField("password");
      }
    },
    [df, username, password, onSuccess]
  );

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1} paddingLeft={compact ? 3 : 1}>
        <Text>
          <Spinner type="dots" /> 正在登录…
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingLeft={compact ? 3 : 1} paddingBottom={1}>
      {!compact && (
        <>
          <Text bold color="cyan">
            🎬 DreamFactory — Login
          </Text>
          <Text dimColor>Connect to linkyun.co</Text>
          <Box height={1} />
        </>
      )}
      {compact && (
        <>
          <Text bold color="cyan">
            登录
          </Text>
          <Text dimColor>连接到 linkyun.co</Text>
          <Box height={1} />
        </>
      )}

      {error && (
        <Box>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {phase === "credentials" && (
        <>
          <Box>
            <Text>Username: </Text>
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
            <Text>Password: </Text>
            {field === "password" ? (
              <TextInput
                value={password}
                onChange={setPassword}
                onSubmit={() => setPhase("savePrompt")}
                mask="*"
              />
            ) : (
              <Text dimColor>{"·".repeat(password.length || 0)}</Text>
            )}
          </Box>
        </>
      )}

      {phase === "savePrompt" && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            用户 <Text bold>{username}</Text>
          </Text>
          <Box height={1} />
          <Text dimColor>
            是否写入当前目录 .env？（仅保存 API Key 与 Workspace，不保存密码）
          </Text>
          <SelectInput
            items={[
              { label: "是，保存到 .env", value: true },
              { label: "否，仅本次运行", value: false },
            ]}
            onSelect={(item) => void runLogin(item.value)}
          />
        </Box>
      )}

      <Box height={1} />
      <Text dimColor>
        {phase === "savePrompt"
          ? "Enter 选择，Esc 返回修改密码"
          : "Enter 继续，Esc 退出"}
      </Text>
    </Box>
  );
}

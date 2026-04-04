import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type { DreamFactory, WorkspaceInfo, AuthSession } from "@dreamfactory/core";
import { saveLinkyunCredentialsToLocalEnv } from "../linkyun-env.js";

interface Props {
  df: DreamFactory;
  onDone: (switched: boolean, session?: AuthSession) => void;
}

type Phase = "loading" | "select" | "switching" | "savePrompt";

export function WorkspaceSelect({ df, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [switchedSession, setSwitchedSession] = useState<AuthSession | null>(null);

  const currentCode = df.auth.getSession()?.workspaceCode ?? "";

  useInput((_, key) => {
    if (key.escape) {
      onDone(false);
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await df.auth.listWorkspaces();
        if (cancelled) return;
        setWorkspaces(list);
        setPhase("select");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "获取工作区列表失败");
        setPhase("select");
      }
    })();
    return () => { cancelled = true; };
  }, [df]);

  if (phase === "loading") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>
          <Spinner type="dots" /> 正在获取工作区列表…
        </Text>
      </Box>
    );
  }

  if (phase === "switching") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>
          <Spinner type="dots" /> 正在切换工作区…
        </Text>
      </Box>
    );
  }

  if (phase === "savePrompt" && switchedSession) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>
          已切换到工作区 <Text bold color="green">{switchedSession.workspaceCode}</Text>
        </Text>
        <Box height={1} />
        <Text dimColor>是否将新工作区写入当前目录 .env？</Text>
        <SelectInput
          items={[
            { label: "是，保存到 .env", value: true },
            { label: "否，仅本次运行", value: false },
          ]}
          onSelect={(item) => {
            if (item.value) {
              saveLinkyunCredentialsToLocalEnv(process.cwd(), switchedSession);
            }
            onDone(true, switchedSession);
          }}
        />
        <Box height={1} />
        <Text dimColor>Enter 选择，Esc 取消</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">✗ {error}</Text>
        <Box height={1} />
        <Text dimColor>Esc 返回</Text>
      </Box>
    );
  }

  if (workspaces.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>
          当前工作区: <Text bold color="green">{currentCode}</Text>
        </Text>
        <Text dimColor>未找到其他可用工作区。</Text>
        <Box height={1} />
        <Text dimColor>Esc 返回</Text>
      </Box>
    );
  }

  const items = workspaces.map((w) => ({
    label: `${w.name} (${w.code})${w.role ? ` · ${w.role}` : ""}${w.code === currentCode ? " ← 当前" : ""}`,
    value: w.code,
  }));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">切换工作区</Text>
      <Text>
        当前: <Text bold color="green">{currentCode}</Text>
      </Text>
      <Box height={1} />
      <SelectInput
        items={items}
        onSelect={async (item) => {
          if (item.value === currentCode) {
            onDone(false);
            return;
          }
          setPhase("switching");
          try {
            const session = await df.auth.switchWorkspace(item.value);
            setSwitchedSession(session);
            setPhase("savePrompt");
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "切换工作区失败");
            setPhase("select");
          }
        }}
      />
      <Box height={1} />
      <Text dimColor>↑↓ 选择 · Enter 确认 · Esc 取消</Text>
    </Box>
  );
}

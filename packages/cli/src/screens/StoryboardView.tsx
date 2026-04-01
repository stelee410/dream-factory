import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type {
  StoryboardEngine,
  Script,
  Storyboard,
  CharacterProfile,
} from "@dreamfactory/core";

interface Props {
  engine: StoryboardEngine;
  script: Script;
  character: CharacterProfile;
  outDir: string;
  onComplete: (storyboard: Storyboard) => void;
}

export function StoryboardView({
  engine,
  script,
  character,
  outDir,
  onComplete,
}: Props) {
  const { exit } = useApp();
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [phase, setPhase] = useState<"breakdown" | "images" | "done">("breakdown");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) exit();
    if (storyboard && input === "s") {
      onComplete(storyboard);
    }
  });

  useEffect(() => {
    (async () => {
      try {
        setPhase("images");
        const sb = await engine.generateStoryboard(script, outDir, (cur, tot) => {
          setProgress({ current: cur, total: tot });
        });
        setStoryboard(sb);
        setPhase("done");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Storyboard generation failed");
      }
    })();
  }, []);

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">✗ {error}</Text>
      </Box>
    );
  }

  if (phase !== "done") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          🎬 DreamFactory — 生成分镜
        </Text>
        <Box height={1} />
        {phase === "breakdown" && (
          <Text>
            <Spinner type="dots" /> 正在拆解剧本为镜头列表...
          </Text>
        )}
        {phase === "images" && (
          <Box flexDirection="column">
            <Text>
              <Spinner type="dots" /> 正在生成分镜图...{" "}
              {progress.total > 0
                ? `(${progress.current}/${progress.total})`
                : ""}
            </Text>
            {progress.total > 0 && (
              <Text dimColor>
                {"█".repeat(progress.current)}
                {"░".repeat(Math.max(0, progress.total - progress.current))}
              </Text>
            )}
          </Box>
        )}
      </Box>
    );
  }

  if (!storyboard) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 分镜预览: {storyboard.title}
      </Text>
      <Text dimColor>
        总镜头: {storyboard.shots.length} | 总时长: {storyboard.total_duration}s
      </Text>
      <Box height={1} />

      {storyboard.shots.map((shot) => (
        <Box key={shot.shot_number} flexDirection="column" marginBottom={1}>
          <Text bold>
            镜头 {String(shot.shot_number).padStart(2, "0")} [{shot.shot_type}]{" "}
            <Text dimColor>({shot.duration}s) 场景{shot.scene_ref}</Text>
          </Text>
          <Text>  {shot.description}</Text>
          {shot.dialogue && (
            <Text color="yellow">  💬 {shot.dialogue}</Text>
          )}
          <Text dimColor>
            {"  "}
            {shot.image_path ? (
              <Text color="green">✓ {shot.image_path}</Text>
            ) : (
              <Text color="red">✗ 图片生成失败</Text>
            )}
          </Text>
        </Box>
      ))}

      <Box height={1} />
      <Text color="yellow">按 s 保存分镜数据并继续，Esc 退出</Text>
    </Box>
  );
}

import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { VideoEngine, Storyboard, VideoOutput } from "@dreamfactory/core";

interface Props {
  engine: VideoEngine;
  storyboard: Storyboard;
  outDir: string;
  onComplete: (output: VideoOutput) => void;
}

function parsePhase(phase: string): { base: string; segInfo?: string } {
  const segMatch = phase.match(/^(submit|poll)_seg_(\d+\/\d+)$/);
  if (segMatch) {
    return { base: segMatch[1]!, segInfo: segMatch[2] };
  }
  return { base: phase };
}

export function VideoGeneration({ engine, storyboard, outDir, onComplete }: Props) {
  const { exit } = useApp();
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: "init" });
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<VideoOutput | null>(null);

  useInput((input, key) => {
    if (key.escape) exit();
    if (output && input === "s") {
      onComplete(output);
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const result = await engine.generateVideo(
          storyboard,
          outDir,
          (cur, tot, phase) => setProgress({ current: cur, total: tot, phase })
        );
        setOutput(result);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Video generation failed");
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

  if (!output) {
    const { base, segInfo } = parsePhase(progress.phase);

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          🎬 DreamFactory — 生成视频
        </Text>
        <Box height={1} />
        {base === "submit" ? (
          <Box flexDirection="column">
            <Text>
              <Spinner type="dots" /> 提交 Seedance 视频任务... ({progress.current}/{progress.total})
              {segInfo && <Text dimColor> [子片段 {segInfo}]</Text>}
            </Text>
            <Text dimColor>
              {"█".repeat(progress.current)}
              {"░".repeat(Math.max(0, progress.total - progress.current))}
            </Text>
          </Box>
        ) : base === "poll" ? (
          <Box flexDirection="column">
            <Text>
              <Spinner type="dots" /> 等待镜头 {progress.current} 视频生成完成...（Seedance 处理中）
              {segInfo && <Text dimColor> [子片段 {segInfo}]</Text>}
            </Text>
            <Text dimColor>
              {"█".repeat(progress.current - 1)}
              {"▓".repeat(1)}
              {"░".repeat(Math.max(0, progress.total - progress.current))}
            </Text>
          </Box>
        ) : progress.phase === "concat" ? (
          <Text>
            <Spinner type="dots" /> 正在拼接视频...
          </Text>
        ) : (
          <Text>
            <Spinner type="dots" /> 准备中...
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 视频生成完成！
      </Text>
      <Box height={1} />

      {output.clips.map((clip) => {
        const shot = storyboard.shots.find((s) => s.shot_number === clip.shot_number);
        const isStitched = shot?.gen_mode === "frame_stitch";
        return (
          <Box key={clip.shot_number}>
            <Text>
              <Text color="green">✓</Text> 镜头 {String(clip.shot_number).padStart(2, "0")}{" "}
              ({clip.duration}s)
              {isStitched && <Text color="blue"> [拼接]</Text>}
              {clip.dialogue && <Text dimColor> 💬 {clip.dialogue}</Text>}
            </Text>
          </Box>
        );
      })}

      <Box height={1} />
      <Text bold color="green">
        ✓ 最终视频: {output.final_path}
      </Text>
      <Text dimColor>
        总时长: {output.total_duration}s | {output.clips.length} 个镜头
      </Text>
      <Box height={1} />
      <Text color="yellow">按 s 完成</Text>
    </Box>
  );
}

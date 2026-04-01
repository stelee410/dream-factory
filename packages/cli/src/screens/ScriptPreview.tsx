import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import Spinner from "ink-spinner";
import type { ScriptEngine, Script, Outline, CharacterProfile } from "@dreamfactory/core";

interface Props {
  engine: ScriptEngine;
  character: CharacterProfile;
  outline: Outline;
  onComplete: (script: Script) => void;
}

export function ScriptPreview({ engine, character, outline, onComplete }: Props) {
  const { exit } = useApp();
  const [script, setScript] = useState<Script | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) exit();
    if (script && input === "s") {
      onComplete(script);
    }
  });

  useEffect(() => {
    engine
      .generateScript(outline)
      .then((s) => {
        setScript(s);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to generate script");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> 正在生成完整剧本「{outline.title}」...
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={1}>
        <Text color="red">✗ {error}</Text>
      </Box>
    );
  }

  if (!script) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 剧本预览
      </Text>
      <Box height={1} />

      <Text bold underline>
        {script.title}
      </Text>
      <Text>
        类型: <Text color="yellow">{script.genre}</Text> | 角色: <Text color="green">{character.name}</Text>
      </Text>
      <Text>概要: {script.synopsis}</Text>
      <Box height={1} />

      {script.scenes.map((scene) => (
        <Box key={scene.scene_number} flexDirection="column" marginBottom={1}>
          <Text bold>
            ── 场景 {scene.scene_number}: {scene.location} ({scene.time}) ──
          </Text>
          <Text italic dimColor>
            {scene.description}
          </Text>
          <Text dimColor>
            镜头: {scene.camera_hints.join(" | ")}
          </Text>
          {scene.dialogues.map((d, i) => (
            <Box key={i} marginLeft={2}>
              <Text>
                <Text bold color="green">{d.character}</Text>
                <Text dimColor> ({d.emotion}, {d.action})</Text>
                : {d.line}
              </Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box height={1} />
      <Text color="yellow">按 s 保存剧本，Esc 退出</Text>
    </Box>
  );
}

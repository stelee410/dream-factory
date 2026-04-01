import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type { ScriptEngine, Outline, CharacterProfile } from "@dreamfactory/core";

interface Props {
  engine: ScriptEngine;
  character: CharacterProfile;
  theme: string;
  onSelect: (outline: Outline) => void;
}

export function OutlineSelect({ engine, character, theme, onSelect }: Props) {
  const { exit } = useApp();
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useInput((_, key) => {
    if (key.escape) exit();
  });

  useEffect(() => {
    engine
      .generateOutlines(theme)
      .then((o) => {
        setOutlines(o);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to generate outlines");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> 正在为 {character.name} 生成「{theme}」主题的剧情大纲...
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

  const items = outlines.map((o, i) => ({
    label: `${i + 1}. ${o.title} [${o.genre}]`,
    value: i.toString(),
  }));

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 选择剧情大纲
      </Text>
      <Text>
        角色: <Text color="green">{character.name}</Text> | 主题: <Text color="yellow">{theme}</Text>
      </Text>
      <Box height={1} />

      {outlines.map((o, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Text bold>
            {i + 1}. {o.title} <Text dimColor>[{o.genre}]</Text>
          </Text>
          <Text>   {o.synopsis}</Text>
          {o.scene_summaries.map((s, j) => (
            <Text key={j} dimColor>
              {"   "}场景{j + 1}: {s}
            </Text>
          ))}
        </Box>
      ))}

      <Box height={1} />
      <Text dimColor>选择一个大纲:</Text>
      <SelectInput
        items={items}
        onSelect={(item) => onSelect(outlines[parseInt(item.value)]!)}
      />
    </Box>
  );
}

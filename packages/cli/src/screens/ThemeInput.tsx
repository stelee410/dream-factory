import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { CharacterProfile } from "@dreamfactory/core";

interface Props {
  character: CharacterProfile;
  onSubmit: (theme: string) => void;
}

export function ThemeInput({ character, onSubmit }: Props) {
  const { exit } = useApp();
  const [theme, setTheme] = useState("");

  useInput((_, key) => {
    if (key.escape) exit();
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 设定短剧主题
      </Text>
      <Text>
        角色: <Text bold color="green">{character.name}</Text>
      </Text>
      <Box height={1} />
      <Text dimColor>
        输入短剧主题/方向，例如：「职场逆袭」「甜蜜恋爱」「悬疑推理」「日常治愈」
      </Text>
      <Box height={1} />
      <Box>
        <Text>主题: </Text>
        <TextInput
          value={theme}
          onChange={setTheme}
          onSubmit={(v) => {
            const trimmed = v.trim();
            if (trimmed) onSubmit(trimmed);
          }}
        />
      </Box>
      <Box height={1} />
      <Text dimColor>按 Enter 确认，Esc 退出</Text>
    </Box>
  );
}

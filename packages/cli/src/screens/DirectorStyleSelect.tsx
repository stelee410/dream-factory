import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import type { DirectorStyle } from "@dreamfactory/core";
import { DIRECTOR_STYLES } from "@dreamfactory/core";

interface Props {
  onSelect: (styles: DirectorStyle[], customDescription?: string) => void;
}

export function DirectorStyleSelect({ onSelect }: Props) {
  const { exit } = useApp();
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"select" | "custom-input">("select");
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState(false);

  const styles = DIRECTOR_STYLES;

  useInput((input, key) => {
    if (phase !== "select") return;

    if (key.escape) exit();

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(styles.length - 1, c + 1));
    }

    // Space to toggle selection
    if (input === " ") {
      const style = styles[cursor]!;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(style.id)) {
          next.delete(style.id);
        } else {
          next.add(style.id);
        }
        return next;
      });
    }

    // Enter to confirm
    if (key.return) {
      if (selected.size === 0) return;

      if (selected.has("custom")) {
        setPhase("custom-input");
        return;
      }

      const selectedStyles = styles.filter((s) => selected.has(s.id));
      onSelect(selectedStyles);
    }
  });

  if (phase === "custom-input") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          🎬 DreamFactory — 自定义导演风格
        </Text>
        <Box height={1} />
        <Text>请输入你的自定义风格描述：</Text>
        {customError && <Text color="red">风格描述不能为空，请输入内容</Text>}
        <Box>
          <Text color="green">&gt; </Text>
          <TextInput
            value={customText}
            onChange={setCustomText}
            onSubmit={(text) => {
              if (!text.trim()) {
                setCustomError(true);
                return;
              }
              setCustomError(false);
              const selectedStyles = styles.filter((s) => selected.has(s.id));
              onSelect(selectedStyles, text.trim());
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 选择导演风格
      </Text>
      <Text dimColor>（空格多选，回车确认，支持混合风格）</Text>
      <Box height={1} />

      {styles.map((style, i) => {
        const isSelected = selected.has(style.id);
        const isCursor = i === cursor;
        return (
          <Box key={style.id}>
            <Text>
              {isCursor ? "❯ " : "  "}
              <Text color={isSelected ? "green" : "white"}>
                {isSelected ? "◉" : "○"}
              </Text>
              {" "}
              <Text bold={isCursor}>
                {style.name}
              </Text>
              <Text dimColor>
                {" "}({style.name_en})
                {style.traits.length > 0 && ` — ${style.traits.join("、")}`}
              </Text>
            </Text>
          </Box>
        );
      })}

      <Box height={1} />
      {selected.size > 0 && (
        <Text color="yellow">
          已选: {styles.filter((s) => selected.has(s.id)).map((s) => s.name).join(" + ")}
        </Text>
      )}
    </Box>
  );
}

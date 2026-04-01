import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { InterviewEngine, CharacterDossier, CharacterProfile } from "@dreamfactory/core";

interface Props {
  engine: InterviewEngine;
  character: CharacterProfile;
  onComplete: (dossier: CharacterDossier) => void;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

const MIN_TURNS = 5;

export function Interview({ engine, character, onComplete }: Props) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: `开始与 ${character.name} 的深度访谈。输入 /done 结束访谈并生成角色档案。（建议至少进行 ${MIN_TURNS} 轮对话）`,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((_, key) => {
    if (key.escape) exit();
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || loading) return;

      setInput("");

      if (trimmed === "/done") {
        if (engine.getTurnCount() < MIN_TURNS) {
          setError(`请至少进行 ${MIN_TURNS} 轮对话后再结束（当前 ${engine.getTurnCount()} 轮）`);
          return;
        }
        setGenerating(true);
        setError(null);
        try {
          const dossier = await engine.generateDossier();
          onComplete(dossier);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : "Failed to generate profile");
          setGenerating(false);
        }
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setLoading(true);
      setError(null);

      try {
        const reply = await engine.chat(trimmed);
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "AI request failed");
      }
      setLoading(false);
    },
    [loading, engine, onComplete]
  );

  if (generating) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> 正在根据访谈记录生成角色档案...
        </Text>
      </Box>
    );
  }

  // Show last 15 messages to keep the screen readable
  const visibleMessages = messages.slice(-15);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — 角色访谈: {character.name}
      </Text>
      <Text dimColor>
        对话轮数: {engine.getTurnCount()}/{MIN_TURNS} | 输入 /done 结束访谈
      </Text>
      <Box height={1} />

      {visibleMessages.map((msg, i) => (
        <Box key={i} marginBottom={msg.role === "assistant" ? 1 : 0}>
          {msg.role === "system" ? (
            <Text dimColor italic>
              {msg.content}
            </Text>
          ) : msg.role === "user" ? (
            <Text>
              <Text color="yellow" bold>你: </Text>
              {msg.content}
            </Text>
          ) : (
            <Text>
              <Text color="green" bold>{character.name}: </Text>
              {msg.content}
            </Text>
          )}
        </Box>
      ))}

      {loading && (
        <Box>
          <Text>
            <Spinner type="dots" />{" "}
            <Text dimColor>{character.name} 正在思考...</Text>
          </Text>
        </Box>
      )}

      {error && (
        <Box>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {!loading && (
        <Box>
          <Text color="yellow" bold>你: </Text>
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
      )}
    </Box>
  );
}

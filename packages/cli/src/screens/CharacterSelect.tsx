import React, { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import type { DreamFactory, CharacterProfile, Agent } from "@dreamfactory/core";

interface Props {
  df: DreamFactory;
  onSelect: (character: CharacterProfile) => void;
}

export function CharacterSelect({ df, onSelect }: Props) {
  const { exit } = useApp();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) exit();
  });

  useEffect(() => {
    df.character
      .list({ status: "active" })
      .then((res) => {
        setAgents(res.agents);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load characters");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> Loading characters...
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

  if (agents.length === 0) {
    return (
      <Box padding={1}>
        <Text color="yellow">No active characters found.</Text>
      </Box>
    );
  }

  const items = agents.map((a) => ({
    label: `${a.name} (${a.code})`,
    value: a.id.toString(),
  }));

  const handleSelect = (item: { value: string }) => {
    const agent = agents.find((a) => a.id.toString() === item.value);
    if (agent) {
      onSelect(df.character.toProfile(agent));
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — Select Character
      </Text>
      <Text dimColor>Choose a digital character for your short drama</Text>
      <Box height={1} />
      <SelectInput items={items} onSelect={handleSelect} />
    </Box>
  );
}

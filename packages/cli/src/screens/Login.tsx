import React, { useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { DreamFactory, AuthSession } from "@dreamfactory/core";

interface Props {
  df: DreamFactory;
  onSuccess: (session: AuthSession) => void;
}

type Field = "username" | "password";

export function Login({ df, onSuccess }: Props) {
  const { exit } = useApp();
  const [field, setField] = useState<Field>("username");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) exit();
  });

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await df.auth.login({ username, password });
      const session = df.auth.getSession()!;
      onSuccess(session);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box padding={1}>
        <Text>
          <Spinner type="dots" /> Logging in...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        🎬 DreamFactory — Login
      </Text>
      <Text dimColor>Connect to linkyun.co</Text>
      <Box height={1} />

      {error && (
        <Box>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

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
            onSubmit={submit}
            mask="*"
          />
        ) : (
          <Text dimColor>{"·".repeat(password.length || 0)}</Text>
        )}
      </Box>

      <Box height={1} />
      <Text dimColor>Press Enter to continue, Esc to quit</Text>
    </Box>
  );
}

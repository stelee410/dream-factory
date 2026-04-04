import React, { useState, useMemo } from "react";
import { Box, Text } from "ink";
import {
  DreamFactory,
  InterviewEngine,
  ScriptEngine,
  StoryboardEngine,
  VideoEngine,
  mergeDirectorStyles,
  describeDirectorStyles,
  resolveLlmFromEnv,
} from "@dreamfactory/core";
import type {
  AuthSession,
  CharacterProfile,
  CharacterDossier,
  DirectorStyle,
  Outline,
  Script,
  Storyboard,
  VideoOutput,
} from "@dreamfactory/core";
import { SplashBranding, StartupSplash } from "./screens/StartupSplash.js";
import { Login } from "./screens/Login.js";
import { CharacterSelect } from "./screens/CharacterSelect.js";
import { WorkspaceSelect } from "./screens/WorkspaceSelect.js";
import { Interview } from "./screens/Interview.js";
import { DossierView } from "./screens/DossierView.js";
import { ThemeInput } from "./screens/ThemeInput.js";
import { DirectorStyleSelect } from "./screens/DirectorStyleSelect.js";
import { OutlineSelect } from "./screens/OutlineSelect.js";
import { ScriptPreview } from "./screens/ScriptPreview.js";
import { StoryboardView } from "./screens/StoryboardView.js";
import { VideoGeneration } from "./screens/VideoGeneration.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Screen =
  | "splash"
  | "login"
  | "character-select"
  | "interview"
  | "dossier"
  | "theme-input"
  | "director-style"
  | "outline-select"
  | "script-preview"
  | "storyboard"
  | "video"
  | "done";

function makeProjectDir(): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "_",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const dir = join(process.cwd(), "dreamfactory", "projects", ts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [interviewEngine, setInterviewEngine] = useState<InterviewEngine | null>(null);
  const [dossier, setDossier] = useState<CharacterDossier | null>(null);
  const [theme, setTheme] = useState("");
  const [directorStylePrompt, setDirectorStylePrompt] = useState("");
  const [directorStyleLabel, setDirectorStyleLabel] = useState("");
  const [scriptEngine, setScriptEngine] = useState<ScriptEngine | null>(null);
  const [selectedOutline, setSelectedOutline] = useState<Outline | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [storyboardEngine, setStoryboardEngine] = useState<StoryboardEngine | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [videoEngine] = useState(() => new VideoEngine());
  const [videoOutput, setVideoOutput] = useState<VideoOutput | null>(null);

  // Unified project directory — created once per run
  const [projectDir, setProjectDir] = useState("");
  const [workspacePicker, setWorkspacePicker] = useState(false);

  const df = useMemo(
    () =>
      new DreamFactory({
        linkyunApiBase: process.env.LINKYUN_API_BASE ?? "https://linkyun.co",
        llm: resolveLlmFromEnv() ?? undefined,
      }),
    []
  );

  if (screen === "splash") {
    return (
      <StartupSplash
        onDone={() => {
          if (df.auth.tryRestoreFromEnv()) {
            setSession(df.auth.getSession()!);
            setScreen("character-select");
          } else {
            setScreen("login");
          }
        }}
      />
    );
  }

  if (screen === "login") {
    return (
      <Box flexDirection="column">
        <SplashBranding />
        <Login
          df={df}
          compact
          onSuccess={(s) => {
            setSession(s);
            setScreen("character-select");
          }}
        />
      </Box>
    );
  }

  if (screen === "character-select") {
    if (workspacePicker) {
      return (
        <Box flexDirection="column" padding={1}>
          <WorkspaceSelect
            df={df}
            onDone={(switched, newSession) => {
              setWorkspacePicker(false);
              if (switched && newSession) {
                setSession(newSession);
              }
            }}
          />
        </Box>
      );
    }
    return (
      <CharacterSelect
        key={session?.workspaceCode ?? "ws"}
        df={df}
        onOpenWorkspaceSwitch={() => setWorkspacePicker(true)}
        onSelect={(c) => {
          setCharacter(c);
          if (!df.ai) return;
          setInterviewEngine(new InterviewEngine(df.ai, c));
          const dir = makeProjectDir();
          setProjectDir(dir);
          writeFileSync(
            join(dir, "character.json"),
            JSON.stringify(c, null, 2),
            "utf-8"
          );
          setScreen("interview");
        }}
      />
    );
  }

  if (screen === "interview" && interviewEngine && character) {
    return (
      <Interview
        engine={interviewEngine}
        character={character}
        onComplete={(d) => {
          setDossier(d);
          writeFileSync(
            join(projectDir, "dossier.json"),
            JSON.stringify(d, null, 2),
            "utf-8"
          );
          setScreen("dossier");
        }}
      />
    );
  }

  if (screen === "dossier" && dossier) {
    return (
      <DossierView
        dossier={dossier}
        savedPath={join(projectDir, "dossier.json")}
        onContinue={() => setScreen("theme-input")}
      />
    );
  }

  if (screen === "theme-input" && character) {
    return (
      <ThemeInput
        character={character}
        onSubmit={(t) => {
          setTheme(t);
          setScreen("director-style");
        }}
      />
    );
  }

  if (screen === "director-style") {
    return (
      <DirectorStyleSelect
        onSelect={(styles: DirectorStyle[], customDescription?: string) => {
          const prompt = mergeDirectorStyles(styles, customDescription);
          const label = describeDirectorStyles(styles, customDescription);
          setDirectorStylePrompt(prompt);
          setDirectorStyleLabel(label);

          // Save director style selection
          writeFileSync(
            join(projectDir, "director-style.json"),
            JSON.stringify({ styles: styles.map((s) => s.id), customDescription, prompt, label }, null, 2),
            "utf-8"
          );

          if (df.ai && dossier && character) {
            setScriptEngine(new ScriptEngine(df.ai, character, dossier, prompt));
          }
          setScreen("outline-select");
        }}
      />
    );
  }

  if (screen === "outline-select" && scriptEngine && character) {
    return (
      <OutlineSelect
        engine={scriptEngine}
        character={character}
        theme={theme}
        onSelect={(o) => {
          setSelectedOutline(o);
          setScreen("script-preview");
        }}
      />
    );
  }

  if (screen === "script-preview" && scriptEngine && character && selectedOutline) {
    return (
      <ScriptPreview
        engine={scriptEngine}
        character={character}
        outline={selectedOutline}
        onComplete={(s) => {
          setScript(s);
          // Save script to project dir
          writeFileSync(
            join(projectDir, "script.json"),
            JSON.stringify(s, null, 2),
            "utf-8"
          );
          writeFileSync(
            join(projectDir, "script.md"),
            ScriptEngine.toMarkdown(s),
            "utf-8"
          );

          if (df.ai && dossier) {
            setStoryboardEngine(new StoryboardEngine(df.ai, dossier, character, directorStylePrompt));
          }
          setScreen("storyboard");
        }}
      />
    );
  }

  if (screen === "storyboard" && storyboardEngine && script && character) {
    const sbDir = join(projectDir, "storyboard");
    return (
      <StoryboardView
        engine={storyboardEngine}
        script={script}
        character={character}
        outDir={sbDir}
        onComplete={(sb) => {
          setStoryboard(sb);
          writeFileSync(
            join(sbDir, "storyboard.json"),
            JSON.stringify(sb, null, 2),
            "utf-8"
          );
          writeFileSync(
            join(sbDir, "storyboard.md"),
            StoryboardEngine.toMarkdown(sb),
            "utf-8"
          );
          setScreen("video");
        }}
      />
    );
  }

  if (screen === "video" && storyboard) {
    const vidDir = join(projectDir, "videos");
    return (
      <VideoGeneration
        engine={videoEngine}
        storyboard={storyboard}
        outDir={vidDir}
        onComplete={(output) => {
          setVideoOutput(output);
          setScreen("done");
        }}
      />
    );
  }

  if (screen === "done") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">
          🎬 DreamFactory — 完成！
        </Text>
        <Box height={1} />
        <Text bold>项目目录: {projectDir}/</Text>
        <Box height={1} />
        <Text bold>产出文件:</Text>
        <Text color="green">  ✓ dossier.json        — 角色档案</Text>
        <Text color="green">  ✓ director-style.json  — 导演风格</Text>
        <Text color="green">  ✓ script.json          — 剧本 (JSON)</Text>
        <Text color="green">  ✓ script.md            — 剧本 (可读版)</Text>
        <Text color="green">  ✓ storyboard/          — 分镜图 + storyboard.json + storyboard.md</Text>
        {videoOutput && (
          <>
            <Text color="green">  ✓ videos/final.mp4     — 最终视频</Text>
            <Text dimColor>
              {"    "}
              {videoOutput.clips.length} 个镜头, 总时长 {videoOutput.total_duration}s
            </Text>
          </>
        )}
        <Box height={1} />
        <Text>
          角色: <Text bold color="green">{character?.name}</Text> | 主题: <Text bold color="yellow">{theme}</Text>
          {directorStyleLabel && (
            <Text> | 风格: <Text bold color="magenta">{directorStyleLabel}</Text></Text>
          )}
        </Text>
        <Text dimColor>感谢使用 DreamFactory!</Text>
      </Box>
    );
  }

  return (
    <Box padding={1}>
      <Text color="red">缺少 LLM 配置：请设置 LLM_API_KEY（或沿用 OPENROUTER_API_KEY）。</Text>
    </Box>
  );
}

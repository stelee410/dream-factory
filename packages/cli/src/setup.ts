import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const GLOBAL_DIR = join(homedir(), ".dreamfactory");
const GLOBAL_ENV = join(GLOBAL_DIR, ".env");

const ENV_KEYS = [
  { key: "LINKYUN_API_BASE", prompt: "Linkyun API Base URL", defaultVal: "https://linkyun.co" },
  { key: "OPENROUTER_API_KEY", prompt: "OpenRouter API Key (for AI generation)", defaultVal: "" },
  { key: "SEEDANCE_API_KEY", prompt: "Seedance API Key (for video generation)", defaultVal: "" },
  { key: "WAN_API_KEY", prompt: "Wan2.7 API Key (for storyboard images)", defaultVal: "" },
];

function generateEnvContent(values: Record<string, string>): string {
  const lines = [
    "# DreamFactory global configuration",
    "# Local .env in working directory overrides these values",
    "",
  ];
  for (const { key, prompt } of ENV_KEYS) {
    lines.push(`# ${prompt}`);
    lines.push(`${key}=${values[key] ?? ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

function parseExistingEnv(): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(GLOBAL_ENV)) return values;
  try {
    const content = readFileSync(GLOBAL_ENV, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      values[key] = val;
    }
  } catch { /* ignore */ }
  return values;
}

/**
 * Non-interactive: create ~/.dreamfactory/.env template if it doesn't exist.
 */
export function ensureGlobalEnv(): void {
  if (existsSync(GLOBAL_ENV)) return;
  mkdirSync(GLOBAL_DIR, { recursive: true });
  const values: Record<string, string> = {};
  for (const { key, defaultVal } of ENV_KEYS) {
    values[key] = defaultVal;
  }
  writeFileSync(GLOBAL_ENV, generateEnvContent(values), "utf-8");
  console.log(`Created global config: ${GLOBAL_ENV}`);
  console.log(`Run "dreamfactory init" to configure API keys.`);
}

/**
 * Interactive setup: prompt user for each API key.
 */
export async function interactiveSetup(): Promise<void> {
  const existing = parseExistingEnv();

  console.log("\nDreamFactory — Initial Setup\n");
  console.log(`Config file: ${GLOBAL_ENV}`);
  console.log("Press Enter to keep existing/default value.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  const values: Record<string, string> = {};

  for (const { key, prompt, defaultVal } of ENV_KEYS) {
    const current = existing[key] ?? defaultVal;
    const display = key.includes("KEY") && current && current !== defaultVal
      ? current.slice(0, 8) + "..."
      : current;
    const hint = display ? ` [${display}]` : "";
    const answer = await ask(`  ${prompt}${hint}: `);
    values[key] = answer.trim() || current;
  }

  rl.close();

  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(GLOBAL_ENV, generateEnvContent(values), "utf-8");

  console.log(`\nConfig saved to ${GLOBAL_ENV}`);

  const missing = ENV_KEYS.filter(({ key, defaultVal }) =>
    !values[key] || values[key] === defaultVal
  ).filter(({ key }) => key !== "LINKYUN_API_BASE");

  if (missing.length > 0) {
    console.log(`\nNote: ${missing.map((m) => m.key).join(", ")} not set.`);
    console.log(`You can edit ${GLOBAL_ENV} later or override with a local .env file.`);
  } else {
    console.log("\nAll keys configured. Run `dreamfactory` to start!");
  }
}

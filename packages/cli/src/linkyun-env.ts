import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuthSession } from "@dreamfactory/core";
import {
  isExpectedLinkyunApiKeyShape,
  LINKYUN_API_KEY_FORMAT_HINT,
} from "./linkyun-api-key-format.js";

export const LINKYUN_ENV_COMMENT = "# Linkyun login (DreamFactory CLI — keep out of git)";

const KEYS = ["LINKYUN_API_KEY", "LINKYUN_WORKSPACE_CODE", "LINKYUN_USERNAME"] as const;

function quoteEnvValue(v: string): string {
  if (/[\s#'"]/.test(v)) return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return v;
}

function upsertKey(content: string, key: string, value: string): string {
  const lines = content.length ? content.split("\n") : [];
  const out: string[] = [];
  let found = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    const lineKey = eq === -1 ? "" : trimmed.slice(0, eq).trim();
    if (lineKey === key) {
      if (!found) {
        out.push(`${key}=${quoteEnvValue(value)}`);
        found = true;
      }
      continue;
    }
    out.push(line);
  }
  if (!found) {
    if (out.length && out[out.length - 1] !== "") out.push("");
    out.push(`${key}=${quoteEnvValue(value)}`);
  }
  return out.join("\n");
}

/**
 * Write Linkyun session to cwd `.env` (merge; preserves other entries).
 * Stores API key + workspace code (+ username for display). Never stores password.
 */
export function saveLinkyunCredentialsToLocalEnv(cwd: string, session: AuthSession): void {
  const envPath = join(cwd, ".env");
  let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

  if (!content.includes(LINKYUN_ENV_COMMENT)) {
    content = content.replace(/\s*$/, "");
    if (content.length) content += "\n\n";
    content += `${LINKYUN_ENV_COMMENT}\n`;
    content += `# LINKYUN_API_KEY: ${LINKYUN_API_KEY_FORMAT_HINT}\n`;
  }

  if (!isExpectedLinkyunApiKeyShape(session.apiKey)) {
    console.warn(
      `[dreamfactory] LINKYUN_API_KEY 形态异常（当前长度 ${session.apiKey.length}）。` +
        ` 正式环境一般为 ${LINKYUN_API_KEY_FORMAT_HINT}。请确认 LINKYUN_API_BASE 指向 linkyun 服务而非其它代理/mock。`
    );
  }

  content = upsertKey(content, "LINKYUN_API_KEY", session.apiKey);
  content = upsertKey(content, "LINKYUN_WORKSPACE_CODE", session.workspaceCode);
  content = upsertKey(content, "LINKYUN_USERNAME", session.username);

  writeFileSync(envPath, content.replace(/\s*$/, "") + "\n", "utf-8");

  process.env.LINKYUN_API_KEY = session.apiKey;
  process.env.LINKYUN_WORKSPACE_CODE = session.workspaceCode;
  process.env.LINKYUN_USERNAME = session.username;
}

/**
 * Remove saved Linkyun keys from cwd `.env`. No-op if file missing.
 */
export function removeLinkyunCredentialsFromLocalEnv(cwd: string): void {
  const envPath = join(cwd, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split("\n");
  const keySet = new Set<string>(KEYS);
  const out = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed === LINKYUN_ENV_COMMENT || trimmed.startsWith("# Linkyun login")) return false;
    const eq = trimmed.indexOf("=");
    const lineKey = eq === -1 ? "" : trimmed.slice(0, eq).trim();
    return !keySet.has(lineKey);
  });

  writeFileSync(envPath, out.join("\n").replace(/\s*$/, "") + "\n", "utf-8");

  delete process.env.LINKYUN_API_KEY;
  delete process.env.LINKYUN_WORKSPACE_CODE;
  delete process.env.LINKYUN_USERNAME;
}

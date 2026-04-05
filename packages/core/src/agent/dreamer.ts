import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DREAMER_FILENAME = "DREAMER.md";
const SOUL_FILENAME = "SOUL.md";

function loadFileFromDirs(filename: string, projectDir?: string): string | null {
  const candidates = [join(process.cwd(), filename)];

  if (projectDir) {
    const projPath = join(resolve(projectDir), filename);
    if (projPath !== candidates[0]) candidates.push(projPath);
  }

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8").trim();
        if (content) return content;
      } catch { /* ignore */ }
    }
  }

  return null;
}

/**
 * Load the DREAMER.md persona/config file.
 *
 * Search order:
 *   1. Current working directory
 *   2. Project directory (if provided and different from cwd)
 */
export function loadDreamerPrompt(projectDir?: string): string | null {
  return loadFileFromDirs(DREAMER_FILENAME, projectDir);
}

/**
 * Load the SOUL.md identity file (system_prompt + protocol).
 *
 * Search order:
 *   1. Current working directory
 *   2. Project directory (if provided and different from cwd)
 */
export function loadSoulPrompt(projectDir?: string): string | null {
  return loadFileFromDirs(SOUL_FILENAME, projectDir);
}

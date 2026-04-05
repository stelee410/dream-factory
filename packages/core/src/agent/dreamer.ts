import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DREAMER_FILENAME = "DREAMER.md";

/**
 * Load the DREAMER.md persona definition file.
 *
 * Search order:
 *   1. Current working directory
 *   2. Project directory (if provided and different from cwd)
 *
 * Returns the file contents as a string, or null if not found.
 */
export function loadDreamerPrompt(projectDir?: string): string | null {
  const candidates = [join(process.cwd(), DREAMER_FILENAME)];

  if (projectDir) {
    const projPath = join(resolve(projectDir), DREAMER_FILENAME);
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

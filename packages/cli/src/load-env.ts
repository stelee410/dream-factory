import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
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
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // file not found, skip
  }
}

// Local .env (CWD) takes priority — load it first so its keys are set,
// then global fills in anything still missing.
loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(join(homedir(), ".dreamfactory", ".env"));

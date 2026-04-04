#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GLOBAL_DIR = join(homedir(), ".dreamfactory");
const GLOBAL_ENV = join(GLOBAL_DIR, ".env");

if (existsSync(GLOBAL_ENV)) {
  process.exit(0);
}

mkdirSync(GLOBAL_DIR, { recursive: true });

const content = `# DreamFactory — global configuration (~/.dreamfactory/.env)
# A local .env in your project directory overrides keys below (see .env.example in repo).

# --- linkyun.co ---
LINKYUN_API_BASE=https://linkyun.co

# Session keys are normally written by CLI login to your project .env, not here.
# Uncomment only if you want the same linkyun session in every workspace:
# LINKYUN_API_KEY=
# LINKYUN_WORKSPACE_CODE=
# LINKYUN_USERNAME=

# --- Third-party APIs ---
# OpenRouter (text / agent): https://openrouter.ai/keys
OPENROUTER_API_KEY=

# Seedance (video)
SEEDANCE_API_KEY=

# Wan (storyboard images)
WAN_API_KEY=
`;

writeFileSync(GLOBAL_ENV, content, "utf-8");
console.log(`\n  DreamFactory: Created global config at ${GLOBAL_ENV}`);
console.log(`  Run "dreamfactory init" to configure API keys.\n`);

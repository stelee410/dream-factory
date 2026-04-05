#!/usr/bin/env node
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { homedir } = require("node:os");

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

# --- LLM (OpenAI-compatible chat; defaults target OpenRouter) ---
# https://openrouter.ai/keys — or any gateway with /v1/chat/completions
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-sonnet-4
LLM_API_KEY=

# Seedance (video)
SEEDANCE_API_KEY=

# Wan (storyboard images)
WAN_API_KEY=

# LibTV (AI creation platform skill)
# Get your access_key from https://www.liblib.tv
LIBTV_ACCESS_KEY=
`;

writeFileSync(GLOBAL_ENV, content, "utf-8");
console.log(`\n  DreamFactory: Created global config at ${GLOBAL_ENV}`);
console.log(`  Run "dreamfactory init" to configure API keys.\n`);

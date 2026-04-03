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

const content = `# DreamFactory global configuration
# Local .env in working directory overrides these values

# Linkyun API Base URL
LINKYUN_API_BASE=https://linkyun.co

# OpenRouter API Key (for AI generation)
OPENROUTER_API_KEY=

# Seedance API Key (for video generation)
SEEDANCE_API_KEY=

# Wan2.7 API Key (for storyboard images)
WAN_API_KEY=
`;

writeFileSync(GLOBAL_ENV, content, "utf-8");
console.log(`\n  DreamFactory: Created global config at ${GLOBAL_ENV}`);
console.log(`  Run "dreamfactory init" to configure API keys.\n`);

import "./load-env.js";
import React from "react";
import { render } from "ink";

const args = process.argv.slice(2);
const command = args[0];

if (command === "--help" || command === "-h") {
  console.log(`
DreamFactory — AI-powered short drama generator

Usage:
  dreamfactory                  Start agent mode (new project)
  dreamfactory last             Resume the most recent project
  dreamfactory <path>           Resume a specific project directory
  dreamfactory init             Configure API keys (saved to ~/.dreamfactory/.env)
  dreamfactory linear           Start linear mode (guided step-by-step)

Options:
  --help, -h                    Show this help message
  --version, -v                 Show version

Config:
  Global config:  ~/.dreamfactory/.env  (shared across all workspaces)
  Local override: .env                  (in current directory, takes priority)

Projects are saved under dreamfactory/projects/ in the current directory.
`);
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log("dreamfactory 0.1.0");
  process.exit(0);
}

if (command === "init") {
  const { interactiveSetup } = await import("./setup.js");
  await interactiveSetup();
  process.exit(0);
}

if (command === "linear") {
  const { App } = await import("./App.js");
  render(<App />);
} else {
  const { AgentChat } = await import("./AgentChat.js");
  const projectDirArg = command; // undefined → new, "last" → most recent, or a path
  render(<AgentChat projectDirArg={projectDirArg} />);
}

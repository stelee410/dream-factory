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
  dreamfactory linear           Start linear mode (guided step-by-step)

Options:
  --help, -h                    Show this help message
  --version, -v                 Show version

Environment:
  Create a .env file in your working directory with:
    LINKYUN_API_BASE=https://linkyun.co
    OPENROUTER_API_KEY=sk-or-v1-xxx
    SEEDANCE_API_KEY=xxx           (for video generation)
    WAN_API_KEY=xxx                (for storyboard images)

Projects are saved under .dreamfactory/projects/ in the current directory.
`);
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  console.log("dreamfactory 0.1.0");
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

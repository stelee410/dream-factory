#!/usr/bin/env node
import "dotenv/config";
import React from "react";
import { render } from "ink";

const args = process.argv.slice(2);

if (args[0] === "agent") {
  const { AgentChat } = await import("./AgentChat.js");
  const projectDirArg = args[1]; // undefined, "last", or a path
  render(<AgentChat projectDirArg={projectDirArg} />);
} else {
  const { App } = await import("./App.js");
  render(<App />);
}

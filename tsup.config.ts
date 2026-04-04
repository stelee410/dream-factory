import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8"));

const banner = `#!/usr/bin/env node
import { createRequire as __createRequire } from 'module';
import { fileURLToPath as __fileURLToPath } from 'url';
import { dirname as __dirname_ } from 'path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
`;

export default defineConfig({
  entry: ["packages/cli/src/index.tsx"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  bundle: true,
  splitting: false,
  sourcemap: false,
  noExternal: [/.*/],
  banner: { js: banner },
  define: {
    __DREAMFACTORY_VERSION__: JSON.stringify(version),
  },
  esbuildOptions(options) {
    options.alias = {
      "@dreamfactory/core": "./packages/core/src/index.ts",
      "react-devtools-core": "./packages/cli/src/shims/devtools-noop.ts",
    };
  },
});

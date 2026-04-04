import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { config } from "dotenv";
import { homedir } from "node:os";
import { safeFetch } from "../api.js";
import { resolveLlmFromEnv } from "../ai/index.js";
import {
  DEFAULT_OPENROUTER_VIDEO_MODEL,
  fileToImageDataUrl,
  findLatestDreamFactoryProject,
  getFirstStoryboardFrame,
  requestOpenRouterImageToVideoAlpha,
  resolveOpenRouterVideoApiBase,
} from "./openrouter-video.js";

config();
config({ path: join(process.cwd(), ".env") });
config({ path: join(homedir(), ".dreamfactory", ".env") });

/** Set `RUN_OPENROUTER_VIDEO_INTEGRATION=1` to exercise the live OpenRouter Video Alpha API. */
const integrationEnabled = process.env.RUN_OPENROUTER_VIDEO_INTEGRATION === "1";

function videoApiBaseFromEnv(): string {
  const llm = resolveLlmFromEnv();
  if (!llm) throw new Error("resolveLlmFromEnv() returned null");
  const raw =
    process.env.OPENROUTER_VIDEO_API_BASE?.trim() || resolveOpenRouterVideoApiBase(llm.baseUrl);
  return raw.replace(/\/$/, "");
}

function looksLikeMp4(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
}

test(
  "OpenRouter Video Alpha: GET /models lists video models (live)",
  { skip: !integrationEnabled },
  async (t) => {
    const llm = resolveLlmFromEnv();
    if (!llm) {
      t.skip("set LLM_API_KEY or OPENROUTER_API_KEY");
      return;
    }
    const base = videoApiBaseFromEnv();
    const res = await safeFetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${llm.apiKey}` },
    });
    assert.ok(res.ok, `expected 2xx from /models, got ${res.status}`);
    const body = (await res.json()) as { data?: unknown[] };
    assert.ok(Array.isArray(body.data));
    assert.ok((body.data?.length ?? 0) > 0, "models list empty");
  }
);

test(
  "OpenRouter Video Alpha: image-to-video from latest project first frame (live)",
  { skip: !integrationEnabled },
  async (t) => {
    const llm = resolveLlmFromEnv();
    if (!llm) {
      t.skip("set LLM_API_KEY or OPENROUTER_API_KEY");
      return;
    }
    const projectsRoot =
      process.env.DREAMFACTORY_PROJECTS_ROOT?.trim() ||
      join(process.cwd(), "dreamfactory", "projects");
    const project = findLatestDreamFactoryProject(projectsRoot);
    if (!project) {
      t.skip(`no project with storyboard/storyboard.json under ${projectsRoot}`);
      return;
    }

    const videoModel =
      process.env.OPENROUTER_VIDEO_MODEL?.trim() ||
      process.env.LLM_VIDEO_MODEL?.trim() ||
      DEFAULT_OPENROUTER_VIDEO_MODEL;
    const videoApiBase = videoApiBaseFromEnv();
    const pollMs = Number(process.env.OPENROUTER_VIDEO_POLL_MS ?? "30000");
    const pollIntervalMs = Number.isFinite(pollMs) && pollMs >= 1000 ? pollMs : 30_000;

    const { imageAbsPath, promptText, shotNumber } = getFirstStoryboardFrame(project);
    const imageDataUrl = fileToImageDataUrl(imageAbsPath, "image/png");

    const buf = await requestOpenRouterImageToVideoAlpha({
      videoApiBase,
      apiKey: llm.apiKey,
      model: videoModel,
      imageDataUrl,
      prompt: promptText,
      pollIntervalMs,
      duration: 4,
    });

    assert.ok(buf.length > 10_000, `video too small (${buf.length} bytes) — check job / billing`);
    assert.ok(looksLikeMp4(buf), "downloaded bytes do not look like MP4 (missing ftyp)");

    const outDir = process.env.OPENROUTER_VIDEO_TEST_OUT?.trim();
    let outPath: string;
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      outPath = join(outDir, `integration_test_shot_${String(shotNumber).padStart(2, "0")}.mp4`);
    } else {
      outPath = join(
        mkdtempSync(join(tmpdir(), "df-video-int-")),
        `shot_${String(shotNumber).padStart(2, "0")}.mp4`
      );
    }
    writeFileSync(outPath, buf);
  }
);

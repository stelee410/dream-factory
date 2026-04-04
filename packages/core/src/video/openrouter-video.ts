import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { safeFetch } from "../api.js";
import type { Storyboard } from "../storyboard/types.js";

/** Default per OpenRouter Video Generation Alpha; override with OPENROUTER_VIDEO_MODEL. */
export const DEFAULT_OPENROUTER_VIDEO_MODEL = "google/veo-3.1";

/**
 * Base URL for `POST/GET /api/alpha/videos` (no trailing slash).
 * Derive from LLM_BASE_URL when it ends with `/api/v1`, or override via env in the caller.
 */
export function resolveOpenRouterVideoApiBase(llmBaseUrl: string): string {
  const trimmed = llmBaseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/api/v1")) {
    return `${trimmed.slice(0, -"/api/v1".length)}/api/alpha/videos`;
  }
  try {
    const u = new URL(trimmed);
    return `${u.origin}/api/alpha/videos`;
  } catch {
    return "https://openrouter.ai/api/alpha/videos";
  }
}

export type OpenRouterAlphaVideoJob = {
  id: string;
  polling_url?: string;
  status: string;
  unsigned_urls?: string[];
  error?: string;
};

export type OpenRouterAlphaVideoSubmitBody = {
  model: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  size?: string;
  generate_audio?: boolean;
  seed?: number;
  input_references?: Array<{
    type: "image_url";
    image_url: { url: string };
  }>;
};

function normalizeVideoApiBase(apiBase: string): string {
  return apiBase.replace(/\/$/, "");
}

/** Submit async video job; OpenRouter returns HTTP 202 with job id. */
export async function submitOpenRouterAlphaVideo(
  apiBase: string,
  apiKey: string,
  body: OpenRouterAlphaVideoSubmitBody
): Promise<{ id: string; polling_url?: string; status?: string }> {
  const base = normalizeVideoApiBase(apiBase);
  const res = await safeFetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 202) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenRouter alpha video submit failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<{ id: string; polling_url?: string; status?: string }>;
}

export async function fetchOpenRouterAlphaVideoJob(
  apiBase: string,
  apiKey: string,
  jobId: string
): Promise<OpenRouterAlphaVideoJob> {
  const base = normalizeVideoApiBase(apiBase);
  const res = await safeFetch(`${base}/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenRouter alpha video poll failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<OpenRouterAlphaVideoJob>;
}

const TERMINAL_ALPHA_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

/** Poll until job reaches a terminal status (default interval 30s per OpenRouter docs). */
export async function pollOpenRouterAlphaVideoJob(
  apiBase: string,
  apiKey: string,
  jobId: string,
  opts?: {
    intervalMs?: number;
    onStatus?: (status: string) => void;
    maxWaitMs?: number;
  }
): Promise<OpenRouterAlphaVideoJob> {
  const intervalMs = opts?.intervalMs ?? 30_000;
  const deadline = opts?.maxWaitMs != null ? Date.now() + opts.maxWaitMs : null;
  for (;;) {
    if (deadline != null && Date.now() > deadline) {
      throw new Error("OpenRouter alpha video poll exceeded maxWaitMs");
    }
    const job = await fetchOpenRouterAlphaVideoJob(apiBase, apiKey, jobId);
    opts?.onStatus?.(job.status);
    if (TERMINAL_ALPHA_STATUSES.has(job.status)) return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function unsignedUrlFromCompletedJob(job: OpenRouterAlphaVideoJob): string {
  const u = job.unsigned_urls?.[0];
  if (typeof u === "string" && u.length > 0) return u;
  throw new Error("completed job missing unsigned_urls[0]");
}

/** Download from OpenRouter alpha content / unsigned_urls (requires Bearer). */
export async function downloadOpenRouterVideoAuthorized(
  url: string,
  apiKey: string
): Promise<Buffer> {
  const res = await safeFetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Failed to download video (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export type OpenRouterAlphaImageToVideoRequest = {
  videoApiBase: string;
  apiKey: string;
  model: string;
  imageDataUrl: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  /** e.g. "1024x1024", "1920x1080" — required by some models (Sora) */
  size?: string;
  pollIntervalMs?: number;
};

/** Image-to-video via official Alpha API (submit → poll → download MP4 bytes). */
export async function requestOpenRouterImageToVideoAlpha(
  req: OpenRouterAlphaImageToVideoRequest
): Promise<Buffer> {
  const created = await submitOpenRouterAlphaVideo(req.videoApiBase, req.apiKey, {
    model: req.model,
    prompt: req.prompt,
    input_references: [{ type: "image_url", image_url: { url: req.imageDataUrl } }],
    ...(req.duration != null ? { duration: req.duration } : {}),
    ...(req.aspect_ratio ? { aspect_ratio: req.aspect_ratio } : {}),
    ...(req.resolution ? { resolution: req.resolution } : {}),
    ...(req.size ? { size: req.size } : {}),
  });
  const id = created.id;
  if (typeof id !== "string" || !id.length) {
    throw new Error("OpenRouter alpha video submit returned no job id");
  }
  const job = await pollOpenRouterAlphaVideoJob(req.videoApiBase, req.apiKey, id, {
    intervalMs: req.pollIntervalMs ?? 30_000,
  });
  if (job.status !== "completed") {
    const detail = job.status === "failed" ? job.error ?? "unknown" : job.status;
    throw new Error(`OpenRouter alpha video: ${detail}`);
  }
  const url = unsignedUrlFromCompletedJob(job);
  return downloadOpenRouterVideoAuthorized(url, req.apiKey);
}

export type OpenRouterVideoRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** data:image/...;base64,... or https URL */
  imageDataUrl: string;
  prompt: string;
};

/**
 * Parse chat/completions JSON and return a video URL or data: URL (mirrors image extraction patterns).
 */
export function extractVideoRefFromOpenRouterResponse(data: unknown): string {
  const message = (data as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]
    ?.message;
  if (!message) throw new Error("No message in OpenRouter response");

  const videos = message.videos as Array<{ url?: string; video_url?: { url?: string } }> | undefined;
  if (Array.isArray(videos)) {
    for (const v of videos) {
      const url = v.video_url?.url ?? v.url;
      if (typeof url === "string" && url.length > 0) return url;
    }
  }

  const msgContent = message.content;
  if (Array.isArray(msgContent)) {
    for (const part of msgContent as { type?: string; video_url?: { url?: string } }[]) {
      if (part.type === "video_url" && part.video_url?.url) {
        return part.video_url.url as string;
      }
    }
  }

  if (typeof msgContent === "string") {
    const dataVideo = msgContent.match(/(data:video\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
    if (dataVideo) return dataVideo[1]!;

    const httpMatch = msgContent.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm)(\?[^\s"'<>]*)?/i);
    if (httpMatch) return httpMatch[0]!;
  }

  throw new Error("Could not extract video URL from OpenRouter response");
}

/**
 * Legacy: synchronous-style video via `/v1/chat/completions` + modalities.
 * Prefer {@link requestOpenRouterImageToVideoAlpha} for OpenRouter Video Generation Alpha.
 */
export async function requestOpenRouterImageToVideo(req: OpenRouterVideoRequest): Promise<unknown> {
  const base = req.baseUrl.replace(/\/$/, "");
  const body: Record<string, unknown> = {
    model: req.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: req.prompt },
          { type: "image_url", image_url: { url: req.imageDataUrl } },
        ],
      },
    ],
    modalities: ["video", "text"],
  };

  const res = await safeFetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenRouter video request failed (${res.status}): ${err}`);
  }

  return res.json();
}

export function fileToImageDataUrl(absPath: string, mime: string): string {
  const b64 = readFileSync(absPath).toString("base64");
  return `data:${mime};base64,${b64}`;
}

/** Resolve storyboard image path whether JSON stores absolute or relative paths. */
export function resolveShotImagePath(projectRoot: string, imagePath: string | null): string | null {
  if (!imagePath) return null;
  const candidates = [
    imagePath,
    join(projectRoot, imagePath),
    join(projectRoot, "storyboard", imagePath),
    join(projectRoot, "storyboard", basename(imagePath)),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function findLatestDreamFactoryProject(projectsRoot: string): string | null {
  if (!existsSync(projectsRoot)) return null;
  const dirs = readdirSync(projectsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(projectsRoot, e.name))
    .filter((p) => existsSync(join(p, "storyboard", "storyboard.json")));
  if (dirs.length === 0) return null;
  dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs[0] ?? null;
}

export function getFirstStoryboardFrame(
  projectRoot: string,
  storyboardPath = join(projectRoot, "storyboard", "storyboard.json")
): { imageAbsPath: string; promptText: string; shotNumber: number } {
  const raw = readFileSync(storyboardPath, "utf-8");
  const sb = JSON.parse(raw) as Storyboard;
  for (const shot of sb.shots) {
    const imageAbsPath = resolveShotImagePath(projectRoot, shot.image_path);
    if (!imageAbsPath) continue;
    const scene = shot.scene || shot.description || "";
    const move = shot.camera?.movement ? `镜头运动：${shot.camera.movement}。` : "";
    const promptText = `根据首帧生成一段短小、连贯的竖屏短视频，保持角色与环境一致。${move}${scene}`.trim();
    return { imageAbsPath, promptText, shotNumber: shot.shot_number };
  }
  throw new Error("No shot with a resolvable image_path in storyboard");
}

export async function downloadVideoRef(ref: string): Promise<Buffer> {
  if (ref.startsWith("data:")) {
    const idx = ref.indexOf("base64,");
    if (idx === -1) throw new Error("Invalid data URL for video");
    return Buffer.from(ref.slice(idx + "base64,".length), "base64");
  }
  const res = await safeFetch(ref);
  if (!res.ok) throw new Error(`Failed to download video (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

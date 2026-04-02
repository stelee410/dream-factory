import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { Storyboard } from "../storyboard/index.js";
import type { Shot, SubSegment } from "../storyboard/types.js";
import type { VideoClip, VideoOutput } from "./types.js";

/**
 * Build an enriched video prompt that includes camera movement info.
 */
function buildVideoPrompt(shot: Pick<Shot, "description" | "scene" | "camera">): string {
  const parts = [shot.scene || shot.description];
  if (shot.camera?.movement) {
    parts.push(`镜头${shot.camera.movement}`);
  }
  return parts.join("。");
}

const SEEDANCE_ENDPOINT =
  "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const SEEDANCE_MODEL = "doubao-seedance-1-5-pro-251215";

export class VideoEngine {
  private apiKey: string;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.SEEDANCE_API_KEY;
    if (!key) {
      throw new Error("SEEDANCE_API_KEY is required. Set it via environment variable or pass it to the constructor.");
    }
    this.apiKey = key;
  }

  /**
   * Submit a single-ref image-to-video task to Seedance API.
   */
  private async submitTask(
    imageBase64: string,
    prompt: string,
    duration: number
  ): Promise<string> {
    const body = {
      model: SEEDANCE_MODEL,
      content: [
        {
          type: "text",
          text: `${prompt} --camerafixed false --watermark true`,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${imageBase64}`,
          },
        },
      ],
      ratio: "9:16",
      resolution: "720p",
      duration,
    };

    const res = await fetch(SEEDANCE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Seedance submit failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { id?: string; task_id?: string };
    const taskId = data.id ?? data.task_id;
    if (!taskId) throw new Error("No task ID returned from Seedance");
    return taskId;
  }

  /**
   * Submit a frame_stitch (first+last frame) task to Seedance API.
   */
  private async submitFrameStitchTask(
    firstFrameBase64: string,
    lastFrameBase64: string,
    prompt: string,
    duration: number
  ): Promise<string> {
    const body = {
      model: SEEDANCE_MODEL,
      content: [
        {
          type: "text",
          text: `${prompt} --camerafixed false --watermark true`,
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${firstFrameBase64}`,
          },
          role: "first_frame",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${lastFrameBase64}`,
          },
          role: "last_frame",
        },
      ],
      ratio: "9:16",
      resolution: "720p",
      duration,
    };

    const res = await fetch(SEEDANCE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Seedance frame-stitch submit failed (${res.status}): ${err}`);
    }

    const data = (await res.json()) as { id?: string; task_id?: string };
    const taskId = data.id ?? data.task_id;
    if (!taskId) throw new Error("No task ID returned from Seedance");
    return taskId;
  }

  /**
   * Poll for task completion and return the video URL.
   */
  private async pollTask(taskId: string, maxWaitMs = 300000): Promise<string> {
    const pollUrl = `${SEEDANCE_ENDPOINT}/${taskId}`;
    const start = Date.now();
    const interval = 5000;

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, interval));

      const res = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Seedance poll failed (${res.status}): ${err}`);
      }

      const data = (await res.json()) as {
        status?: string;
        content?: { video_url?: string };
        error?: { message?: string; code?: string };
      };

      const status = data.status?.toLowerCase();

      if (status === "failed" || status === "error") {
        throw new Error(
          `Seedance task failed: ${data.error?.message ?? "unknown error"}`
        );
      }

      if (status === "succeeded") {
        const videoUrl = data.content?.video_url;
        if (!videoUrl) throw new Error("No video URL in completed task");
        return videoUrl;
      }
    }

    throw new Error(`Seedance task timed out after ${maxWaitMs / 1000}s`);
  }

  /**
   * Download video from URL.
   */
  private async downloadVideo(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download video (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Concatenate video clips using ffmpeg (safe from shell injection via execFileSync).
   */
  private concatenate(clipPaths: string[], outputPath: string): void {
    const dir = join(outputPath, "..");
    const listPath = join(dir, "_concat.txt");
    const lines = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`);
    writeFileSync(listPath, lines.join("\n"), "utf-8");

    execFileSync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-c", "copy",
      outputPath,
    ], { stdio: "pipe", timeout: 120000 });
  }

  /**
   * Generate video for a single_ref shot (existing behavior).
   */
  private async generateSingleRefVideo(
    shot: { image_path: string; description: string; scene?: string; camera?: Shot["camera"]; duration: number; shot_number: number },
    outDir: string,
    onProgress?: (phase: string) => void
  ): Promise<string> {
    onProgress?.("submit");
    const imageData = readFileSync(shot.image_path);
    const imageBase64 = imageData.toString("base64");
    const prompt = buildVideoPrompt(shot);
    const taskId = await this.submitTask(imageBase64, prompt, shot.duration);

    onProgress?.("poll");
    const videoUrl = await this.pollTask(taskId);
    const videoData = await this.downloadVideo(videoUrl);
    const clipPath = join(outDir, `shot_${String(shot.shot_number).padStart(2, "0")}.mp4`);
    writeFileSync(clipPath, videoData);
    return clipPath;
  }

  /**
   * Generate video for a frame_stitch shot by processing each sub-segment
   * and concatenating the results.
   */
  private async generateFrameStitchVideo(
    shot: {
      shot_number: number;
      description: string;
      scene?: string;
      camera?: Shot["camera"];
      duration: number;
      sub_segments: SubSegment[];
    },
    outDir: string,
    onProgress?: (segIdx: number, totalSegs: number, phase: string) => void
  ): Promise<string> {
    const segClipPaths: string[] = [];

    for (let j = 0; j < shot.sub_segments.length; j++) {
      const seg = shot.sub_segments[j]!;
      if (!seg.start_frame || !seg.end_frame) {
        throw new Error(`Missing keyframes for ${seg.seg_id}`);
      }

      onProgress?.(j + 1, shot.sub_segments.length, "submit");
      const firstFrameBase64 = readFileSync(seg.start_frame).toString("base64");
      const lastFrameBase64 = readFileSync(seg.end_frame).toString("base64");
      const prompt = buildVideoPrompt(shot);
      const taskId = await this.submitFrameStitchTask(
        firstFrameBase64,
        lastFrameBase64,
        prompt,
        seg.duration
      );

      onProgress?.(j + 1, shot.sub_segments.length, "poll");
      const videoUrl = await this.pollTask(taskId);
      const videoData = await this.downloadVideo(videoUrl);
      const segClipPath = join(outDir, `${seg.seg_id}.mp4`);
      writeFileSync(segClipPath, videoData);
      segClipPaths.push(segClipPath);
    }

    // Concatenate sub-segment clips into one shot video
    const shotClipPath = join(outDir, `shot_${String(shot.shot_number).padStart(2, "0")}.mp4`);
    if (segClipPaths.length > 1) {
      this.concatenate(segClipPaths, shotClipPath);
    } else if (segClipPaths.length === 1) {
      copyFileSync(segClipPaths[0]!, shotClipPath);
    }

    return shotClipPath;
  }

  async generateVideo(
    storyboard: Storyboard,
    outDir: string,
    onProgress?: (shotNum: number, total: number, phase: string) => void
  ): Promise<VideoOutput> {
    mkdirSync(outDir, { recursive: true });

    const clips: VideoClip[] = [];
    const clipPaths: string[] = [];

    for (let i = 0; i < storyboard.shots.length; i++) {
      const shot = storyboard.shots[i]!;
      if (!shot.image_path) continue;

      let clipPath: string;

      if (shot.gen_mode === "frame_stitch" && shot.sub_segments && shot.sub_segments.length > 0) {
        // Frame stitch mode: process each sub-segment with first/last frame
        clipPath = await this.generateFrameStitchVideo(
          {
            shot_number: shot.shot_number,
            description: shot.description,
            scene: shot.scene,
            camera: shot.camera,
            duration: shot.duration,
            sub_segments: shot.sub_segments,
          },
          outDir,
          (segIdx, totalSegs, phase) => {
            onProgress?.(i + 1, storyboard.shots.length, `${phase}_seg_${segIdx}/${totalSegs}`);
          }
        );
      } else {
        // Single ref mode (default / backward compatible)
        clipPath = await this.generateSingleRefVideo(
          {
            image_path: shot.image_path,
            description: shot.description,
            scene: shot.scene,
            camera: shot.camera,
            duration: shot.duration,
            shot_number: shot.shot_number,
          },
          outDir,
          (phase) => onProgress?.(i + 1, storyboard.shots.length, phase)
        );
      }

      clips.push({
        shot_number: shot.shot_number,
        duration: shot.duration,
        image_path: shot.image_path,
        dialogue: shot.dialogue,
        clip_path: clipPath,
      });
      clipPaths.push(clipPath);
    }

    // Concatenate all shot clips into final video
    onProgress?.(0, 0, "concat");
    const finalPath = join(outDir, "final.mp4");
    if (clipPaths.length > 1) {
      this.concatenate(clipPaths, finalPath);
    } else if (clipPaths.length === 1) {
      copyFileSync(clipPaths[0]!, finalPath);
    }

    const totalDuration = clips.reduce((s, c) => s + c.duration, 0);
    return { clips, final_path: finalPath, total_duration: totalDuration };
  }
}

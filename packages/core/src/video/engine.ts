import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Storyboard } from "../storyboard/index.js";
import type { VideoClip, VideoOutput } from "./types.js";

const SEEDANCE_ENDPOINT =
  "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const SEEDANCE_MODEL = "doubao-seedance-1-5-pro-251215";

export class VideoEngine {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey =
      apiKey ?? process.env.SEEDANCE_API_KEY ?? "b6473204-e102-4d1e-9559-afceda22ed94";
  }

  /**
   * Submit an image-to-video task to Seedance API.
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
   * Concatenate video clips using ffmpeg.
   */
  private concatenate(clipPaths: string[], outputPath: string): void {
    const dir = join(outputPath, "..");
    const listPath = join(dir, "_concat.txt");
    const lines = clipPaths.map((p) => `file '${p}'`);
    writeFileSync(listPath, lines.join("\n"), "utf-8");

    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
      { stdio: "pipe", timeout: 120000 }
    );
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

      onProgress?.(i + 1, storyboard.shots.length, "submit");

      // Read image and convert to base64
      const imageData = readFileSync(shot.image_path);
      const imageBase64 = imageData.toString("base64");

      // Submit task
      const taskId = await this.submitTask(
        imageBase64,
        shot.description,
        shot.duration
      );

      onProgress?.(i + 1, storyboard.shots.length, "poll");

      // Poll for completion
      const videoUrl = await this.pollTask(taskId);

      // Download video
      const videoData = await this.downloadVideo(videoUrl);
      const clipPath = join(
        outDir,
        `shot_${String(shot.shot_number).padStart(2, "0")}.mp4`
      );
      writeFileSync(clipPath, videoData);

      clips.push({
        shot_number: shot.shot_number,
        duration: shot.duration,
        image_path: shot.image_path,
        dialogue: shot.dialogue,
        clip_path: clipPath,
      });
      clipPaths.push(clipPath);
    }

    // Concatenate all clips
    onProgress?.(0, 0, "concat");
    const finalPath = join(outDir, "final.mp4");
    if (clipPaths.length > 1) {
      this.concatenate(clipPaths, finalPath);
    } else if (clipPaths.length === 1) {
      // Single clip — just copy
      writeFileSync(finalPath, readFileSync(clipPaths[0]!));
    }

    const totalDuration = clips.reduce((s, c) => s + c.duration, 0);
    return { clips, final_path: finalPath, total_duration: totalDuration };
  }
}

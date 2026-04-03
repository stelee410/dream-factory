import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AIClient } from "../ai/index.js";
import type { ChatMessage } from "../ai/index.js";
import { safeFetch } from "../api.js";
import type { CharacterDossier } from "../interview/index.js";
import type { CharacterProfile } from "../character/index.js";
import type { Script } from "../script/index.js";
import type { Shot, Storyboard, SubSegment } from "./types.js";
import { WanImageClient } from "./wan-image.js";

const MAX_SEGMENT_DURATION = 10;

export type ImageProvider = "wan" | "openrouter";

export interface StoryboardEngineOptions {
  imageProvider?: ImageProvider;
  wanApiKey?: string;
  wanModel?: "wan2.7-image" | "wan2.7-image-pro";
}

function buildShotBreakdownPrompt(directorStylePrompt?: string): string {
  const directorSection = directorStylePrompt
    ? `\n\n## 导演风格\n${directorStylePrompt}\n请在每个镜头中体现该导演风格的视觉特点。`
    : "";

  return `你是一位专业的分镜师。将剧本拆解为具体的镜头列表。

输出要求：严格按照 JSON 数组格式，不要添加其他文字。
每个镜头：
{
  "shot_number": 1,
  "scene_ref": 1,
  "shot_type": "近景/中景/远景/特写/跟拍/俯拍",
  "duration": 5,
  "description": "画面内容中文描述",
  "scene": "场景描述（详细画面内容）",
  "camera": {
    "movement": "运镜方式（如：跟拍、推拉、平移、环绕、固定等）",
    "angle": "拍摄角度（如：平视、仰拍、俯拍、鸟瞰等）",
    "lens": "镜头焦段（如：35mm广角、50mm标准、85mm中长焦等）"
  },
  "lighting": {
    "type": "灯光类型（如：自然光、逆光、伦勃朗光、柔光等）",
    "color_tone": "色彩倾向（如：暖色调、冷色调、高对比等）"
  },
  "audio": {
    "dialogue": "对应的台词（无则为空字符串）",
    "sfx": "音效描述（如：脚步声、雨声、杯子碰撞声等）",
    "music": "配乐风格（如：钢琴轻音乐、弦乐渐强等）"
  },
  "mood": "氛围/情绪（如：怀旧温暖、紧张悬疑、欢快轻松等）",
  "image_prompt": "English prompt for AI image generation, detailed and specific"
}

image_prompt 构造规则：
1. 开头必须包含角色外貌描述（保持一致性）
2. 包含场景环境描述
3. 包含角色动作和表情
4. 包含镜头类型和角度（如：low angle close-up, bird's eye wide shot）
5. 包含灯光和色调描述（如：warm golden backlight, cold blue tone）
6. 包含氛围描述
7. 结尾添加画面风格：cinematic, soft lighting, warm color palette, anime-influenced illustration style
8. 全部用英文

约束：
- 每个场景拆 1-3 个镜头
- 每个镜头 3-8 秒
- 总时长 30-60 秒${directorSection}`;
}

const OPENROUTER_IMAGE_MODEL = "google/gemini-2.5-flash-image";

export class StoryboardEngine {
  private ai: AIClient;
  private dossier: CharacterDossier;
  private character: CharacterProfile;
  private directorStylePrompt: string;
  private imageProvider: ImageProvider;
  private wanClient: WanImageClient | null;

  constructor(
    ai: AIClient,
    dossier: CharacterDossier,
    character: CharacterProfile,
    directorStylePrompt?: string,
    opts?: StoryboardEngineOptions
  ) {
    this.ai = ai;
    this.dossier = dossier;
    this.character = character;
    this.directorStylePrompt = directorStylePrompt ?? "";

    const wanKey = opts?.wanApiKey ?? process.env.WAN_API_KEY;
    this.imageProvider = opts?.imageProvider ?? (wanKey ? "wan" : "openrouter");

    this.wanClient = wanKey
      ? new WanImageClient(wanKey, opts?.wanModel)
      : null;
  }

  async breakdownShots(script: Script): Promise<Shot[]> {
    const messages: ChatMessage[] = [
      { role: "system", content: buildShotBreakdownPrompt(this.directorStylePrompt) },
      {
        role: "user",
        content: `## 角色外貌\n${this.dossier.appearance}\n\n## 剧本\n${JSON.stringify(script, null, 2)}`,
      },
    ];

    const result = await this.ai.chat(messages, {
      temperature: 0.4,
      max_tokens: 8192,
    });

    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [
      null,
      result,
    ];
    const rawShots = JSON.parse(jsonMatch[1]!.trim()) as Omit<Shot, "gen_mode" | "image_path">[];
    return rawShots.map((s) => ({
      ...s,
      description: s.description || s.scene || "",
      scene: s.scene || s.description || "",
      dialogue: s.dialogue ?? s.audio?.dialogue ?? null,
      image_path: null,
      ...this.assignGenMode(s.shot_number, s.duration),
    }));
  }

  private assignGenMode(
    shotNumber: number,
    duration: number
  ): Pick<Shot, "gen_mode" | "ref_images" | "sub_segments"> {
    if (duration <= MAX_SEGMENT_DURATION) {
      return { gen_mode: "single_ref", ref_images: [] };
    }

    const subSegments: SubSegment[] = [];
    let remaining = duration;
    let segIndex = 1;

    while (remaining > 0) {
      const segDuration = Math.min(remaining, MAX_SEGMENT_DURATION);
      const segId = `shot_${shotNumber}_seg_${segIndex}`;
      subSegments.push({
        seg_id: segId,
        start_frame: null,
        end_frame: null,
        duration: segDuration,
      });
      remaining -= segDuration;
      segIndex++;
    }

    return { gen_mode: "frame_stitch", ref_images: [], sub_segments: subSegments };
  }

  private buildImagePrompt(shot: Shot): string {
    const parts = [shot.image_prompt];

    if (shot.camera) {
      if (shot.camera.angle) parts.push(`${shot.camera.angle} angle`);
      if (shot.camera.lens) parts.push(`shot with ${shot.camera.lens} lens`);
    }

    if (shot.lighting) {
      if (shot.lighting.type) parts.push(`${shot.lighting.type} lighting`);
      if (shot.lighting.color_tone) parts.push(`${shot.lighting.color_tone} color grading`);
    }

    if (shot.mood) {
      parts.push(`mood: ${shot.mood}`);
    }

    if (this.directorStylePrompt) {
      parts.push(`Director style: ${this.directorStylePrompt}`);
    }

    const result = parts.join(". ");
    return result.length > 2000 ? result.slice(0, 2000) : result;
  }

  /**
   * Build a character consistency prefix for Wan image prompts.
   * Includes detailed appearance description to anchor the character across all shots.
   */
  private buildCharacterConsistencyPrompt(): string {
    const lines = [
      `角色外貌（所有镜头必须严格保持一致）：${this.dossier.appearance}`,
    ];
    if (this.dossier.basics.name) {
      lines.push(`角色名：${this.dossier.basics.name}`);
    }
    return lines.join("\n");
  }

  // ---- Wan2.7 image generation ----

  private async generateImageViaWan(shot: Shot): Promise<Buffer> {
    if (!this.wanClient) throw new Error("WAN_API_KEY not configured");

    const characterPrompt = this.buildCharacterConsistencyPrompt();
    const scenePrompt = this.buildImagePrompt(shot);
    const fullPrompt = `${characterPrompt}\n\n画面描述：${scenePrompt}`;

    const referenceImages: string[] = [];
    if (this.character.characterDesignSheetUrl) {
      referenceImages.push(this.character.characterDesignSheetUrl);
    }

    return this.wanClient.generate(fullPrompt, {
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      size: "1K",
    });
  }

  private async generateKeyframeViaWan(
    shot: Shot,
    timePointDescription: string
  ): Promise<Buffer> {
    if (!this.wanClient) throw new Error("WAN_API_KEY not configured");

    const characterPrompt = this.buildCharacterConsistencyPrompt();
    const scenePrompt = this.buildImagePrompt(shot);
    const fullPrompt = `${characterPrompt}\n\n画面描述：${scenePrompt}\n\n当前时刻：${timePointDescription}`;

    const referenceImages: string[] = [];
    if (this.character.characterDesignSheetUrl) {
      referenceImages.push(this.character.characterDesignSheetUrl);
    }

    return this.wanClient.generate(fullPrompt, {
      referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      size: "1K",
    });
  }

  // ---- OpenRouter image generation (legacy) ----

  private async extractImageFromResponse(data: any): Promise<Buffer> {
    const message = data.choices?.[0]?.message;

    if (Array.isArray(message?.images)) {
      for (const img of message.images) {
        const url = img.image_url?.url ?? img.url;
        if (url?.startsWith("data:")) {
          const base64 = url.split(",")[1]!;
          return Buffer.from(base64, "base64");
        }
        if (url) {
          const imgRes = await safeFetch(url);
          return Buffer.from(await imgRes.arrayBuffer());
        }
      }
    }

    const msgContent = message?.content;
    if (Array.isArray(msgContent)) {
      for (const part of msgContent) {
        if (part.type === "image_url" && part.image_url?.url) {
          const url = part.image_url.url as string;
          if (url.startsWith("data:")) {
            const base64 = url.split(",")[1]!;
            return Buffer.from(base64, "base64");
          }
          const imgRes = await safeFetch(url);
          return Buffer.from(await imgRes.arrayBuffer());
        }
      }
    }

    if (typeof msgContent === "string") {
      const b64Match = msgContent.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
      if (b64Match) {
        return Buffer.from(b64Match[1]!, "base64");
      }
    }

    throw new Error("Could not extract image from AI response");
  }

  private async callOpenRouterImageApi(promptText: string): Promise<Buffer> {
    const content: Array<Record<string, unknown>> = [
      { type: "text", text: promptText },
    ];

    if (this.character.characterDesignSheetUrl) {
      content.push({
        type: "image_url",
        image_url: { url: this.character.characterDesignSheetUrl },
      });
    }

    const res = await safeFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_IMAGE_MODEL,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Image generation failed (${res.status}): ${err}`);
    }

    const data = await res.json() as any;
    return this.extractImageFromResponse(data);
  }

  private async generateImageViaOpenRouter(shot: Shot): Promise<Buffer> {
    const enrichedPrompt = this.buildImagePrompt(shot);
    return this.callOpenRouterImageApi(
      `Generate an image based on this character design reference. Keep the character appearance consistent with the reference. Prompt: ${enrichedPrompt}`
    );
  }

  private async generateKeyframeViaOpenRouter(
    shot: Shot,
    timePointDescription: string
  ): Promise<Buffer> {
    const enrichedPrompt = this.buildImagePrompt(shot);
    return this.callOpenRouterImageApi(
      `Generate an image based on this character design reference. Keep the character appearance consistent with the reference. This is a keyframe at a specific moment. Prompt: ${enrichedPrompt}. Moment: ${timePointDescription}`
    );
  }

  // ---- Unified image generation dispatch ----

  async generateImage(shot: Shot): Promise<Buffer> {
    if (this.imageProvider === "wan") {
      return this.generateImageViaWan(shot);
    }
    return this.generateImageViaOpenRouter(shot);
  }

  private async generateKeyframe(
    shot: Shot,
    timePointDescription: string
  ): Promise<Buffer> {
    if (this.imageProvider === "wan") {
      return this.generateKeyframeViaWan(shot, timePointDescription);
    }
    return this.generateKeyframeViaOpenRouter(shot, timePointDescription);
  }

  private async generateKeyframeDescriptions(
    shot: Shot
  ): Promise<string[]> {
    const numKeyframes = (shot.sub_segments?.length ?? 0) + 1;
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `你是一位专业的分镜师。给定一个长镜头的描述，将其拆解为 ${numKeyframes} 个关键时间点的画面描述。
每个时间点用英文描述，保持画面连续性。输出严格 JSON 数组格式，不要添加其他文字。
示例：["Character enters the cafe, standing at the door", "Character walks to the counter, looking around", "Character sits down at a table with a smile"]`,
      },
      {
        role: "user",
        content: `镜头描述：${shot.scene || shot.description}\n总时长：${shot.duration}秒\n分为 ${shot.sub_segments?.length} 个子片段\n角色外貌：${this.dossier.appearance}\nimage_prompt 基础：${shot.image_prompt}`,
      },
    ];

    const result = await this.ai.chat(messages, {
      temperature: 0.4,
      max_tokens: 2048,
    });

    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, result];
    const descriptions = JSON.parse(jsonMatch[1]!.trim()) as string[];

    while (descriptions.length < numKeyframes) {
      descriptions.push(shot.description);
    }
    if (descriptions.length > numKeyframes) {
      descriptions.length = numKeyframes;
    }

    return descriptions;
  }

  private async generateKeyframes(
    shot: Shot,
    outDir: string,
    onProgress?: (frameIdx: number, totalFrames: number) => void
  ): Promise<void> {
    if (!shot.sub_segments || shot.sub_segments.length === 0) return;

    const descriptions = await this.generateKeyframeDescriptions(shot);
    const numKeyframes = shot.sub_segments.length + 1;

    for (let i = 0; i < numKeyframes; i++) {
      onProgress?.(i + 1, numKeyframes);
      const desc = descriptions[i]!;
      const imageData = await this.generateKeyframe(shot, desc);
      const frameName = i === 0
        ? `shot_${String(shot.shot_number).padStart(2, "0")}_start.png`
        : i === numKeyframes - 1
        ? `shot_${String(shot.shot_number).padStart(2, "0")}_end.png`
        : `shot_${String(shot.shot_number).padStart(2, "0")}_mid${i}.png`;
      const framePath = join(outDir, frameName);
      writeFileSync(framePath, imageData);

      if (i < shot.sub_segments.length) {
        shot.sub_segments[i]!.start_frame = framePath;
      }
      if (i > 0) {
        shot.sub_segments[i - 1]!.end_frame = framePath;
      }
    }

    shot.image_path = shot.sub_segments[0]!.start_frame;
  }

  async generateStoryboard(
    script: Script,
    outDir: string,
    onProgress?: (shotNum: number, total: number) => void
  ): Promise<Storyboard> {
    const shots = await this.breakdownShots(script);
    mkdirSync(outDir, { recursive: true });

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]!;
      onProgress?.(i + 1, shots.length);

      if (shot.gen_mode === "frame_stitch") {
        await this.generateKeyframes(shot, outDir);
      } else {
        const imageData = await this.generateImage(shot);
        const filename = `shot_${String(shot.shot_number).padStart(2, "0")}.png`;
        const filePath = join(outDir, filename);
        writeFileSync(filePath, imageData);
        shot.image_path = filePath;
        shot.ref_images = [filePath];
      }
    }

    const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);
    return {
      title: script.title,
      shots,
      total_duration: totalDuration,
      director_style: this.directorStylePrompt || undefined,
    };
  }

  static toMarkdown(storyboard: Storyboard): string {
    let md = `# ${storyboard.title} — 分镜表\n\n`;

    if (storyboard.director_style) {
      md += `**导演风格**: ${storyboard.director_style}\n\n`;
    }

    md += `**总时长**: ${storyboard.total_duration}s | **镜头数**: ${storyboard.shots.length}\n\n---\n\n`;

    for (const shot of storyboard.shots) {
      md += `## 镜头 ${String(shot.shot_number).padStart(2, "0")} — ${shot.shot_type} (${shot.duration}s)\n\n`;
      md += `**场景**: ${shot.scene || shot.description}\n\n`;

      if (shot.camera) {
        md += `**摄影**: 运镜 ${shot.camera.movement} | 角度 ${shot.camera.angle} | 焦段 ${shot.camera.lens}\n\n`;
      }

      if (shot.lighting) {
        md += `**灯光**: ${shot.lighting.type} | ${shot.lighting.color_tone}\n\n`;
      }

      if (shot.mood) {
        md += `**氛围**: ${shot.mood}\n\n`;
      }

      if (shot.audio) {
        if (shot.audio.dialogue) md += `**对白**: ${shot.audio.dialogue}\n\n`;
        if (shot.audio.sfx) md += `**音效**: ${shot.audio.sfx}\n\n`;
        if (shot.audio.music) md += `**配乐**: ${shot.audio.music}\n\n`;
      }

      if (shot.gen_mode === "frame_stitch" && shot.sub_segments) {
        md += `**生成模式**: 首尾帧拼接 (${shot.sub_segments.length} 个子片段)\n\n`;
      }

      md += `---\n\n`;
    }

    return md;
  }
}

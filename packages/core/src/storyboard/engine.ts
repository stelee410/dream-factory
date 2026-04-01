import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AIClient } from "../ai/index.js";
import type { ChatMessage } from "../ai/index.js";
import type { CharacterDossier } from "../interview/index.js";
import type { CharacterProfile } from "../character/index.js";
import type { Script } from "../script/index.js";
import type { Shot, Storyboard } from "./types.js";

const SHOT_BREAKDOWN_PROMPT = `你是一位专业的分镜师。将剧本拆解为具体的镜头列表。

输出要求：严格按照 JSON 数组格式，不要添加其他文字。
每个镜头：
{
  "shot_number": 1,
  "scene_ref": 1,
  "shot_type": "近景/中景/远景/特写/跟拍/俯拍",
  "duration": 5,
  "description": "画面内容中文描述",
  "dialogue": "对应的台词（无则为null）",
  "image_prompt": "English prompt for AI image generation, detailed and specific"
}

image_prompt 构造规则：
1. 开头必须包含角色外貌描述（保持一致性）
2. 包含场景环境描述
3. 包含角色动作和表情
4. 包含镜头类型（close-up, medium shot, wide shot, etc.）
5. 结尾添加画面风格：cinematic, soft lighting, warm color palette, anime-influenced illustration style
6. 全部用英文

约束：
- 每个场景拆 1-3 个镜头
- 每个镜头 3-8 秒
- 总时长 30-60 秒`;

const IMAGE_MODEL = "google/gemini-2.5-flash-image";

export class StoryboardEngine {
  private ai: AIClient;
  private dossier: CharacterDossier;
  private character: CharacterProfile;

  constructor(ai: AIClient, dossier: CharacterDossier, character: CharacterProfile) {
    this.ai = ai;
    this.dossier = dossier;
    this.character = character;
  }

  async breakdownShots(script: Script): Promise<Shot[]> {
    const messages: ChatMessage[] = [
      { role: "system", content: SHOT_BREAKDOWN_PROMPT },
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
    const shots = JSON.parse(jsonMatch[1]!.trim()) as Shot[];
    return shots.map((s) => ({ ...s, image_path: null }));
  }

  async generateImage(shot: Shot): Promise<Buffer> {
    // Build message content: text prompt + optional design sheet reference image
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Generate an image based on this character design reference. Keep the character appearance consistent with the reference. Prompt: ${shot.image_prompt}`,
      },
    ];

    // Include character design sheet as reference for consistency
    if (this.character.characterDesignSheetUrl) {
      content.push({
        type: "image_url",
        image_url: { url: this.character.characterDesignSheetUrl },
      });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Image generation failed (${res.status}): ${err}`);
    }

    const data = await res.json() as any;
    const message = data.choices?.[0]?.message;

    // OpenRouter returns images in message.images array
    if (Array.isArray(message?.images)) {
      for (const img of message.images) {
        const url = img.image_url?.url ?? img.url;
        if (url?.startsWith("data:")) {
          const base64 = url.split(",")[1]!;
          return Buffer.from(base64, "base64");
        }
        if (url) {
          const imgRes = await fetch(url);
          return Buffer.from(await imgRes.arrayBuffer());
        }
      }
    }

    // Fallback: check content for inline images
    const msgContent = message?.content;
    if (Array.isArray(msgContent)) {
      for (const part of msgContent) {
        if (part.type === "image_url" && part.image_url?.url) {
          const url = part.image_url.url as string;
          if (url.startsWith("data:")) {
            const base64 = url.split(",")[1]!;
            return Buffer.from(base64, "base64");
          }
          const imgRes = await fetch(url);
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
      try {
        const imageData = await this.generateImage(shot);
        const filename = `shot_${String(shot.shot_number).padStart(2, "0")}.png`;
        const filePath = join(outDir, filename);
        writeFileSync(filePath, imageData);
        shot.image_path = filePath;
      } catch (e) {
        console.error(
          `Failed to generate image for shot ${shot.shot_number}:`,
          e instanceof Error ? e.message : e
        );
      }
    }

    const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);
    return {
      title: script.title,
      shots,
      total_duration: totalDuration,
    };
  }
}

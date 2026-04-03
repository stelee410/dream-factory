/**
 * Alibaba Cloud Wan2.7 Image Generation API client.
 * https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference
 */

import { safeFetch } from "../api.js";

const WAN_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

const DEFAULT_MODEL = "wan2.7-image";

export interface WanImageOptions {
  model?: "wan2.7-image" | "wan2.7-image-pro";
  size?: "1K" | "2K";
  negative_prompt?: string;
  watermark?: boolean;
  seed?: number;
}

interface WanContentItem {
  text?: string;
  image?: string;
  type?: string;
}

interface WanResponse {
  output?: {
    choices?: Array<{
      finish_reason: string;
      message: {
        role: string;
        content: Array<{ image?: string; type?: string }>;
      };
    }>;
    finished?: boolean;
  };
  usage?: Record<string, unknown>;
  request_id?: string;
  code?: string;
  message?: string;
}

export class WanImageClient {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.model = model ?? DEFAULT_MODEL;
    this.apiKey = apiKey;
  }

  /**
   * Generate an image from a text prompt.
   * Optionally pass reference images for character/style consistency.
   */
  async generate(
    prompt: string,
    opts?: WanImageOptions & { referenceImages?: string[] }
  ): Promise<Buffer> {
    const content: WanContentItem[] = [];

    if (opts?.referenceImages) {
      for (const img of opts.referenceImages) {
        content.push({ image: img });
      }
    }

    content.push({ text: prompt });

    const body: Record<string, unknown> = {
      model: opts?.model ?? this.model,
      input: {
        messages: [{ role: "user", content }],
      },
      parameters: {
        size: opts?.size ?? "1K",
        n: 1,
        watermark: opts?.watermark ?? false,
        negative_prompt: opts?.negative_prompt ??
          "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，构图混乱，文字模糊",
        ...(opts?.seed !== undefined ? { seed: opts.seed } : {}),
      },
    };

    const res = await safeFetch(WAN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Wan image API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as WanResponse;

    if (data.code) {
      throw new Error(`Wan image API error: ${data.code} - ${data.message}`);
    }

    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
    if (!imageUrl) {
      throw new Error("No image URL in Wan API response");
    }

    const imgRes = await safeFetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download generated image (${imgRes.status})`);
    }
    return Buffer.from(await imgRes.arrayBuffer());
  }

  /**
   * Generate multiple sequential images (组图模式) that maintain character consistency.
   * Useful for generating a set of storyboard frames with coherent character appearance.
   */
  async generateSequential(
    prompt: string,
    count: number,
    opts?: WanImageOptions & { referenceImages?: string[] }
  ): Promise<Buffer[]> {
    const content: WanContentItem[] = [];

    if (opts?.referenceImages) {
      for (const img of opts.referenceImages) {
        content.push({ image: img });
      }
    }

    content.push({ text: prompt });

    const body: Record<string, unknown> = {
      model: opts?.model ?? this.model,
      input: {
        messages: [{ role: "user", content }],
      },
      parameters: {
        enable_sequential: true,
        size: opts?.size ?? "1K",
        n: count,
        watermark: opts?.watermark ?? false,
        ...(opts?.seed !== undefined ? { seed: opts.seed } : {}),
      },
    };

    const res = await safeFetch(WAN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Wan image API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as WanResponse;

    if (data.code) {
      throw new Error(`Wan image API error: ${data.code} - ${data.message}`);
    }

    const choices = data.output?.choices ?? [];
    const buffers: Buffer[] = [];

    for (const choice of choices) {
      const imageUrl = choice.message?.content?.[0]?.image;
      if (imageUrl) {
        const imgRes = await safeFetch(imageUrl);
        if (!imgRes.ok) continue;
        buffers.push(Buffer.from(await imgRes.arrayBuffer()));
      }
    }

    if (buffers.length === 0) {
      throw new Error("No images generated from Wan sequential API");
    }

    return buffers;
  }
}

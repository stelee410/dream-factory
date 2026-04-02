import type { DirectorStyle } from "./types.js";

export const DIRECTOR_STYLES: DirectorStyle[] = [
  {
    id: "wkw",
    name: "王家卫",
    name_en: "Wong Kar-wai",
    traits: ["手持摄影", "暖色调", "慢镜头", "独白旁白", "都市孤独感"],
    prompt_snippet:
      "Handheld camera, warm amber/golden color grading, slow motion, voiceover narration, urban loneliness, neon-lit atmosphere, intimate close-ups, shallow depth of field",
  },
  {
    id: "wes",
    name: "韦斯·安德森",
    name_en: "Wes Anderson",
    traits: ["对称构图", "柔和色彩", "平移镜头", "正面角度"],
    prompt_snippet:
      "Symmetrical composition, pastel color palette, lateral tracking shots, frontal angle, whimsical set design, centered framing, flat perspective",
  },
  {
    id: "nolan",
    name: "克里斯托弗·诺兰",
    name_en: "Christopher Nolan",
    traits: ["IMAX 宽幅", "实景", "非线性叙事", "低频配乐"],
    prompt_snippet:
      "IMAX wide-angle, practical locations, dramatic scale, deep bass score, desaturated tones, high contrast, epic wide shots, precise composition",
  },
  {
    id: "docu",
    name: "纪录片风格",
    name_en: "Documentary",
    traits: ["手持跟拍", "自然光", "采访机位", "环境音"],
    prompt_snippet:
      "Handheld follow-cam, natural lighting, interview-style framing, ambient sound, raw and authentic, observational angle, shallow focus on subject",
  },
  {
    id: "epic",
    name: "广告大片",
    name_en: "Epic Commercial",
    traits: ["升格慢镜", "微距特写", "史诗配乐", "快速剪辑"],
    prompt_snippet:
      "High-speed slow motion, macro close-ups, epic orchestral score, quick cuts, dramatic lighting, heroic angles, product-shot quality, cinematic flare",
  },
  {
    id: "custom",
    name: "自定义",
    name_en: "Custom",
    traits: [],
    prompt_snippet: "",
  },
];

/**
 * Merge multiple director styles into a combined prompt snippet.
 */
export function mergeDirectorStyles(
  styles: DirectorStyle[],
  customDescription?: string
): string {
  const snippets = styles
    .filter((s) => s.id !== "custom" && s.prompt_snippet)
    .map((s) => s.prompt_snippet);

  if (customDescription) {
    snippets.push(customDescription);
  }

  return snippets.join(". ");
}

/**
 * Generate a Chinese description of the selected director styles.
 */
export function describeDirectorStyles(
  styles: DirectorStyle[],
  customDescription?: string
): string {
  const parts = styles
    .filter((s) => s.id !== "custom")
    .map((s) => `${s.name}风格（${s.traits.join("、")}）`);

  if (customDescription) {
    parts.push(`自定义（${customDescription}）`);
  }

  return parts.join(" + ");
}

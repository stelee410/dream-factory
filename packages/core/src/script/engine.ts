import { AIClient } from "../ai/index.js";
import type { ChatMessage } from "../ai/index.js";
import type { CharacterDossier } from "../interview/index.js";
import type { CharacterProfile } from "../character/index.js";
import type { Outline, Script } from "./types.js";

const OUTLINE_PROMPT = `你是一位专业的短剧编剧。基于给定的角色档案和主题，生成 3 个不同风格的短剧大纲。

输出要求：严格按照 JSON 数组格式，不要添加其他文字。
每个大纲包含：
- title: 短剧标题（有吸引力、简洁）
- genre: 类型标签
- synopsis: 一句话概要
- scene_summaries: 场景摘要列表（3-5 个场景）

约束：
- 短剧总时长 30-60 秒
- 每个场景对应一个镜头/段落
- 角色的性格和语言风格必须体现在大纲中
- 三个大纲风格要有差异（如：温情/搞笑/悬疑）`;

const SCRIPT_PROMPT = `你是一位专业的短剧编剧。基于选定的大纲和角色档案，生成完整的短剧剧本。

输出要求：严格按照 JSON 格式，不要添加其他文字。
{
  "title": "短剧标题",
  "genre": "类型",
  "synopsis": "一句话概要",
  "scenes": [
    {
      "scene_number": 1,
      "location": "场所",
      "time": "日/夜/黄昏/清晨",
      "description": "场景描述（画面、氛围）",
      "dialogues": [
        {
          "character": "角色名",
          "line": "台词",
          "emotion": "情绪（如：开心、犹豫、坚定）",
          "action": "动作描述（如：转身、微笑、低头）"
        }
      ],
      "camera_hints": ["镜头提示，如：近景、远景、特写、跟拍、俯拍"]
    }
  ]
}

约束：
- 3-5 个场景
- 每场景 2-4 句对白
- 总时长目标 30-60 秒
- 对白必须符合角色的语言风格和口头禅
- camera_hints 要具体、可执行
- description 要包含足够的视觉细节，适合 AI 图片/视频生成`;

function dossierToContext(
  character: CharacterProfile,
  dossier: CharacterDossier
): string {
  return `## 角色档案

名字: ${dossier.basics.name}
年龄: ${dossier.basics.age}
身份: ${dossier.basics.identity}

性格特征:
${dossier.personality.map((p) => `- ${p.trait}: ${p.description}`).join("\n")}

语言风格:
- 说话方式: ${dossier.speech_style.manner}
- 口头禅: ${dossier.speech_style.catchphrases.join("、")}

情感:
- 喜好: ${dossier.emotions.likes.join("、")}
- 厌恶: ${dossier.emotions.dislikes.join("、")}
- 恐惧: ${dossier.emotions.fears.join("、")}

外貌: ${dossier.appearance}`;
}

export class ScriptEngine {
  private ai: AIClient;
  private character: CharacterProfile;
  private dossier: CharacterDossier;

  constructor(
    ai: AIClient,
    character: CharacterProfile,
    dossier: CharacterDossier
  ) {
    this.ai = ai;
    this.character = character;
    this.dossier = dossier;
  }

  async generateOutlines(theme: string): Promise<Outline[]> {
    const context = dossierToContext(this.character, this.dossier);
    const messages: ChatMessage[] = [
      { role: "system", content: OUTLINE_PROMPT },
      {
        role: "user",
        content: `${context}\n\n## 短剧主题\n${theme}`,
      },
    ];

    const result = await this.ai.chat(messages, {
      temperature: 0.8,
      max_tokens: 4096,
    });

    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [
      null,
      result,
    ];
    return JSON.parse(jsonMatch[1]!.trim()) as Outline[];
  }

  async generateScript(outline: Outline): Promise<Script> {
    const context = dossierToContext(this.character, this.dossier);
    const messages: ChatMessage[] = [
      { role: "system", content: SCRIPT_PROMPT },
      {
        role: "user",
        content: `${context}\n\n## 选定大纲\n标题: ${outline.title}\n类型: ${outline.genre}\n概要: ${outline.synopsis}\n场景摘要:\n${outline.scene_summaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      },
    ];

    const result = await this.ai.chat(messages, {
      temperature: 0.6,
      max_tokens: 8192,
    });

    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [
      null,
      result,
    ];
    return JSON.parse(jsonMatch[1]!.trim()) as Script;
  }

  static toMarkdown(script: Script): string {
    let md = `# ${script.title}\n\n`;
    md += `**类型**: ${script.genre}\n`;
    md += `**概要**: ${script.synopsis}\n\n---\n\n`;

    for (const scene of script.scenes) {
      md += `## 场景 ${scene.scene_number}: ${scene.location} — ${scene.time}\n\n`;
      md += `*${scene.description}*\n\n`;
      md += `**镜头**: ${scene.camera_hints.join(" | ")}\n\n`;

      for (const d of scene.dialogues) {
        md += `**${d.character}** *(${d.emotion}, ${d.action})*\n`;
        md += `> ${d.line}\n\n`;
      }
      md += `---\n\n`;
    }

    return md;
  }
}

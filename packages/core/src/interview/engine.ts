import { AIClient } from "../ai/index.js";
import type { ChatMessage } from "../ai/index.js";
import type { CharacterProfile } from "../character/index.js";
import type { CharacterDossier } from "./types.js";

const INTERVIEW_SYSTEM_PROMPT = `你正在参与一场角色深度访谈。你需要完全沉浸在以下角色中，以第一人称回答所有问题。

访谈目的：让对方更深入地了解你——你的性格、喜好、恐惧、说话方式、日常生活等。请像真实的人一样回答，展现你的个性和情感。

回答要求：
- 用你的角色身份自然地回答，不要跳出角色
- 每次回答 2-4 句话，保持对话节奏
- 展现你独特的语言风格和性格特征
- 可以主动分享相关的故事或细节`;

const PROFILE_GENERATION_PROMPT = `基于以下角色访谈对话记录，生成一份结构化的角色档案。请严格按照 JSON 格式输出，不要添加其他文字。

JSON 结构要求：
{
  "basics": {
    "name": "角色名字",
    "age": "年龄或年龄段",
    "identity": "身份描述"
  },
  "personality": [
    { "trait": "性格关键词", "description": "详细描述" }
  ],
  "speech_style": {
    "catchphrases": ["口头禅1", "口头禅2"],
    "manner": "说话方式描述"
  },
  "emotions": {
    "likes": ["喜好1", "喜好2"],
    "dislikes": ["厌恶1"],
    "fears": ["恐惧1"]
  },
  "appearance": "外貌描述，适合用于 AI 图片生成的提示词"
}

personality 数组应包含 3-5 个性格特征。
appearance 字段应详细描述外貌特征，包括发型、五官、体型、穿着风格等，适合作为 AI 图片生成的提示词。`;

export class InterviewEngine {
  private ai: AIClient;
  private history: ChatMessage[] = [];
  private character: CharacterProfile;
  private turnCount = 0;

  constructor(ai: AIClient, character: CharacterProfile) {
    this.ai = ai;
    this.character = character;
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  private buildSystemPrompt(): string {
    let prompt = INTERVIEW_SYSTEM_PROMPT;
    prompt += `\n\n## 你的角色设定\n\n${this.character.systemPrompt}`;
    if (this.character.characterDesignSpec) {
      prompt += `\n\n## 你的角色设定稿\n\n${this.character.characterDesignSpec}`;
    }
    return prompt;
  }

  async chat(userMessage: string): Promise<string> {
    this.history.push({ role: "user", content: userMessage });
    this.turnCount++;

    const messages: ChatMessage[] = [
      { role: "system", content: this.buildSystemPrompt() },
      ...this.history,
    ];

    const reply = await this.ai.chat(messages, { temperature: 0.8 });
    this.history.push({ role: "assistant", content: reply });
    return reply;
  }

  async generateDossier(): Promise<CharacterDossier> {
    const conversationLog = this.history
      .map((m) => `${m.role === "user" ? "访谈者" : this.character.name}: ${m.content}`)
      .join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: PROFILE_GENERATION_PROMPT,
      },
      {
        role: "user",
        content: `## 角色基础信息\n名字: ${this.character.name}\n设定: ${this.character.systemPrompt}\n\n## 访谈记录\n${conversationLog}`,
      },
    ];

    const result = await this.ai.chat(messages, {
      temperature: 0.3,
      max_tokens: 4096,
    });

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [
      null,
      result,
    ];
    const jsonStr = jsonMatch[1]!.trim();
    return JSON.parse(jsonStr) as CharacterDossier;
  }
}

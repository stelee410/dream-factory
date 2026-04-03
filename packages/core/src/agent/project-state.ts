import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CharacterProfile } from "../character/index.js";
import type { CharacterDossier } from "../interview/index.js";
import type { Script, Outline } from "../script/index.js";
import type { Storyboard } from "../storyboard/index.js";
import type { VideoOutput } from "../video/index.js";
import type { DirectorSelection } from "../director/index.js";
import { DIRECTOR_STYLES, mergeDirectorStyles, describeDirectorStyles } from "../director/index.js";

export interface DirectorStyleData {
  styles: string[];
  customDescription?: string;
  prompt: string;
  label: string;
}

export interface ProjectStatus {
  projectDir: string;
  hasCharacter: boolean;
  hasDossier: boolean;
  hasDirectorStyle: boolean;
  hasScript: boolean;
  hasStoryboard: boolean;
  hasVideos: boolean;
  theme: string | null;
}

export class ProjectState {
  readonly projectDir: string;

  character: CharacterProfile | null = null;
  dossier: CharacterDossier | null = null;
  directorStyle: DirectorStyleData | null = null;
  theme: string | null = null;
  outlines: Outline[] | null = null;
  script: Script | null = null;
  storyboard: Storyboard | null = null;
  videoOutput: VideoOutput | null = null;

  constructor(projectDir: string) {
    this.projectDir = resolve(projectDir);
    mkdirSync(this.projectDir, { recursive: true });
  }

  /**
   * Resolve a project directory from CLI arguments.
   * - undefined/empty → create new timestamped dir
   * - "last" → most recent dir in .dreamfactory/projects/
   * - path string → use as-is
   */
  static resolveProjectDir(arg?: string, baseDir?: string): string {
    const base = baseDir ?? process.cwd();
    const projectsRoot = join(base, ".dreamfactory", "projects");

    if (!arg || arg === "") {
      const ts = ProjectState.makeTimestamp();
      const dir = join(projectsRoot, ts);
      mkdirSync(dir, { recursive: true });
      return dir;
    }

    if (arg === "last") {
      mkdirSync(projectsRoot, { recursive: true });
      const entries = readdirSync(projectsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      if (entries.length === 0) {
        const ts = ProjectState.makeTimestamp();
        const dir = join(projectsRoot, ts);
        mkdirSync(dir, { recursive: true });
        return dir;
      }
      return join(projectsRoot, entries[entries.length - 1]!);
    }

    return resolve(arg);
  }

  private static makeTimestamp(): string {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "_",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
  }

  load(): void {
    this.character = this.readJson<CharacterProfile>("character.json");
    this.dossier = this.readJson<CharacterDossier>("dossier.json");
    this.directorStyle = this.readJson<DirectorStyleData>("director-style.json");
    this.script = this.readJson<Script>("script.json");
    this.storyboard = this.readJson<Storyboard>(join("storyboard", "storyboard.json"));
    this.videoOutput = this.readJson<VideoOutput>(join("videos", "video-output.json"));

    const meta = this.readJson<{ theme?: string }>("meta.json");
    this.theme = meta?.theme ?? null;
  }

  getStatus(): ProjectStatus {
    return {
      projectDir: this.projectDir,
      hasCharacter: this.character !== null,
      hasDossier: this.dossier !== null,
      hasDirectorStyle: this.directorStyle !== null,
      hasScript: this.script !== null,
      hasStoryboard: this.storyboard !== null,
      hasVideos: this.videoOutput !== null,
      theme: this.theme,
    };
  }

  getStatusSummary(): string {
    const s = this.getStatus();
    const lines = [
      `项目目录: ${s.projectDir}`,
      `角色: ${s.hasCharacter ? this.character!.name : "未选择"}`,
      `档案: ${s.hasDossier ? "已生成" : "未生成"}`,
      `导演风格: ${s.hasDirectorStyle ? this.directorStyle!.label : "未设置"}`,
      `主题: ${s.theme ?? "未设置"}`,
      `剧本: ${s.hasScript ? (this.script!.title ?? "已生成") : "未生成"}`,
      `分镜: ${s.hasStoryboard ? `已生成 (${this.storyboard!.shots.length} 个镜头)` : "未生成"}`,
      `视频: ${s.hasVideos ? "已生成" : "未生成"}`,
    ];
    return lines.join("\n");
  }

  saveCharacter(character: CharacterProfile): void {
    this.character = character;
    this.writeJson("character.json", character);
  }

  saveDossier(dossier: CharacterDossier): void {
    this.dossier = dossier;
    this.writeJson("dossier.json", dossier);
  }

  saveDirectorStyle(data: DirectorStyleData): void {
    this.directorStyle = data;
    this.writeJson("director-style.json", data);
  }

  saveTheme(theme: string): void {
    this.theme = theme;
    const meta = this.readJson<Record<string, unknown>>("meta.json") ?? {};
    meta.theme = theme;
    this.writeJson("meta.json", meta);
  }

  saveOutlines(outlines: Outline[]): void {
    this.outlines = outlines;
    this.writeJson("outlines.json", outlines);
  }

  saveScript(script: Script, markdown: string): void {
    this.script = script;
    this.writeJson("script.json", script);
    writeFileSync(join(this.projectDir, "script.md"), markdown, "utf-8");
  }

  saveStoryboard(storyboard: Storyboard, markdown: string): void {
    this.storyboard = storyboard;
    const sbDir = join(this.projectDir, "storyboard");
    mkdirSync(sbDir, { recursive: true });
    this.writeJson(join("storyboard", "storyboard.json"), storyboard);
    writeFileSync(join(sbDir, "storyboard.md"), markdown, "utf-8");
  }

  saveVideoOutput(output: VideoOutput): void {
    this.videoOutput = output;
    const vidDir = join(this.projectDir, "videos");
    mkdirSync(vidDir, { recursive: true });
    this.writeJson(join("videos", "video-output.json"), output);
  }

  get storyboardDir(): string {
    return join(this.projectDir, "storyboard");
  }

  get videosDir(): string {
    return join(this.projectDir, "videos");
  }

  private readJson<T>(relativePath: string): T | null {
    const fullPath = join(this.projectDir, relativePath);
    if (!existsSync(fullPath)) return null;
    try {
      const raw = readFileSync(fullPath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private writeJson(relativePath: string, data: unknown): void {
    const fullPath = join(this.projectDir, relativePath);
    writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }
}

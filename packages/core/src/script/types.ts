export interface Dialogue {
  character: string;
  line: string;
  emotion: string;
  action: string;
}

export interface Scene {
  scene_number: number;
  location: string;
  time: "日" | "夜" | "黄昏" | "清晨";
  description: string;
  dialogues: Dialogue[];
  camera_hints: string[];
}

export interface Script {
  title: string;
  genre: string;
  synopsis: string;
  scenes: Scene[];
}

export interface Outline {
  title: string;
  genre: string;
  synopsis: string;
  scene_summaries: string[];
}

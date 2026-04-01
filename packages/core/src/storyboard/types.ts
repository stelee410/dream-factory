export interface Shot {
  shot_number: number;
  scene_ref: number;
  shot_type: string;
  duration: number;
  description: string;
  dialogue: string | null;
  image_prompt: string;
  image_path: string | null;
}

export interface Storyboard {
  title: string;
  shots: Shot[];
  total_duration: number;
}

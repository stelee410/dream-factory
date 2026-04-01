export interface VideoClip {
  shot_number: number;
  duration: number;
  image_path: string;
  dialogue: string | null;
  clip_path: string | null;
}

export interface VideoOutput {
  clips: VideoClip[];
  final_path: string;
  total_duration: number;
}

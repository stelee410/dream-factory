export interface CameraInfo {
  movement: string;
  angle: string;
  lens: string;
}

export interface LightingInfo {
  type: string;
  color_tone: string;
}

export interface AudioInfo {
  dialogue: string;
  sfx: string;
  music: string;
}

export interface SubSegment {
  seg_id: string;
  start_frame: string | null;
  end_frame: string | null;
  duration: number;
}

export interface Shot {
  shot_number: number;
  scene_ref: number;
  shot_type: string;
  duration: number;
  description: string;
  scene?: string;
  camera?: CameraInfo;
  lighting?: LightingInfo;
  audio?: AudioInfo;
  mood?: string;
  dialogue: string | null;
  image_prompt: string;
  image_path: string | null;
  gen_mode: "single_ref" | "frame_stitch";
  ref_images?: string[];
  sub_segments?: SubSegment[];
}

export interface Storyboard {
  title: string;
  shots: Shot[];
  total_duration: number;
  director_style?: string;
}

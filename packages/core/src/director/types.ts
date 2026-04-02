export interface DirectorStyle {
  id: string;
  name: string;
  name_en: string;
  traits: string[];
  prompt_snippet: string;
}

export interface DirectorSelection {
  styles: DirectorStyle[];
  customDescription?: string;
}

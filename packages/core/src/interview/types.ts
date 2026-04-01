export interface CharacterDossier {
  basics: {
    name: string;
    age: string;
    identity: string;
  };
  personality: Array<{
    trait: string;
    description: string;
  }>;
  speech_style: {
    catchphrases: string[];
    manner: string;
  };
  emotions: {
    likes: string[];
    dislikes: string[];
    fears: string[];
  };
  appearance: string;
}

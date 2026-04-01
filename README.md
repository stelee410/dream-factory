# DreamFactory 梦工厂

AI-powered short drama generator for digital characters. Connect to [linkyun.co](https://linkyun.co) digital characters, interview them to build rich profiles, then generate scripts, storyboards, and videos.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **ffmpeg** (for video generation)
  - macOS: `brew install ffmpeg`
  - Linux: `apt install ffmpeg`

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys:
#   LINKYUN_API_BASE=https://linkyun.co
#   OPENROUTER_API_KEY=sk-or-v1-xxx
```

## Build

```bash
pnpm build
```

## Run

```bash
pnpm dev
# or
node packages/cli/dist/index.js
```

## Complete Flow

```
Login (linkyun.co credentials)
  → Select digital character
  → Interview (5+ rounds of conversation with the character)
  → Character dossier generated (personality, speech style, appearance)
  → Input drama theme (e.g. "职场逆袭", "甜蜜恋爱")
  → Choose from 3 AI-generated plot outlines
  → Full script generated (scenes, dialogues, camera hints)
  → Storyboard: script → shots with AI-generated images
  → Video: shots → MP4 clips → final concatenated video (720p)
```

## Output Files

All outputs are saved to `.dreamfactory/` in the working directory:

```
.dreamfactory/
├── dossiers/          # Character profiles (JSON)
├── scripts/           # Scripts (JSON + Markdown)
├── storyboards/       # Shot breakdowns + images (PNG)
└── videos/            # Video clips + final.mp4
```

## Architecture

```
packages/
├── core/              # Shared business logic
│   ├── auth/          # linkyun.co authentication
│   ├── character/     # Digital character management
│   ├── ai/            # OpenRouter AI client
│   ├── interview/     # Character interview engine
│   ├── script/        # Script generation engine
│   ├── storyboard/    # Storyboard breakdown + image generation
│   └── video/         # Video generation (ffmpeg)
└── cli/               # Ink (React for CLI) application
    └── screens/       # Login, CharacterSelect, Interview, etc.
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| CLI | Ink (React for CLI) |
| AI (text) | Claude via OpenRouter |
| AI (images) | Gemini Flash Image via OpenRouter |
| Video | ffmpeg (image-to-video + concat) |
| Monorepo | pnpm workspaces |
| API | linkyun.co REST API |

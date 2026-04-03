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

### Linear Mode (guided step-by-step)

```bash
pnpm dev
# or
node packages/cli/dist/index.js
```

### Agent Mode (AI-powered interactive assistant)

```bash
# New project
node packages/cli/dist/index.js agent

# Resume the most recent project
node packages/cli/dist/index.js agent last

# Resume a specific project directory
node packages/cli/dist/index.js agent .dreamfactory/projects/20260402_103410
```

Agent mode provides an AI assistant that can freely call pipeline tools based on natural language instructions. You can re-interview, change director styles, rewrite scripts, regenerate storyboards or videos at any point.

Commands in agent mode: `/login`, `/status`, `/done` (end interview), `/quit`.

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

Each run creates a timestamped project directory under `.dreamfactory/projects/`:

```
.dreamfactory/projects/YYYYMMDD_HHMMSS/
├── character.json       # Selected character profile
├── dossier.json         # Character dossier from interview
├── director-style.json  # Director style selection
├── script.json          # Full script (JSON)
├── script.md            # Full script (readable)
├── storyboard/          # Shot breakdowns + AI-generated images (PNG)
│   ├── storyboard.json
│   ├── storyboard.md
│   └── shot_01.png ...
└── videos/              # Video clips + final.mp4
    ├── shot_01.mp4 ...
    └── final.mp4
```

## Architecture

```
packages/
├── core/              # Shared business logic
│   ├── auth/          # linkyun.co authentication
│   ├── character/     # Digital character management
│   ├── ai/            # OpenRouter AI client (+ tool calling)
│   ├── interview/     # Character interview engine
│   ├── director/      # Director style presets
│   ├── script/        # Script generation engine
│   ├── storyboard/    # Storyboard breakdown + image generation
│   ├── video/         # Video generation (ffmpeg)
│   └── agent/         # AI Agent (tool calling, project state)
└── cli/               # Ink (React for CLI) application
    ├── screens/       # Login, CharacterSelect, Interview, etc.
    └── AgentChat.tsx  # Agent mode chat interface
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

# DreamFactory 梦工厂

AI-powered short drama generator for digital characters. Interview [linkyun.co](https://linkyun.co) digital characters, build rich profiles, then generate scripts, storyboards, and videos — all from your terminal.

## Quick Start

```bash
# Install
npm install -g github:stelee410/dream-factory

# Configure API keys
dreamfactory init

# Start creating
dreamfactory
```

### Prerequisites

- **Node.js** >= 20
- **ffmpeg** — for video concatenation
  - macOS: `brew install ffmpeg`
  - Linux: `apt install ffmpeg`

## Configuration

### Where values are loaded

The CLI reads **`./.env` first**, then **`~/.dreamfactory/.env`**. Each file only sets a key if it is **not already set** in `process.env`, so values already exported in your shell win, then the local file, then the global file fills remaining gaps (`packages/cli/src/load-env.ts`).

Copy [`.env.example`](./.env.example) to `.env` as a starting point.

### linkyun.co vs third-party keys

| Key | Purpose |
|-----|---------|
| `LINKYUN_API_BASE` | linkyun.co API base URL (default: `https://linkyun.co`) |
| `LINKYUN_API_KEY` | From linkyun **login** JSON `data.api_key` (same as `data.creator.api_key`). The linkyun-agent backend generates it as `sk-` + 48 hex characters (~51 chars). It is **not** OpenRouter (`sk-or-v1-…`) or Anthropic (`sk-ant-…`); keys with those prefixes do not come from this login API. |
| `LINKYUN_WORKSPACE_CODE` | Workspace code from login — header `X-Workspace-Code`. |
| `LINKYUN_USERNAME` | Optional; for display only. |

Prefer signing in inside the CLI and choosing to save the session to the local `.env`; then you do not need to hand-copy keys.

**Where is the real `LINKYUN_API_KEY`?** The **canonical** value lives on the linkyun server (per creator). The CLI only **receives** it in the login JSON and keeps a copy in **memory**; optional **save to `.env`** writes that same value to disk. Anything wrong or placeholder-like in `.env` is just a stale or mistaken file — it is not authoritative.

**Why does password login still work with a bad `LINKYUN_API_KEY` in `.env`?** Interactive login uses **only username + password** in `POST /api/v1/auth/login`; it does **not** read or check `LINKYUN_API_KEY` from the environment. The response body carries the real `api_key`, which replaces in-memory session for that run. **Auto-login from `.env`** (`tryRestoreFromEnv`) only requires non-empty strings and does not pre-validate the key; bad values show up later as API errors (e.g. 401) when listing characters or similar.

**I use auto-restore, my `.env` key looks “wrong”, but listing characters still works — why?** `load-env` **never overwrites** a variable that already exists on `process.env`. If your shell, IDE / Cursor task env, Docker, or `~/.profile` has already exported `LINKYUN_API_KEY` / `LINKYUN_WORKSPACE_CODE`, those values win — the matching lines in the project `.env` are **skipped** when loading (`packages/cli/src/load-env.ts`). Auto-restore and character list then use the **effective** env vars, not necessarily what you see in the file. Compare: `grep ^LINKYUN_ .env` vs starting the CLI from the same terminal with `echo $LINKYUN_API_KEY` (if the latter is non-empty before launch, it overrides the file).

| Key | Purpose |
|-----|---------|
| `LLM_BASE_URL` | Base URL for OpenAI-compatible chat API (default `https://openrouter.ai/api/v1`) |
| `LLM_MODEL` | Model id (default `anthropic/claude-sonnet-4`) |
| `LLM_API_KEY` | API key for that endpoint. If unset, `OPENROUTER_API_KEY` is still accepted. |
| `WAN_API_KEY` | Storyboard images (Alibaba Wan2.7), optional |
| `SEEDANCE_API_KEY` | Video generation (Seedance), optional |

### Global interactive setup

Prompts for the global file keys (LLM, Wan, Seedance, and base URL — not linkyun session):

```bash
dreamfactory init
```

## Usage

```bash
dreamfactory                  # New project (agent mode)
dreamfactory last             # Resume most recent project
dreamfactory <path>           # Resume specific project
dreamfactory init             # Configure API keys
dreamfactory linear           # Linear mode (guided step-by-step)
dreamfactory --help           # Show help
dreamfactory --version        # Show version
```

The current directory is your workspace. All project data is saved under `dreamfactory/projects/` in that directory.

## Agent Mode

The default mode. An AI assistant interprets natural language and calls pipeline tools on your behalf.

**What you can do:**

- Select a character and conduct an interview
- Set a drama theme and director style
- Generate plot outlines, scripts, and storyboards
- Regenerate individual storyboard images or video shots
- Reorder shots and re-concatenate the final video
- Re-do any step at any point without starting over

**Keyboard:**
- `↑` / `↓` — browse input history (up to 100 entries)
- `/status` — view project status
- `/done` — end interview and generate dossier
- `/quit` — exit

## Complete Flow

```
Login (linkyun.co credentials)
  → Select digital character
  → Interview (5+ rounds of conversation)
  → Character dossier generated (personality, speech style, appearance)
  → Set drama theme (e.g. "职场逆袭", "甜蜜恋爱")
  → Set director style (cinematic, anime, documentary, etc.)
  → Choose from 3 AI-generated plot outlines
  → Full script generated (scenes, dialogues, camera directions)
  → Storyboard: script → shots with AI-generated images (Wan2.7)
  → Video: shots → MP4 clips → final concatenated video
```

## Project Output

Each project is a timestamped directory:

```
dreamfactory/projects/YYYYMMDD_HHMMSS/
├── character.json       # Selected character profile
├── dossier.json         # Character dossier from interview
├── director-style.json  # Director style selection
├── meta.json            # Theme and metadata
├── outlines.json        # Generated plot outlines
├── script.json          # Full script (structured)
├── script.md            # Full script (readable)
├── storyboard/
│   ├── storyboard.json  # Shot breakdown (structured)
│   ├── storyboard.md    # Shot breakdown (readable)
│   └── shot_01.png ...  # AI-generated storyboard images
└── videos/
    ├── shot_01.mp4 ...  # Individual shot videos
    ├── video-output.json
    └── final.mp4        # Concatenated final video
```

## Development

```bash
git clone https://github.com/stelee410/dream-factory.git
cd dream-factory
pnpm install
pnpm build        # TypeScript compilation (monorepo)
pnpm build:bundle # Single-file CLI bundle (tsup)
npm link          # Make `dreamfactory` available globally
```

### Architecture

```
packages/
├── core/              # Shared business logic (SDK)
│   ├── auth/          # linkyun.co authentication
│   ├── character/     # Digital character management
│   ├── ai/            # OpenRouter AI client + tool calling
│   ├── interview/     # Character interview engine
│   ├── director/      # Director style presets
│   ├── script/        # Script generation engine
│   ├── storyboard/    # Shot breakdown + Wan2.7 image generation
│   ├── video/         # Seedance video generation + ffmpeg concat
│   └── agent/         # AI agent (tool dispatch, project state)
└── cli/               # Ink (React for CLI) application
    ├── screens/       # Login, Interview, Storyboard, Video, etc.
    └── AgentChat.tsx  # Agent mode interactive chat
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / TypeScript |
| CLI | [Ink](https://github.com/vadimdemedes/ink) (React for terminals) |
| AI (text) | Claude via [OpenRouter](https://openrouter.ai) |
| AI (images) | [Wan2.7](https://bailian.console.aliyun.com) (Alibaba Cloud Bailian) |
| AI (video) | Seedance (image-to-video) |
| Video | ffmpeg (concatenation) |
| Build | tsup + esbuild (single-file bundle) |
| Monorepo | pnpm workspaces |
| API | [linkyun.co](https://linkyun.co) REST API |

## License

MIT

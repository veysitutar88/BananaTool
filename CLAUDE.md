# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (HMR)
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

No test suite is configured.

## Environment Variables

Create a `.env.local` file with:

```
VITE_GEMINI_API_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Supabase is optional — all storage/DB calls gracefully no-op when vars are absent. Gemini key is required for any AI functionality.

## Architecture

**Nano Banana Studio** is a single-page AI portrait generation tool. The entire application state lives in `src/App.tsx` (one large component, no routing, no global state library).

### Generation Pipeline

The core flow is a multi-step pipeline orchestrated in `App.tsx`:

1. **Extract Character DNA** (`src/services/gemini.ts` → `extractImageJson`) — Sends reference images to a Gemini text model; returns a structured JSON describing immutable physical traits (eyes, skin, face geometry, etc.).
2. **Extract Scene DNA** (`extractSceneJson`) — Sends a scene reference image; returns a JSON describing environment, lighting, camera, atmosphere.
3. **Edit DNA** (`editImageJson`) — Freeform JSON editing via natural language or image reference.
4. **Build prompt** (`buildImagePromptFromDna`) — Merges Character DNA JSON + Scene DNA JSON + user scene instructions into a single cinematic prose prompt.
5. **Enhance prompt** (`enhancePrompt`) — Optional step that enriches an existing prompt with optics, lighting, and film science details.
6. **Generate image** (`src/services/imageGenerator.ts` → `generateImage`) — Routes to either `generateWithGeminiImage` (supports reference images) or `generateWithImagen` (text-only, deprecated).

### Image Generation Backends

Defined in `src/lib/ai/imageModels.ts` (the single source of truth for all model IDs):

- **Gemini Image models** (`type: "gemini-image"`) — Use the REST `generateContent` endpoint with `responseModalities: ["TEXT", "IMAGE"]`. Accept reference images as `inlineData` parts. One image per API call; looped for `sampleCount`. Active models: `gemini-2.5-flash-image` (Nano Banana), `gemini-3.1-flash-image-preview` (Nano Banana 2), `gemini-3-pro-image-preview` (Nano Banana Pro).
- **Imagen models** (`type: "imagen"`) — Use the `/predict` endpoint. Text-only, no reference images. All `imagen-4.0-*` are deprecated (shutdown June 24, 2026).

When reference images are present, a `system_instruction` (`DNA_SYSTEM_INSTRUCTION`) is injected at the top level to enforce a strict data hierarchy: character refs > DNA JSON text > scene narrative.

### Reference Image Slots

`App.tsx` manages two blocks of image slots:
- **Block 1 — Character references**: 6 named slots (front, profile, 45°, close-up, full body, turnaround) for face/identity anchoring.
- **Block 2 — Scene/item references**: 1 scene carrier slot + 5 item slots. Scene image is placed first in the API request; item images are placed last.

The image order in the request body is: `[charDNA text part] → [sceneDNA text part] → [prose prompt text] → [scene ref image] → [character ref images] → [item images]`.

### Storage (`src/services/storage.ts`)

All storage is via Supabase. Three DB tables (each requires manual SQL setup — schema is in the file header comments):
- `generations` — history of generated images (prompt, model, DNA JSON, image URL)
- `user_presets` — user-saved scene prompts
- `character_profiles` — named Character DNA JSON profiles with optional thumbnail

Images are stored in a Supabase Storage bucket named `generated` (must be created as public).

### Supabase Client (`src/lib/supabase.ts`)

Returns `null` when env vars are missing. All storage functions check for `null` before any call and silently return empty/no-op. Never assume `supabase` is non-null.

### PNG Metadata (`src/lib/refgen/pngMetadata.ts`)

Pure-JS implementation of PNG iTXt chunk read/write. Used to embed and recover Character DNA JSON directly inside generated PNG files — enabling "load from file" workflows without a database.

### Logging (`src/utils/logger.ts`)

Singleton `logger` with scoped loggers, watchdog timers, and a 100-entry ring buffer. Every service uses `logger.scope('ModuleName')` at the top of the file. In dev, `window.__log` exposes the logger in the browser console. The `watchdog()` helper wraps async calls with soft timeout warnings (does not cancel the promise).

### Safety (`src/lib/ai/imageSafety.ts`)

Central safety config imported by both backends. Policy: MEDIUM passes, HIGH blocks. Never inline safety settings — always import from this file.

### Scene Presets (`src/App.tsx` → `SCENE_PRESETS`) and DNA Presets (`src/presets.ts`)

`SCENE_PRESETS` (defined inline in App.tsx) are 20 cinematic scene prompts with aspect ratios and "hook" captions. `src/presets.ts` exports `PRESETS` — a set of structured DNA JSON templates used as starting points.

### Text Models

`TEXT_MODEL_OPTIONS` in `App.tsx` lists the Gemini text models for DNA extraction and prompt building. Default is `gemini-3.1-pro-preview`. Image models are separate and managed via the `imageModels.ts` registry.

# BananaTool — Project Context

**Status:** AIF pilot initialization  
**Repository:** `veysitutar88/BananaTool`  
**Working branch:** `codex/aif-pilot-initialization`

## Product

BananaTool (also labelled **Nano Banana Studio**) is a single-page tool for constructing reusable character and scene descriptions from reference images, compiling a cinematic prompt, generating images with Gemini, and optionally storing output, presets, and character profiles in Supabase.

The pilot goal is to turn a rapidly iterated prototype into a documented, testable, and safer foundation without rebuilding the product from scratch.

## Current stack

- React 19 + TypeScript 5.9 + Vite 7
- Tailwind CSS 4
- Gemini API
- Supabase Storage and Postgres (optional at runtime)
- Vercel static deployment configuration

## Current generation flow

1. Extract Character DNA from reference images.
2. Extract optional Scene DNA.
3. Edit structured DNA with a natural-language instruction.
4. Build or enhance a cinematic prompt.
5. Generate one to four images.
6. Save a PNG with embedded Character DNA, and optionally persist a history record, preset, or character profile.

## Current architecture

- `src/App.tsx` is a large single component holding most UI state and orchestration.
- `src/services/gemini.ts` manages text-model calls.
- `src/services/imageGenerator.ts` manages image requests.
- `src/services/storage.ts` manages optional Supabase reads and writes.
- `src/lib/ai/imageModels.ts` is the model registry.
- `src/lib/refgen/pngMetadata.ts` manages embedded PNG metadata.

## Constraints

- Do not expose long-lived Gemini credentials in browser bundles.
- Do not run paid model calls, alter Supabase production data, or deploy without explicit owner approval.
- Preserve the existing Character DNA / Scene DNA workflow during migration.
- Make all external-model changes explicit and capability-driven.
- All behavior changes require lint, build, and relevant automated tests.
- Do not install duplicate AIF skills: the required global skills are already available.
- Work through a branch and review before merging into `main`.

## Known risks to address

- The legacy `@google/generative-ai` SDK is no longer actively maintained.
- Preview Gemini image model IDs and Imagen routes require migration or removal.
- The current `VITE_GEMINI_API_KEY` design exposes calls from client code.
- Supabase sample SQL grants broad anonymous access and uses a public bucket.
- The project has no automated test suite or CI.
- The default README is a Vite template rather than product documentation.

## Success criteria for this pilot

The repository has a truthful product description, an actionable modernization plan, a reproducible quality baseline, a tested path toward current Gemini models, and a documented security migration path.
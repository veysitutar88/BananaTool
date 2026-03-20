/**
 * imageModels.ts — Unified image generation model registry
 *
 * Single source of truth for all image generation models.
 * UI shows `label`, API receives `modelId`, metadata stores both.
 *
 * Routing:
 *   - type "gemini-image" → generateWithGeminiImage  (supports reference images)
 *   - type "imagen"       → generateWithImagen        (text-only, Vertex AI /predict)
 */

export interface ImageModel {
  /** Unique internal key used as React key and state value */
  id: string;
  /** Display name shown in UI dropdowns and result metadata */
  label: string;
  /** Exact model ID sent to the API — never use aliases */
  modelId: string;
  /** API provider */
  provider: 'google';
  /** Routing backend */
  type: 'gemini-image' | 'imagen';
  /** Show in dropdowns. false = deprecated/disabled entry kept for history display only */
  active: boolean;
  /** Short description shown as dropdown subtext */
  note: string;
  /**
   * Max total reference images for this model (inline_data parts, excluding text).
   * Flash: 14 (4 character + 10 object). Pro: 11 (5 character + 6 object).
   * Source: Google AI Developers docs, March 2026.
   */
  maxRefs?: number;
  /** Max character (face) reference images within maxRefs */
  maxCharRefs?: number;
}

// ─── Gemini Image Models (native image generation + reference image support) ──

export const GEMINI_IMAGE_MODELS: ImageModel[] = [
  {
    id: 'nano-banana',
    label: 'Nano Banana',
    modelId: 'gemini-2.5-flash-image',
    provider: 'google',
    type: 'gemini-image',
    active: true,
    note: 'GA stable · 14 refs · fastest',
    maxRefs: 14,
    maxCharRefs: 4,
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    modelId: 'gemini-3.1-flash-image-preview',
    provider: 'google',
    type: 'gemini-image',
    active: true,
    note: 'Preview · 14 refs · 4K · latest Flash',
    maxRefs: 14,
    maxCharRefs: 4,
  },
  {
    id: 'nano-banana-pro',
    label: 'Nano Banana Pro',
    modelId: 'gemini-3-pro-image-preview',
    provider: 'google',
    type: 'gemini-image',
    active: true,
    note: 'Preview · 11 refs · studio quality',
    maxRefs: 11,
    maxCharRefs: 5,
  },
];

// ─── Imagen Models (text-only, Vertex AI /predict endpoint) ──────────────────

export const IMAGEN_MODELS: ImageModel[] = [
  {
    id: 'imagen-4-ultra',
    label: 'Imagen 4 Ultra',
    modelId: 'imagen-4.0-ultra-generate-001',
    provider: 'google',
    type: 'imagen',
    active: true,
    note: 'Deprecated — shutdown June 24, 2026',
  },
  {
    id: 'imagen-4',
    label: 'Imagen 4',
    modelId: 'imagen-4.0-generate-001',
    provider: 'google',
    type: 'imagen',
    active: true,
    note: 'Deprecated — shutdown June 24, 2026',
  },
  {
    id: 'imagen-4-fast',
    label: 'Imagen 4 Fast',
    modelId: 'imagen-4.0-fast-generate-001',
    provider: 'google',
    type: 'imagen',
    active: true,
    note: 'Deprecated — shutdown June 24, 2026',
  },
];

// ─── Combined registry ────────────────────────────────────────────────────────

export const ALL_IMAGE_MODELS: ImageModel[] = [
  ...GEMINI_IMAGE_MODELS,
  ...IMAGEN_MODELS,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Look up a model by its exact modelId. Returns undefined if not in registry. */
export function getModelByModelId(modelId: string): ImageModel | undefined {
  return ALL_IMAGE_MODELS.find((m) => m.modelId === modelId);
}

/** Look up a model by its registry id key. */
export function getModelById(id: string): ImageModel | undefined {
  return ALL_IMAGE_MODELS.find((m) => m.id === id);
}

/** Get the display label for a modelId. Falls back to the raw modelId string. */
export function getModelLabel(modelId: string): string {
  return getModelByModelId(modelId)?.label ?? modelId;
}

/** Returns true for models that use the Gemini image generation backend. */
export function isGeminiImageModelId(modelId: string): boolean {
  return getModelByModelId(modelId)?.type === 'gemini-image'
    || (modelId.includes('-image') && !modelId.startsWith('imagen-'));
}

/** Default model used on first load */
export const DEFAULT_IMAGE_MODEL = GEMINI_IMAGE_MODELS[0]; // Nano Banana

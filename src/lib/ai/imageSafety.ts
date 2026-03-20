/**
 * imageSafety.ts — Centralised safety config for image generation
 *
 * Policy:
 *   - MEDIUM severity → passes (social media content, realistic people, fashion)
 *   - HIGH severity   → blocked
 *   - BLOCK_NONE / disabling safety entirely → never used
 *   - Person generation: adults only (allow_adult)
 *
 * Used by:
 *   - generateWithGeminiImage  (Gemini image models via REST generateContent)
 *   - generateWithImagen       (Imagen 4 models via REST /predict)
 *
 * Both entry points import from here — never duplicate safety inline.
 */

// ─── Imagen: /predict endpoint parameters ────────────────────────────────────
// Passed directly inside `parameters` of the predict request body.

export const IMAGE_SOCIAL_SAFETY_IMAGEN = {
  personGeneration: 'allow_adult',
  safetySetting: 'block_only_high',
} as const;

// ─── Gemini image models: generateContent safetySettings array ───────────────
// Passed as top-level `safetySettings` alongside `contents` in the request body.

export const IMAGE_SOCIAL_SAFETY_GEMINI = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_ONLY_HIGH' },
] as const;

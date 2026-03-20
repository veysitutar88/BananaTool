/**
 * imageGenerator.ts
 *
 * Handles all image generation calls.
 *
 * Two distinct backends:
 *
 *   A) Gemini Image Models  (gemini-*-image, gemini-*-image-preview)
 *      — Uses REST API with responseModalities: ["TEXT", "IMAGE"]
 *      — Accepts referenceImages as inlineData parts
 *      — Returns base64-encoded PNG as data URL
 *      — Generates one image per API call (looped for sampleCount)
 *      — Current active models (March 2026):
 *          • gemini-2.5-flash-image          (Nano Banana, Stable)
 *          • gemini-3.1-flash-image-preview  (Nano Banana 2, up to 14 refs, 4K)
 *
 *   B) Imagen Models  (imagen-4.0-*)
 *      — Uses /predict REST endpoint
 *      — Text prompt only — no reference image input
 *      — Returns base64-encoded JPEG as data URL
 *      — Useful for non-portrait generation (food, landscapes, products…)
 *      — NOTE: All imagen-4.0-* models deprecated, shutdown June 24, 2026
 */

import { logger } from '../utils/logger';
import { isGeminiImageModelId, getModelByModelId } from '../lib/ai/imageModels';
import { IMAGE_SOCIAL_SAFETY_GEMINI, IMAGE_SOCIAL_SAFETY_IMAGEN } from '../lib/ai/imageSafety';

/**
 * Result from generateImage.
 * `images`     — array of data URLs (one per requested sample).
 * `signatures` — parallel array of thoughtSignature strings (null when the model
 *                did not emit one). Pass a non-null signature back as
 *                `previousTurn.thoughtSignature` on the next call to enable
 *                multi-turn image-editing continuity.
 */
export interface GenerateImageResult {
  images: string[];
  signatures: (string | null)[];
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const log = logger.scope('ImageGen');

const FALLBACK_PROMPT =
  'A beautiful cinematic portrait of a person, highly detailed, photorealistic, 8k resolution.';

/**
 * Convert a File object to a base64 string (without the data-URL prefix).
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// isGeminiImageModelId is imported from the unified registry in lib/ai/imageModels.ts.
// It checks the registry first, falling back to a heuristic for unknown model IDs.
const isGeminiImageModel = isGeminiImageModelId;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Instruction prepended to the prompt when a scene reference image is provided.
 * Tells the model to preserve the scene/environment and implant the DNA character into it.
 */
const SCENE_REFERENCE_PREFIX = `\
SCENE REFERENCE IMAGE (first attached image): This photo shows the TARGET SCENE / ENVIRONMENT where the character must be placed.

Preserve EXACTLY from this scene:
- Spatial composition and camera angle
- Lighting direction, color temperature, and shadow placement
- Background elements, props, and atmosphere
- Overall mood and color palette

Character implantation rules:
- Place the character described in the prompt naturally into this scene
- If the scene reference contains a person, replace them with the DNA character (same position and pose)
- Character face and identity come from the DNA description in the prompt — do NOT copy the face from the scene
- Clothing follows the scene prompt; if unspecified, dress appropriately for the scene context

CHARACTER + SCENE PROMPT:
`;

/**
 * Appended to the text prompt when item reference images are attached.
 * Instructs the model to faithfully reproduce the visual appearance of the items.
 */
const ITEM_VISUAL_NOTE = `

ITEM REFERENCE IMAGES (last attached images): These are the exact visual items (clothing, accessories, products) to be worn or held by the character. Match their exact color, texture, logo, and style faithfully.`;

/**
 * System instruction injected at the request level (highest parsing priority).
 *
 * Establishes a strict data hierarchy so JSON/DNA constraints always win over
 * scene narrative, preventing context leaking and attention dilution.
 *
 * Sources: Gemini API system_instruction field (v1beta), Google prompting best practices.
 */
const DNA_SYSTEM_INSTRUCTION = `You are a precision rendering engine for photorealistic character generation.

DATA HIERARCHY (strict priority order):
1. CHARACTER REFERENCE IMAGES — absolute visual truth for face geometry, skin texture, and identity. These are immutable anchors.
2. DNA CONSTRAINT TEXT (JSON-derived parameters in the prompt) — overrides any conflicting scene description.
3. SCENE NARRATIVE TEXT — describes environment, lighting, and composition only. Must NOT influence character anatomy.

HARD RULES:
- Character facial geometry, eye shape, skin tone, and distinctive marks are LOCKED to the reference images. Never deviate.
- Scene lighting and color palette must NOT bleed onto the character's face or alter their established skin tone.
- If scene and character descriptions conflict on any trait, the character description wins.
- Never hallucinate features absent from the references.
- Maintain aspect ratio exactly as specified. Never crop the subject unexpectedly.`;

/**
 * Generate images using a Gemini Image model (Nano Banana family).
 *
 * Reference images are passed as inlineData parts alongside the text prompt.
 * The API returns images embedded in the response as inlineData parts.
 * Since the API produces one image per call, sampleCount is fulfilled via a loop.
 *
 * Supported models:
 *   - gemini-2.5-flash-image          (Stable)
 *   - gemini-3.1-flash-image-preview  (Preview — supports up to 14 reference images)
 *
 * @param sceneReference  Optional scene/environment image. Placed first in parts with an
 *                        instruction to preserve the scene and implant the DNA character into it.
 */
async function generateWithGeminiImage(
  prompt: string,
  modelName: string,
  aspectRatio: string,
  sampleCount: number,
  negativePrompt: string | undefined,
  referenceImages: File[],
  sceneReference?: File,
  itemImages?: File[],
  dnaJson?: string,
  sceneDnaJson?: string,
): Promise<GenerateImageResult> {
  // ── Reference quota validation ─────────────────────────────────────────────
  const modelMeta = getModelByModelId(modelName);
  const maxRefs = modelMeta?.maxRefs ?? 14;
  const totalRefs = referenceImages.length + (sceneReference ? 1 : 0) + (itemImages?.length ?? 0);
  if (totalRefs > maxRefs) {
    log.warn(
      `[${modelName}] total reference images (${totalRefs}) exceeds model limit (${maxRefs}). ` +
      `Excess images will likely be silently dropped by the API. ` +
      `Breakdown: charRefs=${referenceImages.length} scene=${sceneReference ? 1 : 0} items=${itemImages?.length ?? 0}`
    );
  }
  // Helper: safe mimeType — some files arrive with empty type (dragged from OS)
  const safeMime = (file: File) => file.type || 'image/jpeg';

  // Convert regular reference files (Block 1 character refs) to inlineData parts
  const refParts = await Promise.all(
    referenceImages.map(async (file) => ({
      inlineData: { mimeType: safeMime(file), data: await fileToBase64(file) },
    }))
  );

  // Scene reference goes FIRST — model treats it as the target environment
  const scenePart = sceneReference
    ? { inlineData: { mimeType: safeMime(sceneReference), data: await fileToBase64(sceneReference) } }
    : null;

  // Item images go LAST — model matches their exact visual appearance
  const itemParts = itemImages?.length
    ? await Promise.all(itemImages.map(async (file) => ({
        inlineData: { mimeType: safeMime(file), data: await fileToBase64(file) },
      })))
    : [];

  // Character DNA JSON — raw identity spec injected as hard constraint text part.
  // Provides a direct anchor independent of how faithfully the text model
  // translated DNA → prose during "Build from DNA". Placeholder JSON is skipped.
  const isDnaReal = dnaJson?.trim() && !dnaJson.includes('"..."') && dnaJson.trim().startsWith('{');
  const dnaPart = isDnaReal
    ? { text: `CHARACTER IDENTITY DNA (hard constraints — override any conflicting scene description):\n${dnaJson}` }
    : null;

  // Scene DNA JSON — raw environment spec injected as separate hard constraint text part.
  // Dual-DNA architecture: character + scene JSONs each anchor their respective
  // dimensions independently. Placeholder JSON is skipped.
  const isSceneDnaReal = sceneDnaJson?.trim() && !sceneDnaJson.includes('"..."') && sceneDnaJson.trim().startsWith('{');
  const sceneDnaPart = isSceneDnaReal
    ? { text: `SCENE ENVIRONMENT DNA (hard constraints — lighting, atmosphere, color palette, location):\n${sceneDnaJson}` }
    : null;

  if (dnaPart) log.info(`[${modelName}] Character DNA injected (${dnaJson!.length} chars)`);
  if (sceneDnaPart) log.info(`[${modelName}] Scene DNA injected (${sceneDnaJson!.length} chars)`);

  // Build text: prepend scene instruction, append item note if items are attached
  const baseText = sceneReference ? `${SCENE_REFERENCE_PREFIX}${prompt}` : prompt;
  const textWithItems = itemParts.length ? `${baseText}${ITEM_VISUAL_NOTE}` : baseText;

  const finalText = negativePrompt?.trim()
    ? `${textWithItems}\n\nDO NOT include in the image: ${negativePrompt.trim()}`
    : textWithItems;

  const results: string[] = [];
  const signatures: (string | null)[] = [];
  const count = Math.max(1, Math.min(4, sampleCount));
  // Holds the last API response for post-loop error reporting
  let lastData: any = null;

  for (let i = 0; i < count; i++) {
    const body = {
      // system_instruction has highest parsing priority in the Gemini API.
      // It isolates DNA constraints from scene narrative to prevent attention dilution.
      // Only injected when reference images are present (character DNA is active).
      ...(refParts.length > 0 ? {
        system_instruction: {
          parts: [{ text: DNA_SYSTEM_INSTRUCTION }],
        },
      } : {}),
      contents: [
        {
          parts: [
            // 1. Character DNA JSON — raw identity spec (face, skin, body)
            ...(dnaPart ? [dnaPart] : []),
            // 2. Scene DNA JSON — raw environment spec (lighting, location, palette)
            ...(sceneDnaPart ? [sceneDnaPart] : []),
            // 3. Prose prompt — natural-language synthesis of both JSONs
            { text: finalText },
            // Scene reference first → model treats it as the target environment
            ...(scenePart ? [scenePart] : []),
            // Block 1 character refs → DNA source, face identity
            ...refParts,
            // Item refs last → clothing/accessories to reproduce visually
            ...itemParts,
          ],
        },
      ],
      // Safety: MEDIUM passes, HIGH is blocked. Adults only. No BLOCK_NONE.
      safetySettings: IMAGE_SOCIAL_SAFETY_GEMINI,
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        // imageConfig: aspectRatio is supported in v1beta for Nano Banana models.
        // NOTE: personGeneration is an Imagen-only field — Gemini image models
        // do NOT support it and return 400 "Cannot find field". Content policy
        // for Gemini is handled via safetySettings above.
        imageConfig: {
          aspectRatio,
        },
      },
    };

    const res = await fetch(
      `${GEMINI_BASE}/${modelName}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const errMsg = errBody?.error?.message ?? JSON.stringify(errBody);
      const totalParts = (scenePart ? 1 : 0) + refParts.length + itemParts.length;
      log.error(`API ${res.status} [${modelName}] — ${errMsg}`);
      log.error(`parts breakdown: text=1 scene=${scenePart ? 1 : 0} refs=${refParts.length} items=${itemParts.length} total=${totalParts + 1}`);
      throw new Error(
        `Gemini Image API ${res.status} [${modelName}]: ${errMsg}`
      );
    }

    lastData = await res.json();
    const data = lastData;
    const candidate = data?.candidates?.[0];
    const finishReason: string = candidate?.finishReason ?? 'UNKNOWN';
    const parts: any[] = candidate?.content?.parts ?? [];
    const imgPart = parts.find((p: any) => p.inlineData?.data);

    if (imgPart) {
      const mime = imgPart.inlineData.mimeType || 'image/png';
      results.push(`data:${mime};base64,${imgPart.inlineData.data}`);

      // Extract thoughtSignature — required for multi-turn image editing sessions.
      // The signature encodes the model's internal reasoning state for this image.
      // Must be passed back verbatim in subsequent edit requests to prevent amnesia.
      // Source: https://ai.google.dev/gemini-api/docs/thought-signatures
      const sigPart = parts.find((p: any) => p.thoughtSignature);
      const sig: string | null = sigPart?.thoughtSignature ?? null;
      signatures.push(sig);

      if (sig) {
        log.info(`[${modelName}] image ${i + 1}/${count} — OK  finishReason=${finishReason}  thoughtSignature=present(${sig.length}b)`);
      } else {
        log.info(`[${modelName}] image ${i + 1}/${count} — OK  finishReason=${finishReason}`);
      }
    } else {
      // Log the full safety picture so we can diagnose filter hits
      const ratings = candidate?.safetyRatings ?? [];
      const ratingSummary = ratings
        .map((r: any) => `${r.category?.replace('HARM_CATEGORY_', '')}=${r.probability}`)
        .join(' ');
      log.warn(
        `[${modelName}] image ${i + 1}/${count} — NO IMAGE  finishReason=${finishReason}` +
        (ratingSummary ? `  safety=[${ratingSummary}]` : '')
      );
      if (data?.promptFeedback?.blockReason) {
        log.error(`[${modelName}] prompt blocked — ${data.promptFeedback.blockReason}`);
      }
    }
  }

  if (results.length === 0) {
    const lastCandidate = lastData?.candidates?.[0];
    const reason = lastCandidate?.finishReason ?? 'unknown';
    throw new Error(
      `Gemini Image API [${modelName}] returned 0 images. finishReason=${reason}. ` +
      'Check console for safety ratings.'
    );
  }

  return { images: results, signatures };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate images using an Imagen 4 model via the /predict endpoint.
 *
 * Accepts text prompts only — reference images are NOT supported by Imagen.
 * Useful for general-purpose generation: landscapes, food, products, etc.
 *
 * NOTE: All imagen-4.0-* models are deprecated and will be shut down June 24, 2026.
 */
async function generateWithImagen(
  prompt: string,
  modelName: string,
  upscale: string,
  aspectRatio: string,
  sampleCount: number,
  negativePrompt?: string,
): Promise<GenerateImageResult> {
  const count = Math.max(1, Math.min(4, sampleCount));
  const url = `${GEMINI_BASE}/${modelName}:predict?key=${API_KEY}`;

  const body: Record<string, any> = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: count,
      aspectRatio,
      outputOptions: { mimeType: 'image/jpeg' },
      // Safety: MEDIUM passes, HIGH is blocked. Adults only. No BLOCK_NONE.
      ...IMAGE_SOCIAL_SAFETY_IMAGEN,
      ...(upscale !== 'none' ? { upscaleFactor: upscale } : {}),
      ...(negativePrompt?.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      `Imagen API ${response.status} — ${errorData?.error?.message ?? JSON.stringify(errorData)}`
    );
  }

  const data = await response.json();
  if (!data.predictions?.length) {
    throw new Error('No images in Imagen API response.');
  }

  const images = data.predictions.map(
    (p: { bytesBase64Encoded: string }) => `data:image/jpeg;base64,${p.bytesBase64Encoded}`
  );
  // Imagen does not emit thought signatures
  return { images, signatures: images.map(() => null) };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point for image generation.
 *
 * Routes to the correct backend based on model name:
 *   - gemini-*-image* → generateWithGeminiImage (supports reference images)
 *   - imagen-*        → generateWithImagen (text prompt only)
 *
 * @param prompt          The cinematic text prompt (built from DNA + scene).
 * @param modelName       Model ID. Defaults to gemini-2.5-flash-image.
 * @param upscale         Upscale factor for Imagen ('none' | 'x2' | 'x3' | 'x4').
 * @param aspectRatio     Output aspect ratio (e.g. '9:16', '1:1').
 * @param sampleCount     Number of images to generate (1–4).
 * @param negativePrompt  Things to avoid (passed to Imagen; woven into prompt for Gemini).
 * @param referenceImages Reference photo files (used only by Gemini image models).
 * @param sceneReference  Optional scene/environment image (Block 2 Scene Carrier slot).
 *                        The character from Block 1 DNA is implanted into this scene.
 *                        Only used by Gemini image models — ignored by Imagen (text-only).
 * @param itemImages      Optional item/clothing images (Block 2 item slots).
 *                        Passed as visual references after Block 1 refs so the model can
 *                        faithfully reproduce exact color, texture, logo, and style.
 *                        Only used by Gemini image models — ignored by Imagen (text-only).
 * @param dnaJson         Optional raw DNA JSON string. When present and valid, injected
 *                        directly as a text part in the image model request — providing a
 *                        hard identity anchor independent of the prose prompt translation.
 *                        Only used by Gemini image models — ignored by Imagen (text-only).
 * @returns               Array of data URLs for the generated images.
 */
export async function generateImage(
  prompt: string,
  modelName: string = 'gemini-2.5-flash-image',
  upscale: string = 'none',
  aspectRatio: string = '1:1',
  sampleCount: number = 1,
  negativePrompt?: string,
  referenceImages: File[] = [],
  sceneReference?: File,
  itemImages?: File[],
  dnaJson?: string,
  sceneDnaJson?: string,
): Promise<GenerateImageResult> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set.');

  log.info(
    `generate — model=${modelName}  aspect=${aspectRatio}  n=${sampleCount}` +
    (sceneReference ? '  +sceneRef' : '') +
    (referenceImages.length ? `  +${referenceImages.length}refs` : '') +
    (itemImages?.length ? `  +${itemImages.length}items` : '') +
    (dnaJson && !dnaJson.includes('"..."') ? '  +charDNA' : '') +
    (sceneDnaJson && !sceneDnaJson.includes('"..."') ? '  +sceneDNA' : '')
  );

  const finalPrompt = prompt?.trim() || FALLBACK_PROMPT;

  // Watchdog: 90s for Gemini image models, 120s for Imagen
  const timeoutMs = isGeminiImageModel(modelName) ? 90_000 : 120_000;

  if (isGeminiImageModel(modelName)) {
    return logger.watchdog('ImageGen', `generate(${modelName})`,
      generateWithGeminiImage(finalPrompt, modelName, aspectRatio, sampleCount, negativePrompt, referenceImages, sceneReference, itemImages, dnaJson, sceneDnaJson),
      timeoutMs,
    );
  }

  return logger.watchdog('ImageGen', `generate(${modelName})`,
    generateWithImagen(finalPrompt, modelName, upscale, aspectRatio, sampleCount, negativePrompt),
    timeoutMs,
  );
}

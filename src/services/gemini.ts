import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { logger } from '../utils/logger';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(API_KEY);
const log = logger.scope('Gemini');

// ─── Helper: File → Gemini inline part ────────────────────────────────────────
export async function fileToGenerativePart(file: File): Promise<{
  inlineData: { data: string; mimeType: string }
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const parts = (reader.result as string).split(',');
      if (parts.length < 2 || !parts[1]) {
        reject(new Error('FileReader returned an unexpected data URL format.'));
        return;
      }
      // file.type can be empty for files dragged from the OS → fallback to jpeg
      resolve({ inlineData: { data: parts[1], mimeType: file.type || 'image/jpeg' } });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Pipeline Step 1: Extract DNA ─────────────────────────────────────────────
export async function extractImageJson(contentElements: any[], modelName: string): Promise<string> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set.');
  log.info(`extractImageJson — model=${modelName}, inputs=${contentElements.length}`);

  const prompt = `You are a forensic character analyst for high-fidelity CGI and photorealistic AI generation.
  
  TASK: Extract an absolute, clinical "Identity DNA" profile from the provided image(s).
  
  RULES:
  1. ACCURACY IS PARAMOUNT. Do not hallucinate traits that aren't there. If the subject has freckles, describe their pattern and density. If the eyes are blue-green, do not say "brown".
  2. BE CLINICAL. Use anatomical terms (e.g., "epicanthic fold", "philtrum depth", "nasolabial fold prominence").
  3. IDENTIFY ANCESTRY. Analyze bone structure and skin undertones to determine precise heritage (e.g., "Northern European/Nordic", "Ashkenazi", "South-East Asian").
  4. IMMUTABLE TRAITS ONLY. Ignore clothing, makeup, and hairstyle. Focus on: Skull shape, eye geometry, nose tip structure, jawline definition, and skin texture.
  5. DISTINCTIVE MARKS: Look for tiny details like specific mole placements, scars, or unique iris patterns.
  
  Analyze the image(s) now and provide the DNA JSON. If multiple images are provided, find the consistent features across all of them.`;

  // Expanded DNA schema for maximum identity consistency
  const dnaSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      identity: {
        type: SchemaType.STRING,
        description: "Facial geometry: skull shape, forehead height/width, face proportions (oval/round/square/heart/oblong), cheekbone prominence, jawline shape (sharp/soft/angular/rounded), chin shape, facial symmetry notes."
      },
      eyes: {
        type: SchemaType.STRING,
        description: "Eye color (exact shade), eye shape (almond/round/hooded/monolid/deep-set/wide-set/close-set), brow shape (arched/straight/bushy/thin), brow color, eyelid fold type, eye spacing, intensity/expressiveness."
      },
      nose_mouth_chin: {
        type: SchemaType.STRING,
        description: "Nose: bridge width, tip shape (rounded/pointed/bulbous/upturned/hooked), nostril width, overall nose size. Lips: upper/lower lip fullness ratio, lip shape (cupid's bow/thin/full/wide/narrow), natural lip color. Chin: projection, cleft if any."
      },
      physical_body: {
        type: SchemaType.STRING,
        description: "Estimated age range, height estimation (petite/average/tall), body frame (slim/athletic/curvy/stocky), shoulder width, waist-to-hip ratio, underlying bone structure, posture notes."
      },
      skin: {
        type: SchemaType.STRING,
        description: "Precise skin tone (use Fitzpatrick I-VI + descriptive: ivory, porcelain, warm beige, golden, olive, caramel, bronze, deep brown, ebony), undertone (cool/warm/neutral), skin texture (smooth, porous, combination), visible pores, natural flush areas."
      },
      distinctive_marks: {
        type: SchemaType.STRING,
        description: "Permanent distinguishing features: moles, birthmarks, scars, freckle patterns, dimples, under-eye characteristics, prominent veins, skin conditions. Note exact location (e.g. 'mole above right upper lip'). Write 'none' if absent."
      },
      ethnicity_ancestry: {
        type: SchemaType.STRING,
        description: "Perceived ethnic/racial background based on visible facial features. Be specific (e.g. 'Northern European / Scandinavian', 'East Asian — Korean', 'Mixed: South Asian + European'). This informs model consistency."
      },
      hair_natural_base: {
        type: SchemaType.STRING,
        description: "Natural (root) hair color and texture ONLY — ignore styled hairstyle and length. E.g. 'natural dark brown, fine straight strands' or 'coarse black with slight wave at root'."
      }
    },
    required: ["identity", "eyes", "nose_mouth_chin", "physical_body", "skin", "distinctive_marks", "ethnicity_ancestry", "hair_natural_base"]
  };

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: dnaSchema,
    }
  });

  return logger.watchdog('Gemini', 'extractImageJson', (async () => {
    try {
      const result = await model.generateContent([prompt, ...contentElements]);
      return result.response.text();
    } catch (err) {
      log.error('extractImageJson failed', err);
      throw err;
    }
  })(), 30_000);
}

// ─── Pipeline Step 2: Edit DNA ────────────────────────────────────────────────
export async function editImageJson(
  currentJson: string,
  editInstruction: string,
  imageParts: any[] = [],
  modelName: string
): Promise<string> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set.');
  log.info(`editImageJson — model=${modelName}, imageParts=${imageParts.length}`);

  const prompt = `You are an expert JSON editor for AI image generation prompts.

Task:
1) Take the "Current JSON" below.
2) Modify it strictly according to the "Instructions".
3) If reference image(s) are attached, use them to guide modifications (transfer style, replace subject, mimic lighting).

Instructions:
${editInstruction
    ? `- ${editInstruction}`
    : '- Apply the style, subject, or composition of the attached image(s). Add any new fields necessary.'
  }

Current JSON:
${currentJson}`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" }
  });

  return logger.watchdog('Gemini', 'editImageJson', (async () => {
    try {
      const result = await model.generateContent([prompt, ...imageParts]);
      return result.response.text();
    } catch (err) {
      log.error('editImageJson failed', err);
      throw err;
    }
  })(), 25_000);
}

// ─── Pipeline Step 2.3: Extract Scene DNA ─────────────────────────────────────
// Extracts structured environment/scene data from a single reference image.
// Parallel to extractImageJson (character), but for the scene/environment.
export async function extractSceneJson(imagePart: any, modelName: string): Promise<string> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set.');
  log.info(`extractSceneJson — model=${modelName}`);

  const scenePromptText = `You are a forensic scene analyst for photorealistic AI image generation.

TASK: Extract a precise "Scene DNA" profile from the provided image.

RULES:
1. ACCURACY IS PARAMOUNT. Describe only what is visible. Be specific and clinical.
2. LIGHTING: Note exact direction (45° from upper-left etc.), quality (hard/soft/diffused), visible color temperature in Kelvin, shadow characteristics.
3. COLOR PALETTE: List the 3–4 dominant color tones visible in the image (walls, sky, surfaces). Use descriptive names (deep indigo, warm amber, crushed black etc.).
4. CAMERA: Estimate focal length, aperture (depth of field), sensor angle. Note framing.
5. TIME + WEATHER: Deduce from light quality and sky (if visible).
6. ATMOSPHERE: The emotional and sensory quality of the scene — what it feels like.
7. BACKGROUND ELEMENTS: Specific objects, textures, and spatial depth visible behind the primary subject area.

Analyze the image now and return the Scene DNA JSON.`;

  const sceneSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      location: {
        type: SchemaType.STRING,
        description: 'Specific place: interior/exterior type, country/city style if inferrable. E.g. "Berlin U-Bahn underground station, concrete platform, Soviet-era tiled walls"',
      },
      time_of_day: {
        type: SchemaType.STRING,
        description: 'Time and light phase. E.g. "blue hour — 15 min post-sunset", "overcast midday", "harsh 2pm direct sun"',
      },
      lighting: {
        type: SchemaType.STRING,
        description: 'Primary source direction and quality, color temperature (Kelvin), secondary sources, shadow characteristics. E.g. "single overhead tungsten 2800K, hard shadows, no fill, deep crushed blacks"',
      },
      color_palette: {
        type: SchemaType.STRING,
        description: 'Dominant 3–4 tones visible in the scene. E.g. "deep navy, warm amber streetlight orange, near-black asphalt, faded white concrete"',
      },
      atmosphere: {
        type: SchemaType.STRING,
        description: 'Emotional and sensory quality. E.g. "melancholic urban solitude, end-of-night energy, cold damp air, slight tension"',
      },
      camera: {
        type: SchemaType.STRING,
        description: 'Estimated lens, aperture/DOF, framing angle. E.g. "35mm wide, f/2 shallow DOF, slightly low angle, subject in center third"',
      },
      weather: {
        type: SchemaType.STRING,
        description: 'Weather conditions. E.g. "light rain, wet surfaces, overcast", "clear dry night", "soft fog haze"',
      },
      background_elements: {
        type: SchemaType.STRING,
        description: 'Specific visible objects, surfaces, textures in the background. E.g. "neon kanji signs out-of-focus, puddles reflecting pink/red, chain-link fence left edge"',
      },
    },
    required: ['location','time_of_day','lighting','color_palette','atmosphere','camera','weather','background_elements'],
  };

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: sceneSchema,
    },
  });

  return logger.watchdog('Gemini', 'extractSceneJson', (async () => {
    try {
      const result = await model.generateContent([scenePromptText, imagePart]);
      return result.response.text();
    } catch (err) {
      log.error('extractSceneJson failed', err);
      throw err;
    }
  })(), 30_000);
}

// ─── Pipeline Step 2.5: Build Prompt from Dual DNA ────────────────────────────
// Merges Character DNA JSON + (optional) Scene DNA JSON + emotional fragment
// into one cinematic prose photography brief.
export async function buildImagePromptFromDna(
  dnaJson: string,
  sceneInstructions: string,
  modelName: string,
  characterName?: string,
  negativePrompt?: string,
  sceneDnaJson?: string,
): Promise<string> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set.');

  const nameContext = characterName?.trim()
    ? `Subject name/alias: "${characterName.trim()}" — embed this name naturally in the prompt if appropriate.\n`
    : '';

  const negContext = negativePrompt?.trim()
    ? `\nThings to EXPLICITLY AVOID (weave avoidance into the prompt language by NOT describing these things): ${negativePrompt.trim()}`
    : '';

  // When Scene DNA JSON is present, use it as the primary scene source.
  // sceneInstructions becomes the "Emotional Fragment" — a short mood cue.
  const hasSceneDna = sceneDnaJson?.trim() && !sceneDnaJson.includes('"..."');

  const sceneSection = hasSceneDna
    ? `Scene DNA JSON (environment — use ALL fields exactly):
${sceneDnaJson}

Emotional Mood Fragment (short atmospheric cue to blend into the scene):
${sceneInstructions || 'none'}`
    : `Scene Instructions:
${sceneInstructions || 'Neutral studio portrait. Soft Rembrandt lighting. 85mm f/1.8 lens. White seamless background.'}`;

  const sceneRule = hasSceneDna
    ? `- SCENE DNA: Translate ALL Scene DNA fields into the prompt exactly — location specifics, color palette names, lighting temperature in Kelvin, camera/lens, atmosphere. The Scene DNA is as immutable as the Character DNA.`
    : `- Integrate the scene instructions seamlessly after the character description.`;

  const prompt = `You are an expert AI photography director and prompt engineer for photorealistic image generation with Gemini image models.

Write a single, highly detailed, natural-language photography prompt.

You will receive:
1. A "Character DNA" JSON with the subject's immutable physical traits.
2. ${hasSceneDna ? 'A "Scene DNA" JSON with the environment\'s immutable visual parameters + a short emotional mood fragment.' : 'Scene Instructions describing the shot.'}
${nameContext}
Rules:
- Start the prompt with the subject's physical appearance drawn DIRECTLY from the Character DNA (face structure, eyes, skin tone, distinctive marks etc.)
- CRITICAL CHARACTER: Every specific detail in the Character DNA (moles, precise eye shape, nose tip, jawline, skin texture, ethnicity) MUST be translated precisely and verbatim.
- Do NOT generalize the subject. If the DNA says "mole above right upper lip" — write it. If it says "epicanthic fold" — write it.
- Include ALL Character DNA fields: identity, eyes, nose/mouth/chin, skin, distinctive marks, ethnicity, physical body.
${sceneRule}
- Write in a single continuous paragraph like a professional photography brief.
- Include: subject physical appearance (ALL character DNA) → styling/clothing → environment → lighting (Kelvin, direction) → camera angle/lens → mood/atmosphere.
- Use cinematic, evocative language.
- Do NOT use JSON terminology. Do NOT mention field names.
- Output ONLY the final prompt string. No preamble, no quotes, no explanation.
${negContext}

Character DNA JSON:
${dnaJson}

${sceneSection}`;

  log.info(`buildImagePromptFromDna — model=${modelName}  sceneDna=${hasSceneDna ? 'yes' : 'no'}`);
  const model = genAI.getGenerativeModel({ model: modelName });
  return logger.watchdog('Gemini', 'buildImagePromptFromDna', (async () => {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err) {
      log.error('buildImagePromptFromDna failed', err);
      throw err;
    }
  })(), 20_000);
}

// ─── Pipeline Step 2.6: Enhance Prompt ────────────────────────────────────────
// Takes any existing prompt and enhances it for photorealism + social media quality.
// dnaJson is optionally passed so the model knows which traits are immutable anchors.
export async function enhancePrompt(
  prompt: string,
  modelName: string,
  dnaJson?: string,
): Promise<string> {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set.');
  log.info(`enhancePrompt — model=${modelName}`);

  const systemPrompt = `You are a master AI photography prompt engineer specializing in photorealistic, social-media-ready portrait generation for Instagram and TikTok vertical format.

Your task: enhance the provided image generation prompt to maximize photorealism and visual impact.

WHAT TO ADD OR IMPROVE:
1. OPTICS: Specify lens (e.g. "Sony 85mm f/1.4 G Master"), aperture, depth-of-field character, bokeh quality
2. SENSOR: Add camera body reference (e.g. "shot on Sony A7IV", "medium format digital")
3. LIGHTING: Exact source, direction, color temperature in Kelvin (e.g. "4800K north window diffusion"), catchlight shape, shadow softness
4. SKIN: Subsurface scattering, micro-pore texture, natural skin sheen or matteness, Fitzpatrick-correct undertone
5. FILM SCIENCE: Reference a color science / film stock (e.g. "Kodak Portra 400 color science", "Fuji Superia 400", "Cinestill 800T")
6. GRAIN: Specify grain level and character (e.g. "subtle 35mm organic grain", "ISO 3200 visible grain structure")
7. MOOD: Sharpen the emotional atmosphere with specific sensory and environmental detail
8. COMPOSITION: Reinforce framing for 9:16 mobile-native vertical format, subject placement, negative space

STRICT RULES:
- DO NOT change, remove, or paraphrase ANY character identity traits (face structure, eyes, skin tone, distinctive marks — these are from DNA and are immutable)
- DO NOT change the scene, location, or clothing unless they are missing
- DO NOT add people who were not in the original prompt
- DO NOT start with a preamble like "Here is an enhanced version"
- Output ONLY the enhanced prompt string — one continuous paragraph, no preamble, no quotes, no explanation`;

  const dnaAnchor = dnaJson?.trim() && !dnaJson.includes('"..."')
    ? `\n\nIMMUTABLE DNA ANCHOR (do NOT alter any of these traits in the output):\n${dnaJson}`
    : '';

  const model = genAI.getGenerativeModel({ model: modelName });
  return logger.watchdog('Gemini', 'enhancePrompt', (async () => {
    try {
      const result = await model.generateContent(`${systemPrompt}${dnaAnchor}\n\nOriginal prompt:\n${prompt}`);
      return result.response.text().trim();
    } catch (err) {
      log.error('enhancePrompt failed', err);
      throw err;
    }
  })(), 25_000);
}

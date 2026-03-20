import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sparkles, Image as ImageIcon, Download, Copy, RefreshCw, Wand2,
  Upload as UploadIcon, Check, ChevronDown, X, AlertCircle,
  FolderOpen, Save, User, MinusCircle, History, RotateCcw,
  Bookmark, Eye, Code2, UserCircle, Dna
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractImageJson, extractSceneJson, fileToGenerativePart, editImageJson, buildImagePromptFromDna, enhancePrompt } from './services/gemini';
import { generateImage } from './services/imageGenerator';
import { uploadImage, saveGeneration, fetchGenerations, fetchUserPresets, saveUserPreset, deleteUserPreset } from './services/storage';
import type { StoredGeneration, UserPreset } from './services/storage';
import { readPngMetadata, injectPngITXt } from './lib/refgen/pngMetadata';
import { downloadFromUrl } from './utils/downloadImage';
import { GEMINI_IMAGE_MODELS, IMAGEN_MODELS, getModelLabel, DEFAULT_IMAGE_MODEL } from './lib/ai/imageModels';

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_TEXT_MODEL = 'gemini-3.1-pro-preview';
const DNA_JSON_PLACEHOLDER = '{\n  "identity": "...",\n  "eyes": "...",\n  "skin": "..."\n}';

const TEXT_MODEL_OPTIONS = [
  { value: 'gemini-3.1-pro-preview',        label: 'Gemini 3.1 Pro ✦'      },  // best vision — default
  { value: 'gemini-3-flash-preview',        label: 'Gemini 3 Flash'         },  // Agentic Vision
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite'  },  // fastest
  { value: 'gemini-2.5-pro',                label: 'Gemini 2.5 Pro'         },  // stable legacy
  { value: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash'       },  // stable legacy
  // gemini-2.0-flash deprecated — removed (shutdown June 1, 2026)
];

const REFERENCE_SLOTS = [
  { id: 'front',      label: 'Фас',             role: 'Front view' },
  { id: 'profile',    label: 'Профиль',         role: 'Side profile' },
  { id: '45deg',      label: '45°',             role: '45-degree angle' },
  { id: 'closeup',    label: 'Крупный план',    role: 'Close-up' },
  { id: 'fullbody',   label: 'Полный рост',     role: 'Full body' },
  { id: 'turnaround', label: 'Сетка ракурсов', role: 'Identity Turnaround Grid (Multiple angles of the same character)' },
];

const ITEM_SLOTS = [
  { id: 'item1', label: 'Item 1' },
  { id: 'item2', label: 'Item 2' },
  { id: 'item3', label: 'Item 3' },
  { id: 'item4', label: 'Item 4' },
  { id: 'item5', label: 'Item 5' },
];

const SCENE_PRESETS = [
  {
    id: '01', name: 'Gas Station Fit',  ar: '4:5',
    prompt: 'Woman in full elevated outfit — tailored wide-leg trousers, structured blazer, pointed mules — standing under harsh white-green fluorescent canopy of a late-night gas station, pumping gas with complete indifference, luxury handbag on forearm, face expressionless and unbothered, asphalt wet from rain with yellow line reflections, cars blurred motion in background — 35mm f/1.8 at hip level candid, ISO 3200 heavy grain, fluorescent 4100K overhead casts hard shadows under cheekbones and collarbone, skin has slight green-white cast from vapor lights, no fill, deep crushed blacks, Cinestill 800T blue-green shadow split, intentional lo-fi aesthetic, unexpected juxtaposition high fashion mundane location',
    hook: 'dressed for the wrong occasion as usual',
  },
  {
    id: '02', name: 'Blue Hour City',   ar: '9:16',
    prompt: 'Woman standing on urban rooftop during the exact 15-minute blue hour window post-sunset — deep indigo sky behind her, city lights just activating below as warm amber street glow rises, she wears a deep wine-red structured coat creating warm-cool color tension with the blue ambient, gold earrings catching last warm light, slight wind in hair, three-quarter turn face toward horizon, confident relaxed posture, rooftop ledge concrete texture — Sony A7IV 50mm f/1.4 low angle upward, ISO 800, sky graduated indigo to navy, skin lit by residual blue ambient plus warm city glow from below creating rim light effect, Fuji Velvia blue saturation in sky, skin tone preserved warm, vertical format',
    hook: 'the 15 minutes nobody talks about',
  },
  {
    id: '03', name: 'Y2K Flash Dump',   ar: '4:5',
    prompt: 'Woman at night party or street, direct on-camera flash fired at f/8 — face slightly overexposed with blown highlights on forehead and nose tip, background goes pitch black, outfit details super-crisp in flash pop, she is mid-laugh or mid-sentence caught unposed, slightly glossy skin from flash, one strand of hair frozen mid-motion across face, wearing slip dress or micro cardigan, friends partially visible at frame edge — 28mm flash candid paparazzi POV, ultra-saturated colors, Y2K tabloid aesthetic 2000s energy, slightly cool flash cast on skin vs warm ambient bleed, red-eye possible in one eye, grain from pushing digital ISO, raw and immediate feeling, authentic fun energy',
    hook: 'nobody posed for this one',
  },
  {
    id: '04', name: 'Mob Wife Night',   ar: '9:16',
    prompt: 'Woman in ornate dimly lit European hotel corridor or grand staircase, wearing oversized floor-length faux fur coat in cognac-brown, deep bold lip dark wine or oxblood, dramatic eye, gold heavy jewelry at neck and wrist, hand resting on carved stone balustrade, looking directly into lens with confrontational yet composed expression — single tungsten source 2700K from above-right creating extreme chiaroscuro, one side of face fully lit warm amber, other side in near-complete shadow, deep blacks with textured wall detail barely visible, 85mm f/1.2 Sony portrait, razor-thin DOF on eyes, rich jewel-tone saturation on coat, Kodak Portra 800 pushed warm, dramatic vertical composition',
    hook: 'she walked in and the room changed temperature',
  },
  {
    id: '05', name: 'Quiet Luxury',     ar: '4:5',
    prompt: 'Woman in white ivory oversized cashmere sweater and wide-leg tailored bone-white trousers standing against smooth limestone wall on empty European side street — Lisbon or Rome morning, she occupies only the left third of frame, vast negative space of pale stone wall fills right two-thirds, face in three-quarter turn with completely neutral composed slightly-bored expression, minimal jewelry, slick low bun, no visible branding — Sony A7C 85mm f/2 from 8 meters away, soft even overcast 5500K morning diffusion, zero shadows, skin perfectly even lit, muted near-monochrome palette ivory-stone-bone, Leica Q2 reference rendering, zero grain, maximum tonal subtlety, editorial restraint',
    hook: 'nothing loud about it',
  },
  {
    id: '06', name: 'Car Mirror',       ar: '9:16',
    prompt: 'Woman seated in car passenger seat, face captured in the side mirror reflection from outside — photographer shooting through slightly open window at rearview mirror angle, face reflected with out-of-focus street scene and motion-blurred trees behind through windshield, she is looking forward not at camera creating voyeuristic candid feel, wearing oversized vintage leather jacket, window glass adds slight color distortion and scratch texture, early morning golden hour light from driver-side casting warm rim — 50mm f/1.4, shallow DOF on mirror glass reflection, mirror frame as compositional device, Kodak Portra 400 warm skin, external street 6000K vs interior warm 3200K contrast, film grain visible in shadows',
    hook: 'caught somewhere between',
  },
  {
    id: '07', name: 'Hard Light Face',  ar: '9:16',
    prompt: 'Extreme close-up portrait — face fills entire vertical frame, a single hard shaft of direct sunlight cuts through venetian blinds creating sharp parallel light and shadow stripes across face, eyes, lips, one eye in full light one in shadow, no fill light, expression quiet and introspective slightly downcast gaze not at camera, natural skin texture fully visible pores freckles individual lashes, no makeup or very minimal, simple white ribbed tank at bottom of frame — 85mm f/1.4 macro-ish close, 1/2000s, ISO 400, light stripes razor-sharp edge falloff, Fuji Superia 400 slightly cool desaturated grade, crushed blacks in shadow zones, maximum skin SSS in light band, face occupies 95% of frame',
    hook: 'some days are just like that',
  },
  {
    id: '08', name: 'Wet Street Neon',  ar: '9:16',
    prompt: 'Woman walking away on rain-wet city street at night, shot from behind at knee level — pavement covered in reflections of neon signs red orange pink, she wears a structured long dark coat and pointed boots, pace confident and purposeful mid-stride with slight coat swing, neon kanji or bar signs visible in background out of focus, puddle reflections of streetlights forming abstract light shapes in foreground — Sony 35mm f/1.4 from very low near-ground angle, ISO 6400 heavy grain structure, teal-orange cinematic grade, wet pavement acts as mirror layer doubling the visual, motion 1/60s slight heel blur, deep crushed blacks, Cinestill 800T orange halation around light sources, film noir urban energy',
    hook: 'the city looks better after it rains',
  },
  {
    id: '09', name: 'Soft Romantic',    ar: '4:5',
    prompt: 'Woman standing in front of pastel painted wall — dusty rose or washed-out terracotta plaster, wearing sheer cream linen blouse and wide-leg soft linen trousers, holding large loose bouquet of dried pampas and wildflowers casually at hip, warm soft backlighting from afternoon sun wrapping around her creating halo edge separation from background, face turned slightly looking just past lens with quiet half-smile, loose undone hair with a few strands across face — 85mm f/1.4 slight lens glow render, 3200K warm afternoon window-quality backlight, minimal shadow fill, Fuji Pro 400H overexposed by one stop lifting shadows to dusty haze, skin creamy glowing SSS from backlight, dreamy slightly soft rendering no clinical sharpness, coquette editorial',
    hook: 'slow morning, no rush',
  },
  {
    id: '10', name: 'Laundromat Glam',  ar: '9:16',
    prompt: 'Woman dressed in full going-out look — satin bias-cut midi dress, heels, hair done, evening makeup — sitting on white plastic laundromat chair at 11pm waiting for dryer, posture completely relaxed legs crossed, chin resting on one hand elbow on knee, slight smirk expression, row of industrial washing machines behind with one tumbling colorful clothes visible through porthole window, harsh fluorescent tube lighting 4000K overhead, linoleum floor, handwritten paper signs on walls — 35mm f/2 full body shot, ISO 1600 fluorescent grain, flat institutional lighting creating unexpected editorial glamour by contrast, Kodak ColorPlus 200 pushed slightly warm, unexpected juxtaposition maximum scroll-stop power',
    hook: 'overdressed and exactly on time',
  },
  {
    id: '11', name: 'Morning Coffee',  ar: '4:5',
    prompt: 'Woman in cream oversized ribbed knit sweater sitting at small wooden table in narrow Berlin apartment kitchen, morning coffee cup held with both hands, steam rising, window light from left casting soft diagonal shadow across table, unmade hair still slightly disheveled, eyes closed or mid-blink with quiet content expression, morning winter light 4500K through frosted glass diffused, no makeup, clear skin — Sony A7C 50mm f/1.8, ISO 400, Fuji Superia 400 simulation slightly faded grain, warm interior amber vs cool window blue balance, shadow detail preserved in knit texture, intimate domestic editorial, nothing staged',
    hook: 'no plans, no rush, just this',
  },
  {
    id: '12', name: 'U-Bahn Window',  ar: '9:16',
    prompt: 'Woman seated in Berlin U-Bahn subway car, face reflected in dark window glass overlaid with night tunnel rushing past — double exposure effect where face reflection and underground tunnel movement coexist in the same window pane, she is looking slightly downward absorbed in thought, earbuds in, oversized coat, city lights and station signs visible as streaks through her reflection — 35mm f/2 handheld, ISO 3200, Cinestill 800T pushed rendering creating orange halation around tungsten cabin lights, blue-teal in tunnel blacks, grain structure heavy, dual-layer reflection depth, melancholic commute energy',
    hook: 'somewhere between here and there',
  },
  {
    id: '13', name: 'Post-Shower',    ar: '4:5',
    prompt: 'Woman standing at bathroom mirror after shower — small fogged-over mirror partially wiped clear showing just her face and towel-wrapped hair, steam haze in room, she is looking directly at reflection (which means directly at viewer), expression completely unguarded and honest, no makeup, individual skin texture fully visible every freckle and pore, soft diffused single bulb 3000K above mirror creating even shadowless bathroom glow, simple white towel, wet skin catching warm light slightly — 50mm f/1.8 straight-on from mirror POV, intimate immediate feeling, zero artifice, Fuji 400H overexposed for lifted creamy skin, grain in steam haze, radical naturalness',
    hook: 'before the mask goes back on',
  },
  {
    id: '14', name: 'Café Laptop',    ar: '4:5',
    prompt: 'Woman working on laptop at marble café window table, exterior rain streaking the glass behind her creating abstract vertical bokeh trails of street lights and passing umbrellas — she is focused downward at screen, wearing fitted black turtleneck, half-finished cortado beside laptop, one hand on trackpad, slightly furrowed concentration expression, café interior warm amber vs rainy exterior cool grey — 35mm f/1.4 from adjacent table level, ISO 800, warm tungsten 3200K interior vs 6000K cold overcast window, rain on glass as natural texture filter, Kodak Portra 400 skin warmth, background café patrons soft bokeh circles, productive solitude aesthetic',
    hook: 'in her own world again',
  },
  {
    id: '15', name: 'Club Bathroom',  ar: '9:16',
    prompt: 'Woman in Berghain-style club bathroom, mirror selfie — large industrial mirror reflecting her and the raw concrete walls behind, a single red or cold blue neon tube light source creating extreme color split across her face, one side red the other blue, she holds phone at chest height, expression cool and direct, wearing minimal black club outfit, lipstick slightly worn from the night, slight sweat sheen on skin catching neon, concrete textures and graffiti visible in background reflection, other blurred club-goers at mirror edge — 28mm f/2.8 phone POV, ISO 6400 aggressive grain, neon split gel color grade, Berlin underground nightlife aesthetic, authentic not performed',
    hook: 'somewhere between arrival and disappearance',
  },
  {
    id: '16', name: 'Train Travel',   ar: '9:16',
    prompt: 'Woman seated at ICE train window, face turned toward glass watching autumn landscape rush past — forest trees in amber-gold-rust colors blurred to watercolor streaks, she rests head lightly against glass, expression quiet and contemplative, wearing camel wool coat, a book closed on table beside coffee cup, overcast white sky filtering through glass washing everything in even cool 5000K daylight, reflections of cabin interior very faintly overlay the forest outside — Sony 85mm f/1.4 from aisle seat, ISO 400, motion blur on landscape 1/30s, face sharp, Fuji Provia film simulation gentle color, autumn palette warm against cool train interior, melancholic beautiful journey',
    hook: 'watching the world go past again',
  },
  {
    id: '17', name: 'Gym Mirror',     ar: '9:16',
    prompt: 'Woman in gym in front of floor-to-ceiling mirror, wearing high-waist ultraviolet purple spandex biker shorts and matching ribbed crop sports bra, toned athletic figure, mid-workout — one hand resting on hip the other lifting dumbbell, slight exertion flush on cheeks, confident direct gaze at mirror, hair in high ponytail with flyaways, rubber gym floor, weight rack blurred behind — Sony 35mm f/1.4 from low angle looking up slightly, ISO 800, harsh gym overhead LED 5500K mixing with warm tungsten accent strip lighting creating cool fill and warm side rim, skin glistening slight sweat sheen catching light, vivid violet against neutral grey rubber and chrome equipment, strong shadows under collarbone and arms from directional overhead, editorial athletic energy',
    hook: 'she doesn\'t need your permission to lift',
  },
  {
    id: '18', name: 'Gym Cardio',     ar: '4:5',
    prompt: 'Woman on treadmill in empty gym late at night, wearing neon acid-lime green seamless ribbed sports bra and matching high-waist shorts, running mid-stride — feet in motion slightly blurred, hair loose flowing behind, expression focused and fierce, earbuds in, large floor-to-ceiling window behind her with city lights against dark sky, gym mostly dark with equipment silhouettes, single dramatic backlight from window creating rim-light halo around her silhouette — Sony 50mm f/1.8, ISO 3200, heavy grain cinematic, backlit rim separation from dark background, neon green outfit vivid against dark gym, city lights scattered bokeh behind glass, Cinestill 800T warm-teal grade, high contrast, action freeze 1/500s mid-stride, pure drive energy',
    hook: 'no audience needed',
  },
  {
    id: '19', name: 'Beach Editorial', ar: '4:5',
    prompt: 'Woman on deserted Mediterranean beach at golden hour, wearing structured high-leg one-piece swimsuit in deep terracotta burnt orange with architectural waist cut-out and high neck, standing ankle-deep in clear shallow water, small waves at her feet, looking into distance over one shoulder with composed powerful expression, wet sand and distant rocky cliffs behind, golden 3200K late sun from low right creating full warm body light, long shadow trailing left, skin bronzed and glowing — Sony 85mm f/1.4, ISO 200, Kodak Ektar 100 warm grade, water at feet catching orange reflection from sky, slight lens flare at frame edge, editorial fashion swimwear, confident solitude',
    hook: 'some places you have to find alone',
  },
  {
    id: '20', name: 'Brazil Beach',    ar: '9:16',
    prompt: 'Woman on Ipanema beach Rio de Janeiro, wearing tiny bright Brazilian-cut bikini in vivid cobalt blue with contrast string ties, full body shot from slight low angle, walking out of ocean toward camera — water streaming down bronzed skin, hair wet slicked back, expression confident laughing mid-motion candid energy, turquoise Atlantic water behind with breaking white waves, bright midday Brazilian sun 6500K overhead creating high contrast highlights and deep shadows, skin rich bronzed glowing wet in direct sunlight, colorful beach umbrellas and carioca crowd softly blurred behind — Sony 35mm f/2, ISO 100, Fuji Velvia saturated grade pushing cobalt blue vs warm bronzed skin, sun highlights on shoulders, authentic Rio beach energy, movement and joy',
    hook: 'the ocean doesn\'t care — she does',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type SlotData = { file: File; url: string };

// ─── Image Slot Component ─────────────────────────────────────────────────────
function ImageSlot({
  id, label, data, type, onUpload, onRemove, onReplace, disabled = false, size = 'md'
}: {
  id: string; label: string; data?: SlotData; type: 'ref' | 'item';
  onUpload: (id: string, type: 'ref' | 'item') => void;
  onRemove: (id: string, type: 'ref' | 'item') => void;
  onReplace: (id: string) => void;
  disabled?: boolean; size?: 'sm' | 'md';
}) {
  const iconSize = size === 'sm' ? 14 : 20;
  return (
    <div className={`relative aspect-square rounded-xl border border-white/10 overflow-hidden bg-black/20 group ${disabled ? 'opacity-60' : ''}`}>
      {data ? (
        <>
          <img src={data.url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-center">
            <span className="text-[10px] text-white/80 truncate block">{label}</span>
          </div>
          {/* Replace button (top-left) */}
          <button
            onClick={() => onReplace(id)}
            disabled={disabled}
            className="absolute top-1 left-1 p-1 rounded-md bg-black/60 text-white/70 opacity-80 group-hover:opacity-100 hover:text-yellow-400 hover:bg-black/80 transition-all z-10"
            title="Replace image"
          >
            <RotateCcw size={12} />
          </button>
          {/* Delete button (top-right) */}
          <button
            onClick={() => onRemove(id, type)}
            disabled={disabled}
            className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-black/80 transition-all z-10"
            title="Remove image"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <div
          onClick={() => !disabled && onUpload(id, type)}
          className={`w-full h-full flex flex-col items-center justify-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'} transition-colors p-2 text-center`}
        >
          <UploadIcon size={iconSize} className="text-white/25 mb-1" />
          <span className={`text-white/40 ${size === 'sm' ? 'text-[9px]' : 'text-xs'}`}>{label}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function App() {
  // ── State: pipeline stages ─────────────────────────────────────────────────
  const [isExtracting,      setIsExtracting]      = useState(false);
  const [isEditing,         setIsEditing]         = useState(false);
  const [isBuildingPrompt,  setIsBuildingPrompt]  = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [isGenerating,      setIsGenerating]      = useState(false);

  // ── State: slots ───────────────────────────────────────────────────────────
  const [references,     setReferences]     = useState<Record<string, SlotData>>({});
  const [items,          setItems]          = useState<Record<string, SlotData>>({});
  const [sceneReference, setSceneReference] = useState<SlotData | null>(null);
  const [sceneDragOver,  setSceneDragOver]  = useState(false);

  // ── State: DNA + prompts ───────────────────────────────────────────────────
  const [jsonDna,      setJsonDna]      = useState(DNA_JSON_PLACEHOLDER);
  const [characterName,setCharacterName]= useState('');
  // B1 FIX: separate scene context from the "edit DNA" instruction field
  const [scenePrompt,  setScenePrompt]  = useState('');   // permanent scene context for Imagen
  const [editInstruction, setEditInstruction] = useState(''); // one-shot DNA edit instruction
  const [negativePrompt,  setNegativePrompt]  = useState('');
  const [builtPrompt,     setBuiltPrompt]     = useState('');
  const [copied,          setCopied]          = useState(false);

  // ── State: model / render settings ────────────────────────────────────────
  const [textModel,   setTextModel]   = useState(DEFAULT_TEXT_MODEL);
  const [imageModel,  setImageModel]  = useState(DEFAULT_IMAGE_MODEL.modelId);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [upscale,     setUpscale]     = useState('none');
  const [sampleCount, setSampleCount] = useState(1);

  // ── State: results ─────────────────────────────────────────────────────────
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [selectedImage,   setSelectedImage]   = useState<string | null>(null);

  // ── State: scene DNA ──────────────────────────────────────────────────────
  const [sceneDna,           setSceneDna]           = useState('');
  const [isExtractingScene,  setIsExtractingScene]  = useState(false);
  const [sceneExtractError,  setSceneExtractError]  = useState<string | null>(null);

  // ── State: cloud history ────────────────────────────────────────────────────
  const [cloudHistory,      setCloudHistory]      = useState<StoredGeneration[]>([]);
  const [cloudHistoryLoading, setCloudHistoryLoading] = useState(false);

  // ── State: user presets / history modal / meta flags ──────────────────────
  const [userPresets,  setUserPresets]  = useState<UserPreset[]>([]);
  const [historyModal, setHistoryModal] = useState<StoredGeneration | null>(null);
  const [dnaFromMeta,  setDnaFromMeta]  = useState(false);

  // ── State: errors ──────────────────────────────────────────────────────────
  const [extractError,  setExtractError]  = useState<string | null>(null);
  const [editError,     setEditError]     = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── State: UI panels ───────────────────────────────────────────────────────


  // ── Cloud history ───────────────────────────────────────────────────────────
  const loadCloudHistory = useCallback(async () => {
    setCloudHistoryLoading(true);
    const rows = await fetchGenerations(50);
    setCloudHistory(rows);
    setCloudHistoryLoading(false);
  }, []);

  useEffect(() => { loadCloudHistory(); }, [loadCloudHistory]);

  const loadUserPresets = useCallback(async () => {
    setUserPresets(await fetchUserPresets());
  }, []);
  useEffect(() => { loadUserPresets(); }, [loadUserPresets]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const hiddenInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Helpers: file inputs ───────────────────────────────────────────────────
  const triggerUpload = (id: string) => hiddenInputs.current[id]?.click();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, slotId: string, type: 'ref' | 'item') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      if (type === 'ref') {
        setReferences(p => ({ ...p, [slotId]: { file, url } }));
        if (file.type === 'image/png') {
          file.arrayBuffer().then(buf => {
            try {
              const meta = readPngMetadata(buf);
              if (meta['CharacterDNA']) {
                safeParseJson(meta['CharacterDNA'], setJsonDna);
                setDnaFromMeta(true);
              }
            } catch { /* fail silently */ }
          });
        }
      } else {
        setItems(p => ({ ...p, [slotId]: { file, url } }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeFile = (id: string, type: 'ref' | 'item') => {
    if (type === 'ref') setReferences(p => { const n = { ...p }; delete n[id]; return n; });
    else setItems(p => { const n = { ...p }; delete n[id]; return n; });
  };

  const handleSceneReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSceneReference({ file, url: ev.target?.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSceneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setSceneDragOver(false);
    if (isBusy) return;
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSceneReference({ file, url: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const safeParseJson = (raw: string, setter: (s: string) => void) => {
    try { setter(JSON.stringify(JSON.parse(raw), null, 2)); }
    catch { setter(raw); }
  };

  // ── Pipeline Step 1: Extract DNA ──────────────────────────────────────────
  const extractDna = useCallback(async () => {
    if (Object.keys(references).length === 0) return;
    setExtractError(null);
    setBuiltPrompt('');
    setDnaFromMeta(false);
    setIsExtracting(true);
    try {
      const parts: any[] = [];
      for (const [slotId, data] of Object.entries(references)) {
        const slot = REFERENCE_SLOTS.find(s => s.id === slotId);
        parts.push(`Image Type: ${slot?.role ?? slot?.label}`);
        parts.push(await fileToGenerativePart(data.file));
      }
      const raw = await extractImageJson(parts, textModel);
      safeParseJson(raw, setJsonDna);
    } catch (err: any) {
      setExtractError(err?.message ?? 'Failed to extract DNA. Check your API key.');
    } finally {
      setIsExtracting(false);
    }
  }, [references, textModel]);

  // ── Pipeline Step 1.5: Extract Scene DNA ─────────────────────────────────
  // Extracts structured scene/environment JSON from the Scene Carrier image.
  const extractSceneDna = useCallback(async () => {
    if (!sceneReference) return;
    setSceneExtractError(null);
    setIsExtractingScene(true);
    try {
      const part = await fileToGenerativePart(sceneReference.file);
      const raw = await extractSceneJson(part, textModel);
      safeParseJson(raw, setSceneDna);
      setBuiltPrompt(''); // scene changed — old built prompt is stale
    } catch (err: any) {
      setSceneExtractError(err?.message ?? 'Failed to extract Scene DNA. Check API key.');
    } finally {
      setIsExtractingScene(false);
    }
  }, [sceneReference, textModel]);

  // ── Pipeline Step 2: Edit DNA ─────────────────────────────────────────────
  // B1 FIX: editInstruction is cleared after apply, scenePrompt stays untouched
  const handleEditSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const itemFiles = Object.values(items).map(i => i.file);
    if (!editInstruction.trim() && itemFiles.length === 0) return;
    setEditError(null);
    setIsEditing(true);
    try {
      const imgParts = await Promise.all(itemFiles.map(f => fileToGenerativePart(f)));
      const raw = await editImageJson(jsonDna, editInstruction, imgParts, textModel);
      safeParseJson(raw, setJsonDna);
      setBuiltPrompt('');
      setEditInstruction(''); // only the one-shot instruction is cleared — scene stays!
    } catch (err: any) {
      setEditError(err?.message ?? 'Failed to edit JSON. Check your API key.');
    } finally {
      setIsEditing(false);
    }
  };

  // ── Pipeline Step 2.5: Build cinematic prompt from DNA + scene ───────────
  const handleBuildPrompt = useCallback(async () => {
    setGenerateError(null);
    setIsBuildingPrompt(true);
    try {
      const prompt = await buildImagePromptFromDna(
        jsonDna,
        scenePrompt,
        textModel,
        characterName,
        negativePrompt,
        sceneDna || undefined,
      );
      setBuiltPrompt(prompt);
    } catch (err: any) {
      setGenerateError(err?.message ?? 'Failed to build prompt. Check your API key.');
    } finally {
      setIsBuildingPrompt(false);
    }
  }, [jsonDna, scenePrompt, textModel, characterName, negativePrompt]);

  // ── Pipeline Step 2.6: Enhance existing prompt with cinematic detail ──────
  const handleEnhancePrompt = useCallback(async () => {
    if (!builtPrompt.trim()) return;
    setGenerateError(null);
    setIsEnhancingPrompt(true);
    try {
      const enhanced = await enhancePrompt(builtPrompt, textModel, jsonDna);
      setBuiltPrompt(enhanced);
    } catch (err: any) {
      setGenerateError(err?.message ?? 'Failed to enhance prompt.');
    } finally {
      setIsEnhancingPrompt(false);
    }
  }, [builtPrompt, textModel]);

  // ── Pipeline Step 3: Generate image from current prompt ──────────────────
  const handleGenerate = async () => {
    if (!builtPrompt.trim()) return;
    setGenerateError(null);
    setGeneratedImages([]);
    setSelectedImage(null);
    setIsGenerating(true);
    try {
      const refFiles  = Object.values(references).map(r => r.file);
      const itemFiles = Object.values(items).map(i => i.file);
      const urls = await generateImage(
        builtPrompt, imageModel, upscale, aspectRatio, sampleCount, negativePrompt,
        refFiles, sceneReference?.file, itemFiles.length ? itemFiles : undefined,
        jsonDna, sceneDna || undefined,
      );
      setGeneratedImages(urls);
      setSelectedImage(urls[0]);
      // Persist to Supabase (fire-and-forget — does not block UI)
      const presetLabel = scenePrompt.slice(0, 60) || undefined;
      uploadImage(urls[0], `${imageModel}-${Date.now()}.png`).then(imageUrl => {
        saveGeneration({
          preset_name:  presetLabel,
          model:        imageModel,
          dna_json:     (() => { try { return JSON.parse(jsonDna); } catch { return jsonDna; } })(),
          built_prompt: builtPrompt,
          image_url:    imageUrl ?? undefined,
        }).then(() => loadCloudHistory());
      });
    } catch (err: any) {
      setGenerateError(err?.message ?? 'Generation failed. Check model access and quota.');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── User preset handlers ──────────────────────────────────────────────────
  const handleSavePreset = useCallback(async () => {
    const name = builtPrompt.split(/[.!?\n]/)[0].trim().slice(0, 80) || 'My Preset';
    const saved = await saveUserPreset(name, builtPrompt);
    if (saved) setUserPresets(prev => [saved, ...prev]);
  }, [builtPrompt]);

  const handleDeletePreset = useCallback(async (id: string) => {
    await deleteUserPreset(id);
    setUserPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleSaveWithDna = useCallback(async () => {
    const dnaReady = jsonDna !== DNA_JSON_PLACEHOLDER && jsonDna.trim().startsWith('{');
    if (!selectedImage?.startsWith('data:image/png') || !dnaReady) return;
    try {
      const base64 = selectedImage.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const modified = injectPngITXt(bytes.buffer, 'CharacterDNA', jsonDna);
      const blob = new Blob([modified], { type: 'image/png' });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `nano-${characterName || 'img'}-${Date.now()}_json.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      setGenerateError(`PNG metadata error: ${err?.message ?? 'unknown'}`);
    }
  }, [selectedImage, jsonDna, characterName]);

  // ── Helpers: presets, copy, save, load ───────────────────────────────────
  const applyPreset = (p: typeof SCENE_PRESETS[0]) => {
    setScenePrompt(p.prompt);
    if (p.ar) setAspectRatio(p.ar);
    setBuiltPrompt(''); // scene changed — old built prompt is stale
  };

  const copyJson = () => {
    navigator.clipboard.writeText(jsonDna);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveDnaToFile = () => {
    const blob = new Blob([jsonDna], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dna-${characterName || 'character'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadDnaFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        safeParseJson(text, setJsonDna);
        setBuiltPrompt('');
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const downloadImage = (url: string) => {
    // Determine extension from data URL mime type (PNG for Gemini, JPEG for Imagen)
    const ext = url.startsWith('data:image/png') ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = url;
    a.download = `nano-${characterName || 'img'}-${Date.now()}.${ext}`;
    a.click();
  };

  const isBusy = isExtracting || isEditing || isGenerating || isBuildingPrompt || isEnhancingPrompt || isExtractingScene;
  const isDnaReady = jsonDna !== DNA_JSON_PLACEHOLDER && jsonDna.trim().startsWith('{');
  const isPromptReady = builtPrompt.trim().length > 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 flex flex-col gap-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="glass-panel rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500/10 p-2 rounded-xl text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Nano Banana Studio</h1>
            <p className="text-[11px] text-white/40">DNA Pipeline · {textModel}</p>
          </div>
        </div>
      </header>



      {/* ── Main 3-column Grid ─────────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-5 auto-rows-fr">

        {/* ══ Column 1: Reference Images + DNA ══════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="glass-panel rounded-2xl flex flex-col overflow-hidden"
        >
          {/* Hidden file inputs for all ref slots */}
          {REFERENCE_SLOTS.map(s => (
            <input key={s.id} type="file" accept="image/*" className="hidden"
              ref={el => { hiddenInputs.current[s.id] = el; }}
              onChange={e => handleFileUpload(e, s.id, 'ref')}
            />
          ))}

          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-white/80">
              <ImageIcon size={16} />
              <h2 className="font-medium text-sm">1. Reference Photos</h2>
            </div>

            {/* Slot Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {REFERENCE_SLOTS.map(slot => (
                <ImageSlot
                  key={slot.id} id={slot.id} label={slot.label} type="ref"
                  data={references[slot.id]}
                  onUpload={triggerUpload}
                  onRemove={removeFile}
                  onReplace={triggerUpload}
                  disabled={isBusy}
                />
              ))}
            </div>

            {/* Extract Button */}
            <button
              onClick={extractDna}
              disabled={isBusy || Object.keys(references).length === 0}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 font-medium transition-all disabled:opacity-40 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              {isExtracting
                ? <><RefreshCw size={15} className="animate-spin text-yellow-500" /> Extracting...</>
                : <><Sparkles size={15} className="text-yellow-500" /> {Object.keys(references).length > 0 ? 'Extract JSON DNA' : 'Upload Images First'}</>
              }
            </button>

            {/* Extract Error */}
            <AnimatePresence>
              {extractError && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /><span>{extractError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="h-px bg-white/8 my-1" />

            {/* Global Settings in Sidebar */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-1.5"><User size={10} /> Name</label>
                  <div className="relative">
                    <input
                      value={characterName}
                      onChange={e => setCharacterName(e.target.value)}
                      placeholder="Mia..."
                      className="w-full px-2.5 py-2 pr-6 rounded-lg bg-black/40 border border-white/10 text-xs focus:outline-none focus:border-yellow-500/50 text-white placeholder:text-white/20"
                    />
                    {characterName && (
                      <button type="button" onClick={() => setCharacterName('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-white/25 hover:text-white/60 hover:bg-white/10 transition-all z-10">
                        <X size={9} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-1.5"><Sparkles size={10} /> model</label>
                  <div className="relative">
                    <select
                      value={textModel}
                      onChange={e => setTextModel(e.target.value)}
                      className="w-full appearance-none px-2.5 py-2 pr-7 rounded-lg bg-black/40 border border-white/10 text-xs focus:outline-none focus:border-yellow-500/50 cursor-pointer text-white/70"
                    >
                      {TEXT_MODEL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value} className="bg-[#0f0f11]">{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-1.5"><MinusCircle size={10} /> Negative Prompt</label>
                <div className="relative">
                  <textarea
                    value={negativePrompt}
                    onChange={e => setNegativePrompt(e.target.value)}
                    placeholder="blur, noise, watermark..."
                    rows={2}
                    className="w-full px-2.5 py-2 rounded-lg bg-black/40 border border-white/10 text-[11px] focus:outline-none focus:border-red-500/30 text-white/60 placeholder:text-white/20 resize-none custom-scrollbar"
                  />
                  {negativePrompt && (
                    <button type="button" onClick={() => setNegativePrompt('')}
                      className="absolute top-1.5 right-1.5 p-0.5 rounded text-white/25 hover:text-white/60 hover:bg-white/10 transition-all z-10">
                      <X size={9} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* DNA JSON Editor */}
          <div className="flex-1 min-h-[260px] border-t border-white/10 bg-[#0a0a0c] flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-yellow-500/70 uppercase tracking-widest">
                DNA Output
                {dnaFromMeta && <span className="text-[8px] text-yellow-500/60 ml-1">▲ from PNG</span>}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={loadDnaFromFile} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Load DNA from .json file"><FolderOpen size={13} /></button>
                <button onClick={saveDnaToFile} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Save DNA to .json file"><Save size={13} /></button>
                <button onClick={copyJson} className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Copy JSON">
                  {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <div className="flex-1 relative">
              <textarea
                value={jsonDna}
                onChange={e => { setJsonDna(e.target.value); setBuiltPrompt(''); }}
                className="absolute inset-0 w-full h-full bg-transparent p-3 font-mono text-[11px] text-yellow-100/60 resize-none focus:outline-none focus:ring-1 focus:ring-yellow-500/20 custom-scrollbar leading-relaxed"
                spellCheck={false}
              />
              {isExtracting && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="animate-spin text-yellow-500" size={22} />
                    <p className="text-xs font-medium text-white/70 animate-pulse">Isolating identity traits…</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* ══ Column 2: Items, Scene, Presets, Controls ═════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
          className="glass-panel rounded-2xl p-5 flex flex-col gap-4"
        >
          {/* Hidden file inputs for item slots */}
          {ITEM_SLOTS.map(s => (
            <input key={s.id} type="file" accept="image/*" className="hidden"
              ref={el => { hiddenInputs.current[s.id] = el; }}
              onChange={e => handleFileUpload(e, s.id, 'item')}
            />
          ))}
          {/* Hidden file input for scene reference (Block 2 Scene Carrier slot) */}
          <input type="file" accept="image/*" className="hidden"
            ref={el => { hiddenInputs.current['scene-reference'] = el; }}
            onChange={handleSceneReferenceUpload}
          />

          <div className="flex items-center gap-2 text-white/80">
            <Wand2 size={16} />
            <h2 className="font-medium text-sm">2. Configuration & Style</h2>
          </div>

          {/* Item Slots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] text-white/40 uppercase tracking-widest">Style / Item References</h3>
              <span className="text-[9px] text-white/25">Used with Edit DNA instruction ↓</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {ITEM_SLOTS.map(slot => (
                <ImageSlot
                  key={slot.id} id={slot.id} label={slot.label} type="item" size="sm"
                  data={items[slot.id]}
                  onUpload={triggerUpload}
                  onRemove={removeFile}
                  onReplace={triggerUpload}
                  disabled={isBusy}
                />
              ))}
            </div>
          </div>

          <div className="h-px bg-white/8" />

          {/* Scene Instructions (permanent — B1 FIX) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                Emotional Fragment
                {sceneDna && <span className="text-[8px] text-cyan-500/50 normal-case tracking-normal font-normal">+ Scene DNA active</span>}
              </h3>
              <span className="text-[9px] text-white/25">Mood · 3–20 words</span>
            </div>
            <div className="relative">
              <textarea
                value={scenePrompt}
                onChange={e => setScenePrompt(e.target.value)}
                disabled={isBusy}
                placeholder={sceneDna ? "Emotional mood: «угрюмая дождливая ночь», «тёплый летний полдень»…" : "Scene: clothing, location, lighting, camera, mood…"}
                className="w-full h-20 bg-black/40 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-yellow-500/40 transition-colors placeholder:text-white/25 disabled:opacity-50 resize-none custom-scrollbar"
              />
              {scenePrompt && !isBusy && (
                <button type="button" onClick={() => setScenePrompt('')}
                  className="absolute top-1.5 right-1.5 p-0.5 rounded text-white/25 hover:text-white/60 hover:bg-white/10 transition-all z-10">
                  <X size={9} />
                </button>
              )}
            </div>
          </div>

          {/* ── Scene Carrier ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                <ImageIcon size={10} className="text-cyan-400/60" />
                Scene Carrier
              </h3>
              <span className="text-[9px] text-white/25">Background · Environment · Nano Banana only</span>
            </div>
            <div className="flex gap-3 items-start">
              {/* Scene slot — landscape 4:3 ratio, cyan border, drag-and-drop */}
              <div
                onClick={() => !isBusy && triggerUpload('scene-reference')}
                onDragOver={e => { e.preventDefault(); if (!isBusy) setSceneDragOver(true); }}
                onDragLeave={() => setSceneDragOver(false)}
                onDrop={handleSceneDrop}
                className={`relative w-[88px] h-[66px] flex-shrink-0 rounded-xl border overflow-hidden group transition-all ${
                  sceneDragOver
                    ? 'border-cyan-400/70 bg-cyan-500/15 scale-[1.02]'
                    : 'border-cyan-500/25 bg-cyan-950/20'
                }`}
              >
                {sceneReference ? (
                  <>
                    <img src={sceneReference.url} alt="Scene reference" className="absolute inset-0 w-full h-full object-cover" />
                    <button
                      onClick={e => { e.stopPropagation(); triggerUpload('scene-reference'); }}
                      disabled={isBusy}
                      className="absolute top-1 left-1 p-1 rounded-md bg-black/70 text-white/70 opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all z-10"
                    ><RotateCcw size={11} /></button>
                    <button
                      onClick={e => { e.stopPropagation(); setSceneReference(null); }}
                      disabled={isBusy}
                      className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-white/70 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all z-10"
                    ><X size={11} /></button>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-cyan-900/70 to-transparent p-1 text-center">
                      <span className="text-[8px] text-cyan-200/70">Active</span>
                    </div>
                  </>
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center gap-1 ${isBusy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-cyan-500/5'} transition-colors`}>
                    <ImageIcon size={18} className="text-cyan-500/30" />
                    <span className="text-[9px] text-cyan-500/40 text-center leading-tight px-1">Drop scene</span>
                  </div>
                )}
              </div>
              {/* Explanation + Extract button */}
              <div className="flex-1 text-[10px] text-white/30 leading-relaxed pt-0.5">
                <p>Drop a <span className="text-white/50">background or scene photo</span>. Персонаж из блока 1 будет имплантирован.</p>
                <button
                  onClick={extractSceneDna}
                  disabled={isBusy || isExtractingScene || !sceneReference}
                  className="mt-2 w-full py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15 hover:border-cyan-500/40 text-[10px] text-cyan-400/70 hover:text-cyan-400 font-medium transition-all disabled:opacity-30 flex items-center justify-center gap-1.5"
                  title={!sceneReference ? 'Сначала загрузи сцену' : 'Извлечь Scene DNA JSON из фото'}
                >
                  {isExtractingScene
                    ? <><RefreshCw size={10} className="animate-spin" />Analyzing scene…</>
                    : <><Sparkles size={10} />Extract Scene DNA</>}
                </button>
              </div>
            </div>

            {/* Scene DNA JSON textarea */}
            <AnimatePresence>
              {(sceneDna || sceneExtractError) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {sceneExtractError && (
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-2">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" /><span>{sceneExtractError}</span>
                    </div>
                  )}
                  {sceneDna && (
                    <div className="relative rounded-xl border border-cyan-500/20 bg-[#0a0a0c] overflow-hidden">
                      <div className="px-3 py-1.5 border-b border-cyan-500/10 flex items-center justify-between">
                        <span className="text-[9px] font-semibold text-cyan-500/60 uppercase tracking-widest">Scene DNA</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigator.clipboard.writeText(sceneDna)}
                            className="p-1 rounded hover:bg-white/10 text-white/30 hover:text-white transition-colors"
                            title="Copy Scene DNA"
                          ><Copy size={11} /></button>
                          <button
                            onClick={() => { setSceneDna(''); setBuiltPrompt(''); }}
                            className="p-1 rounded hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                            title="Clear Scene DNA"
                          ><X size={11} /></button>
                        </div>
                      </div>
                      <textarea
                        value={sceneDna}
                        onChange={e => { setSceneDna(e.target.value); setBuiltPrompt(''); }}
                        rows={5}
                        className="w-full bg-transparent p-2.5 font-mono text-[10px] text-cyan-100/50 resize-none focus:outline-none custom-scrollbar leading-relaxed"
                        spellCheck={false}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-px bg-white/8" />

          {/* DNA Edit Instruction (one-shot — cleared after Apply) */}
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] text-white/40 uppercase tracking-widest">Edit DNA Instruction</h3>
              <span className="text-[9px] text-white/25">Cleared after Apply</span>
            </div>
            <div className="relative">
              <textarea
                value={editInstruction}
                onChange={e => setEditInstruction(e.target.value)}
                disabled={isBusy}
                placeholder="e.g. 'add a scar on left jaw', 'change eye color to green'…"
                className="w-full h-16 bg-black/40 border border-white/10 rounded-xl p-3 pr-28 text-xs focus:outline-none focus:border-blue-500/40 transition-colors placeholder:text-white/25 disabled:opacity-50 resize-none custom-scrollbar"
              />
              {editInstruction && !isBusy && (
                <button type="button" onClick={() => setEditInstruction('')}
                  className="absolute top-1.5 left-1.5 p-0.5 rounded text-white/25 hover:text-white/60 hover:bg-white/10 transition-all z-10">
                  <X size={9} />
                </button>
              )}
              <button
                type="submit"
                disabled={isBusy || (!editInstruction.trim() && Object.keys(items).length === 0)}
                className="absolute bottom-2 right-2 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[11px] font-semibold hover:bg-blue-400 transition-colors disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                {isEditing ? <RefreshCw size={11} className="animate-spin" /> : <Wand2 size={11} />}
                Apply
              </button>
            </div>
            <AnimatePresence>
              {editError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" /><span>{editError}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <div className="h-px bg-white/8" />

          {/* Quick Style Presets */}
          <div className="flex flex-col min-h-0">
            <h3 className="text-[10px] text-white/40 uppercase tracking-widest mb-2 shrink-0">Quick Styles</h3>
            <div className="grid grid-cols-2 gap-1.5 overflow-y-auto custom-scrollbar max-h-[130px] pr-1">
              {SCENE_PRESETS.map(p => (
                <button
                  key={p.id} onClick={() => applyPreset(p)} disabled={isBusy}
                  className="px-2.5 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-yellow-500/30 text-left transition-all disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-yellow-500/40 w-full"
                >
                  <span className="text-[11px] font-medium text-white/90 block truncate">{p.name}</span>
                  <span className="text-[9px] text-white/35 block truncate">{p.hook}</span>
                </button>
              ))}
            </div>
            {userPresets.length > 0 && (
              <div className="mt-2">
                <h4 className="text-[9px] text-white/25 uppercase tracking-widest mb-1.5">Saved</h4>
                <div className="grid grid-cols-2 gap-1.5 overflow-y-auto custom-scrollbar max-h-[100px] pr-1">
                  {userPresets.map(p => (
                    <div key={p.id} className="relative group/preset">
                      <button
                        onClick={() => { setScenePrompt(p.prompt); setBuiltPrompt(''); }}
                        disabled={isBusy}
                        className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-yellow-500/30 text-left transition-all disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-yellow-500/40"
                      >
                        <span className="text-[11px] font-medium text-white/80 block truncate pr-4">{p.name}</span>
                      </button>
                      <button
                        onClick={() => handleDeletePreset(p.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover/preset:opacity-100 text-white/30 hover:text-red-400 transition-all p-0.5 rounded"
                        title="Удалить пресет"
                      >
                        <X size={8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-px bg-white/8" />

          {/* Image Model + Render Controls */}
          <div className="flex flex-col gap-2.5 mt-auto">
            {/* Row 1: image model + aspect ratio */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={imageModel} onChange={e => setImageModel(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 pr-8 border border-white/10 bg-black/30 rounded-xl text-xs font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-yellow-500/40">
                  <optgroup label="Nano Banana — reference image support" className="bg-[#0f0f11]">
                    {GEMINI_IMAGE_MODELS.filter(m => m.active).map(m => (
                      <option key={m.id} value={m.modelId} className="bg-[#0f0f11]">
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Imagen 4 — text only · ⚠ Jun 2026" className="bg-[#0f0f11]">
                    {IMAGEN_MODELS.filter(m => m.active).map(m => (
                      <option key={m.id} value={m.modelId} className="bg-[#0f0f11]">
                        {m.label} ⚠
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
              <div className="relative w-24">
                <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 pr-8 border border-white/10 bg-black/30 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-yellow-500/40">
                  {['1:1','9:16','16:9','4:3','3:4'].map(r => (
                    <option key={r} value={r} className="bg-[#0f0f11]">{r}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
            </div>

            {/* Row 2: upscale + samples */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={upscale} onChange={e => setUpscale(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 pr-8 border border-white/10 bg-black/30 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-yellow-500/40">
                  <option value="none" className="bg-[#0f0f11]">Upscale: Off</option>
                  <option value="x2"   className="bg-[#0f0f11]">Upscale: 2×</option>
                  <option value="x3"   className="bg-[#0f0f11]">Upscale: 3×</option>
                  <option value="x4"   className="bg-[#0f0f11]">Upscale: 4×</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
              <div className="relative w-24">
                <select value={sampleCount} onChange={e => setSampleCount(Number(e.target.value))}
                  className="w-full appearance-none px-3 py-2.5 pr-8 border border-white/10 bg-black/30 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-yellow-500/40">
                  <option value={1} className="bg-[#0f0f11]">1 image</option>
                  <option value={2} className="bg-[#0f0f11]">2 images</option>
                  <option value={3} className="bg-[#0f0f11]">3 images</option>
                  <option value={4} className="bg-[#0f0f11]">4 images</option>
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              </div>
            </div>

            {/* Prompt Editor */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40 uppercase tracking-widest">Prompt</span>
                <div className="flex items-center gap-1">
                  {builtPrompt && (
                    <button
                      onClick={() => setBuiltPrompt('')}
                      disabled={isBusy}
                      title="Clear prompt"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 text-[10px] text-white/35 hover:text-red-400 transition-all disabled:opacity-30"
                    >
                      <X size={9} />Clear
                    </button>
                  )}
                  {builtPrompt && (
                    <button
                      onClick={handleEnhancePrompt}
                      disabled={isBusy}
                      title="Enhance prompt: add optics, lighting Kelvin, film stock, skin SSS"
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-purple-500/15 hover:border-purple-500/40 text-[10px] text-white/35 hover:text-purple-400 transition-all disabled:opacity-30"
                    >
                      {isEnhancingPrompt
                        ? <RefreshCw size={9} className="animate-spin" />
                        : <Sparkles size={9} />}
                      Enhance
                    </button>
                  )}
                  <button
                    onClick={handleBuildPrompt}
                    disabled={isBusy || !isDnaReady}
                    title={!isDnaReady ? 'Extract DNA first (Step 1)' : 'Build cinematic prompt from DNA + scene'}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-yellow-500/40 text-[10px] text-white/35 hover:text-yellow-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isBuildingPrompt
                      ? <><RefreshCw size={10} className="animate-spin" />Building…</>
                      : <><Wand2 size={10} />Build from DNA</>}
                  </button>
                </div>
              </div>
              <textarea
                value={builtPrompt}
                onChange={e => setBuiltPrompt(e.target.value)}
                disabled={isBusy}
                placeholder="Type prompt manually here — Generate uses this directly as-is.&#10;Or click 'Build from DNA' to auto-generate from extracted identity + scene instructions."
                rows={5}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[11px] font-mono text-yellow-100/60 focus:outline-none focus:border-yellow-500/30 transition-colors placeholder:text-white/20 disabled:opacity-50 resize-none custom-scrollbar leading-relaxed"
              />
              {builtPrompt && (
                <button
                  onClick={handleSavePreset}
                  disabled={isBusy}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-yellow-500/30 text-[10px] text-white/35 hover:text-yellow-400 transition-all disabled:opacity-30"
                  title="Сохранить промпт как пресет"
                >
                  <Bookmark size={10} />
                  Save to presets
                </button>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isBusy || !isPromptReady}
              title={!isPromptReady ? 'Write or build a prompt first' : undefined}
              className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(234,179,8,0.25)] hover:shadow-[0_0_30px_rgba(234,179,8,0.4)]"
            >
              {isGenerating      ? <><RefreshCw size={16} className="animate-spin" />Rendering…</>
               : !isPromptReady  ? <><ImageIcon size={16} />Build or Type Prompt First</>
               :                   <><ImageIcon size={16} />Generate Image</>}
            </button>

            {/* Generate Error */}
            <AnimatePresence>
              {generateError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" /><span>{generateError}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>

        {/* ══ Column 3: Result + History ════════════════════════════════════ */}
        <motion.section
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}
          className="glass-panel rounded-2xl p-5 flex flex-col gap-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between text-white/80">
            <div className="flex items-center gap-2">
              <ImageIcon size={16} />
              <h2 className="font-medium text-sm">3. Result</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => selectedImage && downloadImage(selectedImage)}
                disabled={!selectedImage}
                className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-xs flex items-center gap-1.5 transition-colors text-white/50 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <Download size={13} /> Save
              </button>
              {selectedImage?.startsWith('data:image/png') && isDnaReady && (
                <button
                  onClick={handleSaveWithDna}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-yellow-500/30 text-[10px] text-white/35 hover:text-yellow-400 transition-all"
                  title="Embed DNA JSON into PNG and download"
                >
                  <Dna size={11} />
                  Save PNG + DNA
                </button>
              )}
            </div>
          </div>

          {/* Main Image */}
          <div className="flex-1 min-h-[320px] rounded-xl border border-white/10 bg-black/20 flex items-center justify-center relative overflow-hidden">
            {selectedImage ? (
              <img src={selectedImage} alt="Generated" className="absolute inset-0 w-full h-full object-contain p-2" />
            ) : (
              <div className="text-center p-6 text-white/25 flex flex-col items-center gap-3">
                <div className="p-4 rounded-full bg-white/5"><Wand2 size={30} className="opacity-40" /></div>
                <p className="text-xs">Generated image will appear here</p>
              </div>
            )}
            {(isBuildingPrompt || isGenerating) && (
              <div className="absolute inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="animate-spin text-yellow-500" size={22} />
                  <p className="text-xs font-medium text-white/70 animate-pulse">
                    {isBuildingPrompt ? 'Writing cinematic prompt…' : 'Rendering image…'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Model metadata badge — shown after generation */}
          {selectedImage && !isGenerating && (
            <div className="flex items-center gap-1.5 text-[9px] text-white/30 px-0.5">
              <span className="text-white/50 font-medium">{getModelLabel(imageModel)}</span>
              <span className="text-white/15">·</span>
              <span className="font-mono">{imageModel}</span>
            </div>
          )}

          {/* Variations (multiple samples) */}
          {generatedImages.length > 1 && (
            <div>
              <h3 className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Variations</h3>
              <div className="grid grid-cols-4 gap-2">
                {generatedImages.map((url, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedImage(url)}
                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedImage === url ? 'border-yellow-500' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <img src={url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadImage(url); }}
                      className="absolute bottom-1 right-1 p-1 rounded-md bg-black/60 text-white/60 hover:text-white opacity-0 hover:opacity-100 transition-all"
                      title="Save this variation"
                    >
                      <Download size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cloud History */}
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <History size={12} className="text-white/40" />
                <h3 className="text-[10px] text-white/40 uppercase tracking-widest">История</h3>
                {cloudHistory.length > 0 && (
                  <span className="text-[9px] text-white/25">{cloudHistory.length}</span>
                )}
              </div>
              <button
                onClick={loadCloudHistory}
                disabled={cloudHistoryLoading}
                className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-30"
                title="Обновить из базы"
              >
                <RefreshCw size={11} className={cloudHistoryLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {cloudHistoryLoading && cloudHistory.length === 0 && (
              <p className="text-[10px] text-white/25 text-center py-4">Загрузка...</p>
            )}

            {!cloudHistoryLoading && cloudHistory.length === 0 && (
              <p className="text-[10px] text-white/25 text-center py-4">Нет сохранённых генераций</p>
            )}

            <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 mt-2">
              <div className="grid grid-cols-2 gap-1.5">
                {cloudHistory.map((gen) => {
                  const date = new Date(gen.created_at).toLocaleDateString('ru', {
                    day: '2-digit', month: '2-digit',
                  });
                  return (
                    <div
                      key={gen.id}
                      className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group border border-white/10 hover:border-white/30 transition-all bg-white/[0.03]"
                      onClick={() => setHistoryModal(gen)}
                    >
                      {gen.image_url ? (
                        <img
                          src={gen.image_url}
                          alt=""
                          className="w-full h-full object-cover opacity-75 group-hover:opacity-100 transition-opacity"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon size={14} className="text-white/20" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] text-white/60">{date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.section>
      </main>

      {/* History detail modal */}
      {historyModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setHistoryModal(null)}
        >
          <div
            className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden max-w-xs w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {historyModal.image_url && (
              <img
                src={historyModal.image_url}
                alt="history"
                className="w-full aspect-square object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="p-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => { if (historyModal.image_url) setSelectedImage(historyModal.image_url); setHistoryModal(null); }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-[10px] text-white/50 hover:text-white/90 transition-all"
              >
                <Eye size={11} /> Preview
              </button>
              <button
                onClick={async () => {
                  if (!historyModal.image_url) return;
                  try {
                    const res = await fetch(historyModal.image_url);
                    const blob = await res.blob();
                    const file = new File([blob], `history-${historyModal.id.slice(0, 8)}.png`, { type: blob.type });
                    const slotKeys = ['r1', 'r2', 'r3', 'r4'] as const;
                    const emptySlot = slotKeys.find(id => !references[id]);
                    if (emptySlot) {
                      const objectUrl = URL.createObjectURL(blob);
                      setReferences(p => ({ ...p, [emptySlot]: { file, url: objectUrl } }));
                    }
                  } catch { /* ignore */ }
                  setHistoryModal(null);
                }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/30 text-[10px] text-white/50 hover:text-blue-400 transition-all"
              >
                <UserCircle size={11} /> Char Ref
              </button>
              <button
                onClick={() => {
                  if (historyModal.dna_json) {
                    setJsonDna(JSON.stringify(historyModal.dna_json, null, 2));
                  }
                  setHistoryModal(null);
                }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-yellow-500/30 text-[10px] text-white/50 hover:text-yellow-400 transition-all"
              >
                <Code2 size={11} /> Load DNA
              </button>
              <button
                onClick={() => {
                  if (historyModal.image_url) downloadFromUrl(historyModal.image_url, `nano-${historyModal.id.slice(0, 8)}.png`);
                  setHistoryModal(null);
                }}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-[10px] text-white/50 hover:text-white/90 transition-all"
              >
                <Download size={11} /> Download
              </button>
            </div>
            {historyModal.built_prompt && (
              <p className="px-3 pb-3 text-[9px] text-white/25 font-mono line-clamp-2">
                {historyModal.built_prompt}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

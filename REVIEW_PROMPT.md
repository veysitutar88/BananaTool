# Self-Review Prompt — Nano Banana Studio vs Competitor (NBS Photo Tool)

## Контекст
Ниже — детальное сравнение нашего приложения (Nano Banana Studio, portrait DNA pipeline)
и конкурирующего NBS (photo restoration/animation tool).
Используй этот файл как roadmap для аудита и улучшений.

---

## ЧТО ЕСТЬ У КОНКУРЕНТА, ЧЕГО НЕТ У НАС

### 🔴 HIGH PRIORITY

#### 1. Mobile / Responsive Layout
**У конкурента:** 3 панели скользят как drawer'ы. Кнопки-шевроны по краям экрана.
Backdrop overlay при открытии панели. Breakpoint 1024px. `isCompactView` state.
```tsx
const [isCompactView, setIsCompactView] = useState(window.innerWidth < TABLET_BREAKPOINT);
const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
const [isRightPanelOpen, setIsRightPanelOpen] = useState(!isCompactView);
// + fixed chevron buttons + backdrop div при isCompactView
```
**У нас:** Жёсткий 3-column grid, на мобильном ломается полностью.
**Файл:** `src/App.tsx` — layout секция
**Решение:** Добавить `isCompactView`, sliding panels, chevron buttons, backdrop.

#### 2. Quota / Cooldown Manager
**У конкурента:** При ошибке `QUOTA_EXCEEDED` запускается 60-секундный таймер.
Кнопка блокируется и показывает обратный отсчёт.
```tsx
const COOLDOWN_SECONDS = 60;
setQuotaCooldownEnd(Date.now() + COOLDOWN_SECONDS * 1000);
// В UI: "Retry in {cooldownRemaining}s"
```
**У нас:** Просто показываем текст ошибки, кнопка не блокируется.
**Файл:** `src/App.tsx` → `handleGenerate()`, `src/services/imageGenerator.ts`
**Решение:** Добавить `quotaCooldownEnd` state + `QUOTA_EXCEEDED:` prefix в ошибках сервиса.

#### 3. IndexedDB / Local History (без Supabase)
**У конкурента:** Вся история хранится в IndexedDB через `dbService`.
Приложение полностью работает без облака. `saveHistory()`, `getHistory()`, `clearHistory()`.
**У нас:** История только в Supabase — без ключей история не сохраняется вообще.
**Файл:** `src/services/storage.ts`
**Решение:** Добавить IndexedDB как primary storage, Supabase как optional sync.

---

### 🟡 MEDIUM PRIORITY

#### 4. Canvas Upscaling (2x)
**У конкурента:**
```tsx
canvas.width = img.naturalWidth * 2;
ctx.filter = 'contrast(105%) saturate(105%) brightness(102%)';
ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
downloadImage(upscaledDataUrl, result.id, '-2x');
```
С loading modal (`UpscalingModal`).
**У нас:** Нет простого 2x upscale через canvas.
**Решение:** Добавить `upscaleAndDownload()` + простой modal.

#### 5. ZIP Download All
**У конкурента:** JSZip — скачать все результаты одним архивом.
Файлы именуются `result_01_prompt_name.png`.
**У нас:** Только поштучное скачивание.
**Решение:** Подключить JSZip (CDN или npm), добавить `handleDownloadAll()`.

#### 6. Object URL Cleanup (Memory Leaks)
**У конкурента:** На unmount и при clearAll явный `URL.revokeObjectURL()` для всех blob URL.
```tsx
useEffect(() => {
  return () => {
    resultsRef.current.forEach(result => {
      if (result.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(result.videoUrl);
    });
  };
}, []);
```
**У нас:** Проверить — есть ли cleanup для object URLs от PNG uploads.
**Файл:** `src/App.tsx` → useEffect cleanup
**Решение:** Аудит всех `URL.createObjectURL()` — добавить соответствующие `revokeObjectURL`.

#### 7. Before/After Comparison Slider
**У конкурента:** `comparisonMode: 'slider' | 'single' | 'split'`
Drag-slider для сравнения до/после прямо в центральной панели.
**У нас:** Показываем просто финальный результат, без сравнения с source.
**Решение:** Добавить comparison slider компонент для selected image vs source image.

---

### 🟢 LOW PRIORITY / IDEAS

#### 8. promptMode System
У конкурента 5 режимов (retouch/reimagine/animate/color/removeBg) с разными preset-наборами.
У нас по сути один режим (generate portrait).
Идея: добавить Portrait / Editorial / Story / Variation modes с разными system instructions.

#### 9. Image Dimensions Display
Конкурент трекает `beforeImageDimensions` и `afterImageDimensions` отдельно.
У нас нет отображения размеров входного/выходного изображения.

#### 10. Plugin System
У конкурента `PluginsModal` — точка расширяемости.
Можно добавить как заглушку для будущих интеграций (Fal.ai, Replicate, etc).

---

## АУДИТ СКРОЛЛА — КОНКРЕТНЫЕ МЕСТА

### Что проверить в нашем App.tsx:

1. **Column 1 (DNA editor)** — `overflow-y-auto` + `min-h-0` обязательны на flex-контейнере
2. **Column 2 (Presets list)** — `max-h-[130px] overflow-y-auto` — достаточно ли?
3. **Column 3 (History grid)** — `flex-1 min-h-0` — не съедает ли лишнее место?
4. **Outer layout** — нет ли `overflow: hidden` что блокирует внутренний скролл
5. **Modals** — DNA Library + History Modal — есть ли `overflow-y-auto` внутри?

### Команды для быстрой диагностики:
```bash
grep -n "overflow" src/App.tsx | head -50
grep -n "min-h-0\|flex-1\|flex-col" src/App.tsx | head -50
```

---

## КАК ЗАПУСТИТЬ АУДИТ

```bash
cd /home/user/BananaTool
npm run dev
# http://localhost:5173
```

### Чеклист
- [ ] Открыть на 390px ширине — сломан ли layout?
- [ ] Скроллить Column 1 DNA editor при длинном JSON
- [ ] Скроллить Column 2 Presets list
- [ ] Скроллить Column 3 History при 30+ элементах
- [ ] Открыть DNA Library Modal — скролл внутри при 10+ профилях
- [ ] Сгенерировать 4 images (sampleCount=4) — variations grid корректен?
- [ ] Вызвать quota error — есть ли cooldown?
- [ ] Загрузить PNG с DNA metadata — автозагрузка DNA работает?
- [ ] Memory leaks: открыть DevTools → Memory → загрузить/удалить 10 слотов

---

## ПРИОРИТИЗИРОВАННЫЙ ПЛАН УЛУЧШЕНИЙ

| # | Улучшение | Приоритет | Сложность | Файл |
|---|-----------|-----------|-----------|------|
| 1 | Mobile responsive panels | HIGH | Hard | App.tsx |
| 2 | Quota cooldown timer | HIGH | Easy | App.tsx + imageGenerator.ts |
| 3 | IndexedDB local history | HIGH | Medium | services/storage.ts |
| 4 | Canvas 2x upscale | MEDIUM | Easy | App.tsx |
| 5 | ZIP download all | MEDIUM | Easy | App.tsx + index.html |
| 6 | Scroll audit & fixes | MEDIUM | Easy | App.tsx |
| 7 | Object URL cleanup | MEDIUM | Easy | App.tsx |
| 8 | Before/After slider | LOW | Hard | новый компонент |

---

## ЧТО У НАС ЛУЧШЕ ЧЕМ У КОНКУРЕНТА

- **DNA Pipeline** — 6-шаговый pipeline с Character DNA + Scene DNA + Dual JSON — намного сложнее
- **PNG Metadata** — встраивание DNA JSON прямо в PNG (iTXt chunk) — уникальная фича
- **DNA Library** — облачная база именованных DNA-профилей персонажей
- **Reference slots** — 6 character refs + 5 item refs + 1 scene carrier = полная система
- **Prompt Builder** — автоматическое построение промпта из двух JSON через Gemini
- **Суперрезкий фокус** — portrait identity preservation, а не просто "retouching"

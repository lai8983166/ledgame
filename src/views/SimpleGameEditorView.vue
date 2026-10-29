<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import { useI18n } from "vue-i18n";
import EditorActionIcon from "../components/EditorActionIcon.vue";
import EditorSaveDialog from '../components/EditorSaveDialog.vue';
import { requiredEditorFields } from '../lib/editorRequiredFields.js';
import { withEditorSavingCursor } from '../lib/editorSavingCursor.js';
import EditorSpritePreview from "../components/EditorSpritePreview.vue";
import { filterEditorSprites } from '../lib/simpleEditorSprites.js';
import SimpleMatrixCanvas from "../components/SimpleMatrixCanvas.vue";
import SimpleLevelPreviewDialog from "../components/SimpleLevelPreviewDialog.vue";
import GameGlobalConfigDialog from "../components/GameGlobalConfigDialog.vue";
import MediaPickerDialog from "../components/MediaPickerDialog.vue";
import PixelLightLayoutDialog from "../components/PixelLightLayoutDialog.vue";
import GameEffectDialog from "../components/GameEffectDialog.vue";
import GameWiringDialog from "../components/GameWiringDialog.vue";
import { saveGameWiring } from "../lib/gameWiring.js";
import { encodeSimpleGifInWorker } from "../lib/encodeSimpleGif.js";
import { prepareSimpleLevelGif, selectSimpleTopItem } from "../lib/simpleLevelGif.js";
import { resolveLiveOccupancyCell, canApplyColorOccupancy, filterUnoccupiedColorCells } from "../lib/simpleOccupancy.js";
import { createLevelPreviewSnapshot } from "../lib/simpleLevelPreview.js";
import { createWholeFrameCopyPlan } from "../lib/simpleFrameCopyPlan.js";
import { insertFrameAfter, visibleFrameIndices } from "../lib/simpleFrameSequence.js";
import { deleteLevelAt, moveLevelAt } from "../lib/simpleLevelSequence.js";
import { normalizeLevelOption, validateLevelOption } from "../lib/simpleLevelOptions.js";
import { createRgbEditHistory } from "../lib/simpleRgbEditHistory.js";
import { createObjectEraseStroke, drawingStrokeCells } from "../lib/simpleDrawingTools.js";
import { createLatestAsyncTaskGuard } from "../lib/latestAsyncTask.js";
import { applySimpleGlobalConfigPatch, saveSimpleGlobalConfigDocument } from "../lib/simpleGlobalConfig.js";
import { normalizePixelLightWiring } from "../lib/pixelLightLayout.js";
import { normalizeGameCategoryList } from "../lib/gameCategories.js";
import {
  applyEffectToFrameList,
  expandEffectFrames,
  normalizeEffectConfig,
  normalizeEffectSprite,
} from "../lib/effectEditor.js";
import {
  runGuardedFrameSequence,
  waitForGuardedPromise,
} from "../lib/guardedAsyncFlow.js";
import {
  canSelectObjectForMerge,
  centerObjectAnchor,
  MERGE_ERROR,
  mergeSameColorObjects,
} from "../lib/simpleObjectMerge.js";
import { confirmWithRendererFocus, restoreRendererFocus } from "../lib/rendererFocus.js";

const { t } = useI18n({ useScope: "global" });
const saveFeedback = ref(null);
const draggingLevelIndex = ref(null);
const levelDropIndex = ref(null);

const props = defineProps({
  initialDocument: { type: Object, default: null },
  gameId: {
    type: [Number, String],
    default: null,
  },
  gameName: {
    type: String,
    default: "",
  },
});
const emit = defineEmits(["back"]);
const api = window.ledGame;
const busyAction = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const globalConfigOpen = ref(false);
const levelMediaPicker = ref(null);
const levelBackgroundMusic = computed(() => activeLevel.value?.option?.bgVoice || '');
function selectLevelMedia(value) {
  const level = levelMediaPicker.value;
  if (level && !busyAction.value && document.value?.levels.includes(level)) level.option.bgVoice = value;
  levelMediaPicker.value = null;
}
function levelMediaUrl() {
  return 'led-media://preview/' + levelBackgroundMusic.value.split('/').map(encodeURIComponent).join('/');
}
const gameWiringOpen = ref(false);
const gameWiringSaving = ref(false);
const gameWiringError = ref("");
async function saveWiring(wiring) {
  if (gameWiringSaving.value) return;
  gameWiringSaving.value = true;
  gameWiringError.value = "";
  try {
    if (currentGameId.value) await withEditorSavingCursor(() => saveGameWiring(api, currentGameId.value, false, wiring, document.value));
    else {
      document.value.wiringData = JSON.parse(JSON.stringify(wiring));
      statusMessage.value = t('gameCreation.draftHint');
    }
    gameWiringOpen.value = false;
    saveFeedback.value = { message: currentGameId.value ? t('simple.saveSuccess') : t('gameCreation.draftHint') };
  } catch (error) {
    gameWiringError.value = error.message?.startsWith('gameWiring.') ? t(error.message) : error.message;
    saveFeedback.value = { failed: true, message: gameWiringError.value };
  } finally { gameWiringSaving.value = false; }
}
const globalConfigDraft = ref({});
const gameCategories = ref([]);
const pixelLightLayoutOpen = ref(false);
const pixelLightLayoutDraft = ref({});
const pixelLightControllerCount = ref(2);
const effectDialogOpen = ref(false);
const effectDialogDraft = ref({});
const effectSpirits = ref([]);
const effectSpiritLoadFailed = ref(false);
const effectIdPrefix = ref("effect");
const runtimeStatusMessage = ref("");
const runtimeErrorMessage = ref("");
const runtimeResult = ref(null);
const previewStatusMessage = ref("");
const levelPreviewSnapshot = ref(null);
const validationErrors = ref([]);
const gifExportProgress = ref("");
const document = ref(null);
const activeLevelIndex = ref(0);
const activeFrameIndex = ref(0);
const selectedColor = ref(0);
const drawingTool = ref("select");
const spriteBrushActive = ref(false);
const spriteSearchText = ref("");
const spriteFilterColors = ref([0, 1, 2, 3]);
const selectedSpriteId = ref("");
const matrixZoom = ref(1);
const showOverlapIndicators = ref(true);
const draggingFrameProgress = ref(false);
const previewFrameIndex = ref(null);
const selectedObjectId = ref("");
const hoveredObjectId = ref("");
const panoramaMode = ref(false);
const selectionMode = ref(false);
const mergeSelectionIds = ref([]);
const anchorEditMode = ref(false);
const showObjectList = ref(false);
const anchorCandidate = ref(null);
const objectIdCounter = ref(0);
const contextMenu = ref({ visible: false, x: 0, y: 0 });
const rgbEditHistory = createRgbEditHistory();
const editorLoadGuard = createLatestAsyncTaskGuard();
const rgbHistoryRevision = ref(0);
const fitViewportRef = ref(null);
const fitContentRef = ref(null);
const MIN_EDITOR_FIT_WIDTH = 1600;
const MIN_EDITOR_FIT_HEIGHT = 860;
const MIN_EDITOR_FIT_SCALE = 0.1;
const EDITOR_VIEWPORT_GUTTER = 12;
const editorFitScale = ref(1);
const editorFitBaseWidth = ref(MIN_EDITOR_FIT_WIDTH);
const editorFitBaseHeight = ref(MIN_EDITOR_FIT_HEIGHT);
const editorFitAvailableWidth = ref(0);
const editorFitAvailableHeight = ref(0);
const editorFitReady = ref(false);
let pendingZoomDirection = 0;
let zoomAnimationFrame = 0;
let fitResizeObserver = null;
let fitMeasureFrame = 0;
let editorFitCanReveal = false;
let layoutDiagnosticFrame = 0;
let lastLayoutDiagnostic = "";
let editorMounted = false;

const PANORAMA_PADDING = 8;
const EDITOR_OUTSIDE_RANGE_PADDING = 2;

// Matrix auto-fit: the matrix canvas is sized from these container measurements so it
// fills the .matrix-scroll column instead of using a fixed 18px cell. matrixZoom remains
// a user multiplier (wheel) on top of the auto-fit base.
const matrixScrollRef = ref(null);
const matrixContainerWidth = ref(0);
const matrixContainerHeight = ref(0);
let matrixResizeObserver = null;
const matrixBasePatchVersion = ref(0);
const matrixBasePatchCells = ref([]);
const objectDragPreview = ref(null);
const erasePreviewFrame = ref(null);
let eraseStrokeState = null;
let matrixFrameCache = new WeakMap();
let frameOccupancyCache = new WeakMap();
let matrixCacheWarmupHandle = 0;
let matrixCacheWarmupHandleType = "";
let matrixCacheWarmupQueue = [];
const matrixCacheRevision = ref(0);
let objectDragState = null;
const MIN_MATRIX_CELL = 8;
const MAX_MATRIX_CELL = 64;
const MATRIX_GAP_RATIO = 0;
const MATRIX_SCROLL_PADDING = 18;
const MATRIX_CACHE_WARMUP_BATCH_SIZE = 2;

const levels = computed(() => document.value?.levels || []);
const activeLevel = computed(() => levels.value[activeLevelIndex.value] || null);
const frames = computed(() => activeLevel.value?.frameList || []);
const frameTickIndices = computed(() => visibleFrameIndices(frames.value.length, displayedFrameIndex.value));
const activeLevelOptionErrors = computed(
  () => new Set(validateLevelOption(activeLevel.value?.option, document.value?.globalLifeLimit).map((error) => error.field)),
);
const activeFrame = computed(() => frames.value[activeFrameIndex.value] || null);
const currentGameId = computed(() => {
  const value = Number(document.value?.id ?? props.gameId);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
});
const currentGameName = computed(() => props.gameName || document.value?.name || "Simple");
const displayedFrameIndex = computed(() =>
  draggingFrameProgress.value && previewFrameIndex.value !== null
    ? previewFrameIndex.value
    : activeFrameIndex.value,
);
const canUndoRgbEdit = computed(() => {
  rgbHistoryRevision.value;
  return rgbEditHistory.canUndo;
});
const canRedoRgbEdit = computed(() => {
  rgbHistoryRevision.value;
  return rgbEditHistory.canRedo;
});
const previewFrame = computed(() => frames.value[displayedFrameIndex.value] || activeFrame.value || null);
const activeFramePercent = computed(() => {
  if (frames.value.length <= 1) {
    return 0;
  }
  return (displayedFrameIndex.value / (frames.value.length - 1)) * 100;
});
const matrixWidth = computed(() => clampDimension(document.value?.siteSizeWidth));
const matrixHeight = computed(() => clampDimension(document.value?.siteSizeHeight));
const matrixCellSizeValue = computed(() => {
  // Base is the auto-fit cell (fills the .matrix-scroll column); matrixZoom is a user
  // multiplier on top. autoFitMatrixCell is defined further down — the forward reference
  // is fine because computed callbacks evaluate lazily.
  const base = autoFitMatrixCell.value || 18;
  const cell = Math.round(base * matrixZoom.value);
  return Math.min(MAX_MATRIX_CELL, Math.max(MIN_MATRIX_CELL, cell));
});
const matrixGapSizeValue = computed(() =>
  Math.max(0, Math.round(matrixCellSizeValue.value * MATRIX_GAP_RATIO)),
);
const matrixRange = computed(() => {
  const padding = panoramaMode.value ? PANORAMA_PADDING : 0;
  return {
    minX: -padding,
    maxX: matrixWidth.value - 1 + padding,
    minY: -padding,
    maxY: matrixHeight.value - 1 + padding,
  };
});
const matrixRows = computed(() => createRange(matrixRange.value.minY, matrixRange.value.maxY));
const matrixColumns = computed(() => createRange(matrixRange.value.minX, matrixRange.value.maxX));
const matrixRowCount = computed(() => matrixRows.value.length);
const matrixColumnCount = computed(() => matrixColumns.value.length);
const matrixLayoutPaddingCells = computed(() =>
  panoramaMode.value ? 0 : EDITOR_OUTSIDE_RANGE_PADDING,
);
const autoFitMatrixCell = computed(() => {
  // Pick the largest square cell that fits the measured .matrix-scroll content area in
  // BOTH dimensions. total = n*cell + (n-1)*gap, gap≈cell*MATRIX_GAP_RATIO
  //   => cell*(n + MATRIX_GAP_RATIO*(n-1)) ≤ avail  =>  cell ≤ avail / (n + MATRIX_GAP_RATIO*(n-1))
  const padding = matrixLayoutPaddingCells.value;
  const cols = Math.max(1, matrixColumnCount.value + padding * 2);
  const rows = Math.max(1, matrixRowCount.value + padding * 2);
  const availW = Math.max(0, matrixContainerWidth.value - 2 * MATRIX_SCROLL_PADDING);
  const availH = Math.max(0, matrixContainerHeight.value - 2 * MATRIX_SCROLL_PADDING);
  if (!availW && !availH) {
    return 0; // container not measured yet; matrixCellSizeValue falls back to 18px base
  }
  const cellByW = availW ? availW / (cols + MATRIX_GAP_RATIO * Math.max(0, cols - 1)) : Infinity;
  const cellByH = availH ? availH / (rows + MATRIX_GAP_RATIO * Math.max(0, rows - 1)) : Infinity;
  return Math.floor(Math.min(cellByW, cellByH));
});
const colorOptions = computed(() => [
  { index: 0, label: "Color 0", value: normalizeColor(document.value?.color0, "#00ff00") },
  { index: 1, label: "Color 1", value: normalizeColor(document.value?.color1, "#0000ff") },
  { index: 2, label: "Color 2", value: normalizeColor(document.value?.color2, "#ff00ff") },
  { index: 3, label: "Color 3", value: normalizeColor(document.value?.color3, "#ffffff") },
]);
const colorSelectionDisabled = computed(
  () => Boolean(busyAction.value) || selectionMode.value || anchorEditMode.value,
);
const normalizedEditorSprites = computed(() =>
  effectSpirits.value
    .map((sprite) => normalizeEffectSprite(sprite))
    .filter((sprite) => sprite?.id && sprite.name && sprite.points.length),
);
const spriteDimensionFilter = computed(() => {
  const parts = String(spriteSearchText.value || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 2 || !parts.every((part) => /^\d+$/.test(part))) {
    return null;
  }
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return null;
  }
  return { width, height };
});
const filteredEditorSprites = computed(() => filterEditorSprites(normalizedEditorSprites.value, spriteSearchText.value, spriteFilterColors.value));
const selectedEditorSprite = computed(() =>
  filteredEditorSprites.value.find((sprite) => sprite.id === selectedSpriteId.value) || null,
);
watch(selectedEditorSprite, sprite => {
  if (!sprite && spriteBrushActive.value) {
    spriteBrushActive.value = false;
    selectedSpriteId.value = '';
  }
});
const matrixCells = computed(() => {
  matrixCacheRevision.value;
  const frame = erasePreviewFrame.value || previewFrame.value;
  return frame ? getOrCreateMatrixCells(frame) : [];
});
const matrixOverlayHighlights = computed(() => {
  const frame = erasePreviewFrame.value || previewFrame.value;
  if (!frame) {
    return [];
  }
  const highlights = [];
  const hovered = (frame.matrix || []).find((object) => object.id === hoveredObjectId.value);
  if (hovered) {
    for (const cell of getObjectCells(hovered)) {
      if (!isCellInMatrixRange(cell.x, cell.y)) {
        continue;
      }
      const occupants = occupancyIndex.value.get(createPointKey(cell.x, cell.y)) || [];
      if (getTopOccupancyEntry(occupants)?.object?.id === hovered.id) {
        highlights.push({ x: cell.x, y: cell.y, type: "hover-object" });
      }
    }
  }
  const selected = (frame.matrix || []).find((object) => object.id === selectedObjectId.value);
  if (selected) {
    getObjectCells(selected).forEach((cell) => {
      if (isCellInMatrixRange(cell.x, cell.y)) {
        highlights.push({ x: cell.x, y: cell.y, type: "selected" });
      }
    });
  }
  const mergeIds = mergeSelectionIds.value;
  for (const object of frame.matrix || []) {
    if (!mergeIds.includes(object.id)) {
      continue;
    }
    getObjectCells(object).forEach((cell) => {
      if (isCellInMatrixRange(cell.x, cell.y)) {
        highlights.push({ x: cell.x, y: cell.y, type: "merge" });
      }
    });
  }
  const anchorHighlight = anchorEditMode.value ? createAnchorHighlight(frame) : null;
  if (anchorHighlight && isCellInMatrixRange(anchorHighlight.x, anchorHighlight.y)) {
    highlights.push(anchorHighlight);
  }
  const dragPreview = objectDragPreview.value;
  if (dragPreview?.objectId === selectedObjectId.value) {
    for (const cell of dragPreview.cells) {
      if (isCellInMatrixRange(cell.x, cell.y)) {
        highlights.push({
          x: cell.x,
          y: cell.y,
          type: "drag-preview",
          color: dragPreview.color,
        });
      }
    }
  }
  return highlights;
});
const runtimeSummary = computed(() => formatRuntimeSummary(runtimeResult.value));
const frameObjects = computed(() =>
  (activeFrame.value?.matrix || []).map((object, index) => createObjectSummary(object, index)),
);
const frameColorObjectCounts = computed(() => {
  const counts = [0, 0, 0, 0];
  for (const object of activeFrame.value?.matrix || []) {
    counts[clampColorIndex(object.color)] += 1;
  }
  return counts;
});
const selectedObject = computed(() =>
  (activeFrame.value?.matrix || []).find((object) => object.id === selectedObjectId.value) || null,
);
const selectedObjectIndex = computed(() =>
  (activeFrame.value?.matrix || []).findIndex((object) => object.id === selectedObjectId.value),
);
const selectedObjectCanMoveUp = computed(
  () => selectedObjectIndex.value >= 0 && selectedObjectIndex.value < (activeFrame.value?.matrix || []).length - 1,
);
const selectedObjectCanMoveDown = computed(() => selectedObjectIndex.value > 0);
const occupancyIndex = computed(() => {
  matrixCacheRevision.value;
  return activeFrame.value ? getOrCreateFrameOccupancyIndex(activeFrame.value) : new Map();
});
function createExpandedCellMap(frame) {
  const occupancy = getOrCreateFrameOccupancyIndex(frame);
  const map = new Map();
  for (const [key, occupants] of occupancy.entries()) {
    const topEntry = getTopOccupancyEntry(occupants);
    if (topEntry) {
      map.set(key, { ...topEntry, occupants });
    }
  }
  return map;
}

function getExpandedCellAt(x, y) {
  return resolveLiveOccupancyCell(
    occupancyIndex.value,
    createPointKey(x, y),
    getTopOccupancyEntry,
  );
}
const panoramaStatusText = computed(
  () =>
    `x ${matrixRange.value.minX}..${matrixRange.value.maxX}, y ${matrixRange.value.minY}..${matrixRange.value.maxY}`,
);
const editorFitShellStyle = computed(() => ({
  width: `${Math.ceil(Math.max(
    editorFitAvailableWidth.value,
    editorFitBaseWidth.value * editorFitScale.value + EDITOR_VIEWPORT_GUTTER * 2,
  ))}px`,
  height: `${Math.ceil(Math.max(
    editorFitAvailableHeight.value,
    editorFitBaseHeight.value * editorFitScale.value + EDITOR_VIEWPORT_GUTTER * 2,
  ))}px`,
}));
const editorFitContentStyle = computed(() => ({
  width: `${editorFitBaseWidth.value || MIN_EDITOR_FIT_WIDTH}px`,
  height: `${editorFitBaseHeight.value || MIN_EDITOR_FIT_HEIGHT}px`,
  transform: `scale(${editorFitScale.value})`,
}));

watch(
  [document, matrixWidth, matrixHeight],
  () => {
    // These change the editor's natural size but not the pinned content box,
    // so the ResizeObserver can't catch them; re-fit after the DOM update.
    // Do not include matrixZoom, panoramaMode, activeLevelIndex, or
    // activeFrameIndex here: those are inner editor operations. Re-fitting
    // the whole editor from inner scrollWidth makes the centered fit shell
    // drift horizontally while the user zooms, enters panorama mode, or drags
    // the frame sequence.
    if (editorFitReady.value) {
      scheduleEditorFitMeasurement();
    }
    scheduleMatrixCacheWarmup();
  },
  { flush: "post" },
);

watch(
  [matrixRange, colorOptions],
  () => {
    scheduleMatrixCacheWarmup();
  },
  { flush: "post" },
);

watch(
  document,
  () => {
    // .matrix-scroll is behind v-if="document", so it only exists after the editor data
    // loads. Measure it once and start observing once it appears.
    nextTick(() => {
      if (!editorMounted) {
        return;
      }
      measureMatrixContainer();
      if (matrixScrollRef.value && matrixResizeObserver) {
        matrixResizeObserver.observe(matrixScrollRef.value);
      }
    });
  },
  { flush: "post" },
);

onMounted(() => {
  editorMounted = true;
  applyInitialEditorFit();
  setupEditorFitMeasurement();
  setupMatrixContainerObserver();
  loadEditor();
  void loadGameCategories();
  void loadEffectSpirits();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("resize", scheduleEditorFitMeasurement);
  window.visualViewport?.addEventListener("resize", scheduleEditorFitMeasurement);

  // Font loads (system fallback in packaged builds) can shift layout metrics
  // after the first measure; re-fit once fonts settle, then a couple of frames
  // later for the cascade. (window.document, not the local `document` ref.)
  const fonts = window.document?.fonts;
  if (fonts && typeof fonts.ready?.then === "function") {
    fonts.ready
      .then(() => {
        if (editorMounted && editorFitReady.value) {
          scheduleEditorFitMeasurement();
        }
      })
      .catch(() => {});
  }
});

onBeforeUnmount(() => {
  cancelEraseStroke();
  editorMounted = false;
  editorLoadGuard.invalidate();
  levelPreviewSnapshot.value = null;
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("resize", scheduleEditorFitMeasurement);
  window.visualViewport?.removeEventListener("resize", scheduleEditorFitMeasurement);
  fitResizeObserver?.disconnect();
  fitResizeObserver = null;
  matrixResizeObserver?.disconnect();
  matrixResizeObserver = null;
  cancelEditorFitMeasurement();
  cancelEditorLayoutDiagnostic();
  cancelZoomFrame();
  cancelMatrixCacheWarmup();
});

async function loadGameCategories() {
  if (!api?.listGameCategories) {
    return;
  }
  try {
    gameCategories.value = normalizeGameCategoryList(await api.listGameCategories());
  } catch (_error) {
    gameCategories.value = [];
  }
}

watch(
  () => props.gameId,
  (nextGameId, previousGameId) => {
    if (!editorMounted || !nextGameId || String(nextGameId) === String(previousGameId)) {
      return;
    }
    loadEditor();
  },
);

watch(
  filteredEditorSprites,
  (sprites) => {
    if (!sprites.some((sprite) => sprite.id === selectedSpriteId.value)) {
      selectedSpriteId.value = "";
    }
  },
  { flush: "post" },
);

async function loadEditor() {
  const gameId = currentGameId.value;
  const loadTicket = editorLoadGuard.begin(gameId);
  editorFitReady.value = false;
  editorFitCanReveal = false;
  clearRgbEditHistory();
  document.value = null;
  effectDialogOpen.value = false;
  await runEditorAction("load", async () => {
    if (!gameId && !props.initialDocument) {
      throw new Error(t("simple.gameSelectionMissing"));
    }
    const detail = gameId ? await api.getGameEditor(gameId) : { data: JSON.parse(JSON.stringify(props.initialDocument)) };
    if (!isCurrentEditorLoad(loadTicket)) {
      return;
    }
    const loaded = detail?.data ?? detail;
    if (!loaded || (gameId ? Number(loaded.id) !== gameId : loaded.id != null || loaded.type !== 'default')) {
      throw new Error(t("simple.editorGameMismatch", { game: currentGameName.value }));
    }
    const prepared = await prepareEditorDocument({ ...loaded, id: gameId }, loadTicket);
    if (!prepared || !isCurrentEditorLoad(loadTicket)) return;
    document.value = prepared;
    resetMatrixFrameCache();
    activeLevelIndex.value = 0;
    activeFrameIndex.value = 0;
    selectedColor.value = 0;
    drawingTool.value = "select";
    spriteBrushActive.value = false;
    spriteSearchText.value = "";
    selectedSpriteId.value = "";
    selectedObjectId.value = "";
    stopSelectionMode();
    panoramaMode.value = false;
    statusMessage.value = gameId ? t("simple.loadedGame", { game: currentGameName.value }) : t('gameCreation.draftHint');
    runtimeStatusMessage.value = "";
    runtimeErrorMessage.value = "";
    runtimeResult.value = null;
    previewStatusMessage.value = "";
    validationErrors.value = [];
    scheduleMatrixCacheWarmup(0);
    await nextTick();
    if (!isCurrentEditorLoad(loadTicket)) {
      return;
    }
    const fontsReady = await waitForEditorFonts(loadTicket);
    if (!fontsReady) {
      return;
    }
    await stabilizeEditorFitBeforeReveal(3, loadTicket);
  }, () => isCurrentEditorLoad(loadTicket));
}

function isCurrentEditorLoad(ticket) {
  return editorMounted && editorLoadGuard.isCurrent(ticket, currentGameId.value);
}

async function prepareEditorDocument(value, ticket) {
  // The API owns this detached document. Do not expose partially prepared frames
  // to Vue, or mutate the persisted database during preparation.
  const count = (value.levels || []).reduce((n, level) => n + (level.frameList || []).length, 0);
  let objects = 0;
  const large = count >= 32 || (value.levels || []).some(level =>
    (level.frameList || []).some(frame => (objects += (frame.matrix || []).length) >= 2000));
  if (!large) return ensureEditableShape(value);
  value.levels ||= [];
  let batchStarted = performance.now();
  await new Promise(resolve => window.setTimeout(resolve, 0));
  if (!isCurrentEditorLoad(ticket)) return null;
  for (const [index, level] of value.levels.entries()) {
    prepareEditableLevel(level, index);
    for (const [frameIndex, frame] of level.frameList.entries()) {
      frame.repeatTimes ||= 1;
      frame.matrix ||= [];
      for (let i = 0; i < frame.matrix.length; i += 1) {
        frame.matrix[i] = normalizeMatrixObject(frame.matrix[i], frame, frameIndex);
        if (i % 256 === 0 && performance.now() - batchStarted >= 8) {
          await new Promise(resolve => window.setTimeout(resolve, 0));
          if (!isCurrentEditorLoad(ticket)) return null;
          batchStarted = performance.now();
        }
      }
      setMatrixFrameVersion(frame, getMatrixFrameVersion(frame));
    }
  }
  return value;
}

async function waitForEditorFonts(loadTicket) {
  const fonts = window.document?.fonts;
  if (!fonts || typeof fonts.ready?.then !== "function") {
    return isCurrentEditorLoad(loadTicket);
  }
  return waitForGuardedPromise({
    promise: fonts.ready,
    isCurrent: () => isCurrentEditorLoad(loadTicket),
    // Font readiness is an optimization; layout can still stabilize without it.
    ignoreError: true,
  });
}

async function stabilizeEditorFitBeforeReveal(frames, loadTicket) {
  return runGuardedFrameSequence({
    frames,
    nextFrame: nextAnimationFrame,
    isCurrent: () => isCurrentEditorLoad(loadTicket),
    measure: measureEditorFit,
    reveal() {
      editorFitCanReveal = true;
    },
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function setupEditorFitMeasurement() {
  if (typeof ResizeObserver === "function") {
    fitResizeObserver = new ResizeObserver(scheduleEditorFitMeasurement);
    nextTick(() => {
      // Only observe the viewport: its border-box changes when the window
      // resizes. The content element is pinned by inline width/height, so
      // observing it never fires on inner growth (the old bug); inner size
      // changes are covered by the watchers instead.
      if (fitViewportRef.value) {
        fitResizeObserver.observe(fitViewportRef.value);
      }
    });
  }
  scheduleEditorFitMeasurement();
}

function scheduleEditorFitMeasurement() {
  if (!editorMounted || fitMeasureFrame) {
    return;
  }
  fitMeasureFrame = window.requestAnimationFrame(() => {
    fitMeasureFrame = 0;
    measureEditorFit();
  });
}

function measureEditorFit() {
  if (!editorMounted) {
    return;
  }
  const viewport = fitViewportRef.value;
  const content = fitContentRef.value;
  if (!viewport || !content) {
    // Still mounting / swapping views; retry on the next frame instead of
    // leaving editorFitScale stuck at its initial value of 1.
    scheduleEditorFitMeasurement();
    return;
  }
  const viewportWidth = Math.floor(viewport.clientWidth);
  const viewportHeight = Math.floor(viewport.clientHeight);
  if (!viewportWidth || !viewportHeight) {
    scheduleEditorFitMeasurement();
    return;
  }
  editorFitAvailableWidth.value = viewportWidth;
  editorFitAvailableHeight.value = viewportHeight;
  const availableContentWidth = Math.max(1, viewportWidth - EDITOR_VIEWPORT_GUTTER * 2);
  const availableContentHeight = Math.max(1, viewportHeight - EDITOR_VIEWPORT_GUTTER * 2);
  // Measure overflow beyond the currently pinned content box. Treating the
  // pinned width itself as a new natural minimum makes the fit dimensions grow
  // forever and leaves unused space below the editor after a resize.
  const naturalBounds = measureNaturalEditorBounds(content);
  const horizontalOverflow = Math.max(
    0,
    content.scrollWidth - content.clientWidth,
    naturalBounds.width - content.offsetWidth,
  );
  const verticalOverflow = Math.max(
    0,
    content.scrollHeight - content.clientHeight,
    naturalBounds.height - content.offsetHeight,
  );
  const naturalWidth = MIN_EDITOR_FIT_WIDTH + horizontalOverflow;
  const naturalHeight = MIN_EDITOR_FIT_HEIGHT + verticalOverflow;
  const baseWidth = Math.max(availableContentWidth, naturalWidth);
  const baseHeight = Math.max(availableContentHeight, naturalHeight);
  editorFitBaseWidth.value = baseWidth;
  editorFitBaseHeight.value = baseHeight;
  const fitScale = Math.min(
    availableContentWidth / baseWidth,
    availableContentHeight / baseHeight,
    1,
  );
  editorFitScale.value = Number(Math.max(fitScale, MIN_EDITOR_FIT_SCALE).toFixed(4));
  scheduleEditorLayoutDiagnostic();
  if (errorMessage.value || (document.value && editorFitCanReveal)) {
    editorFitReady.value = true;
  }
}

function applyInitialEditorFit() {
  // Synchronous pre-paint fit from window dimensions so the very first frame
  // is already scaled instead of 1500x860 at scale 1 (which gets clipped by
  // the viewport's overflow:hidden). Seed baseWidth/Height with the design
  // size too, so the fit-shell sizes correctly and centers the content
  // (leaving them at 0 would collapse the shell to 0x0 and mis-anchor it).
  // measureEditorFit() will refine these from the real DOM on the next frame.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!vw || !vh) {
    return false;
  }
  const approxViewportWidth = Math.max(0, vw - 84);
  const approxViewportHeight = Math.max(0, vh - 120);
  const approxContentWidth = Math.max(1, approxViewportWidth - EDITOR_VIEWPORT_GUTTER * 2);
  const approxContentHeight = Math.max(1, approxViewportHeight - EDITOR_VIEWPORT_GUTTER * 2);
  editorFitBaseWidth.value = MIN_EDITOR_FIT_WIDTH;
  editorFitBaseHeight.value = MIN_EDITOR_FIT_HEIGHT;
  editorFitAvailableWidth.value = approxViewportWidth;
  editorFitAvailableHeight.value = approxViewportHeight;
  editorFitScale.value = Number(
    Math.min(
      Math.max(
        Math.min(
          approxContentWidth / MIN_EDITOR_FIT_WIDTH,
          approxContentHeight / MIN_EDITOR_FIT_HEIGHT,
          1,
        ),
        MIN_EDITOR_FIT_SCALE,
      ),
      1,
    ).toFixed(4),
  );
  return true;
}

function cancelEditorFitMeasurement() {
  if (!fitMeasureFrame) {
    return;
  }
  window.cancelAnimationFrame(fitMeasureFrame);
  fitMeasureFrame = 0;
}

function scheduleEditorLayoutDiagnostic() {
  if (layoutDiagnosticFrame || typeof window.ledGame?.reportEditorLayout !== "function") {
    return;
  }
  layoutDiagnosticFrame = window.requestAnimationFrame(() => {
    layoutDiagnosticFrame = 0;
    reportEditorLayoutDiagnostic();
  });
}

function cancelEditorLayoutDiagnostic() {
  if (!layoutDiagnosticFrame) {
    return;
  }
  window.cancelAnimationFrame(layoutDiagnosticFrame);
  layoutDiagnosticFrame = 0;
}

function reportEditorLayoutDiagnostic() {
  const viewport = fitViewportRef.value;
  const content = fitContentRef.value;
  if (!viewport || !content || !document.value) {
    return;
  }
  const shell = viewport.querySelector(".simple-editor-fit-shell");
  const snapshot = {
    diagnostic: "layout-v2",
    window: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      visualViewportWidth: Math.round(window.visualViewport?.width || 0),
      visualViewportHeight: Math.round(window.visualViewport?.height || 0),
      visualViewportScale: window.visualViewport?.scale || 0,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
    },
    fit: {
      scale: editorFitScale.value,
      baseWidth: editorFitBaseWidth.value,
      baseHeight: editorFitBaseHeight.value,
      availableWidth: editorFitAvailableWidth.value,
      availableHeight: editorFitAvailableHeight.value,
    },
    documentElement: measureElementBox(window.document.documentElement),
    body: measureElementBox(window.document.body),
    appShell: measureElementBox(window.document.querySelector(".app-shell")),
    appNav: measureElementBox(window.document.querySelector(".app-nav")),
    viewport: measureElementBox(viewport),
    shell: measureElementBox(shell),
    content: measureElementBox(content),
    layout: measureElementBox(content.querySelector(".simple-editor-layout")),
    rightPanel: measureElementBox(content.querySelector(".editor-right")),
    rightMain: measureElementBox(content.querySelector(".editor-right-main")),
    objectPanel: measureElementBox(content.querySelector(".object-panel")),
    sideRail: measureElementBox(content.querySelector(".editor-side-rail")),
  };
  const serialized = JSON.stringify(snapshot);
  if (serialized === lastLayoutDiagnostic) {
    return;
  }
  lastLayoutDiagnostic = serialized;
  window.ledGame.reportEditorLayout(snapshot);
}

function measureElementBox(element) {
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return {
    client: `${element.clientWidth}x${element.clientHeight}`,
    scroll: `${element.scrollWidth}x${element.scrollHeight}`,
    offset: `${element.offsetWidth}x${element.offsetHeight}`,
    rect: `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.right)},${Math.round(rect.bottom)},${Math.round(rect.width)}x${Math.round(rect.height)}`,
    overflow: `${style.overflowX}/${style.overflowY}`,
    position: style.position,
    width: style.width,
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    padding: `${style.paddingTop},${style.paddingRight},${style.paddingBottom},${style.paddingLeft}`,
    transform: style.transform,
    zoom: style.zoom || "1",
    scrollLeft: element.scrollLeft,
    scrollTop: element.scrollTop,
  };
}

function measureNaturalEditorBounds(content) {
  const scale = Math.max(editorFitScale.value, 0.0001);
  const contentRect = content.getBoundingClientRect();
  let left = 0;
  let top = 0;
  let right = content.scrollWidth;
  let bottom = content.scrollHeight;
  const candidates = content.querySelectorAll(
    ".simple-editor-layout, .editor-right-main, .object-panel, .editor-side-rail",
  );
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    left = Math.min(left, (rect.left - contentRect.left) / scale);
    top = Math.min(top, (rect.top - contentRect.top) / scale);
    right = Math.max(right, (rect.right - contentRect.left) / scale);
    bottom = Math.max(bottom, (rect.bottom - contentRect.top) / scale);
  }
  return {
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  };
}

function measureMatrixContainer() {
  const el = matrixScrollRef.value;
  if (!el) {
    return;
  }
  // clientWidth/Height are layout pixels, unaffected by the workspace's transform:scale,
  // so this reports the real ~650px column / 1fr-row height the matrix should fill.
  matrixContainerWidth.value = el.clientWidth;
  matrixContainerHeight.value = el.clientHeight;
}

function setupMatrixContainerObserver() {
  if (typeof ResizeObserver !== "function") {
    return;
  }
  matrixResizeObserver = new ResizeObserver(measureMatrixContainer);
}

async function validateEditor() {
  if (!document.value) {
    return;
  }
  const localErrors = document.value.levels.flatMap((level, index) =>
    validateLevelOption(level.option, document.value.globalLifeLimit).map((error) => ({
      path: "levels[" + index + "].option." + error.field,
      message: t(error.messageKey),
    })),
  );
  if (localErrors.length) {
    validationErrors.value = localErrors;
    statusMessage.value = t("simple.validationFailed");
    return;
  }
  await runEditorAction("validate", async () => {
    const result = await api.validateGameEditor(createEditorPayload());
    validationErrors.value = result?.data?.errors || [];
    statusMessage.value = result?.data?.valid ? t("simple.validationPassed") : t("simple.validationFailed");
  });
}

async function saveEditor() {
  if (!document.value || busyAction.value) {
    return;
  }
  await runEditorAction("save", async () => {
    const missing = requiredEditorFields(document.value);
    if (missing.length) {
      throw new Error(t('editorSave.required') + '\n' + missing.map(field => (field.level ? `${t('simple.level')} ${field.level} · ` : '') + t(field.label)).join('\n'));
    }
    const localErrors = document.value.levels.flatMap((level, index) =>
      validateLevelOption(level.option, document.value.globalLifeLimit).map((error) => ({
        path: "levels[" + index + "].option." + error.field,
        message: t(error.messageKey),
      })),
    );
    for (const field of ['siteSizeWidth', 'siteSizeHeight', ...(document.value.globalTimeLimit ? ['globalTimeLimitValue'] : []), ...(document.value.globalLifeLimit ? ['globalLifeLimitValue'] : [])]) {
      if (!Number.isInteger(Number(document.value[field])) || Number(document.value[field]) <= 0) localErrors.push({ path: field, message: t('simple.levelLimitPositive') });
    }
    if (localErrors.length) {
      validationErrors.value = localErrors;
      statusMessage.value = t("simple.validationFailed");
      throw new Error(t('editorSave.invalid') + '\n' + localErrors.map(error => error.message).join('\n'));
    }
    const payload = createEditorPayload();
    const result = currentGameId.value
      ? await api.saveGameEditor(currentGameId.value, payload)
      : await api.createGameEditor(payload);
    const saved = result?.data ?? result;
    if (saved?.saved !== true || !Number.isInteger(saved.gameId) || saved.gameId < 1) {
      throw new Error(result?.message || t('gameWiring.saveFailed'));
    }
    document.value.id = saved.gameId;
    payload.id = saved.gameId;
    statusMessage.value = t("simple.saveSuccess");
    validationErrors.value = [];
  });
}

function openGlobalConfig() {
  if (!document.value || busyAction.value) {
    return;
  }
  const doc = document.value;
  globalConfigDraft.value = {
    cover: doc.cover ?? "",
    type: doc.type ?? "",
    mode: doc.mode ?? "",
    name: doc.name ?? "",
    description: doc.description ?? '',
    remark: doc.remark ?? '',
    siteSizeWidth: doc.siteSizeWidth ?? '',
    siteSizeHeight: doc.siteSizeHeight ?? '',
    firstCatalog: doc.firstCatalog ?? "",
    childModeVisible: doc.childModeVisible !== false,
    globalTimeLimit: Boolean(doc.globalTimeLimit),
    globalTimeLimitValue: doc.globalTimeLimitValue ?? 0,
    globalLifeLimit: Boolean(doc.globalLifeLimit),
    globalLifeLimitValue: doc.globalLifeLimitValue ?? 20,
    audio: { ...(doc.audio || {}) },
    gif: { ...(doc.gif || {}) },
    commonConfig: { ...(doc.commonConfig || {}) },
  };
  errorMessage.value = "";
  globalConfigOpen.value = true;
}

async function saveGlobalConfig(patch) {
  if (busyAction.value) return;
  const gameId = currentGameId.value;
  if (!gameId) {
    applySimpleGlobalConfigPatch(document.value, patch);
    globalConfigOpen.value = false;
    statusMessage.value = t('gameCreation.draftHint');
    saveFeedback.value = { message: statusMessage.value };
    return;
  }
  // 仅持久化配置字段：用后端上次已保存的文档作为 base，只应用配置 patch 后落库，
  // 避免把 RGB 编辑区未保存的帧/矩阵改动一并提交。
  await runEditorAction("save", async () => {
    const result = await saveSimpleGlobalConfigDocument({
      api,
      gameId,
      patch,
      liveDocument: document.value,
      missingDocumentMessage: t("simple.readSavedFailed"),
    });
    statusMessage.value = result?.data?.saved ? t("simple.globalSaved") : t("simple.saveComplete");
    validationErrors.value = [];
  });
  if (!errorMessage.value) {
    globalConfigOpen.value = false;
  }
}

function openPixelLightLayout() {
  if (!document.value || busyAction.value) {
    return;
  }
  const draft = normalizePixelLightWiring(document.value.commonConfig?.pixelLightWiring);
  pixelLightLayoutDraft.value = draft;
  errorMessage.value = "";
  pixelLightControllerCount.value = Math.max(2, draft.form.controlIdx + 1);
  pixelLightLayoutOpen.value = true;
}

async function loadEffectSpirits() {
  if (effectSpirits.value.length || effectSpiritLoadFailed.value) {
    return;
  }
  if (!window.spiritLibrary?.list) {
    effectSpiritLoadFailed.value = true;
    return;
  }
  try {
    const result = await window.spiritLibrary.list();
    effectSpirits.value = Array.isArray(result?.data) ? result.data : [];
  } catch (_error) {
    effectSpiritLoadFailed.value = true;
  }
}

function openEffectDialog() {
  if (!document.value || busyAction.value || !activeLevel.value || !activeFrame.value) {
    return;
  }
  effectDialogDraft.value = normalizeEffectConfig({ color: selectedColor.value });
  effectIdPrefix.value = `effect-${Date.now().toString(36)}-${objectIdCounter.value++}-${activeLevelIndex.value}-${activeFrameIndex.value}`;
  effectDialogOpen.value = true;
  loadEffectSpirits();
}

function closeEffectDialog() {
  if (!busyAction.value) {
    effectDialogOpen.value = false;
  }
}

function applyEffectResult(result) {
  const level = activeLevel.value;
  if (!level || !Array.isArray(result?.frames) || !result.frames.length) {
    return;
  }
  const generatedFrames = expandEffectFrames(result.config, {
    spirits: effectSpirits.value,
    idPrefix: effectIdPrefix.value,
  });
  const applied = applyEffectToFrameList(
    level.frameList,
    activeFrameIndex.value,
    generatedFrames,
    result.config?.mode,
  );
  const startIndex = Math.min(level.frameList.length, Math.max(0, activeFrameIndex.value));
  if (!generatedFrames.every((_frame, offset) => canApplyColorOccupancy(
    result.config?.mode === 'merge' ? level.frameList[startIndex + offset]?.matrix : [],
    applied.frameList[startIndex + offset]?.matrix,
  ))) return;
  applied.frameList.forEach((frame, index) => {
    frame.matrix = (frame.matrix || []).map(object => normalizeMatrixObject(object, frame, index));
  });
  level.frameList = applied.frameList;
  activeFrameIndex.value = applied.selectedFrameIndex;
  resetMatrixFrameCache();
  clearRgbEditHistory();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
  effectDialogOpen.value = false;
  statusMessage.value = t("effect.applied");
}

async function savePixelLightLayout(layout) {
  const gameId = currentGameId.value;
  if (!gameId) {
    document.value.commonConfig ||= {};
    document.value.commonConfig.pixelLightWiring = normalizePixelLightWiring(layout);
    pixelLightLayoutDraft.value = normalizePixelLightWiring(layout);
    pixelLightLayoutOpen.value = false;
    statusMessage.value = t('gameCreation.draftHint');
    return;
  }
  await runEditorAction("save", async () => {
    const result = await saveSimpleGlobalConfigDocument({
      api,
      gameId,
      patch: { commonConfig: { pixelLightWiring: normalizePixelLightWiring(layout) } },
      liveDocument: document.value,
      missingDocumentMessage: t("simple.readSavedFailed"),
    });
    pixelLightLayoutDraft.value = normalizePixelLightWiring(layout);
    statusMessage.value = result?.data?.saved ? t("pixelLight.saved") : t("simple.saveComplete");
    validationErrors.value = [];
  });
  if (!errorMessage.value) {
    pixelLightLayoutOpen.value = false;
  }
}

async function exportCurrentLevelGif() {
  const level = activeLevel.value;
  if (!level?.frameList?.length || busyAction.value) {
    return;
  }
  busyAction.value = "gif-export";
  errorMessage.value = "";
  gifExportProgress.value = t("simple.preparingGif");
  try {
    if (!api?.saveGif) {
      throw new Error(t("simple.gifApiUnavailable"));
    }
    const prepared = prepareSimpleLevelGif(level, document.value);
    const bytes = await encodeSimpleGifInWorker(prepared, (completed, total) => {
      gifExportProgress.value = t("simple.encodingGif", { completed, total });
    });
    const levelName = String(level.label || `level-${activeLevelIndex.value + 1}`)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim();
    const result = await api.saveGif({
      bytes,
      defaultFileName: `${levelName || "simple-level"}.gif`,
    });
    if (result?.canceled) {
      statusMessage.value = t("simple.gifCancelled");
    } else {
      statusMessage.value = t("simple.gifSaved", { file: result?.fileName || t("simple.exportComplete") });
    }
  } catch (error) {
    const messageKey = {
      SIMPLE_GIF_EMPTY_LEVEL: "simple.gifEmptyLevel",
      SIMPLE_GIF_ENCODING_FAILED: "simple.gifEncodingFailed",
      SIMPLE_GIF_WORKER_FAILED: "simple.gifWorkerFailed",
    }[error?.code];
    errorMessage.value = messageKey ? t(messageKey) : error?.message || t("simple.gifFailed");
  } finally {
    gifExportProgress.value = "";
    busyAction.value = "";
  }
}


function openPreview() {
  levelPreviewSnapshot.value = createLevelPreviewSnapshot(activeLevel.value, {
    width: matrixWidth.value,
    height: matrixHeight.value,
    colors: colorOptions.value.map((color) => color.value),
  });
}

function closeLevelPreview() {
  levelPreviewSnapshot.value = null;
}

async function exportCurrentLevel() {
  if (busyAction.value) return;
  statusMessage.value = "";
  errorMessage.value = "";
  if (!activeLevel.value) {
    errorMessage.value = t("simple.noExportLevel");
    return;
  }
  busyAction.value = "level-export";
  try {
    if (!api?.exportFrameJson) {
      throw new Error(t("simple.exportApiUnavailable"));
    }
    const content = JSON.stringify(serializeActiveLevel(), null, 2);
    const defaultFileName = `led-level-${activeLevelIndex.value + 1}.json`;
    const result = await api.exportFrameJson({ content, defaultFileName, title: t("simple.exportCurrentLevel") });
    if (result?.canceled) {
      return;
    }
    statusMessage.value = t("simple.levelExported", {
      file: result?.filePath || t("simple.fileFallback"),
    });
  } catch (error) {
    errorMessage.value = error.message || String(error);
  } finally {
    busyAction.value = "";
  }
}

async function importCurrentLevel() {
  if (busyAction.value) return;
  statusMessage.value = "";
  errorMessage.value = "";
  const level = activeLevel.value;
  if (!level) {
    errorMessage.value = t("simple.noReplaceLevel");
    return;
  }
  const targetDocument = document.value;
  const levelIndex = activeLevelIndex.value;
  busyAction.value = "level-import";
  try {
    if (!api?.importFrameJson) {
      throw new Error(t("simple.importApiUnavailable"));
    }
    const result = await api.importFrameJson({ title: t("simple.importReplaceLevel") });
    if (result?.canceled) {
      return;
    }
    if (document.value !== targetDocument || activeLevel.value !== level || activeLevelIndex.value !== levelIndex) {
      throw new Error(t("simple.levelImportStale"));
    }
    const imported = normalizeImportedLevel(JSON.parse(result?.content || ""));
    if (!imported.frameList.every(frame => canApplyColorOccupancy([], frame.matrix))) return;
    if (!confirmWithRendererFocus(t("simple.confirmReplaceLevel", {
      name: level.label || `Level ${levelIndex + 1}`, count: level.frameList.length,
    }))) return;
    document.value.levels[levelIndex] = imported;
    activeFrameIndex.value = 0;
    previewFrameIndex.value = null;
    draggingFrameProgress.value = false;
    selectedObjectId.value = "";
    resetMatrixFrameCache();
    clearRgbEditHistory();
    syncSelectedObject();
    scheduleMatrixCacheWarmup(0);
    statusMessage.value = t("simple.levelImported", { count: imported.frameList.length });
  } catch (error) {
    errorMessage.value = t("simple.levelImportFailed", { message: error.message || String(error) });
  } finally {
    busyAction.value = "";
    nextTick(restoreRendererFocus);
  }
}

async function runEditorAction(name, action, shouldCommit = () => true) {
  busyAction.value = name;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    if (!api) {
      throw new Error("Electron API is unavailable");
    }
    if (name === 'save') await withEditorSavingCursor(action);
    else await action();
    if (name === 'save' && shouldCommit()) saveFeedback.value = { message: statusMessage.value || t('simple.saveSuccess') };
  } catch (error) {
    if (shouldCommit()) {
      errorMessage.value = error.message || String(error);
      if (name === 'save') saveFeedback.value = { failed: true, message: errorMessage.value };
      if (name === 'load') nextTick(scheduleEditorFitMeasurement);
    }
  } finally {
    if (shouldCommit()) {
      busyAction.value = "";
    }
  }
}

function getCachedMatrixCells(frame) {
  const cacheKey = createMatrixFrameCacheKey(frame);
  const cached = matrixFrameCache.get(frame);
  return cached?.key === cacheKey ? cached.cells : null;
}

function getOrCreateMatrixCells(frame) {
  const cached = getCachedMatrixCells(frame);
  if (cached) {
    return cached;
  }
  const cells = buildMatrixCellsForFrame(frame);
  setCachedMatrixCells(frame, cells);
  return cells;
}

function getOrCreateFrameOccupancyIndex(frame) {
  const cacheKey = getMatrixFrameVersion(frame);
  const cached = frameOccupancyCache.get(frame);
  if (cached?.key === cacheKey) {
    return cached.index;
  }
  const index = createOccupancyIndex(frame.matrix || []);
  frameOccupancyCache.set(frame, {
    key: cacheKey,
    index,
  });
  return index;
}

function buildMatrixCellsForFrame(frame) {
  const cells = [];
  const expandedMap = createExpandedCellMap(frame);
  for (const row of matrixRows.value) {
    for (const column of matrixColumns.value) {
      const cell = expandedMap.get(createPointKey(column, row));
      const occupants = cell?.occupants || [];
      const objectId = cell?.object?.id || "";
      const realCell = isRealCell(column, row);
      const colorIndex = clampColorIndex(cell?.object?.color);
      const color = cell?.object
        ? colorOptions.value[colorIndex]?.value || "#26313d"
        : "#000000";
      const overlapCount = occupants.length;
      cells.push({
        key: `${column}:${row}`,
        x: column,
        y: row,
        color,
        objectId,
        overlapCount,
        classes: {
          "real-cell": realCell,
          "virtual-cell": !realCell,
          "object-cell": Boolean(cell),
          "overlap-cell": overlapCount > 1,
        },
      });
    }
  }
  return cells;
}

function setCachedMatrixCells(frame, cells) {
  matrixFrameCache.set(frame, {
    key: createMatrixFrameCacheKey(frame),
    cells,
  });
}

function createMatrixFrameCacheKey(frame) {
  const range = matrixRange.value;
  return [
    getMatrixFrameVersion(frame),
    range.minX,
    range.maxX,
    range.minY,
    range.maxY,
    matrixWidth.value,
    matrixHeight.value,
    colorOptions.value.map((color) => color.value).join("|"),
  ].join(";");
}

function invalidateMatrixFrame(frame = activeFrame.value) {
  if (!frame) {
    return;
  }
  setMatrixFrameVersion(frame, getMatrixFrameVersion(frame) + 1);
  matrixFrameCache.delete(frame);
  frameOccupancyCache.delete(frame);
  matrixCacheRevision.value += 1;
  scheduleMatrixCacheWarmup();
}

// Lightweight in-place cache update for a single-object add/remove: updates only the
// affected cells in the cached matrixCells array + occupancy index (O(object cells))
// instead of wiping the whole frame cache (which forced an O(rows*cols) rebuild).
// matrixCacheRevision is intentionally NOT bumped, so the matrixCells computed keeps
// returning the same (mutated) array and only the canvas is told via the patch props.
function patchMatrixFrame(frame, object, op, { warmup = true } = {}) {
  if (!frame) {
    return;
  }
  const cellsEntry = matrixFrameCache.get(frame);
  const occEntry = frameOccupancyCache.get(frame);
  if (!cellsEntry || !occEntry) {
    // Cold frame (never built) — fall back to a full invalidate+rebuild.
    invalidateMatrixFrame(frame);
    return;
  }
  const cells = cellsEntry.cells;
  const occupancy = occEntry.index;
  const objectCells = getObjectCells(object);
  const objectIndex = (frame.matrix || []).findIndex((item) => item.id === object.id);
  const changedKeys = new Set();

  for (const oc of objectCells) {
    const key = createPointKey(oc.x, oc.y);
    if (op === "add") {
      let occupants = occupancy.get(key);
      if (!occupants) {
        occupants = [];
        occupancy.set(key, occupants);
      }
      occupants.push({
        x: oc.x,
        y: oc.y,
        dx: oc.dx,
        dy: oc.dy,
        object,
        objectIndex,
        pointIndex: occupants.length,
      });
    } else {
      const occupants = occupancy.get(key);
      if (occupants) {
        const at = occupants.findIndex((entry) => entry.object?.id === object.id);
        if (at >= 0) {
          occupants.splice(at, 1);
        }
        if (!occupants.length) {
          occupancy.delete(key);
        }
      }
    }
    changedKeys.add(key);
  }

  const changedPositions = [];
  for (const key of changedKeys) {
    const sep = key.indexOf(":");
    const x = Number(key.slice(0, sep));
    const y = Number(key.slice(sep + 1));
    const renderIndex =
      (y - matrixRange.value.minY) * matrixColumnCount.value +
      (x - matrixRange.value.minX);
    if (renderIndex < 0 || renderIndex >= cells.length) {
      continue;
    }
    const occupants = occupancy.get(key) || [];
    const topEntry = getTopOccupancyEntry(occupants);
    const top = topEntry?.object;
    const realCell = isRealCell(x, y);
    const colorIndex = clampColorIndex(top?.color);
    const color = top
      ? colorOptions.value[colorIndex]?.value || "#26313d"
      : "#000000";
    cells[renderIndex] = {
      key,
      x,
      y,
      color,
      objectId: top?.id || "",
      overlapCount: occupants.length,
      classes: {
        "real-cell": realCell,
        "virtual-cell": !realCell,
        "object-cell": Boolean(top),
        "overlap-cell": occupants.length > 1,
      },
    };
    changedPositions.push({ x, y });
  }

  setMatrixFrameVersion(frame, getMatrixFrameVersion(frame) + 1);
  cellsEntry.key = createMatrixFrameCacheKey(frame);
  occEntry.key = getMatrixFrameVersion(frame);
  queueMatrixBasePatch(changedPositions);
  if (warmup) {
    scheduleMatrixCacheWarmup();
  }
}

function resetMatrixFrameCache() {
  matrixFrameCache = new WeakMap();
  frameOccupancyCache = new WeakMap();
  matrixCacheRevision.value += 1;
  scheduleMatrixCacheWarmup();
}

function scheduleMatrixCacheWarmup(centerIndex = displayedFrameIndex.value) {
  matrixCacheWarmupQueue = createMatrixCacheWarmupQueue(centerIndex);
  if (matrixCacheWarmupHandle || !matrixCacheWarmupQueue.length) {
    return;
  }
  requestMatrixCacheWarmup();
}

function createMatrixCacheWarmupQueue(centerIndex) {
  const frameList = frames.value;
  if (!frameList.length) {
    return [];
  }
  const boundedCenter = Math.min(frameList.length - 1, Math.max(0, toInteger(centerIndex, activeFrameIndex.value)));
  const ordered = [frameList[boundedCenter]];
  for (let distance = 1; ordered.length < frameList.length; distance += 1) {
    const nextIndex = boundedCenter + distance;
    const previousIndex = boundedCenter - distance;
    if (nextIndex < frameList.length) {
      ordered.push(frameList[nextIndex]);
    }
    if (previousIndex >= 0) {
      ordered.push(frameList[previousIndex]);
    }
  }
  return ordered.filter(Boolean);
}

function requestMatrixCacheWarmup() {
  if (typeof window.requestIdleCallback === "function") {
    matrixCacheWarmupHandleType = "idle";
    matrixCacheWarmupHandle = window.requestIdleCallback(runMatrixCacheWarmup, { timeout: 350 });
    return;
  }
  matrixCacheWarmupHandleType = "frame";
  matrixCacheWarmupHandle = window.requestAnimationFrame(() => {
    runMatrixCacheWarmup({
      didTimeout: true,
      timeRemaining: () => 4,
    });
  });
}

function runMatrixCacheWarmup(deadline) {
  matrixCacheWarmupHandle = 0;
  matrixCacheWarmupHandleType = "";
  let warmedCount = 0;
  while (matrixCacheWarmupQueue.length) {
    const hasTime =
      deadline?.didTimeout ||
      typeof deadline?.timeRemaining !== "function" ||
      deadline.timeRemaining() > 2 ||
      warmedCount === 0;
    if (!hasTime || warmedCount >= MATRIX_CACHE_WARMUP_BATCH_SIZE) {
      break;
    }
    const frame = matrixCacheWarmupQueue.shift();
    if (!frame || getCachedMatrixCells(frame)) {
      continue;
    }
    getOrCreateMatrixCells(frame);
    warmedCount += 1;
  }
  if (matrixCacheWarmupQueue.length) {
    requestMatrixCacheWarmup();
  }
}

function cancelMatrixCacheWarmup() {
  if (!matrixCacheWarmupHandle) {
    return;
  }
  if (matrixCacheWarmupHandleType === "idle" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(matrixCacheWarmupHandle);
  } else {
    window.cancelAnimationFrame(matrixCacheWarmupHandle);
  }
  matrixCacheWarmupHandle = 0;
  matrixCacheWarmupHandleType = "";
  matrixCacheWarmupQueue = [];
}

function getMatrixFrameVersion(frame) {
  return Number(frame?.__matrixVersion) || 0;
}

function setMatrixFrameVersion(frame, version) {
  Object.defineProperty(frame, "__matrixVersion", {
    value: version,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

function createRgbHistoryTarget(levelIndex, frameIndex) {
  return {
    levelIndex: toInteger(levelIndex, 0),
    frameIndex: toInteger(frameIndex, 0),
  };
}

function currentFrameRgbHistoryTargets() {
  return [createRgbHistoryTarget(activeLevelIndex.value, activeFrameIndex.value)];
}

function currentLevelRgbHistoryTargets(frameIndices = frames.value.map((_frame, index) => index)) {
  return frameIndices.map((frameIndex) =>
    createRgbHistoryTarget(activeLevelIndex.value, frameIndex),
  );
}

function captureRgbHistorySnapshot(targets) {
  const uniqueTargets = new Map();
  for (const target of targets || []) {
    const key = `${target.levelIndex}:${target.frameIndex}`;
    uniqueTargets.set(key, target);
  }
  return {
    activeLevelIndex: activeLevelIndex.value,
    activeFrameIndex: activeFrameIndex.value,
    selectedObjectId: selectedObjectId.value,
    matrices: [...uniqueTargets.values()].map((target) => {
      const frame = document.value?.levels?.[target.levelIndex]?.frameList?.[target.frameIndex];
      return {
        ...target,
        matrix: cloneRgbMatrix(frame?.matrix),
      };
    }),
  };
}

function cloneRgbMatrix(matrix) {
  return (matrix || []).map((object) => ({
    ...JSON.parse(JSON.stringify(toRaw(object))),
    id: object.id,
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    color: clampColorIndex(object.color),
    points: getObjectPoints(object).map(([dx, dy]) => [dx, dy]),
  }));
}

function runRgbEdit(targets, action, mutation, { recenter = true } = {}) {
  cancelEraseStroke();
  const before = captureRgbHistorySnapshot(targets);
  const selection = { mode: selectionMode.value, ids: [...mergeSelectionIds.value] };
  const result = mutation();
  for (const target of targets) {
    const frame = document.value?.levels?.[target.levelIndex]?.frameList?.[target.frameIndex];
    if (frame && recenter) frame.matrix = frame.matrix.map(centerObjectAnchor);
  }
  const after = captureRgbHistorySnapshot(targets);
  if (!after.matrices.every((item, index) =>
    canApplyColorOccupancy(before.matrices[index]?.matrix, item.matrix))) {
    // Synchronous mutations are rolled back before Vue paints or history is committed.
    restoreRgbHistorySnapshot(before);
    selectionMode.value = selection.mode;
    mergeSelectionIds.value = selection.ids;
    return false;
  }
  // Rebasing changed object references; discard only affected derived caches.
  for (const target of targets) {
    invalidateMatrixFrame(document.value?.levels?.[target.levelIndex]?.frameList?.[target.frameIndex]);
  }
  if (rgbEditHistory.commit(before, after, { action })) {
    rgbHistoryRevision.value += 1;
  }
  return result === false ? false : true;
}

function clearRgbEditHistory() {
  cancelEraseStroke();
  rgbEditHistory.clear();
  rgbHistoryRevision.value += 1;
}

function undoRgbEdit() {
  cancelEraseStroke();
  if (busyAction.value || !rgbEditHistory.canUndo) {
    return false;
  }
  const entry = rgbEditHistory.undo();
  restoreRgbHistorySnapshot(entry.snapshot);
  rgbHistoryRevision.value += 1;
  statusMessage.value = t("simple.rgbUndoComplete");
  return true;
}

function redoRgbEdit() {
  cancelEraseStroke();
  if (busyAction.value || !rgbEditHistory.canRedo) {
    return false;
  }
  const entry = rgbEditHistory.redo();
  restoreRgbHistorySnapshot(entry.snapshot);
  rgbHistoryRevision.value += 1;
  statusMessage.value = t("simple.rgbRedoComplete");
  return true;
}

function restoreRgbHistorySnapshot(snapshot) {
  for (const item of snapshot?.matrices || []) {
    const frame = document.value?.levels?.[item.levelIndex]?.frameList?.[item.frameIndex];
    if (frame) {
      frame.matrix = cloneRgbMatrix(item.matrix);
    }
  }
  activeLevelIndex.value = clampIndex(snapshot?.activeLevelIndex, levels.value.length);
  activeFrameIndex.value = clampIndex(
    snapshot?.activeFrameIndex,
    document.value?.levels?.[activeLevelIndex.value]?.frameList?.length,
  );
  selectedObjectId.value = snapshot?.selectedObjectId || "";
  resetMatrixFrameCache();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
}

function clampIndex(value, length) {
  const max = Math.max(0, toInteger(length, 0) - 1);
  return Math.min(max, Math.max(0, toInteger(value, 0)));
}

function selectLevel(index) {
  cancelEraseStroke();
  activeLevelIndex.value = index;
  activeFrameIndex.value = 0;
  ensureActiveFrame();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(0);
}

function selectFrame(index) {
  cancelEraseStroke();
  previewFrameIndex.value = null;
  draggingFrameProgress.value = false;
  activeFrameIndex.value = index;
  ensureActiveFrame();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(index);
}

function getFrameIndexFromPointer(event) {
  if (!frames.value.length) {
    return activeFrameIndex.value;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return Math.round(ratio * (frames.value.length - 1));
}

function previewFrameFromPointer(event) {
  previewFrameIndex.value = getFrameIndexFromPointer(event);
}

function startFrameDrag(event) {
  draggingFrameProgress.value = true;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  previewFrameFromPointer(event);
}

function dragFrameProgress(event) {
  if (!draggingFrameProgress.value) {
    return;
  }
  previewFrameFromPointer(event);
}

function stopFrameDrag(event) {
  if (!draggingFrameProgress.value) {
    return;
  }
  const nextIndex = previewFrameIndex.value;
  draggingFrameProgress.value = false;
  previewFrameIndex.value = null;
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  if (event.type !== "pointercancel" && Number.isInteger(nextIndex)) {
    selectFrame(nextIndex);
  }
}

function addLevel() {
  document.value = ensureEditableShape(document.value);
  const nextIndex = levels.value.length;
  document.value.levels.push({
    label: `Level ${nextIndex + 1}`,
    option: normalizeLevelOption(),
    frameList: [createBlankFrame()],
  });
  activeLevelIndex.value = nextIndex;
  activeFrameIndex.value = 0;
  clearRgbEditHistory();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(0);
}

const canDeleteActiveLevel = computed(() => levels.value.length > 1);

function startLevelDrag(event, index) {
  if (busyAction.value || anchorEditMode.value) { event.preventDefault(); return; }
  draggingLevelIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function endLevelDrag() {
  draggingLevelIndex.value = null;
  levelDropIndex.value = null;
}

function dropLevel(index) {
  if (busyAction.value || draggingLevelIndex.value == null) { endLevelDrag(); return; }
  const result = moveLevelAt(levels.value, draggingLevelIndex.value, index, activeLevelIndex.value);
  endLevelDrag();
  if (!result.moved) {
    return;
  }
  document.value.levels = result.levels;
  activeLevelIndex.value = result.activeIndex;
  activeFrameIndex.value = Math.min(activeFrameIndex.value, Math.max(0, frames.value.length - 1));
  clearRgbEditHistory();
  ensureActiveFrame();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
  resetMatrixFrameCache();
}

function deleteCurrentLevel(index = activeLevelIndex.value) {
  const level = document.value?.levels?.[index];
  if (busyAction.value || anchorEditMode.value || draggingLevelIndex.value !== null || !level || !canDeleteActiveLevel.value) {
    return;
  }
  const levelName = level.label || `Level ${index + 1}`;
  const frameCount = level.frameList?.length || 0;
  if (!confirmWithRendererFocus(t("simple.deleteLevelConfirm", { name: levelName, count: frameCount }))) {
    return;
  }

  const deletingActive = index === activeLevelIndex.value;
  const result = deleteLevelAt(document.value.levels, index, activeLevelIndex.value);
  if (!result.deleted) {
    return;
  }
  document.value.levels = result.levels;
  activeLevelIndex.value = result.activeIndex;
  if (deletingActive) activeFrameIndex.value = 0;
  resetMatrixFrameCache();
  clearRgbEditHistory();
  stopSelectionMode();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
  statusMessage.value = t("simple.levelDeleted", { name: levelName });
}

function addFrame() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList ||= [];
  level.frameList.push(createBlankFrame());
  invalidateMatrixFrame(level.frameList[level.frameList.length - 1]);
  activeFrameIndex.value = level.frameList.length - 1;
  clearRgbEditHistory();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
}

function addFrameAfterCurrent() {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  level.frameList ||= [];
  const result = insertFrameAfter(level.frameList, activeFrameIndex.value, createBlankFrame());
  if (!result.inserted) {
    return;
  }
  invalidateMatrixFrame(level.frameList[result.index]);
  clearRgbEditHistory();
  selectFrame(result.index);
}

function deleteCurrentFrame() {
  const level = activeLevel.value;
  if (!level?.frameList?.length) {
    return;
  }
  if (!confirmWithRendererFocus(t("simple.deleteFrameConfirm", { number: activeFrameIndex.value + 1 }))) {
    return;
  }
  level.frameList.splice(activeFrameIndex.value, 1);
  resetMatrixFrameCache();
  if (!level.frameList.length) {
    level.frameList.push(createBlankFrame());
  }
  activeFrameIndex.value = Math.min(activeFrameIndex.value, level.frameList.length - 1);
  clearRgbEditHistory();
  syncSelectedObject();
  scheduleMatrixCacheWarmup(activeFrameIndex.value);
}

function applyCurrentRepeatTimesToAllFrames() {
  const level = activeLevel.value;
  const frame = activeFrame.value;
  if (!level?.frameList?.length || !frame) {
    return;
  }
  const repeatTimes = Math.max(1, toInteger(frame.repeatTimes, 1));
  level.frameList.forEach((item) => {
    item.repeatTimes = repeatTimes;
  });
  frame.repeatTimes = repeatTimes;
  statusMessage.value = t("simple.repeatApplied", { count: repeatTimes });
}

function selectColor(index) {
  if (colorSelectionDisabled.value) {
    return;
  }
  spriteBrushActive.value = false;
  selectedSpriteId.value = '';
  selectedColor.value = index;
  selectDrawingTool("brush");
}

function selectEditorSprite(sprite) {
  if (colorSelectionDisabled.value || !sprite) return;
  selectedSpriteId.value = sprite.id;
  spriteBrushActive.value = true;
  selectDrawingTool("brush");
}

function selectDrawingTool(tool) {
  if (busyAction.value) return;
  cancelEraseStroke();
  drawingTool.value = tool;
  objectDragState = null;
  objectDragPreview.value = null;
  hoveredObjectId.value = "";
  stopSelectionMode();
  stopAnchorEdit();
}

function cancelEraseStroke() {
  eraseStrokeState = null;
  erasePreviewFrame.value = null;
}

function handleEraseStart(cell) {
  cancelEraseStroke();
  if (busyAction.value || drawingTool.value !== "eraser" || selectionMode.value || anchorEditMode.value) return;
  const frame = activeFrame.value;
  if (!frame) return;
  eraseStrokeState = { frame, targets: currentFrameRgbHistoryTargets(), eraser: createObjectEraseStroke(frame.matrix), lastCell: null };
  handleEraseMove(cell);
}

function handleEraseMove(cell) {
  const stroke = eraseStrokeState;
  if (!stroke || stroke.frame !== activeFrame.value) { cancelEraseStroke(); return; }
  if (!cell) { stroke.lastCell = null; return; }
  const cells = stroke.lastCell ? drawingStrokeCells(stroke.lastCell, cell).slice(1) : [{ x: cell.x, y: cell.y }];
  stroke.lastCell = { x: cell.x, y: cell.y };
  if (stroke.eraser.visit(cells)) {
    erasePreviewFrame.value = { ...stroke.frame, matrix: stroke.frame.matrix.filter(object => !stroke.eraser.removedIds.has(object.id)) };
  }
}

function handleEraseEnd(payload) {
  if (payload?.cancelled) { cancelEraseStroke(); return; }
  if (payload?.current) handleEraseMove(payload.current);
  const stroke = eraseStrokeState;
  cancelEraseStroke();
  if (!stroke || stroke.frame !== activeFrame.value || busyAction.value || !stroke.eraser.removedIds.size) return;
  runRgbEdit(stroke.targets, "erase-objects", () => {
    stroke.frame.matrix = stroke.frame.matrix.filter(object => !stroke.eraser.removedIds.has(object.id));
    if (stroke.eraser.removedIds.has(selectedObjectId.value)) selectedObjectId.value = "";
  }, { recenter: false });
}

function handleCellClick(x, y) {
  if (busyAction.value) return;
  const frame = ensureActiveFrame();
  const existing = getExpandedCellAt(x, y);
  if (anchorEditMode.value) {
    selectAnchorCandidate(existing);
    return;
  }
  if (selectionMode.value) {
    toggleMergeSelection(existing);
    return;
  }
  const topObject = getTopOccupancyEntry(existing?.occupants)?.object;
  if (drawingTool.value === "select") {
    if (topObject?.id) {
      selectObject(topObject.id);
      statusMessage.value = t("simple.objectSelected");
    } else {
      selectedObjectId.value = "";
    }
    return;
  }
  if (drawingTool.value !== "brush") return;
  if (!panoramaMode.value && !isRealCell(x, y)) {
    statusMessage.value = t("simple.realCellsOnly");
    return;
  }
  if (spriteBrushActive.value) {
    const sprite = selectedEditorSprite.value;
    if (!sprite) {
      statusMessage.value = t("simple.spriteRequired");
      return;
    }
    const object = createSpriteMatrixObject(x, y, sprite, frame);
    if (!panoramaMode.value && !isObjectInsideRealMatrix(object)) {
      statusMessage.value = t("simple.spriteOutOfBounds");
      return;
    }
    if (!runRgbEdit(currentFrameRgbHistoryTargets(), "create-sprite-object", () => {
      frame.matrix.push(object);
      patchMatrixFrame(frame, object, "add");
      selectedObjectId.value = object.id;
    })) return;
    statusMessage.value = t("simple.spriteCreated", { name: sprite.name });
    return;
  }
  if (!filterUnoccupiedColorCells(frame.matrix, [{x,y}], selectedColor.value).length) return;
  runRgbEdit(currentFrameRgbHistoryTargets(), "create-object", () => {
    const object = createMatrixObject(x, y, selectedColor.value, frame);
    frame.matrix.push(object);
    patchMatrixFrame(frame, object, "add");
    selectedObjectId.value = object.id;
  });
  statusMessage.value = t(isRealCell(x, y) ? "simple.singleCreated" : "simple.virtualCreated");
}

function handleCellRangeCreate(payload) {
  if (busyAction.value || drawingTool.value !== "brush" || spriteBrushActive.value || anchorEditMode.value || selectionMode.value) {
    return;
  }
  const frame = ensureActiveFrame();
  const cells = filterUnoccupiedColorCells(frame.matrix, dedupeCells(payload?.cells || []), selectedColor.value);
  if (!cells.length) {
    return;
  }
  const hasOverlap = cells.some((cell) => Boolean(getExpandedCellAt(cell.x, cell.y)));
  const requestedAnchorX = toInteger(payload?.anchorX, cells[0].x);
  const requestedAnchorY = toInteger(payload?.anchorY, cells[0].y);
  const anchorInsideRealMatrix = isRealCell(requestedAnchorX, requestedAnchorY);
  const anchorX = !panoramaMode.value && !anchorInsideRealMatrix ? cells[0].x : requestedAnchorX;
  const anchorY = !panoramaMode.value && !anchorInsideRealMatrix ? cells[0].y : requestedAnchorY;
  runRgbEdit(currentFrameRgbHistoryTargets(), "create-range-object", () => {
    const object = {
      id: createUniqueObjectId(frame, activeFrameIndex.value),
      x: anchorX,
      y: anchorY,
      color: clampColorIndex(selectedColor.value),
      points: cells.map((cell) => [cell.x - anchorX, cell.y - anchorY]),
    };
    frame.matrix.push(object);
    patchMatrixFrame(frame, object, "add");
    selectedObjectId.value = object.id;
  });
  statusMessage.value = t(hasOverlap ? "simple.overlapMultiCreated" : "simple.multiCreated");
}

function handleObjectDragStart(cell) {
  if (busyAction.value || drawingTool.value !== "select" || selectionMode.value || anchorEditMode.value) {
    return;
  }
  const existing = getExpandedCellAt(cell?.x, cell?.y);
  const selectedEntry = existing?.occupants?.find(
    (entry) => entry.object?.id === selectedObjectId.value,
  );
  const object = selectedEntry?.object || getTopOccupancyEntry(existing?.occupants)?.object;
  if (!object?.id) {
    objectDragState = null;
    objectDragPreview.value = null;
    return;
  }
  selectObject(object.id);
  objectDragState = {
    objectId: object.id,
    startX: toInteger(cell.x, 0),
    startY: toInteger(cell.y, 0),
    originX: toInteger(object.x, 0),
    originY: toInteger(object.y, 0),
    points: getObjectPoints(object).map(([dx, dy]) => [dx, dy]),
    color: colorOptions.value[clampColorIndex(object.color)]?.value || "#ffffff",
    deltaX: 0,
    deltaY: 0,
    moved: false,
  };
  hoveredObjectId.value = "";
  objectDragPreview.value = null;
  statusMessage.value = t("simple.selectedCanDrag");
}

function handleCellHover(cell) {
  if (
    drawingTool.value !== "select" ||
    selectionMode.value ||
    anchorEditMode.value ||
    objectDragState ||
    !cell
  ) {
    hoveredObjectId.value = "";
    return;
  }
  const occupants = occupancyIndex.value.get(createPointKey(cell.x, cell.y)) || [];
  hoveredObjectId.value = getTopOccupancyEntry(occupants)?.object?.id || "";
}

function handleObjectDrag(payload) {
  if (!objectDragState || !selectedObject.value) {
    return;
  }
  const currentX = toInteger(payload.current?.x, objectDragState.startX);
  const currentY = toInteger(payload.current?.y, objectDragState.startY);
  const deltaX = currentX - objectDragState.startX;
  const deltaY = currentY - objectDragState.startY;
  if (deltaX === objectDragState.deltaX && deltaY === objectDragState.deltaY) {
    return;
  }
  objectDragState.deltaX = deltaX;
  objectDragState.deltaY = deltaY;
  objectDragState.moved = Boolean(deltaX || deltaY);
  objectDragPreview.value = objectDragState.moved
    ? {
        objectId: objectDragState.objectId,
        color: objectDragState.color,
        cells: objectDragState.points.map(([dx, dy]) => ({
          x: objectDragState.originX + deltaX + dx,
          y: objectDragState.originY + deltaY + dy,
        })),
      }
    : null;
}

function handleObjectDragEnd(payload) {
  if (!objectDragState) {
    return;
  }
  const dragState = objectDragState;
  objectDragState = null;
  objectDragPreview.value = null;
  if (dragState.moved && !payload.cancelled) {
    if (!selectedObject.value || selectedObject.value.id !== dragState.objectId) {
      return;
    }
    if (!runRgbEdit(currentFrameRgbHistoryTargets(), "drag-object", () => {
      const object = selectedObject.value;
      const previousX = toInteger(object.x, 0);
      const previousY = toInteger(object.y, 0);
      object.x = dragState.originX + dragState.deltaX;
      object.y = dragState.originY + dragState.deltaY;
      wrapSelectedObjectInPanorama();
      invalidateMatrixFrame();
      if (anchorCandidate.value?.objectId === object.id) {
        anchorCandidate.value = {
          ...anchorCandidate.value,
          x: anchorCandidate.value.x + toInteger(object.x, 0) - previousX,
          y: anchorCandidate.value.y + toInteger(object.y, 0) - previousY,
        };
      }
    })) return;
    statusMessage.value = t("simple.objectMoved");
  }
}

function queueMatrixBasePatch(cells) {
  matrixBasePatchCells.value = expandPatchCells(cells);
  matrixBasePatchVersion.value += 1;
}

function expandPatchCells(cells) {
  const expanded = [];
  for (const cell of dedupeCells(cells)) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        expanded.push({ x: cell.x + dx, y: cell.y + dy });
      }
    }
  }
  return dedupeCells(expanded);
}

function zoomMatrix(event) {
  event.preventDefault();
  pendingZoomDirection += event.deltaY > 0 ? -1 : 1;
  if (zoomAnimationFrame) {
    return;
  }
  zoomAnimationFrame = window.requestAnimationFrame(() => {
    const direction = Math.sign(pendingZoomDirection);
    pendingZoomDirection = 0;
    zoomAnimationFrame = 0;
    if (direction) {
      matrixZoom.value = clampZoom(matrixZoom.value + direction * 0.1);
    }
  });
}

function selectObject(id) {
  selectedObjectId.value = id;
  stopSelectionMode();
  stopAnchorEdit();
}

function applyBrushColorToSelectedObject() {
  const object = selectedObject.value;
  if (!object) {
    return;
  }
  runRgbEdit(currentFrameRgbHistoryTargets(), "recolor-object", () => {
    object.color = selectedColor.value;
    const frame = ensureActiveFrame();
    invalidateMatrixFrame(frame);
  });
}

function deleteSelectedObject() {
  const frame = ensureActiveFrame();
  const index = frame.matrix.findIndex((object) => object.id === selectedObjectId.value);
  if (index < 0) {
    return;
  }
  runRgbEdit(currentFrameRgbHistoryTargets(), "delete-object", () => {
    const [removed] = frame.matrix.splice(index, 1);
    patchMatrixFrame(frame, removed, "remove");
    selectedObjectId.value = "";
    stopSelectionMode();
    stopAnchorEdit();
  });
}

function moveSelectedObjectLayerUp() {
  reorderSelectedObject(selectedObjectIndex.value + 1);
}

function moveSelectedObjectLayerDown() {
  reorderSelectedObject(selectedObjectIndex.value - 1);
}

function reorderSelectedObject(targetIndex) {
  const frame = ensureActiveFrame();
  const currentIndex = frame.matrix.findIndex((object) => object.id === selectedObjectId.value);
  if (currentIndex < 0) {
    return;
  }
  const boundedIndex = Math.min(frame.matrix.length - 1, Math.max(0, targetIndex));
  if (boundedIndex === currentIndex) {
    return;
  }
  runRgbEdit(currentFrameRgbHistoryTargets(), "reorder-object", () => {
    const [object] = frame.matrix.splice(currentIndex, 1);
    frame.matrix.splice(boundedIndex, 0, object);
    invalidateMatrixFrame(frame);
  });
  statusMessage.value = t("simple.layerAdjusted");
}

function applySelectedObjectLayerToAllFrames() {
  const level = activeLevel.value;
  const objectId = selectedObjectId.value;
  const targetIndex = selectedObjectIndex.value;
  if (!level || !objectId || targetIndex < 0) {
    return;
  }

  let appliedCount = 0;
  let skippedCount = 0;
  runRgbEdit(currentLevelRgbHistoryTargets(), "apply-layer-to-frames", () => {
    for (const frame of level.frameList || []) {
      frame.matrix ||= [];
      const currentIndex = frame.matrix.findIndex((object) => object.id === objectId);
      if (currentIndex < 0) {
        skippedCount++;
        continue;
      }

      const [object] = frame.matrix.splice(currentIndex, 1);
      const boundedIndex = Math.min(targetIndex, frame.matrix.length);
      frame.matrix.splice(boundedIndex, 0, object);
      invalidateMatrixFrame(frame);
      appliedCount++;
    }
  });
  statusMessage.value = t("simple.layerApplied", { applied: appliedCount, skipped: skippedCount });
}

function copySelectedObjectToPreviousFrame() {
  copySelectedObjectToFrame(activeFrameIndex.value - 1);
}

function copySelectedObjectToNextFrame() {
  copySelectedObjectToFrame(activeFrameIndex.value + 1);
}

function copySelectedObjectToAllFrames() {
  if (!selectedObject.value) {
    return;
  }
  let copied = 0;
  const targetIndices = frames.value
    .map((_frame, frameIndex) => frameIndex)
    .filter((frameIndex) => frameIndex !== activeFrameIndex.value);
  if (!runRgbEdit(currentLevelRgbHistoryTargets(targetIndices), "copy-object-to-all-frames", () => {
    targetIndices.forEach((frameIndex) => {
      const frame = frames.value[frameIndex];
      upsertObjectInFrame(selectedObject.value, frame);
      invalidateMatrixFrame(frame);
      copied += 1;
    });
  })) return;
  statusMessage.value = copied
    ? t("simple.framesUpdated", { count: copied })
    : t("simple.noTargetFrames");
}

function copyColorObjectsToAllFrames(colorIndex) {
  const normalizedColor = clampColorIndex(colorIndex);
  const sourceFrame = ensureActiveFrame();
  const sourceObjects = (sourceFrame.matrix || []).filter(
    (object) => clampColorIndex(object.color) === normalizedColor,
  );
  if (!sourceObjects.length) {
    statusMessage.value = t("simple.noColorObjects", { color: normalizedColor });
    return;
  }
  const targetIndices = frames.value
    .map((_frame, frameIndex) => frameIndex)
    .filter((frameIndex) => frameIndex !== activeFrameIndex.value);
  let copiedFrames = 0;
  if (!runRgbEdit(currentLevelRgbHistoryTargets(targetIndices), "copy-color-to-all-frames", () => {
    for (const frameIndex of targetIndices) {
      const targetFrame = frames.value[frameIndex];
      for (const object of sourceObjects) {
        upsertObjectInFrame(object, targetFrame);
      }
      invalidateMatrixFrame(targetFrame);
      copiedFrames += 1;
    }
  })) return;
  statusMessage.value = copiedFrames
    ? t("simple.colorCopied", {
      objects: sourceObjects.length,
      color: normalizedColor,
      frames: copiedFrames,
    })
    : t("simple.noTargetFrames");
}

function copySelectedObjectToFrame(frameIndex) {
  if (!selectedObject.value || frameIndex < 0 || frameIndex >= frames.value.length) {
    return;
  }
  if (!runRgbEdit(currentLevelRgbHistoryTargets([frameIndex]), "copy-object-to-frame", () => {
    upsertObjectInFrame(selectedObject.value, frames.value[frameIndex]);
    invalidateMatrixFrame(frames.value[frameIndex]);
  })) return;
  statusMessage.value = t("simple.frameUpdated", { number: frameIndex + 1 });
}

function upsertObjectInFrame(object, frame) {
  frame.matrix ||= [];
  const clone = {
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    id: object.id,
    color: clampColorIndex(object.color),
    points: getObjectPoints(object).map(([dx, dy]) => [dx, dy]),
  };
  const existingIndex = frame.matrix.findIndex((item) => item.id === object.id);
  if (existingIndex >= 0) {
    frame.matrix.splice(existingIndex, 1, clone);
    return;
  }
  frame.matrix.push(clone);
}

function copyCurrentFrameToPreviousFrame() {
  executeWholeFrameCopy("previous");
}

function updateActiveLevelTimeMode(mode) {
  if (!activeLevel.value) {
    return;
  }
  activeLevel.value.option = normalizeLevelOption({
    ...activeLevel.value.option,
    timeLimitMode: mode,
  });
}

function updateActiveLevelLifeMode(mode) {
  if (!activeLevel.value) {
    return;
  }
  activeLevel.value.option = normalizeLevelOption({
    ...activeLevel.value.option,
    lifeLimitMode: mode,
  });
}

function copyCurrentFrameToNextFrame() {
  executeWholeFrameCopy("next");
}

function copyCurrentFrameToAllFrames() {
  executeWholeFrameCopy("all");
}

function executeWholeFrameCopy(mode) {
  const level = activeLevel.value;
  if (!level) {
    return;
  }
  const plan = createWholeFrameCopyPlan(mode, activeFrameIndex.value, level.frameList.length);
  if (!canApplyColorOccupancy([], activeFrame.value?.matrix)) return;
  if (!plan.targetIndices.length) {
    statusMessage.value = t("simple.noTargetFrames");
    return;
  }
  if (plan.overwriteIndices.length) {
    const message = mode === "all"
      ? t("simple.frameOverwriteManyConfirm", { count: plan.overwriteIndices.length })
      : t("simple.frameOverwriteConfirm", { number: plan.overwriteIndices[0] + 1 });
    if (!confirmWithRendererFocus(message)) {
      return;
    }
  }

  const sourceFrame = ensureActiveFrame();
  if (plan.createIndex !== null) {
    level.frameList.splice(plan.createIndex, 0, createBlankFrame());
  }
  for (const targetIndex of plan.targetIndices) {
    const targetFrame = level.frameList[targetIndex];
    replaceFrameObjects(sourceFrame, targetFrame);
    invalidateMatrixFrame(targetFrame);
  }
  clearRgbEditHistory();

  if (mode === "next") {
    selectFrame(plan.targetIndices[0]);
  }
  statusMessage.value = mode === "all"
    ? t("simple.frameCopiedMany", { count: plan.targetIndices.length })
    : t("simple.frameCopied", { number: plan.targetIndices[0] + 1 });
}

function replaceFrameObjects(sourceFrame, targetFrame) {
  targetFrame.matrix = (sourceFrame.matrix || []).map((object) => ({
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    id: object.id,
    color: clampColorIndex(object.color),
    points: getObjectPoints(object).map(([dx, dy]) => [dx, dy]),
  }));
}

function startAnchorEdit() {
  if (!selectedObject.value) {
    return;
  }
  stopSelectionMode();
  anchorEditMode.value = true;
  anchorCandidate.value = {
    objectId: selectedObject.value.id,
    x: toInteger(selectedObject.value.x, 0),
    y: toInteger(selectedObject.value.y, 0),
  };
}

function selectAnchorCandidate(cell) {
  const selectedEntry = cell?.occupants?.find((entry) => entry.object?.id === selectedObjectId.value);
  if (!selectedEntry) {
    return;
  }
  anchorCandidate.value = {
    objectId: selectedEntry.object.id,
    x: cell.x,
    y: cell.y,
  };
}

function confirmAnchorEdit() {
  if (!selectedObject.value || !anchorCandidate.value) {
    stopAnchorEdit();
    return;
  }
  const cells = getObjectCells(selectedObject.value);
  const nextX = anchorCandidate.value.x;
  const nextY = anchorCandidate.value.y;
  runRgbEdit(currentFrameRgbHistoryTargets(), "change-object-anchor", () => {
    selectedObject.value.x = nextX;
    selectedObject.value.y = nextY;
    selectedObject.value.points = prioritizeAnchorPoint(
      cells.map((cell) => [cell.x - nextX, cell.y - nextY]),
    );
    invalidateMatrixFrame();
    stopAnchorEdit();
  });
}

function stopAnchorEdit() {
  anchorEditMode.value = false;
  anchorCandidate.value = null;
}

function rotateSelectedObjectClockwise() {
  rotateSelectedObject("clockwise");
}

function rotateSelectedObjectCounterClockwise() {
  rotateSelectedObject("counterclockwise");
}

function rotateSelectedObject(direction) {
  if (!selectedObject.value) {
    return;
  }
  runRgbEdit(currentFrameRgbHistoryTargets(), `rotate-object-${direction}`, () => {
    selectedObject.value.points = rotatePointsAroundAnchor(
      getObjectPoints(selectedObject.value),
      direction,
    );
    invalidateMatrixFrame();
  }, { recenter: false });
}

function moveSelectedObject(deltaX, deltaY) {
  if (!selectedObject.value) {
    return;
  }
  runRgbEdit(currentFrameRgbHistoryTargets(), "move-object", () => {
    const previousX = toInteger(selectedObject.value.x, 0);
    const previousY = toInteger(selectedObject.value.y, 0);
    selectedObject.value.x = Number(selectedObject.value.x || 0) + deltaX;
    selectedObject.value.y = Number(selectedObject.value.y || 0) + deltaY;
    wrapSelectedObjectInPanorama();
    invalidateMatrixFrame();
    if (anchorCandidate.value?.objectId === selectedObject.value.id) {
      anchorCandidate.value = {
        ...anchorCandidate.value,
        x: anchorCandidate.value.x + toInteger(selectedObject.value.x, 0) - previousX,
        y: anchorCandidate.value.y + toInteger(selectedObject.value.y, 0) - previousY,
      };
    }
  });
}

function togglePanoramaMode() {
  panoramaMode.value = !panoramaMode.value;
  if (!panoramaMode.value) {
    stopSelectionMode();
    stopAnchorEdit();
  }
}

function enterSelectionMode() {
  drawingTool.value = "select";
  if (!panoramaMode.value) {
    panoramaMode.value = true;
  }
  stopAnchorEdit();
  selectionMode.value = true;
  selectedObjectId.value = "";
  mergeSelectionIds.value = [];
  closeContextMenu();
}

function stopSelectionMode() {
  selectionMode.value = false;
  mergeSelectionIds.value = [];
  closeContextMenu();
}

function toggleMergeSelection(cell) {
  const object = getTopOccupancyEntry(cell?.occupants)?.object;
  if (!object) {
    return;
  }
  const id = object.id;
  if (mergeSelectionIds.value.includes(id)) {
    mergeSelectionIds.value = mergeSelectionIds.value.filter((item) => item !== id);
    return;
  }
  const selection = canSelectObjectForMerge(
    activeFrame.value?.matrix,
    mergeSelectionIds.value,
    id,
  );
  if (!selection.ok) {
    statusMessage.value = t(
      selection.code === MERGE_ERROR.MIXED_COLOR
        ? "merge.sameColorOnly"
        : "merge.staleSelection",
    );
    return;
  }
  mergeSelectionIds.value = [...mergeSelectionIds.value, id];
}

function mergeSelectedObjects() {
  const frame = ensureActiveFrame();
  const result = mergeSameColorObjects(
    frame.matrix,
    mergeSelectionIds.value,
    () => createUniqueObjectId(frame, activeFrameIndex.value),
  );
  if (!result.ok) {
    const messageKey = {
      [MERGE_ERROR.NOT_ENOUGH]: "merge.atLeastTwo",
      [MERGE_ERROR.MISSING_OBJECT]: "merge.staleSelectionLong",
      [MERGE_ERROR.MIXED_COLOR]: "merge.sameColorOnly",
    }[result.code] || "merge.unavailable";
    statusMessage.value = t(messageKey);
    return;
  }

  if (!runRgbEdit(currentFrameRgbHistoryTargets(), "merge-objects", () => {
    frame.matrix = result.matrix;
    invalidateMatrixFrame(frame);
    selectedObjectId.value = result.object.id;
    stopSelectionMode();
  })) return;
  statusMessage.value = t("merge.complete");
}

function openContextMenu(event) {
  if (!panoramaMode.value) {
    return;
  }
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
  };
}

function closeContextMenu() {
  if (contextMenu.value.visible) {
    contextMenu.value = { ...contextMenu.value, visible: false };
  }
}

function prepareEditableLevel(level, index) {
  level.label ||= "Level " + (index + 1);
  level.option = normalizeLevelOption(level.option);
  level.frameList ||= [];
  if (!level.frameList[0]) level.frameList[0] = { repeatTimes: 1, matrix: [] };
}

function ensureEditableShape(value) {
  const next = value || {};
  next.levels ||= [];
  if (!next.levels[0]) {
    next.levels[0] = { label: "Level 1", frameList: [] };
  }
  next.levels.forEach((level, index) => {
    prepareEditableLevel(level, index);
    level.frameList.forEach((frame, frameIndex) => {
      frame.repeatTimes ||= 1;
      frame.matrix ||= [];
      frame.matrix = frame.matrix.map((object) => normalizeMatrixObject(object, frame, frameIndex));
      setMatrixFrameVersion(frame, getMatrixFrameVersion(frame));
    });
  });
  return next;
}

function ensureActiveFrame() {
  if (!activeLevel.value) {
    document.value = ensureEditableShape(document.value);
  }
  if (!activeLevel.value.frameList[activeFrameIndex.value]) {
    activeLevel.value.frameList[activeFrameIndex.value] = { repeatTimes: 1, matrix: [] };
  }
  activeLevel.value.frameList[activeFrameIndex.value].matrix ||= [];
  activeLevel.value.frameList[activeFrameIndex.value].matrix =
    activeLevel.value.frameList[activeFrameIndex.value].matrix.map((object) =>
      normalizeMatrixObject(object, activeLevel.value.frameList[activeFrameIndex.value], activeFrameIndex.value),
    );
  return activeLevel.value.frameList[activeFrameIndex.value];
}

function createBlankFrame() {
  return {
    repeatTimes: 1,
    matrix: [],
  };
}

function cleanFrameMatrix(frame, width = matrixWidth.value, height = matrixHeight.value) {
  const cleaned = [];
  for (const object of frame?.matrix || []) {
    // Serialization does not mutate these points; canonical loaded coordinates
    // can be reused here. createEditorPayload's final JSON parse detaches them.
    const points = Array.isArray(object.points) && object.points.length && object.points.every(point =>
      Array.isArray(point) && point.length === 2 && Number.isInteger(point[0]) && Number.isInteger(point[1]))
      ? object.points : getObjectPoints(object);
    const baseX = toInteger(object.x, 0), baseY = toInteger(object.y, 0);
    if (!points.every(([dx, dy]) => baseX + dx >= 0 && baseX + dx < width && baseY + dy >= 0 && baseY + dy < height)) continue;
    const x = typeof object.x === 'number' && !Number.isFinite(object.x) ? 0 : Number(object.x || 0);
    const y = typeof object.y === 'number' && !Number.isFinite(object.y) ? 0 : Number(object.y || 0);
    const color = clampColorIndex(object.color);
    cleaned.push(Object.is(x, object.x) && Object.is(y, object.y) && color === object.color && points === object.points
      ? object : {
      ...object,
      x,
      y,
      id: object.id,
      color,
      points,
    });
  }
  return cleaned;
}

function createEditorFingerprint(value = document.value) {
  const payload = { ...toRaw(value) };
  const width = clampDimension(payload.siteSizeWidth), height = clampDimension(payload.siteSizeHeight);
  if (currentGameId.value) {
    payload.id = currentGameId.value;
  }
  payload.levels = payload.levels?.map(level => ({
    ...level,
    option: normalizeLevelOption(level.option),
    frameList: level.frameList?.map(frame => {
      const next = { ...frame, matrix: cleanFrameMatrix(frame, width, height) };
      delete next.__matrixVersion;
      return next;
    }),
  }));
  return JSON.stringify(payload);
}

function createEditorPayload() {
  // One serialization produces both the comparable representation and a fully
  // detached JSON payload; no second whole-document clone before cleaning.
  return JSON.parse(createEditorFingerprint());
}

function serializeActiveLevel() {
  const level = JSON.parse(JSON.stringify(toRaw(activeLevel.value)));
  level.option = normalizeLevelOption(level.option);
  level.frameList.forEach(frame => {
    frame.matrix = cleanFrameMatrix(frame);
    delete frame.__matrixVersion;
  });
  return level;
}

// 在脱离文档的候选关卡上校验全部帧；不能边读取边覆盖现有帧。
function normalizeImportedLevel(level) {
  const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const invalid = () => { throw new Error(t("simple.levelJsonInvalid")); };
  if (!isRecord(level) || level.levels != null || !Array.isArray(level.frameList) || !level.frameList.length ||
      (level.label != null && typeof level.label !== "string") ||
      (level.option != null && !isRecord(level.option))) invalid();
  const optionErrors = validateLevelOption(level.option, document.value?.globalLifeLimit);
  if (optionErrors.length) throw new Error(t(optionErrors[0].messageKey));
  level.label ||= activeLevel.value.label;
  level.option = normalizeLevelOption(level.option);
  level.frameList.forEach((frame, frameIndex) => {
    if (!isRecord(frame) || !Array.isArray(frame.matrix) ||
        !Number.isSafeInteger(frame.repeatTimes) || frame.repeatTimes < 1) invalid();
    const usedIds = new Set();
    frame.matrix = frame.matrix.map(entry => {
      const object = Array.isArray(entry) ? createObjectFromTuple(entry) : entry;
      if (!isRecord(object) || !Number.isSafeInteger(object.x) || !Number.isSafeInteger(object.y) ||
          !Number.isInteger(object.color) || object.color < 0 || object.color > 3 ||
          (object.id != null && ((typeof object.id !== "string" && !Number.isSafeInteger(object.id)) || usedIds.has(object.id)))) invalid();
      if (object.points != null && (!Array.isArray(object.points) || !object.points.length ||
          object.points.some(point => {
            const values = Array.isArray(point) ? point : [point?.x, point?.y];
            return values.length !== 2 || !values.every(Number.isSafeInteger);
          }))) invalid();
      const normalized = normalizeMatrixObject(object, frame, frameIndex);
      if (!isObjectInsideRealMatrix(normalized)) throw new Error(t("simple.levelJsonOutside"));
      usedIds.add(normalized.id);
      return normalized;
    });
    setMatrixFrameVersion(frame, 0);
  });
  return level;
}

function createOccupancyIndex(objects) {
  const index = new Map();
  objects.forEach((object, objectIndex) => {
    getObjectCells(object).forEach((cell, pointIndex) => {
      const key = createPointKey(cell.x, cell.y);
      const occupants = index.get(key) || [];
      occupants.push({
        ...cell,
        object,
        objectIndex,
        pointIndex,
      });
      index.set(key, occupants);
    });
  });
  return index;
}

function getTopOccupancyEntry(occupants) {
  return selectSimpleTopItem(occupants, (entry) => entry?.object?.color);
}

function createCellTitle(x, y, occupants) {
  if (!occupants?.length) {
    return `x ${x}, y ${y}`;
  }
  const topObjectId = getTopOccupancyEntry(occupants)?.object?.id || "";
  const overlapText = occupants.length > 1
    ? t("simple.overlapLayers", { count: occupants.length })
    : "";
  return `x ${x}, y ${y}, ${topObjectId}${overlapText}`;
}

function createPointKey(x, y) {
  return `${x}:${y}`;
}

function dedupeCells(cells) {
  const map = new Map();
  for (const cell of cells) {
    const x = toInteger(cell?.x, 0);
    const y = toInteger(cell?.y, 0);
    map.set(createPointKey(x, y), { x, y });
  }
  return [...map.values()];
}

function createRange(start, end) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_value, index) => start + index);
}

function createMatrixObject(x, y, color, frame) {
  return {
    id: createUniqueObjectId(frame, activeFrameIndex.value),
    x,
    y,
    color: clampColorIndex(color),
    points: [[0, 0]],
  };
}

function createSpriteMatrixObject(x, y, sprite, frame) {
  return {
    id: createUniqueObjectId(frame, activeFrameIndex.value),
    x,
    y,
    color: clampColorIndex(sprite.color),
    points: sprite.points.map(([pointX, pointY]) => [toInteger(pointX, 0), toInteger(pointY, 0)]),
  };
}

function createUniqueObjectId(frame, frameIndex) {
  const usedIds = new Set((frame?.matrix || []).map((object) => object?.id).filter(Boolean));
  let id = "";
  do {
    id = `obj-${frameIndex}-${Date.now().toString(36)}-${(objectIdCounter.value++).toString(36)}`;
  } while (usedIds.has(id));
  return id;
}

function normalizeMatrixObject(value, frame, frameIndex) {
  // Most persisted frames contain canonical single-cell objects. The detached
  // API document already owns them: no new center, point array or object clone
  // is needed. Legacy tuples, missing IDs and noncanonical shapes take the full
  // normalization path below.
  if (!Array.isArray(value) && value?.id && Number.isInteger(value.x) && Number.isInteger(value.y)
    && Number.isInteger(value.color) && value.color >= 0 && value.color <= 3
    && value.points?.length === 1 && Array.isArray(value.points[0])
    && value.points[0].length === 2 && value.points[0][0] === 0 && value.points[0][1] === 0) return value;
  const object = Array.isArray(value)
    ? createObjectFromTuple(value)
    : { ...value };
  object.x = toInteger(object.x, 0);
  object.y = toInteger(object.y, 0);
  object.color = clampColorIndex(object.color);
  // centerObjectAnchor normalizes points once. Preserve this loader's legacy
  // empty-object fallback; explicit empty frames themselves remain empty.
  if (!Array.isArray(object.points) || !object.points.length) object.points = [[0, 0]];
  if (!object.id) {
    object.id = createUniqueObjectId(frame, frameIndex);
  }
  return centerObjectAnchor(object);
}

function createObjectFromTuple(value) {
  if (value.length >= 4) {
    return {
      x: value[0],
      y: value[1],
      id: value[2],
      color: value[3]?.color,
      points: value[3]?.points,
    };
  }
  return {
    x: value[0],
    y: value[1],
    color: value[2],
    points: [[0, 0]],
  };
}

function getObjectPoints(object) {
  if (!Array.isArray(object?.points) || !object.points.length) {
    return [[0, 0]];
  }
  const points = object.points
    .map((point) => {
      if (Array.isArray(point)) {
        return [toInteger(point[0], 0), toInteger(point[1], 0)];
      }
      return [toInteger(point?.x, 0), toInteger(point?.y, 0)];
    })
    .filter(([dx, dy]) => Number.isInteger(dx) && Number.isInteger(dy));
  return points.length ? points : [[0, 0]];
}

function getObjectCells(object) {
  const baseX = toInteger(object?.x, 0);
  const baseY = toInteger(object?.y, 0);
  return getObjectPoints(object).map(([dx, dy]) => ({
    x: baseX + dx,
    y: baseY + dy,
    dx,
    dy,
  }));
}

function createObjectSummary(object, index) {
  const points = getObjectPoints(object);
  return {
    index,
    id: object.id,
    x: toInteger(object.x, 0),
    y: toInteger(object.y, 0),
    color: clampColorIndex(object.color),
    occupiedCount: points.length,
    object,
  };
}

function rotatePointsAroundAnchor(points, direction) {
  if (direction === "clockwise") {
    return points.map(([dx, dy]) => [-dy, dx]);
  }
  return points.map(([dx, dy]) => [dy, -dx]);
}

function isRealCell(x, y) {
  return x >= 0 && x < matrixWidth.value && y >= 0 && y < matrixHeight.value;
}

function isObjectInsideRealMatrix(object) {
  return getObjectCells(object).every((cell) => isRealCell(cell.x, cell.y));
}

function isCellInMatrixRange(x, y) {
  const range = matrixRange.value;
  return x >= range.minX && x <= range.maxX && y >= range.minY && y <= range.maxY;
}

function createAnchorHighlight(frame) {
  const selected = (frame.matrix || []).find((object) => object.id === selectedObjectId.value);
  if (selected) {
    const anchor = anchorEditMode.value ? anchorCandidate.value || selected : selected;
    return {
      x: toInteger(anchor.x, 0),
      y: toInteger(anchor.y, 0),
      type: "anchor",
    };
  }
  const mergeAnchorId = mergeSelectionIds.value[0];
  if (!mergeAnchorId) {
    return null;
  }
  const anchorObject = (frame.matrix || []).find((object) => object.id === mergeAnchorId);
  if (!anchorObject) {
    return null;
  }
  const anchorCell = getObjectCells(anchorObject)[0];
  return anchorCell ? { x: anchorCell.x, y: anchorCell.y, type: "anchor" } : null;
}

function prioritizeAnchorPoint(points) {
  return [...points].sort((first, second) => {
    const firstIsAnchor = first[0] === 0 && first[1] === 0;
    const secondIsAnchor = second[0] === 0 && second[1] === 0;
    if (firstIsAnchor === secondIsAnchor) {
      return 0;
    }
    return firstIsAnchor ? -1 : 1;
  });
}

function wrapSelectedObjectInPanorama() {
  if (!panoramaMode.value || !selectedObject.value) {
    return;
  }
  const range = matrixRange.value;
  const width = range.maxX - range.minX + 1;
  const height = range.maxY - range.minY + 1;
  let cells = getObjectCells(selectedObject.value);
  if (cells.some((cell) => cell.x < range.minX)) {
    selectedObject.value.x = toInteger(selectedObject.value.x, 0) + width;
  } else if (cells.some((cell) => cell.x > range.maxX)) {
    selectedObject.value.x = toInteger(selectedObject.value.x, 0) - width;
  }
  cells = getObjectCells(selectedObject.value);
  if (cells.some((cell) => cell.y < range.minY)) {
    selectedObject.value.y = toInteger(selectedObject.value.y, 0) + height;
  } else if (cells.some((cell) => cell.y > range.maxY)) {
    selectedObject.value.y = toInteger(selectedObject.value.y, 0) - height;
  }
}

function cancelZoomFrame() {
  if (!zoomAnimationFrame) {
    return;
  }
  window.cancelAnimationFrame(zoomAnimationFrame);
  zoomAnimationFrame = 0;
  pendingZoomDirection = 0;
}

function syncSelectedObject() {
  cancelEraseStroke();
  // Selection reconciliation must not re-center a restored history snapshot.
  const frame = activeFrame.value || ensureActiveFrame();
  objectDragState = null;
  objectDragPreview.value = null;
  hoveredObjectId.value = "";
  if (!frame.matrix.some((object) => object.id === selectedObjectId.value)) {
    selectedObjectId.value = "";
  }
  stopSelectionMode();
  stopAnchorEdit();
}

function canTriggerGlobalShortcut(event) {
  return (
    !event.repeat &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    !selectionMode.value &&
    !anchorEditMode.value &&
    !objectDragState
  );
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && eraseStrokeState) { cancelEraseStroke(); event.preventDefault(); return; }
  if (levelMediaPicker.value) return;
  const tagName = event.target?.tagName?.toLowerCase();
  if (["input", "textarea", "select", "audio"].includes(tagName) || event.target?.isContentEditable) {
    return;
  }
  const lowerKey = event.key.toLowerCase();
  const historyModifier = event.ctrlKey || event.metaKey;
  const historyShortcut = (
    !event.repeat &&
    !event.isComposing &&
    historyModifier &&
    !event.altKey &&
    (lowerKey === "y" || lowerKey === "z")
  );
  if (historyShortcut) {
    const redo = lowerKey === "y" || (lowerKey === "z" && event.shiftKey);
    const handled = redo ? redoRgbEdit() : undoRgbEdit();
    if (handled) {
      event.preventDefault();
    }
    return;
  }
  if (event.key === "Delete" && canTriggerGlobalShortcut(event) && selectedObject.value) {
    event.preventDefault();
    deleteSelectedObject();
    return;
  }
  // A/D 切换上一帧/下一帧（不限定编辑模式，复用 Q 的冲突保护；首尾帧不回绕）。
  const frameStep = lowerKey === "a" ? -1 : lowerKey === "d" ? 1 : 0;
  if (frameStep !== 0 && canTriggerGlobalShortcut(event)) {
    const nextIndex = activeFrameIndex.value + frameStep;
    if (nextIndex >= 0 && nextIndex < frames.value.length) {
      event.preventDefault();
      selectFrame(nextIndex);
    }
    return;
  }
  const movement = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[event.key];
  if (!movement || !selectedObject.value || !canTriggerGlobalShortcut(event) || busyAction.value) {
    return;
  }
  event.preventDefault();
  moveSelectedObject(movement[0], movement[1]);
}

function toInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.trunc(number);
}

function normalizeColor(value, fallback) {
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }
  return fallback;
}

function clampDimension(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 1;
  }
  return Math.min(96, Math.max(1, Math.floor(number)));
}

function clampColorIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.min(3, Math.max(0, Math.floor(number)));
}

function clampZoom(value) {
  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))));
}

function formatRuntimeSummary(value) {
  if (!value) {
    return [];
  }
  const summary = [];
  const fields = [
    [t("simple.summaryState"), value.engineState || value.state],
    [t("simple.summaryGame"), value.gameName || value.name],
    [t("simple.summaryGameId"), value.gameId || value.id],
    [t("simple.summaryStartLevel"), value.startLevelIndex],
    [t("simple.summaryLaunch"), value.launchMethod],
    [t("simple.summarySize"), value.width && value.height ? `${value.width} x ${value.height}` : ""],
  ];
  for (const [label, fieldValue] of fields) {
    if (fieldValue !== undefined && fieldValue !== null && fieldValue !== "") {
      summary.push(`${label}: ${fieldValue}`);
    }
  }
  if (!summary.length) {
    summary.push(JSON.stringify(value));
  }
  return summary;
}
</script>

<template>
  <div ref="fitViewportRef" class="simple-editor-fit-viewport" :aria-busy="busyAction === 'save'">
    <div v-if="!editorFitReady && !errorMessage" class="simple-editor-loading" role="status" aria-live="polite">
      <span class="simple-editor-loading-spinner" aria-hidden="true"></span>
      <span>{{ t('common.loading') }}</span>
      <button class="soft-button" type="button" @click="$emit('back')">{{ t('simple.backToList') }}</button>
    </div>
    <div class="simple-editor-fit-shell" :class="{ ready: editorFitReady }" :style="editorFitShellStyle">
      <section
        ref="fitContentRef"
        class="workspace simple-editor-workspace simple-editor-fit-content"
        :style="editorFitContentStyle"
      >
    <div class="editor-topbar">
      <div class="editor-heading-row">
      <button class="soft-button editor-back-button" type="button" @click="$emit('back')">{{ t("simple.backToList") }}</button>
      <div v-if="document && !anchorEditMode" class="editor-heading-actions">
        <button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('simple.save')" :title="t('simple.save')" :disabled="Boolean(busyAction)" @click="saveEditor"><EditorActionIcon name="save" /></button>
        <button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('simple.globalConfig')" :title="t('simple.globalConfig')" :disabled="Boolean(busyAction)" @click="openGlobalConfig"><EditorActionIcon name="settings" /></button>
        <button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('gameWiring.title')" :title="t('gameWiring.title')" :disabled="Boolean(busyAction)" @click="gameWiringError = ''; gameWiringOpen = true"><EditorActionIcon name="wiring" /></button>
      </div>
      <div v-if="document" class="level-sequence-row">
        <div class="level-structure-actions">
          <button class="icon-add-button" type="button" :aria-label="t('simple.addLevel')" :title="t('simple.addLevel')" @click="addLevel">+</button>
        </div>
        <div class="sequence-list">
          <div v-for="(level,index) in levels" :key="`level-${index}`" class="level-tab" :class="{'level-drop-target':levelDropIndex===index}"
            @dragover.prevent="draggingLevelIndex!==null&&(levelDropIndex=index)" @drop.prevent="dropLevel(index)">
            <button class="sequence-pill" :class="{active:activeLevelIndex===index}" type="button" :draggable="!busyAction && !anchorEditMode"
              @dragstart="startLevelDrag($event, index)" @dragend="endLevelDrag" @click="selectLevel(index)">{{level.label||`Level ${index+1}`}}</button>
            <button class="level-tab-delete" type="button" :aria-label="t('simple.deleteLevelLabel', {name:level.label||`Level ${index+1}`})"
              :title="t('simple.deleteLevelLabel', {name:level.label||`Level ${index+1}`})" :disabled="Boolean(busyAction) || !canDeleteActiveLevel || anchorEditMode || draggingLevelIndex !== null"
              @pointerdown.stop @click.stop="deleteCurrentLevel(index)" @dragstart.prevent.stop>×</button>
          </div>
        </div>
      </div>
      </div>
      <div v-if="document" class="sequence-block frame-sequence-header">
        <div class="sequence-head">
          <h2>{{ t("simple.frames") }}</h2>
          <p>{{ t("simple.frameCountHint", { count: frames.length }) }}</p>
        </div>
        <div class="frame-progress-row">
          <div class="frame-progress-shell">
            <div
              class="frame-progress-track"
              @pointerdown="startFrameDrag"
              @pointermove="dragFrameProgress"
              @pointerup="stopFrameDrag"
              @pointercancel="stopFrameDrag"
              @lostpointercapture="draggingFrameProgress = false"
            >
              <div
                class="frame-progress-fill"
                :style="{ width: `${activeFramePercent}%` }"
              ></div>
              <div
                class="frame-progress-marker"
                :style="{ left: `${activeFramePercent}%` }"
              ></div>
            </div>
            <div class="frame-tick-row" :style="{
              '--frame-intervals': Math.max(1, frames.length - 1),
              '--frame-label-density': Math.max(1, (frames.length - 1) * ((String(frames.length).length + String(Math.max(1, frames.length - 1)).length) / 2 * 0.68 + 0.3)),
            }">
              <button
                v-for="index in frameTickIndices"
                :key="`frame-${index}`"
                class="frame-tick"
                :class="{ active: displayedFrameIndex === index }"
                :style="{ left: `${index / Math.max(1, frames.length - 1) * 100}%` }"
                :title="String(index + 1)"
                type="button"
                @click="selectFrame(index)"
              >
                <span class="frame-tick-dot"></span>
                <span class="frame-tick-label">{{ index + 1 }}</span>
              </button>
            </div>
          </div>
          <div class="frame-icon-actions">
            <button v-if="false" class="icon-add-button" type="button" :aria-label="t('simple.addFrame')" :data-tip="t('simple.addFrame')" @click="addFrame">
              +
            </button>
            <button
              class="icon-add-button"
              type="button"
              :aria-label="t('simple.addFrameAfter')"
              :data-tip="t('simple.addFrameAfter')"
              @click="addFrameAfterCurrent"
            >
              +&gt;
            </button>
            <button v-if="false"
              class="icon-add-button"
              type="button"
              :aria-label="t('simple.copyPreviousFrame')"
              :data-tip="t('simple.copyPreviousFrame')"
              :disabled="activeFrameIndex <= 0"
              @click="copyCurrentFrameToPreviousFrame"
            >
              P
            </button>
            <button
              class="icon-add-button"
              type="button"
              :aria-label="t('simple.copyNextFrame')"
              :data-tip="t('simple.copyNextFrame')"
              @click="copyCurrentFrameToNextFrame"
            >
              <EditorActionIcon name="copy" />
            </button>
            <button v-if="false"
              class="icon-add-button"
              type="button"
              :aria-label="t('simple.copyAllFrames')"
              :data-tip="t('simple.copyAllFrames')"
              :disabled="frames.length <= 1"
              @click="copyCurrentFrameToAllFrames"
            >
              =
            </button>
            <button
              class="icon-add-button icon-danger-button"
              type="button"
              :aria-label="t('simple.deleteCurrentFrame')"
              :data-tip="t('simple.deleteCurrentFrame')"
              :disabled="frames.length <= 1"
              @click="deleteCurrentFrame"
            >
              -
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="document" class="editor-toolbar">
            <div class="object-actions">
              <button v-for="tool in ['select', 'brush', 'eraser']" :key="tool"
                class="soft-button compact-button object-icon-button drawing-tool-button"
                :class="{ active: drawingTool === tool && !selectionMode && !anchorEditMode }"
                type="button" :data-tool="tool" :disabled="Boolean(busyAction)"
                :aria-label="t(`simple.tool${tool[0].toUpperCase()}${tool.slice(1)}`)"
                :data-tip="t(`simple.tool${tool[0].toUpperCase()}${tool.slice(1)}`)"
                :aria-pressed="drawingTool === tool && !selectionMode && !anchorEditMode"
                @click="selectDrawingTool(tool)">
                <EditorActionIcon :name="tool" />
              </button>
              <template v-if="anchorEditMode">
                <button
                  class="soft-button compact-button object-icon-button"
                  type="button"
                  :aria-label="t('simple.confirm')"
                  :title="t('simple.confirm')"
                  @click="confirmAnchorEdit"
                >
                  <EditorActionIcon name="check" />
                </button>
                <button
                  class="soft-button compact-button object-icon-button"
                  type="button"
                  :aria-label="t('simple.cancel')"
                  :title="t('simple.cancel')"
                  @click="stopAnchorEdit"
                >
                  <EditorActionIcon name="close" />
                </button>
              </template>
              <template v-else>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject"
                  type="button"
                  :aria-label="t('simple.rotateLeft')"
                  :title="t('simple.rotateLeft')"
                  @click="rotateSelectedObjectCounterClockwise"
                >
                  <EditorActionIcon name="rotate-left" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject"
                  type="button"
                  :aria-label="t('simple.editAnchor')"
                  :title="t('simple.editAnchor')"
                  @click="startAnchorEdit"
                >
                  <EditorActionIcon name="anchor" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button layer-symbol-button"
                  :disabled="!selectedObjectCanMoveUp"
                  type="button"
                  :title="t('simple.layerUpTitle')"
                  :aria-label="t('simple.layerUp')"
                  @click="moveSelectedObjectLayerUp"
                >
                  <EditorActionIcon name="layer-up" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button layer-symbol-button"
                  :disabled="!selectedObjectCanMoveDown"
                  type="button"
                  :title="t('simple.layerDownTitle')"
                  :aria-label="t('simple.layerDown')"
                  @click="moveSelectedObjectLayerDown"
                >
                  <EditorActionIcon name="layer-down" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button layer-symbol-button"
                  :disabled="!selectedObject"
                  type="button"
                  :title="t('simple.applyLayer')"
                  :aria-label="t('simple.applyLayer')"
                  @click="applySelectedObjectLayerToAllFrames"
                >
                  <EditorActionIcon name="layers" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject"
                  type="button"
                  :aria-label="t('simple.recolor')"
                  :title="t('simple.recolor')"
                  @click="applyBrushColorToSelectedObject"
                >
                  <EditorActionIcon name="palette" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject || activeFrameIndex <= 0"
                  type="button"
                  :aria-label="t('simple.copyPrevious')"
                  :title="t('simple.copyPrevious')"
                  @click="copySelectedObjectToPreviousFrame"
                >
                  <EditorActionIcon name="copy-previous" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject || activeFrameIndex >= frames.length - 1"
                  type="button"
                  :aria-label="t('simple.copyNext')"
                  :title="t('simple.copyNext')"
                  @click="copySelectedObjectToNextFrame"
                >
                  <EditorActionIcon name="copy-next" />
                </button>
                <button v-if="false"
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject || frames.length <= 1"
                  type="button"
                  :aria-label="t('simple.copyAll')"
                  :title="t('simple.copyAll')"
                  @click="copySelectedObjectToAllFrames"
                >
                  <EditorActionIcon name="copy-all" />
                </button>
                <button
                  class="soft-button compact-button object-icon-button object-danger-button"
                  :disabled="!selectedObject"
                  type="button"
                  :aria-label="t('simple.delete')"
                  :title="t('simple.delete')"
                  @click="deleteSelectedObject"
                >
                  <EditorActionIcon name="trash" />
                </button>
                <button
                  class="soft-button compact-button object-icon-button"
                  :disabled="!selectedObject"
                  type="button"
                  :aria-label="t('simple.rotateRight')"
                  :title="t('simple.rotateRight')"
                  @click="rotateSelectedObjectClockwise"
                >
                  <EditorActionIcon name="rotate-right" />
                </button>
              </template>
              <template v-if="!anchorEditMode">
              <button
                class="soft-button compact-button object-icon-button color-copy-button color-copy-green"
                :disabled="frames.length <= 1 || frameColorObjectCounts[0] === 0"
                type="button"
                :title="t('simple.greenCopyTitle')"
                :aria-label="t('simple.greenToAll')"
                @click="copyColorObjectsToAllFrames(0)"
              >
                <EditorActionIcon name="copy-color" />
              </button>
              <button
                class="soft-button compact-button object-icon-button color-copy-button color-copy-blue"
                :disabled="frames.length <= 1 || frameColorObjectCounts[1] === 0"
                type="button"
                :title="t('simple.blueCopyTitle')"
                :aria-label="t('simple.blueToAll')"
                @click="copyColorObjectsToAllFrames(1)"
              >
                <EditorActionIcon name="copy-color" />
              </button>
              <button
                class="soft-button compact-button object-icon-button color-copy-button color-copy-red"
                :disabled="frames.length <= 1 || frameColorObjectCounts[2] === 0"
                type="button"
                :title="t('simple.redCopyTitle')"
                :aria-label="t('simple.redToAll')"
                @click="copyColorObjectsToAllFrames(2)"
              >
                <EditorActionIcon name="copy-color" />
              </button>
                <button
                  class="soft-button compact-button object-icon-button color-copy-button color-copy-pink"
                :disabled="frames.length <= 1 || frameColorObjectCounts[3] === 0"
                type="button"
                :title="t('simple.pinkCopyTitle')"
                :aria-label="t('simple.pinkToAll')"
                @click="copyColorObjectsToAllFrames(3)"
              >
                <EditorActionIcon name="copy-color" />
              </button>
              </template>
<button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('simple.exportCurrentLevel')" :data-tip="t('simple.exportCurrentLevelJson')" :title="t('simple.exportCurrentLevelJson')" :disabled="Boolean(busyAction) || !activeLevel" @click="exportCurrentLevel"><EditorActionIcon name="export" /></button>
<button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('simple.importReplaceLevel')" :data-tip="t('simple.importReplaceLevelJson')" :title="t('simple.importReplaceLevelJson')" :disabled="Boolean(busyAction) || !activeLevel" @click="importCurrentLevel"><EditorActionIcon name="import" /></button>
<button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('simple.openPreview')" :title="t('simple.openPreview')" :disabled="Boolean(busyAction) || !activeLevel" @click="openPreview"><EditorActionIcon name="preview" /></button>
<button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('simple.exportGif')" :title="t('simple.exportGif')" :disabled="Boolean(busyAction) || !activeLevel?.frameList?.length" @click="exportCurrentLevelGif"><EditorActionIcon name="gif" /></button>
<button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('pixelLight.open')" :title="t('pixelLight.open')" :disabled="Boolean(busyAction) || !document" @click="openPixelLightLayout"><EditorActionIcon name="pixel-light" /></button>
<button class="soft-button compact-button object-icon-button" type="button" :aria-label="t('effect.open')" :title="t('effect.open')" :disabled="Boolean(busyAction) || !activeFrame" @click="openEffectDialog"><EditorActionIcon name="effect" /></button>
            </div>
    </div>
    <div class="editor-feedback" v-if="errorMessage || gifExportProgress || runtimeErrorMessage || validationErrors.length" aria-live="polite">
      <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
      <p v-if="gifExportProgress" class="status-line">{{ gifExportProgress }}</p>
      <p v-if="runtimeErrorMessage" class="error-line">{{ runtimeErrorMessage }}</p>
      <div v-if="validationErrors.length" class="validation-list"><p v-for="error in validationErrors" :key="error.path + error.message">{{ error.path }}: {{ error.message }}</p></div>
    </div>

    <div v-if="!document && !errorMessage" class="editor-loading">
      {{ t("simple.loading", { game: currentGameName }) }}
    </div>

    <div v-if="document" class="simple-editor-layout">
      <aside class="editor-panel editor-left">
        <!-- 周期和难度字段暂未参与当前玩法，保留数据模型以兼容已有游戏数据。 -->
        <!--
        <div class="two-column-fields">
          <label>
            <span>{{ t("simple.period") }}</span>
            <input v-model.number="document.period" min="1" type="number" />
          </label>
          <label>
            <span>{{ t("simple.difficulty") }}</span>
            <input v-model.number="document.difficulty" min="0" type="number" />
          </label>
        </div>
        -->
        <div v-if="activeLevel" class="level-limit-fields">
          <h3>{{ t("simple.levelLimits") }}</h3>
          <label>
            <span class="editor-required-label">{{ t('management.simpleReward') }}</span>
            <input v-model.number="activeLevel.option.rewardPoints" type="number" min="0" max="1000000" step="1" :class="{ invalid: activeLevelOptionErrors.has('rewardPoints') }" />
            <small v-if="activeLevelOptionErrors.has('rewardPoints')" class="field-error">{{ t('management.rewardInvalid') }}</small>
          </label>
          <label>
            <span class="editor-required-label">{{ t("simple.levelTimeLimit") }}</span>
            <select
              :value="activeLevel.option.timeLimitMode"
              @change="updateActiveLevelTimeMode($event.target.value)"
            >
              <option value="UNLIMITED">{{ t("simple.levelTimeUnlimited") }}</option>
              <option value="CYCLE_COUNT">{{ t("simple.levelTimeCycleCount") }}</option>
              <option value="CYCLE_SECONDS">{{ t("simple.levelTimeCycleSeconds") }}</option>
            </select>
          </label>
          <label v-if="activeLevel.option.timeLimitMode !== 'UNLIMITED'">
            <span class="editor-required-label">{{ t("simple.levelTimeValue") }}</span>
            <input
              v-model.number="activeLevel.option.timeLimitValue"
              min="1"
              type="number"
              :class="{ invalid: activeLevelOptionErrors.has('timeLimitValue') }"
            />
            <small v-if="activeLevelOptionErrors.has('timeLimitValue')" class="field-error">
              {{ t("simple.levelLimitPositive") }}
            </small>
          </label>
          <label v-if="!document.globalLifeLimit">
            <span class="editor-required-label">{{ t("simple.levelLifeLimit") }}</span>
            <select
              :value="activeLevel.option.lifeLimitMode"
              @change="updateActiveLevelLifeMode($event.target.value)"
            >
              <option value="UNLIMITED">{{ t("simple.levelLifeUnlimited") }}</option>
              <option value="LIMITED">{{ t("simple.levelLifeLimited") }}</option>
            </select>
          </label>
          <label v-if="!document.globalLifeLimit && activeLevel.option.lifeLimitMode === 'LIMITED'">
            <span class="editor-required-label">{{ t("simple.levelLifeValue") }}</span>
            <input
              v-model.number="activeLevel.option.lifeLimitValue"
              min="1"
              type="number"
              :class="{ invalid: activeLevelOptionErrors.has('lifeLimitValue') }"
            />
            <small v-if="activeLevelOptionErrors.has('lifeLimitValue')" class="field-error">
              {{ t("simple.levelLimitPositive") }}
            </small>
          </label>
        </div>
        <section v-if="activeLevel" class="editor-circle-countdown">
          <label class="circle-countdown-toggle"><input type="checkbox" :checked="String(activeLevel.option.pixelLightType)==='1'" @change="activeLevel.option.pixelLightType=$event.target.checked?'1':'0'; if($event.target.checked){activeLevel.option.countdownMin ??= 5;activeLevel.option.countdownMax ??= 10;}" /><span>{{t('circleLights.enabled')}}</span></label>
          <template v-if="String(activeLevel.option.pixelLightType)==='1'">
            <label><span>{{t('circleLights.min')}}</span><input v-model.number="activeLevel.option.countdownMin" type="number" min="1" max="99" step="1" :class="{invalid:activeLevelOptionErrors.has('countdownMin')}" /></label>
            <label><span>{{t('circleLights.max')}}</span><input v-model.number="activeLevel.option.countdownMax" type="number" min="1" max="99" step="1" :class="{invalid:activeLevelOptionErrors.has('countdownMax')}" /></label>
            <small v-if="activeLevelOptionErrors.has('countdownMin')" class="field-error">{{t('circleLights.invalid')}}</small>
          </template>
        </section>
        <section v-if="activeLevel" class="editor-level-media">
          <div class="editor-level-media-field">
            <label for="level-background-music">{{ t('simple.levelBackgroundMusic') }}</label>
            <div class="editor-level-media-row">
              <input id="level-background-music" :value="levelBackgroundMusic" :title="levelBackgroundMusic" :placeholder="t('globalConfig.notSelected')" readonly />
              <button class="soft-button compact-button" type="button" :disabled="Boolean(busyAction)" :aria-label="t('globalConfig.choose') + ' ' + t('simple.levelBackgroundMusic')" @click="levelMediaPicker = activeLevel">{{ t('globalConfig.choose') }}</button>
              <button class="soft-button compact-button" type="button" :disabled="Boolean(busyAction) || !levelBackgroundMusic" :aria-label="t('globalConfig.clear') + ' ' + t('simple.levelBackgroundMusic')" @click="activeLevel.option.bgVoice = ''">{{ t('globalConfig.clear') }}</button>
            </div>
            <audio v-if="levelBackgroundMusic" :key="levelBackgroundMusic" :src="levelMediaUrl()" :aria-label="t('simple.levelBackgroundMusic')" preload="none" controls />
          </div>
        </section>
      </aside>

      <main class="editor-panel editor-center">

        <div class="matrix-status-bar" :class="{ active: panoramaMode || selectionMode || anchorEditMode }">
          <div class="matrix-status-main">
            <div class="matrix-status-title">
              <strong>{{ t(anchorEditMode ? "simple.editAnchor" : panoramaMode ? "simple.panoramaEdit" : "simple.matrixEdit") }}</strong>
              <span>{{
                anchorEditMode
                  ? t("simple.chooseAnchor")
                  : panoramaMode
                    ? panoramaStatusText
                    : `${matrixWidth} x ${matrixHeight}`
              }}</span>
            </div>
            <div class="matrix-inline-fields">
              <label>
                <span>{{ t("simple.level") }}</span>
                <input v-model="activeLevel.label" type="text" />
              </label>
              <label class="matrix-repeat-field">
                <span>{{ t("simple.repeat") }}</span>
                <div class="repeat-times-control">
                  <input
                    :key="`repeat-${activeLevelIndex}-${activeFrameIndex}`"
                    v-model.number="activeFrame.repeatTimes"
                    min="1"
                    type="number"
                  />
                  <button
                    class="soft-button repeat-copy-button"
                    type="button"
                    :title="t('simple.applyRepeat')"
                    :aria-label="t('simple.applyRepeat')"
                    @click="applyCurrentRepeatTimesToAllFrames"
                  >
                    {{ t('simple.copyRepeat') }}
                  </button>
                </div>
              </label>
            </div>
          </div>
          <div class="matrix-status-actions">
            <div class="rgb-history-actions" :aria-label="t('simple.rgbHistory')">
              <button
                class="icon-add-button rgb-history-button"
                type="button"
                :aria-label="t('simple.undoRgb')"
                :data-tip="t('simple.undoRgbTip')"
                :disabled="Boolean(busyAction) || !canUndoRgbEdit"
                @click="undoRgbEdit"
              >
                ↶
              </button>
              <button
                class="icon-add-button rgb-history-button"
                type="button"
                :aria-label="t('simple.redoRgb')"
                :data-tip="t('simple.redoRgbTip')"
                :disabled="Boolean(busyAction) || !canRedoRgbEdit"
                @click="redoRgbEdit"
              >
                ↷
              </button>
            </div>
            <button
              class="soft-button compact-button overlap-indicator-toggle"
              type="button"
              :aria-pressed="showOverlapIndicators"
              @click="showOverlapIndicators = !showOverlapIndicators"
            >
              {{ t(showOverlapIndicators ? "simple.hideOverlapCount" : "simple.showOverlapCount") }}
            </button>
            <button class="soft-button compact-button" type="button" @click="togglePanoramaMode">
              {{ t(panoramaMode ? "simple.exitPanorama" : "simple.panorama") }}
            </button>
            <button
              v-if="panoramaMode && !selectionMode && !anchorEditMode"
              class="soft-button compact-button"
              type="button"
              @click="enterSelectionMode"
            >
              {{ t("simple.select") }}
            </button>
            <template v-if="selectionMode">
              <span class="selection-count">{{ t("simple.selectedCount", { count: mergeSelectionIds.length }) }}</span>
              <button class="soft-button compact-button" type="button" @click="mergeSelectedObjects">
                {{ t("simple.merge") }}
              </button>
              <button class="soft-button compact-button" type="button" @click="stopSelectionMode">
                {{ t("simple.cancel") }}
              </button>
            </template>
          </div>
        </div>

        <div ref="matrixScrollRef" class="matrix-scroll" @wheel="zoomMatrix">
          <SimpleMatrixCanvas
            :tool="anchorEditMode || selectionMode ? 'select' : drawingTool"
            :interaction-enabled="!busyAction"
            :erase-enabled="!busyAction && drawingTool === 'eraser' && !selectionMode && !anchorEditMode"
            :interaction-key="`${activeLevelIndex}:${activeFrameIndex}:${panoramaMode}:${selectionMode}:${anchorEditMode}`"
            :cells="matrixCells"
            :column-count="matrixColumnCount"
            :row-count="matrixRowCount"
            :cell-size="matrixCellSizeValue"
            :gap-size="matrixGapSizeValue"
            :base-patch-cells="matrixBasePatchCells"
            :base-patch-version="matrixBasePatchVersion"
            :overlay-highlights="matrixOverlayHighlights"
            :show-overlap-indicator="showOverlapIndicators"
            :range-create-enabled="!busyAction && drawingTool === 'brush' && !spriteBrushActive && !selectionMode && !anchorEditMode"
            :object-drag-enabled="!busyAction && drawingTool === 'select' && !selectionMode && !anchorEditMode"
            :outside-range-layout-enabled="!panoramaMode"
            :outside-range-padding="EDITOR_OUTSIDE_RANGE_PADDING"
            :outside-range-create-enabled="!busyAction && drawingTool === 'brush' && !spriteBrushActive && !panoramaMode && !selectionMode && !anchorEditMode"
            @cell-click="handleCellClick"
            @erase-start="handleEraseStart"
            @erase-move="handleEraseMove"
            @erase-end="handleEraseEnd"
            @cell-range-create="handleCellRangeCreate"
            @object-drag-start="handleObjectDragStart"
            @object-drag="handleObjectDrag"
            @object-drag-end="handleObjectDragEnd"
            @cell-hover="handleCellHover"
            @matrix-contextmenu="openContextMenu"
          />
        </div>

        <div
          v-if="contextMenu.visible"
          class="matrix-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button v-if="!selectionMode" type="button" @click="enterSelectionMode">{{ t("simple.select") }}</button>
          <template v-else>
            <button type="button" @click="mergeSelectedObjects">{{ t("simple.merge") }}</button>
            <button type="button" @click="stopSelectionMode">{{ t("simple.cancel") }}</button>
          </template>
        </div>
      </main>

      <aside class="editor-panel editor-right">
        <div class="side-panel-heading">
          <h2>{{ t("simple.objectEditor") }}</h2>
          <p>{{ selectedObject ? selectedObject.id : t("simple.noObjectSelected") }}</p>
        </div>
        <div class="editor-right-main">
          <div class="object-panel">
            <div class="object-panel-head">
              <h2>{{ t("simple.objects") }}</h2>
              <div class="object-panel-head-actions">
                <p>{{ t("simple.itemCount", { count: frameObjects.length }) }}</p>
                <button
                  v-if="!anchorEditMode"
                  class="soft-button compact-button object-list-toggle"
                  type="button"
                  :aria-label="t(showObjectList ? 'simple.showSpritePreview' : 'simple.showObjects')"
                  :aria-pressed="showObjectList"
                  :title="t(showObjectList ? 'simple.showSpritePreview' : 'simple.showObjects')"
                  @click="showObjectList = !showObjectList"
                >
                  <EditorActionIcon :name="showObjectList ? 'sprite' : 'layers'" />
                </button>
              </div>
            </div>
              <div v-if="!anchorEditMode" class="object-action-palette" :aria-label="t('simple.color')" role="group">
                <button
                  v-for="color in colorOptions"
                  :key="color.index"
                  class="palette-option object-color-button"
                  :class="[
                    { active: !spriteBrushActive && selectedColor === color.index },
                    `object-color-${color.index}`,
                  ]"
                  :disabled="colorSelectionDisabled"
                  :title="color.label"
                  :aria-label="color.label"
                  :aria-pressed="!spriteBrushActive && selectedColor === color.index"
                  type="button"
                  @click="selectColor(color.index)"
                >
                  <span class="palette-swatch" :style="{ backgroundColor: color.value }"></span>
                  <span class="palette-label">{{ color.label }}</span>
                </button>
              </div>
            <div v-if="!anchorEditMode && showObjectList" class="object-list">
              <button
                v-for="object in frameObjects"
                :key="object.id"
                class="object-row"
                :class="{ active: selectedObjectId === object.id }"
                type="button"
                @click="selectObject(object.id)"
              >
                <span class="object-color" :style="{ backgroundColor: colorOptions[object.color]?.value }"></span>
                <span class="object-main">
                  <strong>{{ object.id }}</strong>
                  <small>{{ t("simple.objectMeta", {
                    layer: object.index + 1,
                    total: frameObjects.length,
                    x: object.x,
                    y: object.y,
                    color: object.color,
                    priority: object.color === 0 ? t("simple.greenPriority") : "",
                    cells: object.occupiedCount,
                  }) }}</small>
                </span>
              </button>
            </div>
            <div v-else-if="!anchorEditMode" class="sprite-preview-panel">
              <div class="sprite-preview-heading">
                <strong>{{ t("simple.spritePreview") }}</strong>
                <small v-if="spriteDimensionFilter">{{ t("simple.spritePreviewCount", { count: filteredEditorSprites.length }) }}</small>
              </div>
              <input
                v-model="spriteSearchText"
                class="sprite-dimension-search"
                type="text"
                inputmode="numeric"
                :placeholder="t('simple.spriteSearchPlaceholder')"
                :aria-label="t('simple.spriteSearch')"
              />
              <div class="sprite-color-filters" role="group" :aria-label="t('simple.color')">
                <label v-for="option in colorOptions" :key="option.index" :style="{ '--sprite-filter-color': option.value }" :title="t(`effect.colors.color${option.index}`)">
                  <input v-model="spriteFilterColors" type="checkbox" :value="option.index" :aria-label="t(`effect.colors.color${option.index}`)" />
                  <span aria-hidden="true"></span>
                </label>
              </div>
              <p v-if="effectSpiritLoadFailed" class="sprite-preview-empty">{{ t("effect.spiritLoadFailed") }}</p>
              <p v-else-if="!filteredEditorSprites.length" class="sprite-preview-empty">{{ t("simple.spriteNoMatch") }}</p>
              <div v-else class="sprite-preview-grid">
                <button
                  v-for="sprite in filteredEditorSprites"
                  :key="sprite.id"
                  class="sprite-preview-card"
                  :class="{ active: selectedSpriteId === sprite.id }"
                  :style="{ width: `${sprite.width * 13 + 17}px` }"
                  :disabled="colorSelectionDisabled"
                  type="button"
                  :aria-label="sprite.name"

                  :aria-pressed="selectedSpriteId === sprite.id"
                  @click="selectEditorSprite(sprite)"
                >
                  <EditorSpritePreview
                    :sprite="sprite"
                    :color="colorOptions[sprite.color]?.value || '#70d6b3'"
                  />
                </button>
              </div>
            </div>
            <div v-else class="anchor-edit-panel">
              <strong>{{ t("simple.editAnchor") }}</strong>
              <span>{{ t("simple.chooseAnchor") }}</span>
            </div>
          </div>

        </div>
      </aside>
    </div>
      </section>
    </div>
    <EditorSaveDialog v-if="saveFeedback" v-bind="saveFeedback" @close="saveFeedback = null" />
    <GameGlobalConfigDialog
      v-if="globalConfigOpen"
      :config="globalConfigDraft"
      :categories="gameCategories"
      :saving="busyAction === 'save'"
      :error="errorMessage"
      @cancel="globalConfigOpen = false"
      @save="saveGlobalConfig"
    />
    <MediaPickerDialog v-if="levelMediaPicker" accept="audio" :current-value="levelMediaPicker.option.bgVoice || ''" :title="t('simple.levelBackgroundMusic')" @cancel="levelMediaPicker = null" @select="selectLevelMedia" />
    <PixelLightLayoutDialog
      v-if="pixelLightLayoutOpen"
      :layout="pixelLightLayoutDraft"
      :controller-count="pixelLightControllerCount"
      :grid-width="matrixWidth"
      :grid-height="matrixHeight"
      :saving="busyAction === 'save'"
      :error="errorMessage"
      @cancel="pixelLightLayoutOpen = false"
      @save="savePixelLightLayout"
    />
    <GameWiringDialog v-if="gameWiringOpen" :wiring="document?.wiringData" :width="matrixWidth" :height="matrixHeight"
      :saving="gameWiringSaving" :error="gameWiringError" @cancel="gameWiringOpen = false" @save="saveWiring" />
    <GameEffectDialog
      v-if="effectDialogOpen"
      :effect="effectDialogDraft"
      :spirits="effectSpirits"
      :grid-width="matrixWidth"
      :grid-height="matrixHeight"
      :level-index="activeLevelIndex"
      :frame-index="activeFrameIndex"
      :colors="colorOptions.map((color) => color.value)"
      :id-prefix="effectIdPrefix"
      :saving="Boolean(busyAction)"
      :error="effectSpiritLoadFailed ? t('effect.spiritLoadFailed') : errorMessage"
      @cancel="closeEffectDialog"
      @confirm="applyEffectResult"
    />
    <SimpleLevelPreviewDialog
      v-if="levelPreviewSnapshot"
      :snapshot="levelPreviewSnapshot"
      @close="closeLevelPreview"
    />
  </div>
</template>

<style scoped>
.sequence-pill[draggable="true"] { cursor: grab; }
.level-tab { position: relative; display: flex; flex-shrink: 0; }
.level-tab .sequence-pill { padding-right: 28px; }
.level-tab.level-drop-target { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
.level-tab-delete { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 3px; background: var(--ui-surface); color: var(--ui-text); font-size: 18px; line-height: 1; cursor: pointer; opacity: 0; }
.level-tab:hover .level-tab-delete, .level-tab:focus-within .level-tab-delete { opacity: 1; }
.level-tab-delete:hover, .level-tab-delete:focus-visible { background: var(--ui-error); color: #fff; }
.level-tab-delete:disabled { cursor: default; opacity: 0; }
.level-tab:hover .level-tab-delete:disabled, .level-tab:focus-within .level-tab-delete:disabled { opacity: .35; }
.editor-level-media{display:grid;gap:14px;min-width:0}
.editor-circle-countdown{display:grid;gap:8px;margin:12px 0;min-width:0}
.editor-circle-countdown label{display:flex;align-items:center;gap:10px}
.editor-circle-countdown label span{flex:1}
.editor-circle-countdown input[type=number]{width:90px;min-width:0}
.editor-circle-countdown .circle-countdown-toggle input{width:16px;height:16px;margin:0;flex:0 0 16px}
.editor-level-media-field{display:grid;gap:6px;min-width:0}
.editor-level-media-row{display:flex;align-items:center;gap:6px;min-width:0}
.editor-level-media-row input{flex:1;min-width:0;text-overflow:ellipsis}
.editor-level-media-row button{flex-shrink:0}
.editor-level-media-field audio{width:100%;height:32px}
</style>

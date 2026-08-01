import { unwrapBackendData } from "./gameFlowState.js";
import { normalizeLevelOption } from "./simpleLevelOptions.js";

export const TOUCH_PLAYER_COUNTS = Object.freeze([1, 2, 3, 4, 5, 6]);
export const TOUCH_GAME_COUNTDOWN_SECONDS = 5;

export function normalizeTouchPlayerCount(value, fallback = 1) {
  const number = Number(value);
  if (Number.isInteger(number) && TOUCH_PLAYER_COUNTS.includes(number)) {
    return number;
  }
  const fallbackNumber = Number(fallback);
  return Number.isInteger(fallbackNumber) && TOUCH_PLAYER_COUNTS.includes(fallbackNumber)
    ? fallbackNumber
    : 1;
}

export function wrapTouchCarouselIndex(index, itemCount) {
  const count = Math.max(0, Math.floor(Number(itemCount) || 0));
  if (!count) return 0;
  const normalized = Math.floor(Number(index) || 0) % count;
  return normalized < 0 ? normalized + count : normalized;
}

export function moveTouchCarousel(index, offset, itemCount) {
  return wrapTouchCarouselIndex(
    Math.floor(Number(index) || 0) + Math.floor(Number(offset) || 0),
    itemCount,
  );
}

export function touchCarouselSlots(items, activeIndex) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return [];
  if (source.length === 1) {
    return [{ item: source[0], index: 0, offset: 0, key: "0:0" }];
  }
  const center = wrapTouchCarouselIndex(activeIndex, source.length);
  return [-1, 0, 1].map((offset) => {
    const index = moveTouchCarousel(center, offset, source.length);
    return {
      item: source[index],
      index,
      offset,
      key: `${index}:${offset}`,
    };
  });
}

export function normalizeTouchGameDocument(value, fallback = {}) {
  const source = unwrapBackendData(value);
  const document = source && typeof source === "object" ? source : {};
  const levels = Array.isArray(document.levels)
    ? document.levels.map((level, index) => ({
        index,
        label: String(level?.label || `Level ${index + 1}`),
        option: normalizeLevelOption(level?.option),
      }))
    : [];
  return {
    id: finiteNumber(document.id ?? fallback.id),
    name: String(document.name || fallback.name || "Game"),
    description: String(document.description || "").trim(),
    globalTimeLimit: Boolean(document.globalTimeLimit),
    globalTimeLimitValue: positiveInteger(document.globalTimeLimitValue),
    levels,
  };
}

export function createTouchCountdown({
  seconds = TOUCH_GAME_COUNTDOWN_SECONDS,
  onTick,
  onComplete,
  schedule = (callback) => window.setTimeout(callback, 1000),
  cancelSchedule = (timer) => window.clearTimeout(timer),
} = {}) {
  let remaining = Math.max(1, Math.floor(Number(seconds) || TOUCH_GAME_COUNTDOWN_SECONDS));
  let timer = null;
  let cancelled = false;

  const advance = () => {
    if (cancelled) return;
    remaining -= 1;
    if (remaining <= 0) {
      onComplete?.();
      return;
    }
    onTick?.(remaining);
    timer = schedule(advance);
  };

  onTick?.(remaining);
  timer = schedule(advance);

  return () => {
    cancelled = true;
    if (timer !== null) {
      cancelSchedule(timer);
      timer = null;
    }
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

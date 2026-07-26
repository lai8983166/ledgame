export const TIME_LIMIT_MODES = Object.freeze([
  "UNLIMITED",
  "CYCLE_COUNT",
  "CYCLE_SECONDS",
]);

export const LIFE_LIMIT_MODES = Object.freeze(["UNLIMITED", "LIMITED"]);

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function normalizeLevelOption(option = {}) {
  const source = { ...option };
  const requestedTimeMode = String(source.timeLimitMode || "").trim().toUpperCase();
  const timeLimitMode = TIME_LIMIT_MODES.includes(requestedTimeMode)
    ? requestedTimeMode
    : source.timeLimit
      ? "CYCLE_SECONDS"
      : "UNLIMITED";
  const requestedLifeMode = String(source.lifeLimitMode || "").trim().toUpperCase();
  const lifeLimitMode = LIFE_LIMIT_MODES.includes(requestedLifeMode)
    ? requestedLifeMode
    : source.lifeLimit
      ? "LIMITED"
      : "UNLIMITED";

  return {
    ...source,
    timeLimitMode,
    timeLimitValue: timeLimitMode === "UNLIMITED"
      ? 0
      : positiveInteger(source.timeLimitValue),
    timeLimit: timeLimitMode !== "UNLIMITED",
    lifeLimitMode,
    lifeLimitValue: lifeLimitMode === "LIMITED"
      ? positiveInteger(source.lifeLimitValue)
      : 0,
    lifeLimit: lifeLimitMode === "LIMITED",
  };
}

export function validateLevelOption(option) {
  const normalized = normalizeLevelOption(option);
  const errors = [];
  if (normalized.timeLimitMode !== "UNLIMITED" && normalized.timeLimitValue <= 0) {
    errors.push({ field: "timeLimitValue", messageKey: "simple.levelLimitPositive" });
  }
  if (normalized.lifeLimitMode === "LIMITED" && normalized.lifeLimitValue <= 0) {
    errors.push({ field: "lifeLimitValue", messageKey: "simple.levelLimitPositive" });
  }
  return errors;
}

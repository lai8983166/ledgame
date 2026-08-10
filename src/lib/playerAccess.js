const ACCESS_STATES = new Set(["READY", "ACTIVE", "EXPIRED"]);

const ERROR_MESSAGE_KEYS = Object.freeze({
  WRISTBAND_SCAN_REQUIRED: "touch.errors.wristbandScanRequired",
  WRISTBAND_NOT_FOUND: "touch.errors.wristbandNotFound",
  WRISTBAND_NOT_BOUND: "touch.errors.wristbandNotBound",
  WRISTBAND_NOT_READY: "touch.errors.wristbandNotReady",
  WRISTBAND_EXPIRED: "touch.errors.wristbandExpired",
  WRISTBAND_IN_USE: "touch.errors.wristbandInUse",
  MEMBER_FROZEN: "touch.errors.memberFrozen",
  MEMBER_PLATFORM_UNAVAILABLE: "touch.errors.platformUnavailable",
  MEMBER_PLATFORM_TIMEOUT: "touch.errors.platformTimeout",
  PLATFORM_UNAVAILABLE: "touch.errors.platformUnavailable",
  PLATFORM_TIMEOUT: "touch.errors.platformTimeout",
});

export function normalizePlayerAccess(value) {
  if (!value || typeof value !== "object") return null;
  const member = normalizeMember(value.member);
  const access = normalizeAccess(value.access);
  if (!member || !access) return null;
  return {
    member,
    access,
    platformPlayId: nullableNumber(value.platformPlayId),
    externalSessionId: nullableText(value.externalSessionId),
  };
}

export function playerAccessRemainingSeconds(value, now = Date.now()) {
  const playerAccess = normalizePlayerAccess(value);
  if (!playerAccess) return null;
  const expiresAt = Date.parse(playerAccess.access.expiresAt || "");
  if (Number.isFinite(expiresAt) && Number.isFinite(Number(now))) {
    return Math.max(0, Math.floor((expiresAt - Number(now)) / 1000));
  }
  return playerAccess.access.remainingSeconds;
}

export function wristbandErrorMessageKey(error) {
  const candidates = [
    error?.code,
    error?.response?.code,
    error?.data?.code,
    error?.response?.data?.code,
  ];
  const message = String(error?.message || "");
  for (const code of Object.keys(ERROR_MESSAGE_KEYS)) {
    if (candidates.some((candidate) => String(candidate || "").toUpperCase() === code)) {
      return ERROR_MESSAGE_KEYS[code];
    }
    if (new RegExp(`(^|\\W)${code}(\\W|$)`).test(message.toUpperCase())) {
      return ERROR_MESSAGE_KEYS[code];
    }
  }
  return null;
}

function normalizeMember(value) {
  if (!value || typeof value !== "object") return null;
  const id = nullableNumber(value.id);
  const phone = nullableText(value.phone);
  if (id === null || !phone) return null;
  return {
    id,
    phone,
    name: nullableText(value.name),
    status: nullableText(value.status),
  };
}

function normalizeAccess(value) {
  if (!value || typeof value !== "object") return null;
  const bindingId = nullableNumber(value.bindingId);
  const uid = nullableText(value.uid);
  const status = String(value.status || "").trim().toUpperCase();
  const durationMinutes = nonNegativeNumber(value.durationMinutes);
  const remainingSeconds = nonNegativeInteger(value.remainingSeconds);
  if (
    bindingId === null ||
    !uid ||
    !/^\d{1,32}$/.test(uid) ||
    !ACCESS_STATES.has(status) ||
    durationMinutes === null ||
    remainingSeconds === null
  ) {
    return null;
  }
  return {
    bindingId,
    uid,
    status,
    durationMinutes,
    startedAt: nullableText(value.startedAt),
    expiresAt: nullableText(value.expiresAt),
    remainingSeconds,
  };
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value) {
  const number = nullableNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function nonNegativeInteger(value) {
  const number = nonNegativeNumber(value);
  return number === null ? null : Math.floor(number);
}

function nullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

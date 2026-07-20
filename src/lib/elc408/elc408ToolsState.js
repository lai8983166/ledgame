// Small normalize helpers for ELC-408 backend responses. Keep unknown fields
// intact so a future schema bump does not break the UI; provide stable
// fallbacks for missing enum/error fields only.

export const RGB_MODES = ["RGB", "RBG", "GRB", "GBR", "BRG", "BGR"];
export const CONTROLLER_MODELS = ["HC08", "HC04"];
export const DISPLAY_COLORS = ["BLACK", "RED", "GREEN", "BLUE", "WHITE"];

export const DEFAULT_CONFIG_DRAFT = Object.freeze({
  tcpServerPort: 3002,
  allowRepeatActiveOnDown: false,
  debounceMillis: 50,
  networkInterfaceId: "",
  controllerModel: "HC08",
  rgbMode: "RGB",
});

export const DEFAULT_DEBUG_DRAFT = Object.freeze({
  rgbMode: "RGB",
  networkInterfaceId: "",
  controllerModel: "HC08",
  controllerCount: 1,
  maxPointsPerChannel: 64,
  displayColor: "RED",
  frameIntervalMs: 1000,
});

export function normalizeRgbMode(value) {
  if (typeof value === "string" && RGB_MODES.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return "RGB";
}

export function normalizeControllerModel(value) {
  if (typeof value === "string" && CONTROLLER_MODELS.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return "HC08";
}

export function normalizeDisplayColor(value) {
  if (typeof value === "string" && DISPLAY_COLORS.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return "RED";
}

export function displayColorToRgb(name) {
  switch (normalizeDisplayColor(name)) {
    case "RED":
      return { r: 255, g: 0, b: 0 };
    case "GREEN":
      return { r: 0, g: 255, b: 0 };
    case "BLUE":
      return { r: 0, g: 0, b: 255 };
    case "WHITE":
      return { r: 255, g: 255, b: 255 };
    case "BLACK":
    default:
      return { r: 0, g: 0, b: 0 };
  }
}

export function normalizeNetworkInterface(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    id: String(entry.id ?? ""),
    name: String(entry.name ?? ""),
    displayName: String(entry.displayName ?? entry.name ?? ""),
    localAddress: String(entry.localAddress ?? ""),
    prefixLength: Number.isFinite(entry.prefixLength) ? entry.prefixLength : 0,
    hardwareAddress: String(entry.hardwareAddress ?? ""),
    broadcastAddress: String(entry.broadcastAddress ?? ""),
  };
}

export function normalizeNetworkInterfaceList(payload) {
  const list = Array.isArray(payload) ? payload : payload?.data ?? [];
  return list.map(normalizeNetworkInterface).filter(Boolean);
}

export function networkInterfaceLabel(entry) {
  if (!entry) {
    return "";
  }
  const name = entry.displayName || entry.name || entry.id || "";
  const suffix = entry.localAddress
    ? ` (${entry.localAddress}/${entry.prefixLength || 0})`
    : "";
  return `${name}${suffix}`;
}

export function normalizeController(controller) {
  if (!controller || typeof controller !== "object") {
    return null;
  }
  return {
    mac: String(controller.mac ?? ""),
    sourceIp: String(controller.sourceIp ?? ""),
    lastSeenAt: Number.isFinite(controller.lastSeenAt) ? controller.lastSeenAt : 0,
    channelCount: Number.isFinite(controller.channelCount) ? controller.channelCount : 0,
  };
}

export function normalizeControllerList(payload) {
  const data = payload?.data ?? payload;
  const list = Array.isArray(data?.controllers) ? data.controllers : [];
  return list.map(normalizeController).filter(Boolean);
}

export function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return {
    seq: Number.isFinite(entry.seq) ? entry.seq : 0,
    timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : 0,
    direction: entry.direction === "RECEIVE" ? "RECEIVE" : "SEND",
    type: String(entry.type ?? ""),
    hex: String(entry.hex ?? ""),
    byteLength: Number.isFinite(entry.byteLength) ? entry.byteLength : 0,
  };
}

export function normalizeLogList(payload, previousCursor) {
  const data = payload?.data ?? payload;
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const nextCursor = Number.isFinite(data?.nextCursor) ? data.nextCursor : previousCursor;
  return {
    entries: entries.map(normalizeLogEntry).filter(Boolean),
    nextCursor,
  };
}

export function extractBackendError(error) {
  if (!error) {
    return { code: "", message: "" };
  }
  const message = typeof error.message === "string" ? error.message : String(error);
  const match = message.match(/^([A-Z][A-Z0-9_]+):/);
  return {
    code: match ? match[1] : "",
    message,
  };
}

export function classifyBackendErrorCode(code) {
  switch (code) {
    case "UDP_PORT_IN_USE":
      return "udpPortInUse";
    case "MULTI_CONTROLLER_UNVERIFIED":
      return "multiControllerUnverified";
    case "NETWORK_INTERFACE_NOT_FOUND":
    case "NETWORK_INTERFACE_AMBIGUOUS":
    case "NETWORK_INTERFACE_NOT_CONFIGURED":
      return "networkInterfaceUnavailable";
    case "HC04_UNAVAILABLE":
    case "HC04_FIXTURE_UNAVAILABLE":
      return "hc04Unavailable";
    case "SDK_NOT_ENABLED":
      return "sdkNotEnabled";
    default:
      return "backendError";
  }
}

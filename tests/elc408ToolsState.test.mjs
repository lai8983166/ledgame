import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CONFIG_DRAFT,
  DEFAULT_DEBUG_DRAFT,
  RGB_MODES,
  CONTROLLER_MODELS,
  DISPLAY_COLORS,
  normalizeRgbMode,
  normalizeControllerModel,
  normalizeDisplayColor,
  displayColorToRgb,
  normalizeNetworkInterface,
  normalizeNetworkInterfaceList,
  networkInterfaceLabel,
  normalizeController,
  normalizeControllerList,
  normalizeLogEntry,
  normalizeLogList,
  extractBackendError,
  classifyBackendErrorCode,
} from "../src/lib/elc408/elc408ToolsState.js";

test("DEFAULT_CONFIG_DRAFT has canonical values", () => {
  assert.equal(DEFAULT_CONFIG_DRAFT.tcpServerPort, 3002);
  assert.equal(DEFAULT_CONFIG_DRAFT.allowRepeatActiveOnDown, false);
  assert.equal(DEFAULT_CONFIG_DRAFT.debounceMillis, 50);
  assert.equal(DEFAULT_CONFIG_DRAFT.controllerModel, "HC08");
  assert.equal(DEFAULT_CONFIG_DRAFT.rgbMode, "RGB");
});

test("DEFAULT_DEBUG_DRAFT has canonical values", () => {
  assert.equal(DEFAULT_DEBUG_DRAFT.controllerCount, 1);
  assert.equal(DEFAULT_DEBUG_DRAFT.maxPointsPerChannel, 64);
  assert.equal(DEFAULT_DEBUG_DRAFT.frameIntervalMs, 1000);
  assert.equal(DEFAULT_DEBUG_DRAFT.displayColor, "RED");
});

test("RGB_MODES exposes six permutations", () => {
  assert.equal(RGB_MODES.length, 6);
  assert.ok(RGB_MODES.includes("RGB"));
  assert.ok(RGB_MODES.includes("BGR"));
});

test("CONTROLLER_MODELS exposes HC08 and HC04", () => {
  assert.deepEqual(CONTROLLER_MODELS, ["HC08", "HC04"]);
});

test("DISPLAY_COLORS exposes five options", () => {
  assert.equal(DISPLAY_COLORS.length, 5);
  assert.ok(DISPLAY_COLORS.includes("BLACK"));
  assert.ok(DISPLAY_COLORS.includes("WHITE"));
});

test("normalizeRgbMode falls back to RGB on unknown value", () => {
  assert.equal(normalizeRgbMode("RGB"), "RGB");
  assert.equal(normalizeRgbMode("rbg"), "RBG");
  assert.equal(normalizeRgbMode("XYZ"), "RGB");
  assert.equal(normalizeRgbMode(null), "RGB");
});

test("normalizeControllerModel falls back to HC08 on unknown value", () => {
  assert.equal(normalizeControllerModel("hc04"), "HC04");
  assert.equal(normalizeControllerModel("HC99"), "HC08");
});

test("normalizeDisplayColor falls back to RED on unknown value", () => {
  assert.equal(normalizeDisplayColor("BLUE"), "BLUE");
  assert.equal(normalizeDisplayColor("PURPLE"), "RED");
});

test("displayColorToRgb returns correct triples", () => {
  assert.deepEqual(displayColorToRgb("RED"), { r: 255, g: 0, b: 0 });
  assert.deepEqual(displayColorToRgb("GREEN"), { r: 0, g: 255, b: 0 });
  assert.deepEqual(displayColorToRgb("BLUE"), { r: 0, g: 0, b: 255 });
  assert.deepEqual(displayColorToRgb("WHITE"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(displayColorToRgb("BLACK"), { r: 0, g: 0, b: 0 });
});

test("normalizeNetworkInterface preserves all known fields", () => {
  const entry = normalizeNetworkInterface({
    id: "ni-1",
    name: "eth0",
    displayName: "Wired NIC",
    localAddress: "169.254.1.10",
    prefixLength: 16,
    hardwareAddress: "AA-BB-CC-DD-EE-FF",
    broadcastAddress: "169.254.255.255",
  });
  assert.equal(entry.id, "ni-1");
  assert.equal(entry.prefixLength, 16);
});

test("normalizeNetworkInterface returns null on garbage input", () => {
  assert.equal(normalizeNetworkInterface(null), null);
  assert.equal(normalizeNetworkInterface("string"), null);
});

test("normalizeNetworkInterfaceList unwraps Result envelope", () => {
  const list = normalizeNetworkInterfaceList({ data: [{ id: "a" }, { id: "b" }] });
  assert.equal(list.length, 2);
});

test("networkInterfaceLabel composes name with localAddress/prefixLength", () => {
  const label = networkInterfaceLabel({
    displayName: "ASIX USB",
    localAddress: "169.254.1.10",
    prefixLength: 16,
  });
  assert.equal(label, "ASIX USB (169.254.1.10/16)");
});

test("normalizeControllerList unwraps controllers field", () => {
  const list = normalizeControllerList({
    data: {
      controllers: [{ mac: "AABBCC", sourceIp: "169.254.1.11" }],
    },
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].mac, "AABBCC");
});

test("normalizeLogEntry falls back to SEND direction", () => {
  const entry = normalizeLogEntry({ seq: 1, direction: "RECEIVE", type: "0x68", hex: "68", timestamp: 1, byteLength: 1 });
  assert.equal(entry.direction, "RECEIVE");
  const fallback = normalizeLogEntry({ seq: 2, direction: "UNKNOWN", type: "x" });
  assert.equal(fallback.direction, "SEND");
});

test("normalizeLogList preserves previous cursor on missing nextCursor", () => {
  const result = normalizeLogList({ data: { entries: [] } }, 42);
  assert.equal(result.nextCursor, 42);
});

test("extractBackendError pulls leading UPPER_CASE code", () => {
  const result = extractBackendError(new Error("UDP_PORT_IN_USE: cannot bind"));
  assert.equal(result.code, "UDP_PORT_IN_USE");
  assert.match(result.message, /UDP_PORT_IN_USE/);
});

test("classifyBackendErrorCode maps known codes", () => {
  assert.equal(classifyBackendErrorCode("UDP_PORT_IN_USE"), "udpPortInUse");
  assert.equal(classifyBackendErrorCode("MULTI_CONTROLLER_UNVERIFIED"), "multiControllerUnverified");
  assert.equal(classifyBackendErrorCode("NETWORK_INTERFACE_NOT_FOUND"), "networkInterfaceUnavailable");
  assert.equal(classifyBackendErrorCode("HC04_UNAVAILABLE"), "hc04Unavailable");
  assert.equal(classifyBackendErrorCode("UNKNOWN"), "backendError");
});

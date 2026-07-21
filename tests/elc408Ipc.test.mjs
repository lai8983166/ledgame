import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeConfigDraft,
  normalizeWiringDraft,
  normalizeSearchRequest,
  normalizeDebugStartRequest,
  normalizeLogCaptureRequest,
  normalizeSaveFilePayload,
} from "../electron/elc408Ipc.cjs";

test("normalizeConfigDraft applies canonical defaults", () => {
  const result = normalizeConfigDraft({});
  assert.equal(result.tcpServerPort, 3002);
  assert.equal(result.allowRepeatActiveOnDown, false);
  assert.equal(result.debounceMillis, 50);
  assert.equal(result.controllerModel, "HC08");
  assert.equal(result.rgbMode, "RGB");
});

test("normalizeConfigDraft clamps port and debounce", () => {
  const result = normalizeConfigDraft({
    tcpServerPort: 99999,
    debounceMillis: -5,
  });
  assert.equal(result.tcpServerPort, 65535);
  assert.equal(result.debounceMillis, 0);
});

test("normalizeConfigDraft normalizes enum case", () => {
  const result = normalizeConfigDraft({
    controllerModel: "hc04",
    rgbMode: "grb",
  });
  assert.equal(result.controllerModel, "HC04");
  assert.equal(result.rgbMode, "GRB");
});

test("normalizeConfigDraft rejects unknown enum values", () => {
  const result = normalizeConfigDraft({
    controllerModel: "HC99",
    rgbMode: "XYZ",
  });
  assert.equal(result.controllerModel, "HC08");
  assert.equal(result.rgbMode, "RGB");
});

test("normalizeWiringDraft strips mode and activeChannelIndex", () => {
  const result = normalizeWiringDraft({
    width: 16,
    height: 32,
    maxPointsPerChannel: 64,
    mode: "SINGLE_ROW_PRIORITY",
    activeChannelIndex: 2,
    lines: [[[0, 0]]],
  });
  assert.equal(result.mode, undefined);
  assert.equal(result.activeChannelIndex, undefined);
  assert.deepEqual(result.lines, [[[0, 0]]]);
});

test("normalizeWiringDraft drops non-integer points", () => {
  const result = normalizeWiringDraft({
    width: 16,
    height: 32,
    lines: [
      [[0, 0], ["a", "b"], [1.5, 2.5], [1, 2]],
    ],
  });
  assert.deepEqual(result.lines[0], [[0, 0], [1, 2]]);
});

test("normalizeWiringDraft clamps dimensions to min 1", () => {
  const result = normalizeWiringDraft({ width: 0, height: -1 });
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
});

test("normalizeSearchRequest strips invalid fields", () => {
  const result = normalizeSearchRequest({
    networkInterfaceId: "ni-test",
    controllerModel: "HC99",
    rgbMode: "XYZ",
    rawBytes: [0x67],
  });
  assert.deepEqual(result, { networkInterfaceId: "ni-test" });
});

test("normalizeDebugStartRequest applies canonical defaults", () => {
  const result = normalizeDebugStartRequest({});
  assert.equal(result.rgbMode, "RGB");
  assert.equal(result.controllerModel, "HC08");
  assert.equal(result.controllerCount, 1);
  assert.equal(result.maxPointsPerChannel, 64);
  assert.equal(result.frameIntervalMs, 1000);
  assert.deepEqual(result.displayColor, { r: 255, g: 0, b: 0 });
});

test("normalizeDebugStartRequest clamps displayColor", () => {
  const result = normalizeDebugStartRequest({
    displayColor: { r: 999, g: -5, b: 128 },
  });
  assert.deepEqual(result.displayColor, { r: 255, g: 0, b: 128 });
});

test("normalizeLogCaptureRequest accepts only a boolean enabled value", () => {
  assert.deepEqual(normalizeLogCaptureRequest(true), {
    ok: true,
    value: { enabled: true },
  });
  assert.deepEqual(normalizeLogCaptureRequest(false), {
    ok: true,
    value: { enabled: false },
  });
  for (const invalid of ["true", 1, null, undefined, {}, { enabled: true }]) {
    assert.equal(normalizeLogCaptureRequest(invalid).ok, false);
  }
});

test("normalizeSaveFilePayload rejects unsupported kind", () => {
  const result = normalizeSaveFilePayload({ kind: "executable", content: "{}" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported file kind/);
});

test("normalizeSaveFilePayload rejects oversized content", () => {
  const huge = "x".repeat(256 * 1024 + 1);
  const result = normalizeSaveFilePayload({ kind: "config", content: huge });
  assert.equal(result.ok, false);
});

test("normalizeSaveFilePayload rejects path separators in file name", () => {
  const result = normalizeSaveFilePayload({
    kind: "config",
    content: "{}",
    suggestedFileName: "../../evil.conf.json",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /path separators/);
});

test("normalizeSaveFilePayload accepts valid config payload", () => {
  const result = normalizeSaveFilePayload({
    kind: "config",
    content: "{\"schemaVersion\":1}",
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "config");
  assert.equal(result.suggestedFileName, "conf.json");
});

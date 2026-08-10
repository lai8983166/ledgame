import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePlayerAccess,
  playerAccessRemainingSeconds,
  wristbandErrorMessageKey,
} from "../src/lib/playerAccess.js";

const accessFixture = {
  member: { id: 12, phone: "13800138000", name: "张三", status: "ACTIVE" },
  access: {
    bindingId: 9,
    uid: "2283055618",
    status: "ACTIVE",
    durationMinutes: 60,
    startedAt: "2026-08-09T03:00:00Z",
    expiresAt: "2026-08-09T04:00:00Z",
    remainingSeconds: 3598,
  },
  platformPlayId: 21,
  externalSessionId: "prep-21",
};

test("normalizes a complete authoritative player access response", () => {
  assert.deepEqual(normalizePlayerAccess(accessFixture), accessFixture);
  assert.equal(normalizePlayerAccess(null), null);
  assert.equal(normalizePlayerAccess({ ...accessFixture, member: null }), null);
  assert.equal(normalizePlayerAccess({ ...accessFixture, access: { status: "ACTIVE" } }), null);
  assert.equal(
    normalizePlayerAccess({
      ...accessFixture,
      access: { ...accessFixture.access, remainingSeconds: "invalid" },
    }),
    null,
  );
});

test("derives a live remaining balance from expiresAt with zero and response fallbacks", () => {
  const now = Date.parse("2026-08-09T03:00:02Z");
  assert.equal(playerAccessRemainingSeconds(accessFixture, now), 3598);
  assert.equal(playerAccessRemainingSeconds(accessFixture, Date.parse("2026-08-09T04:00:01Z")), 0);
  assert.equal(
    playerAccessRemainingSeconds({
      ...accessFixture,
      access: { ...accessFixture.access, expiresAt: null, remainingSeconds: 42 },
    }, now),
    42,
  );
  assert.equal(playerAccessRemainingSeconds(null, now), null);
});

test("maps stable backend wristband errors to localized message keys", () => {
  const expectations = {
    WRISTBAND_SCAN_REQUIRED: "touch.errors.wristbandScanRequired",
    WRISTBAND_NOT_FOUND: "touch.errors.wristbandNotFound",
    WRISTBAND_NOT_BOUND: "touch.errors.wristbandNotBound",
    WRISTBAND_EXPIRED: "touch.errors.wristbandExpired",
    WRISTBAND_IN_USE: "touch.errors.wristbandInUse",
    MEMBER_FROZEN: "touch.errors.memberFrozen",
    MEMBER_PLATFORM_UNAVAILABLE: "touch.errors.platformUnavailable",
    MEMBER_PLATFORM_TIMEOUT: "touch.errors.platformTimeout",
    PLATFORM_UNAVAILABLE: "touch.errors.platformUnavailable",
    PLATFORM_TIMEOUT: "touch.errors.platformTimeout",
  };

  for (const [code, key] of Object.entries(expectations)) {
    assert.equal(wristbandErrorMessageKey({ code }), key);
    assert.equal(wristbandErrorMessageKey({ response: { code } }), key);
    assert.equal(wristbandErrorMessageKey(new Error(`${code}: rejected`)), key);
  }
  assert.equal(wristbandErrorMessageKey(new Error("unknown")), null);
});

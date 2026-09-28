import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authoredMessages, canonicalLocales } from "../src/i18n/messages.js";

const appSource = await readFile(new URL("../src/App.vue", import.meta.url), "utf8");

test("titlebar controls use translated labels and retain their existing window actions", () => {
  for (const [key, action] of [
    ["minimize", "minimizeWindow"],
    ["maximize", "toggleMaximizeWindow"],
    ["close", "closeWindow"],
  ]) {
    assert.match(appSource, new RegExp(`:aria-label="t\\('windowControls\\.${key}'\\)" @click="api\\.${action}\\?\\.\\(\\)"`));
  }
  assert.doesNotMatch(appSource, /\saria-label="(?:Minimize|Maximize|Close)"/);
});

test("every supported language has authored translations for all titlebar controls", () => {
  for (const locale of canonicalLocales) {
    for (const key of ["minimize", "maximize", "close"]) {
      const label = authoredMessages[locale].windowControls?.[key];
      assert.equal(typeof label, "string", `${locale}: ${key}`);
      assert.ok(label.trim(), `${locale}: ${key} must not be empty`);
    }
  }
  assert.deepEqual(authoredMessages["zh-CN"].windowControls, {
    minimize: "最小化", maximize: "最大化", close: "关闭",
  });
  assert.deepEqual(authoredMessages["en-US"].windowControls, {
    minimize: "Minimize", maximize: "Maximize", close: "Close",
  });
});

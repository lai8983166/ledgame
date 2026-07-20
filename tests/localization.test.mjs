import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { messages } from "../src/i18n/messages.js";
import {
  applyLocale,
  DEFAULT_LOCALE,
  disposeApplicationLocale,
  i18n,
  initializeApplicationLocale,
  normalizeLocale,
  setApplicationLocale,
  SUPPORTED_LOCALES,
} from "../src/i18n/index.js";

const require = createRequire(import.meta.url);
const {
  createLanguagePreferenceStore,
  normalizeLocale: normalizeMainLocale,
} = require("../electron/language-settings.cjs");

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, nested]) => {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    return nested && typeof nested === "object"
      ? flattenKeys(nested, pathKey)
      : [pathKey];
  });
}

function flattenMessages(value, prefix = "", result = new Map()) {
  for (const [key, nested] of Object.entries(value)) {
    const pathKey = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object") {
      flattenMessages(nested, pathKey, result);
    } else {
      result.set(pathKey, String(nested));
    }
  }
  return result;
}

function interpolationParameters(message) {
  return [...message.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]).sort();
}

test("locale catalogs expose identical key sets", () => {
  const referenceKeys = flattenKeys(messages[DEFAULT_LOCALE]).sort();
  const referenceMessages = flattenMessages(messages[DEFAULT_LOCALE]);
  for (const [locale, catalog] of Object.entries(messages)) {
    assert.deepEqual(flattenKeys(catalog).sort(), referenceKeys, `${locale} key set differs`);
    const localizedMessages = flattenMessages(catalog);
    for (const [key, message] of referenceMessages) {
      assert.deepEqual(
        interpolationParameters(localizedMessages.get(key)),
        interpolationParameters(message),
        `interpolation parameters differ for ${locale}:${key}`,
      );
    }
  }
});

test("renderer and main locale normalization share the same allowlist and fallback", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["zh-CN", "en-US", "ru-RU", "ko-KR", "ja-JP"]);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.equal(normalizeLocale("en-US"), "en-US");
  assert.equal(normalizeLocale("ru-RU"), "ru-RU");
  assert.equal(normalizeLocale("ko-KR"), "ko-KR");
  assert.equal(normalizeLocale("ja-JP"), "ja-JP");
  assert.equal(normalizeLocale("fr-FR"), "zh-CN");
  assert.equal(normalizeMainLocale("fr-FR"), "zh-CN");
});

test("language preference store persists valid locale atomically", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "led-language-"));
  const settingsPath = path.join(directory, "settings", "language.json");
  const fs = await import("node:fs/promises");
  try {
    const store = createLanguagePreferenceStore({ fs, settingsPath });
    assert.equal(await store.get(), "zh-CN");
    for (const locale of SUPPORTED_LOCALES.slice(1)) {
      assert.equal(await store.set(locale), locale);
      assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), { locale });
    }
    assert.equal(await createLanguagePreferenceStore({ fs, settingsPath }).get(), "ja-JP");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("language preference store rejects unknown locale and recovers damaged JSON", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "led-language-"));
  const settingsPath = path.join(directory, "language.json");
  const fs = await import("node:fs/promises");
  try {
    await writeFile(settingsPath, "not-json", "utf8");
    const store = createLanguagePreferenceStore({ fs, settingsPath });
    assert.equal(await store.get(), "zh-CN");
    await assert.rejects(() => store.set("de-DE"), /Unsupported application locale/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("preload exposes removable language listeners without filesystem access", async () => {
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  assert.match(preload, /exposeInMainWorld\('appLanguage'/);
  assert.match(preload, /app-language:get/);
  assert.match(preload, /app-language:set/);
  assert.match(preload, /removeListener\('app-language-changed'/);
  assert.doesNotMatch(preload, /require\(['"]node:fs/);
});

test("language view exposes all supported locales with country flags", async () => {
  const source = await readFile(new URL("../src/views/LanguageView.vue", import.meta.url), "utf8");
  for (const locale of SUPPORTED_LOCALES) {
    assert.match(source, new RegExp(locale));
  }
  for (const flag of ["cn.svg", "us.svg", "ru.svg", "kr.svg", "jp.svg"]) {
    assert.match(source, new RegExp(`assets/flags/${flag.replace(".", "\\.")}`));
  }
  assert.match(source, /<img class="language-option-flag"/);
  assert.match(source, /language-option-flag/);
});

test("renderer applies locale immediately, preserves draft state, and cleans repeated listeners", async () => {
  const draft = { name: "未翻译的用户输入", frames: [{ id: "frame-1" }] };
  const listeners = [];
  let removed = 0;
  const api = {
    get: async () => "zh-CN",
    set: async (locale) => locale,
    onChanged(listener) {
      listeners.push(listener);
      return () => { removed += 1; };
    },
  };

  await initializeApplicationLocale(api);
  assert.equal(i18n.global.t("nav.language"), "语言");
  await setApplicationLocale("en-US");
  assert.equal(i18n.global.t("nav.language"), "Language");
  assert.deepEqual(draft, { name: "未翻译的用户输入", frames: [{ id: "frame-1" }] });

  await initializeApplicationLocale(api);
  assert.equal(removed, 1);
  listeners.at(-1)("en-US");
  assert.equal(i18n.global.locale.value, "en-US");
  disposeApplicationLocale();
  assert.equal(removed, 2);
  applyLocale(DEFAULT_LOCALE);
});

test("renderer initialization failure and unknown locale safely fall back to zh-CN", async () => {
  await initializeApplicationLocale({
    get: async () => { throw new Error("settings unavailable"); },
    onChanged: () => () => {},
  });
  assert.equal(i18n.global.locale.value, "zh-CN");
  assert.equal(applyLocale("unknown-locale"), "zh-CN");
  assert.equal(i18n.global.t("unknown.message.key"), "unknown.message.key");
  disposeApplicationLocale();
});

test("Vue UI keeps Han interface copy inside the locale catalog", async () => {
  const sourceRoot = new URL("../src/", import.meta.url);
  const allowed = new Set([
    "i18n/messages.js",
    "i18n/additional-messages.js",
    "i18n/elc408-messages.js",
  ]);
  const violations = [];

  async function visit(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) {
        await visit(entryUrl, entryRelative);
      } else if (/\.(?:vue|js)$/.test(entry.name) && !allowed.has(entryRelative)) {
        const source = await readFile(entryUrl, "utf8");
        const withoutComments = source
          .replace(/<!--[^]*?-->/g, "")
          .replace(/\/\*[^]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        if (/\p{Script=Han}/u.test(withoutComments)) {
          violations.push(entryRelative);
        }
      }
    }
  }

  await visit(sourceRoot);
  assert.deepEqual(violations, []);
});

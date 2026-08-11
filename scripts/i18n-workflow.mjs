import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authoredMessages, canonicalLocales } from "../src/i18n/messages.js";
import { generatedTranslations } from "../src/i18n/generated-translations.js";
import { APPLICATION_LANGUAGE_OPTIONS } from "../src/lib/applicationLanguages.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const queuePath = path.join(repositoryRoot, "i18n", "translation-queue.json");
const baselinePath = path.join(repositoryRoot, "i18n", "unmarked-baseline.json");
const generatedPath = path.join(repositoryRoot, "src", "i18n", "generated-translations.js");
const sourceRoot = path.join(repositoryRoot, "src");
const criticalKeys = ["language.title", "language.subtitle", "language.description", "language.current", "language.saveError"];

export function flattenCatalog(value, prefix = "", result = {}) {
  for (const [key, nested] of Object.entries(value || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) flattenCatalog(nested, fullKey, result);
    else result[fullKey] = String(nested);
  }
  return result;
}

export function unflattenCatalog(flat) {
  const catalog = {};
  for (const [key, value] of Object.entries(flat)) {
    const segments = key.split(".");
    let cursor = catalog;
    for (const segment of segments.slice(0, -1)) cursor = cursor[segment] ||= {};
    cursor[segments.at(-1)] = value;
  }
  return catalog;
}

function interpolationParameters(message) {
  return [...message.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]).sort();
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : [entryPath];
  }));
  return files.flat().filter((file) => /\.(?:vue|js)$/.test(file)).sort();
}

async function referencedKeys() {
  const keys = new Set();
  for (const file of await sourceFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/\b(?:t|te)\(\s*["'`]([\w.-]+)["'`]/g)) keys.add(match[1]);
  }
  return [...keys].sort();
}

function normalizeLiteral(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function unmarkedCopy() {
  const findings = [];
  for (const file of (await sourceFiles(sourceRoot)).filter((item) => item.endsWith(".vue"))) {
    const source = await readFile(file, "utf8");
    const template = source.match(/<template>([\s\S]*?)<\/template>/)?.[1] || "";
    const relative = path.relative(repositoryRoot, file).replaceAll("\\", "/");
    const literals = [
      ...[...template.matchAll(/>\s*([^<>{}\n][^<>{}]*)\s*</g)].map((match) => match[1]),
      ...[...template.matchAll(/\b(?:placeholder|title|aria-label)=["']([^"']+)["']/g)].map((match) => match[1]),
    ];
    for (const literal of literals.map(normalizeLiteral)) {
      if (!literal || !/[\p{L}\p{Script=Han}]/u.test(literal)) continue;
      if (/^(?:true|false|button|dialog|option|listbox|status)$/i.test(literal)) continue;
      findings.push(`${relative}::${literal}`);
    }
  }
  return [...new Set(findings)].sort();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function createMissingQueue(base, authoredByLocale, previousTargets = {}) {
  const targets = {};
  for (const locale of canonicalLocales) {
    if (locale === "en-US") continue;
    const authored = flattenCatalog(authoredByLocale[locale]);
    const entries = {};
    for (const key of Object.keys(base).sort()) {
      if (typeof authored[key] === "string" && authored[key].trim()) continue;
      const previous = previousTargets[locale]?.[key];
      entries[key] = {
        source: base[key],
        translation: previous?.source === base[key] ? previous.translation || "" : "",
      };
    }
    if (Object.keys(entries).length) targets[locale] = entries;
  }
  return { schemaVersion: 1, sourceLocale: "en-US", targets };
}

async function buildState() {
  const base = flattenCatalog(authoredMessages["en-US"]);
  const previousQueue = await readJson(queuePath, { targets: {} });
  const queue = createMissingQueue(base, authoredMessages, previousQueue.targets);
  const references = await referencedKeys();
  const interpolationErrors = [];
  for (const locale of canonicalLocales) {
    const authored = flattenCatalog(authoredMessages[locale]);
    for (const [key, message] of Object.entries(authored)) {
      if (!(key in base)) continue;
      const expected = interpolationParameters(base[key]);
      const actual = interpolationParameters(message);
      if (expected.join("\0") !== actual.join("\0")) interpolationErrors.push(`${locale}:${key}`);
    }
  }
  return {
    base,
    queue,
    references,
    unknownKeys: references.filter((key) => !(key in base)),
    interpolationErrors: interpolationErrors.sort(),
    unmarked: await unmarkedCopy(),
  };
}

function printReport(state) {
  console.log(`Game desktop: ${Object.keys(state.base).length} base keys, ${state.references.length} referenced keys`);
  for (const option of APPLICATION_LANGUAGE_OPTIONS) {
    console.log(`  ${option.flag} ${option.label} (${option.value}): ${Object.keys(state.queue.targets[option.value] || {}).length} missing`);
  }
  console.log(`  unmarked Vue literals: ${state.unmarked.length}`);
}

async function importCompleted() {
  const queue = await readJson(queuePath, { targets: {} });
  const merged = structuredClone(generatedTranslations);
  let imported = 0;
  for (const [locale, entries] of Object.entries(queue.targets || {})) {
    const flat = flattenCatalog(merged[locale] || {});
    for (const [key, entry] of Object.entries(entries)) {
      if (!entry.translation?.trim()) continue;
      flat[key] = entry.translation.trim();
      imported += 1;
    }
    if (Object.keys(flat).length) merged[locale] = unflattenCatalog(flat);
  }
  const output = `// Generated by \`npm run i18n:import\`. Do not add source-language copy here.\nexport const generatedTranslations = ${JSON.stringify(merged, null, 2)};\n`;
  await writeFile(generatedPath, output, "utf8");
  console.log(`Imported ${imported} completed translations into src/i18n/generated-translations.js`);
}

async function check(state) {
  const errors = [];
  const baseline = await readJson(baselinePath, []);
  if (APPLICATION_LANGUAGE_OPTIONS.length !== canonicalLocales.length) errors.push("Every locale must have a language option");
  if (APPLICATION_LANGUAGE_OPTIONS.some((option) => !option.flagCode)) errors.push("Every locale must have a bundled country flag code");
  if (new Set(APPLICATION_LANGUAGE_OPTIONS.map((option) => option.flagCode)).size !== canonicalLocales.length) errors.push("Every locale must have a unique country flag code");
  errors.push(...state.unknownKeys.map((key) => `unknown source key ${key}`));
  errors.push(...state.interpolationErrors.map((key) => `interpolation parameters differ for ${key}`));
  for (const locale of canonicalLocales.filter((item) => item !== "en-US")) {
    for (const key of criticalKeys) {
      if (state.queue.targets[locale]?.[key]) errors.push(`${locale} missing critical key ${key}`);
    }
  }
  const allowed = new Set(baseline);
  errors.push(...state.unmarked.filter((item) => !allowed.has(item)).map((item) => `new unmarked copy ${item}`));
  if (errors.length) throw new Error(`Localization check failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  console.log("Localization check passed: flags, keys, interpolation, critical coverage, and unmarked-copy baseline.");
}

async function main() {
  const command = process.argv[2] || "report";
  if (command === "import") return importCompleted();
  const state = await buildState();
  if (command === "report") return printReport(state);
  if (command === "extract") {
    await writeFile(queuePath, `${JSON.stringify(state.queue, null, 2)}\n`, "utf8");
    console.log("Wrote incremental translation queue: i18n/translation-queue.json");
    return printReport(state);
  }
  if (command === "baseline") {
    await writeFile(baselinePath, `${JSON.stringify(state.unmarked, null, 2)}\n`, "utf8");
    return console.log("Wrote unmarked-copy baseline: i18n/unmarked-baseline.json");
  }
  if (command === "check") return check(state);
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

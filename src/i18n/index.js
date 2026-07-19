import { createI18n } from "vue-i18n";
import { messages } from "./messages.js";

export const DEFAULT_LOCALE = "zh-CN";
export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US", "ru-RU", "ko-KR", "ja-JP"]);
const STORAGE_KEY = "led-game.locale";
const CHANNEL_NAME = "led-game-language";

export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  messages,
  missingWarn: false,
  fallbackWarn: false,
});

let languageApi = null;
let removeLanguageListener = null;
let fallbackChannel = null;

export function normalizeLocale(value) {
  return SUPPORTED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

export function applyLocale(value) {
  const locale = normalizeLocale(value);
  i18n.global.locale.value = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  return locale;
}

export async function initializeApplicationLocale(api = globalThis.window?.appLanguage) {
  languageApi = api || null;
  let initialLocale = DEFAULT_LOCALE;
  try {
    initialLocale = languageApi?.get
      ? await languageApi.get()
      : globalThis.localStorage?.getItem(STORAGE_KEY);
  } catch (_error) {
    initialLocale = DEFAULT_LOCALE;
  }
  applyLocale(initialLocale);

  removeLanguageListener?.();
  removeLanguageListener = languageApi?.onChanged?.((locale) => applyLocale(locale)) || null;

  if (!languageApi && typeof BroadcastChannel !== "undefined") {
    fallbackChannel?.close();
    fallbackChannel = new BroadcastChannel(CHANNEL_NAME);
    fallbackChannel.onmessage = (event) => applyLocale(event.data);
  }
  return i18n.global.locale.value;
}

export async function setApplicationLocale(value) {
  const locale = normalizeLocale(value);
  if (languageApi?.set) {
    const saved = await languageApi.set(locale);
    return applyLocale(saved);
  }
  applyLocale(locale);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, locale);
    fallbackChannel?.postMessage(locale);
  } catch (_error) {
    // A blocked storage backend must not prevent an in-memory language change.
  }
  return locale;
}

export function disposeApplicationLocale() {
  removeLanguageListener?.();
  removeLanguageListener = null;
  fallbackChannel?.close();
  fallbackChannel = null;
}

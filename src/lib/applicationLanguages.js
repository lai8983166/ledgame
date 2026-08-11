import { SUPPORTED_LOCALES } from "../i18n/index.js";
const LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "中文", flag: "🇨🇳", flagCode: "cn" },
  { value: "en-US", label: "English", flag: "🇺🇸", flagCode: "us" },
  { value: "es-ES", label: "Español", flag: "🇪🇸", flagCode: "es" },
  { value: "pt-PT", label: "Português", flag: "🇵🇹", flagCode: "pt" },
  { value: "fr-FR", label: "Français", flag: "🇫🇷", flagCode: "fr" },
  { value: "de-DE", label: "Deutsch", flag: "🇩🇪", flagCode: "de" },
  { value: "pl-PL", label: "Polski", flag: "🇵🇱", flagCode: "pl" },
  { value: "ru-RU", label: "Русский", flag: "🇷🇺", flagCode: "ru" },
  { value: "vi-VN", label: "Tiếng Việt", flag: "🇻🇳", flagCode: "vn" },
  { value: "it-IT", label: "Italiano", flag: "🇮🇹", flagCode: "it" },
  { value: "cs-CZ", label: "Čeština", flag: "🇨🇿", flagCode: "cz" },
  { value: "ko-KR", label: "한국어", flag: "🇰🇷", flagCode: "kr" },
  { value: "ro-RO", label: "Română", flag: "🇷🇴", flagCode: "ro" },
  { value: "ar-SA", label: "العربية", flag: "🇸🇦", flagCode: "sa" },
];

export const APPLICATION_LANGUAGE_OPTIONS = Object.freeze(
  LANGUAGE_OPTIONS.filter((option) => SUPPORTED_LOCALES.includes(option.value)),
);

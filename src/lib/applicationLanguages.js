import flagChina from "../assets/flags/cn.svg";
import flagJapan from "../assets/flags/jp.svg";
import flagKorea from "../assets/flags/kr.svg";
import flagRussia from "../assets/flags/ru.svg";
import flagUnitedStates from "../assets/flags/us.svg";
import { SUPPORTED_LOCALES } from "../i18n/index.js";

const LANGUAGE_OPTIONS = [
  { value: "zh-CN", labelKey: "language.chinese", flag: flagChina },
  { value: "en-US", labelKey: "language.english", flag: flagUnitedStates },
  { value: "ru-RU", labelKey: "language.russian", flag: flagRussia },
  { value: "ko-KR", labelKey: "language.korean", flag: flagKorea },
  { value: "ja-JP", labelKey: "language.japanese", flag: flagJapan },
];

export const APPLICATION_LANGUAGE_OPTIONS = Object.freeze(
  LANGUAGE_OPTIONS.filter((option) => SUPPORTED_LOCALES.includes(option.value)),
);

<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { setApplicationLocale, SUPPORTED_LOCALES } from "../i18n/index.js";
import flagChina from "../assets/flags/cn.svg";
import flagJapan from "../assets/flags/jp.svg";
import flagKorea from "../assets/flags/kr.svg";
import flagRussia from "../assets/flags/ru.svg";
import flagUnitedStates from "../assets/flags/us.svg";

const { locale, t } = useI18n({ useScope: "global" });
const errorMessage = ref("");
const busy = ref(false);

const options = [
  { value: "zh-CN", labelKey: "language.chinese", flag: flagChina },
  { value: "en-US", labelKey: "language.english", flag: flagUnitedStates },
  { value: "ru-RU", labelKey: "language.russian", flag: flagRussia },
  { value: "ko-KR", labelKey: "language.korean", flag: flagKorea },
  { value: "ja-JP", labelKey: "language.japanese", flag: flagJapan },
].filter((option) => SUPPORTED_LOCALES.includes(option.value));

async function selectLanguage(value) {
  if (busy.value || value === locale.value) {
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  try {
    await setApplicationLocale(value);
  } catch (error) {
    errorMessage.value = error?.message || t("language.saveError");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="workspace language-view">
    <div class="page-heading">
      <div>
        <h1>{{ t("language.title") }}</h1>
        <p>{{ t("language.subtitle") }}</p>
      </div>
    </div>

    <section class="language-settings" :aria-label="t('language.title')">
      <div>
        <strong>{{ t("language.current") }}</strong>
        <p>{{ t("language.description") }}</p>
      </div>
      <div class="language-options" role="radiogroup" :aria-label="t('language.title')">
        <label v-for="option in options" :key="option.value" class="language-option">
          <input
            :checked="locale === option.value"
            :disabled="busy"
            :value="option.value"
            name="application-language"
            type="radio"
            @change="selectLanguage(option.value)"
          />
          <img class="language-option-flag" :src="option.flag" alt="" aria-hidden="true" />
          <span>{{ t(option.labelKey) }}</span>
          <small>{{ option.value }}</small>
        </label>
      </div>
      <p v-if="errorMessage" class="error-line">{{ errorMessage }}</p>
    </section>
  </section>
</template>

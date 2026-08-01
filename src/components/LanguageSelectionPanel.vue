<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { setApplicationLocale } from "../i18n/index.js";
import { APPLICATION_LANGUAGE_OPTIONS } from "../lib/applicationLanguages.js";

defineProps({
  compact: {
    type: Boolean,
    default: false,
  },
  showIntro: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["selected"]);
const { locale, t } = useI18n({ useScope: "global" });
const errorMessage = ref("");
const busy = ref(false);

async function selectLanguage(value) {
  if (busy.value || value === locale.value) {
    return;
  }
  busy.value = true;
  errorMessage.value = "";
  try {
    await setApplicationLocale(value);
    emit("selected", value);
  } catch (error) {
    errorMessage.value = error?.message || t("language.saveError");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section
    class="language-settings language-selection-panel"
    :class="{ compact }"
    :aria-label="t('language.title')"
  >
    <div v-if="showIntro">
      <strong>{{ t("language.current") }}</strong>
      <p>{{ t("language.description") }}</p>
    </div>
    <div class="language-options" role="radiogroup" :aria-label="t('language.title')">
      <label v-for="option in APPLICATION_LANGUAGE_OPTIONS" :key="option.value" class="language-option">
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
    <p v-if="errorMessage" class="error-line" role="alert">{{ errorMessage }}</p>
  </section>
</template>

<script setup>
import { useI18n } from "vue-i18n";
import LanguageSelectionPanel from "../components/LanguageSelectionPanel.vue";

const { t } = useI18n();
</script>

<template>
  <section class="workspace language-view">
    <div class="page-heading">
      <div>
        <h1>{{ t("language.title") }}</h1>
        <p>{{ t("language.subtitle") }}</p>
      </div>
    </div>

    <LanguageSelectionPanel />
  </section>
</template>

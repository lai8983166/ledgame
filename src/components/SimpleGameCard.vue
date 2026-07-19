<script setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });
defineEmits(["open"]);
</script>

<template>
  <button class="game-card" type="button" @click="$emit('open')">
    <div class="game-card-mark" aria-hidden="true"></div>
    <div>
      <h2>simple</h2>
      <p>{{ t("games.simpleDescription") }}</p>
    </div>
  </button>
</template>

<script setup>
import SimpleGameCard from "../components/SimpleGameCard.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });

defineEmits(["open-simple"]);
</script>

<template>
  <section class="workspace game-list-view">
    <div class="page-heading">
      <div>
        <h1>{{ t("games.title") }}</h1>
        <p>{{ t("games.subtitle") }}</p>
      </div>
    </div>

    <div class="game-card-grid">
      <SimpleGameCard @open="$emit('open-simple')" />
    </div>
  </section>
</template>

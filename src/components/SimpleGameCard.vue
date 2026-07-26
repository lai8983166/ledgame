<script setup>
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });
const props = defineProps({
  game: {
    type: Object,
    required: true,
  },
});
const emit = defineEmits(["open-game"]);
</script>

<template>
  <button class="game-card" type="button" @click="emit('open-game', props.game)">
    <div class="game-card-mark" aria-hidden="true"></div>
    <div>
      <h2>{{ game.name }}</h2>
      <p>{{ t(`games.${game.name}Description`) }}</p>
      <small v-if="game.name === 'simple-demo'" class="game-card-badge">{{ t("games.testOnly") }}</small>
    </div>
  </button>
</template>

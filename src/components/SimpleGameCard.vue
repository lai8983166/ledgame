<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { buildMediaPreviewUrl } from "../lib/mediaPreview.js";

const { t } = useI18n({ useScope: "global" });
const props = defineProps({
  game: {
    type: Object,
    required: true,
  },
});
const emit = defineEmits(["open-game", "edit-game"]);
const coverFailed = ref(false);
const coverUrl = computed(() =>
  coverFailed.value ? "" : buildMediaPreviewUrl(props.game.cover),
);

watch(
  () => props.game.cover,
  () => {
    coverFailed.value = false;
  },
);
</script>

<template>
  <article class="game-card">
    <button class="game-card-main" type="button" @click="emit('open-game', props.game)">
      <span class="game-card-cover">
        <img
          v-if="coverUrl"
          :src="coverUrl"
          :alt="t('games.coverAlt', { game: game.name })"
          @error="coverFailed = true"
        />
        <span v-else class="game-card-cover-placeholder">
          <span class="game-card-mark" aria-hidden="true"></span>
          <span>{{ t(coverFailed ? "games.coverUnavailable" : "games.noCover") }}</span>
        </span>
      </span>
      <span class="game-card-copy">
        <h2>{{ game.name }}</h2>
        <small v-if="game.name === 'simple-demo'" class="game-card-badge">
          {{ t("games.testOnly") }}
        </small>
      </span>
    </button>
    <button
      class="game-card-edit"
      type="button"
      :title="t('games.editInfo')"
      :aria-label="t('games.editInfoFor', { game: game.name })"
      @click="emit('edit-game', props.game)"
    >
      &#9998;
    </button>
  </article>
</template>

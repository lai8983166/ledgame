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
  orderBlocked: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dropTarget: { type: Boolean, default: false },
});
const emit = defineEmits(["open-game", "edit-game", "reorder-start", "reorder-over", "reorder-drop", "reorder-end"]);
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
  <article class="game-card" :data-id="game.id" :class="{ 'catalog-dragging': dragging, 'catalog-drop-target': dropTarget }"
    @dragover.prevent="emit('reorder-over', game.id)" @drop.prevent.stop="emit('reorder-drop', game.id)">
    <button class="catalog-drag-handle" type="button" :draggable="!orderBlocked" :disabled="orderBlocked"
      v-bind="{ title: t('management.reorder'), 'aria-label': t('management.reorder') }"
      @click.stop.prevent @dragstart.stop="emit('reorder-start', $event, game.id)" @dragend.stop="emit('reorder-end')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle v-for="n in 6" :key="n" :cx="n % 2 ? 8 : 16" :cy="4 + Math.floor((n - 1) / 2) * 8" r="2" fill="currentColor" /></svg>
    </button>
    <button class="game-card-main" type="button" :disabled="dragging || orderBlocked" @dragstart.prevent @click="emit('open-game', props.game)">
      <span class="game-card-cover">
        <img
          v-if="coverUrl"
          :src="coverUrl"
          :alt="t('games.coverAlt', { game: game.displayName || game.name })"
          @error="coverFailed = true"
        />
        <span v-else class="game-card-cover-placeholder">
          <span class="game-card-mark" aria-hidden="true"></span>
          <span>{{ t(coverFailed ? "games.coverUnavailable" : "games.noCover") }}</span>
        </span>
      </span>
      <span class="game-card-copy">
        <h2>{{ game.displayName || game.name }}</h2>
        <small v-if="game.type === 'rank'" class="game-card-badge">{{ t("rank.typeLabel") }}</small>
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

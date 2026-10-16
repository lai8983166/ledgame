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
const emit = defineEmits(["open-game", "play-game", "export-game", "delete-game", "reorder-start", "reorder-over", "reorder-drop", "reorder-end"]);
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
    <div class="game-card-main" @dragstart.prevent>
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
        <small class="game-card-badge">{{ t(game.type === 'rank' ? 'gameCreation.ranked' : 'gameCreation.entertainment') }}</small>
        <small v-if="game.name === 'simple-demo'" class="game-card-badge">
          {{ t("games.testOnly") }}
        </small>
      </span>
    </div>
    <div class="game-card-actions" @click.stop>
      <button class="game-card-play" type="button" :disabled="dragging || orderBlocked" :aria-label="t('catalogMaintenance.play')" @click.stop="emit('play-game', game)">
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="4"/><path d="M25 18 46 32 25 46Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>
      </button>
      <div class="game-card-action-footer">
        <button type="button" :disabled="dragging || orderBlocked" @click.stop="emit('open-game', game)">{{ t('catalogMaintenance.edit') }}</button>
        <button type="button" :disabled="dragging || orderBlocked" @click.stop="emit('export-game', game)">{{ t('catalogMaintenance.export') }}</button>
        <button type="button" :disabled="dragging || orderBlocked" @click.stop="emit('delete-game', game)">{{ t('catalogMaintenance.delete') }}</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.game-card { position:relative; }
.game-card-actions { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0; pointer-events:none; transition:opacity .15s ease; background:rgba(0,8,18,.48); z-index:2; }
.game-card:hover .game-card-actions, .game-card:focus-within .game-card-actions { opacity:1; pointer-events:auto; }
.game-card-play { width:76px; height:76px; padding:0; color:white; background:none; border:0; cursor:pointer; }
.game-card-play svg { width:100%; height:100%; filter:drop-shadow(0 2px 4px #0008); }
.game-card-action-footer { position:absolute; bottom:0; width:100%; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); background:rgba(0,9,20,.85); }
.game-card-action-footer button { min-height:42px; padding:8px 4px; color:white; border:0; background:none; cursor:pointer; font-size:14px; }
.game-card-action-footer button:hover, .game-card-action-footer button:focus-visible { background:#20c9e333; }
.catalog-drag-handle { z-index:3; }
@media (hover:none) { .game-card-actions { opacity:1; pointer-events:auto; } }
</style>

<script setup>
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { buildMediaPreviewUrl } from "../lib/mediaPreview.js";

const props = defineProps({
  category: { type: Object, required: true },
  orderBlocked: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dropTarget: { type: Boolean, default: false },
});
const emit = defineEmits(["open", "edit", "reorder-start", "reorder-over", "reorder-drop", "reorder-end"]);
const { t } = useI18n({ useScope: "global" });
const coverFailed = ref(false);
const coverUrl = computed(() => coverFailed.value ? "" : buildMediaPreviewUrl(props.category.cover));

watch(() => props.category.cover, () => { coverFailed.value = false; });
</script>

<template>
  <article class="game-category-card" :data-id="category.id" :class="{ 'catalog-dragging': dragging, 'catalog-drop-target': dropTarget }"
    @dragover.prevent="emit('reorder-over', category.id)" @drop.prevent.stop="emit('reorder-drop', category.id)">
    <button class="catalog-drag-handle" type="button" :draggable="!orderBlocked" :disabled="orderBlocked"
      v-bind="{ title: t('management.reorder'), 'aria-label': t('management.reorder') }"
      @click.stop.prevent @dragstart.stop="emit('reorder-start', $event, category.id)" @dragend.stop="emit('reorder-end')">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle v-for="n in 6" :key="n" :cx="n % 2 ? 8 : 16" :cy="4 + Math.floor((n - 1) / 2) * 8" r="2" fill="currentColor" /></svg>
    </button>
    <button class="game-category-card-main" type="button" :disabled="dragging || orderBlocked" @dragstart.prevent @click="emit('open', category)">
      <span class="game-category-card-cover">
        <img v-if="coverUrl" :src="coverUrl" :alt="category.name" @error="coverFailed = true" />
        <span v-else class="game-card-cover-placeholder">
          <span class="game-card-mark" aria-hidden="true"></span>
          <span>{{ t(coverFailed ? "games.coverUnavailable" : "games.noCover") }}</span>
        </span>
      </span>
      <span class="game-category-card-copy">
        <h2>{{ category.name }}</h2>
      </span>
    </button>
    <button
      class="game-category-card-edit"
      type="button"
      v-bind="{ title: t('gameCategories.edit'), 'aria-label': t('gameCategories.editFor', { name: category.name }) }"
      @click="emit('edit', category)"
    >
      &#9998;
    </button>
  </article>
</template>

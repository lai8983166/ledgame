<script setup>
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { buildMediaPreviewUrl } from "../lib/mediaPreview.js";

const props = defineProps({
  category: { type: Object, required: true },
});
const emit = defineEmits(["open", "edit"]);
const { t } = useI18n({ useScope: "global" });
const coverFailed = ref(false);
const coverUrl = computed(() => coverFailed.value ? "" : buildMediaPreviewUrl(props.category.cover));

watch(() => props.category.cover, () => { coverFailed.value = false; });
</script>

<template>
  <article class="game-category-card">
    <button class="game-category-card-main" type="button" @click="emit('open', category)">
      <span class="game-category-card-cover">
        <img v-if="coverUrl" :src="coverUrl" :alt="category.name" @error="coverFailed = true" />
        <span v-else class="game-card-cover-placeholder">
          <span class="game-card-mark" aria-hidden="true"></span>
          <span>{{ t(coverFailed ? "games.coverUnavailable" : "games.noCover") }}</span>
        </span>
      </span>
      <span class="game-category-card-copy">
        <h2>{{ category.name }}</h2>
        <small>{{ t("gameCategories.openHint") }}</small>
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

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { buildMediaPreviewUrl } from "../lib/mediaPreview.js";
import MediaPickerDialog from "./MediaPickerDialog.vue";

const props = defineProps({
  game: { type: Object, required: true },
  cover: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["cancel", "save", "update:cover"]);
const { t } = useI18n({ useScope: "global" });

const dialogRef = ref(null);
const pickerOpen = ref(false);
const previewFailed = ref(false);
const busy = computed(() => props.loading || props.saving);
const previewUrl = computed(() =>
  previewFailed.value ? "" : buildMediaPreviewUrl(props.cover),
);

watch(
  () => props.cover,
  () => {
    previewFailed.value = false;
  },
);

function updateCover(value) {
  previewFailed.value = false;
  emit("update:cover", value || "");
  pickerOpen.value = false;
}

function close() {
  if (!busy.value && !pickerOpen.value) {
    emit("cancel");
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    if (!pickerOpen.value) {
      close();
    }
    return;
  }
  if (event.key !== "Tab" || pickerOpen.value) {
    return;
  }
  const focusable = [
    ...(dialogRef.value?.querySelectorAll("button:not(:disabled)") || []),
  ];
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  nextTick(() => dialogRef.value?.focus());
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="game-info-backdrop" @mousedown.self="close">
    <section
      ref="dialogRef"
      class="game-info-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-info-title"
      tabindex="-1"
    >
      <header class="game-info-header">
        <div>
          <h2 id="game-info-title">{{ t("games.editInfoTitle") }}</h2>
          <p>{{ game.name }}</p>
        </div>
        <button
          class="inline-symbol-button"
          type="button"
          :title="t('common.close')"
          :disabled="busy"
          @click="close"
        >
          ×
        </button>
      </header>

      <div class="game-info-body">
        <span class="game-info-label">{{ t("games.editCover") }}</span>
        <div class="game-info-cover-preview">
          <img
            v-if="previewUrl"
            :src="previewUrl"
            :alt="t('games.coverPreview', { game: game.name })"
            @error="previewFailed = true"
          />
          <span v-else>{{ t(previewFailed ? "games.coverPreviewFailed" : "games.noCover") }}</span>
        </div>
        <p class="game-info-cover-path">{{ cover || t("games.noCoverSelected") }}</p>
        <div class="game-info-cover-actions">
          <button
            class="soft-button"
            type="button"
            :disabled="busy"
            @click="pickerOpen = true"
          >
            {{ t("games.chooseCover") }}
          </button>
          <button
            class="soft-button"
            type="button"
            :disabled="busy || !cover"
            @click="updateCover('')"
          >
            {{ t("games.clearCover") }}
          </button>
        </div>
      </div>

      <p v-if="loading" class="status-line" role="status">{{ t("games.loadingGameInfo") }}</p>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>

      <footer class="game-info-actions">
        <button class="soft-button" type="button" :disabled="busy" @click="close">
          {{ t("common.cancel") }}
        </button>
        <button
          class="action-button primary"
          type="button"
          :disabled="busy"
          @click="emit('save')"
        >
          {{ t(saving ? "games.savingGameInfo" : "common.save") }}
        </button>
      </footer>
    </section>

    <MediaPickerDialog
      v-if="pickerOpen"
      accept="image"
      :current-value="cover"
      :title="t('games.chooseCover')"
      @cancel="pickerOpen = false"
      @select="updateCover"
    />
  </div>
</template>

<style scoped>
.game-info-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 27, 37, 0.56);
}

.game-info-dialog {
  display: grid;
  gap: 16px;
  width: min(480px, 100%);
  max-height: calc(100vh - 40px);
  padding: 22px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 8px;
  background: #eef1f5;
  box-shadow: 0 24px 70px rgba(25, 34, 46, 0.38);
  outline: none;
}

.game-info-header,
.game-info-actions,
.game-info-cover-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.game-info-header h2,
.game-info-header p,
.game-info-cover-path {
  margin: 0;
}

.game-info-header h2 {
  color: #2f3845;
  font-size: 18px;
}

.game-info-header p,
.game-info-cover-path {
  margin-top: 4px;
  color: #76818f;
  font-size: 12px;
}

.game-info-body {
  display: grid;
  justify-items: center;
  gap: 12px;
}

.game-info-label {
  justify-self: start;
  color: #4f5b69;
  font-size: 13px;
  font-weight: 700;
}

.game-info-cover-preview {
  display: grid;
  place-items: center;
  width: 183px;
  height: 308px;
  overflow: hidden;
  border: 1px solid rgba(143, 155, 170, 0.42);
  border-radius: 6px;
  color: #778391;
  background: #dfe5ec;
}

.game-info-cover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.game-info-cover-preview span {
  padding: 16px;
  font-size: 12px;
  text-align: center;
}

.game-info-cover-path {
  width: 100%;
  overflow-wrap: anywhere;
  text-align: center;
}

.game-info-cover-actions {
  justify-content: center;
}

.game-info-actions {
  justify-content: flex-end;
}
</style>

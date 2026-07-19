<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  accept: { type: String, default: "any" }, // 'image' | 'audio' | 'any'
  currentValue: { type: String, default: "" },
  title: { type: String, default: "" },
});
const emit = defineEmits(["cancel", "select"]);
const { t } = useI18n();

const mediaApi = typeof window !== "undefined" ? window.mediaLibrary : null;
const dialogRef = ref(null);
const loading = ref(false);
const loadError = ref("");
const allFiles = ref([]);
const selected = ref(props.currentValue || "");
const preview = ref(null);

const acceptLabel = computed(() => {
  if (props.accept === "audio") return t("mediaPicker.audio");
  if (props.accept === "image") return t("mediaPicker.images");
  return t("mediaPicker.allMedia");
});
const dialogTitle = computed(() => props.title || t("mediaPicker.title"));

function matchesAccept(mediaType) {
  if (props.accept === "image") return mediaType === "image";
  if (props.accept === "audio") return mediaType === "audio";
  return mediaType === "image" || mediaType === "video" || mediaType === "audio";
}

function flatten(nodes, acc = []) {
  for (const node of nodes || []) {
    if (node.kind === "directory") {
      flatten(node.children, acc);
    } else if (node.kind === "file" && matchesAccept(node.mediaType)) {
      acc.push(node);
    }
  }
  return acc;
}

async function loadMedia() {
  if (!mediaApi?.list) {
    loadError.value = t("mediaPicker.unavailable");
    return;
  }
  loading.value = true;
  loadError.value = "";
  try {
    const result = await mediaApi.list();
    allFiles.value = flatten(result?.items || []);
  } catch (error) {
    loadError.value = error?.message || String(error);
  } finally {
    loading.value = false;
  }
}

async function loadPreview(relativePath) {
  if (!relativePath || !mediaApi?.getPreviewUrl) {
    preview.value = null;
    return;
  }
  preview.value = null;
  try {
    const result = await mediaApi.getPreviewUrl(relativePath);
    preview.value = { ...result, name: relativePath.split("/").pop() };
  } catch (error) {
    preview.value = { url: "", mediaType: "error", name: relativePath.split("/").pop(), error: error?.message || String(error) };
  }
}

function selectFile(node) {
  selected.value = node.relativePath;
}

function confirm() {
  if (selected.value) {
    emit("select", selected.value);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    emit("cancel");
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [...(dialogRef.value?.querySelectorAll("button:not(:disabled)") || [])];
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

watch(selected, (value) => loadPreview(value));

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);
  await loadMedia();
  if (selected.value) {
    loadPreview(selected.value);
  }
  nextTick(() => dialogRef.value?.focus());
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="media-picker-backdrop" @mousedown.self="emit('cancel')">
    <section
      ref="dialogRef"
      class="media-picker-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="dialogTitle"
      tabindex="-1"
    >
      <header class="media-picker-header">
        <div>
          <h2>{{ dialogTitle }}</h2>
          <p>{{ t("mediaPicker.count", { type: acceptLabel, count: allFiles.length }) }}</p>
        </div>
        <button class="inline-symbol-button" type="button" :title="t('common.close')" @click="emit('cancel')">×</button>
      </header>

      <div class="media-picker-body">
        <div class="media-picker-list">
          <p v-if="loading" class="media-picker-hint">{{ t("common.loading") }}…</p>
          <p v-else-if="loadError" class="media-picker-hint error">{{ loadError }}</p>
          <p v-else-if="!allFiles.length" class="media-picker-hint">{{ t("mediaPicker.noMatches") }}</p>
          <button
            v-for="file in allFiles"
            :key="file.relativePath"
            type="button"
            class="media-picker-row"
            :class="{ selected: file.relativePath === selected }"
            :title="file.relativePath"
            @click="selectFile(file)"
            @dblclick="selectFile(file), confirm()"
          >
            <span class="media-picker-row-name">{{ file.name }}</span>
            <span class="media-picker-row-path">{{ file.relativePath }}</span>
          </button>
        </div>

        <div class="media-picker-preview">
          <p v-if="!selected" class="media-picker-hint">{{ t("mediaPicker.choosePreview") }}</p>
          <template v-else-if="!preview">{{ t("mediaPicker.loadingPreview") }}…</template>
          <template v-else-if="preview.mediaType === 'image'">
            <img class="media-picker-image" :src="preview.url" :alt="preview.name" />
          </template>
          <template v-else-if="preview.mediaType === 'video'">
            <video class="media-picker-video" :src="preview.url" controls playsinline />
          </template>
          <template v-else-if="preview.mediaType === 'audio'">
            <div class="media-picker-audio">
              <span class="media-picker-audio-name">{{ preview.name }}</span>
              <audio :src="preview.url" controls />
            </div>
          </template>
          <p v-else-if="preview.mediaType === 'error'" class="media-picker-hint error">{{ preview.error }}</p>
        </div>
      </div>

      <footer class="media-picker-actions">
        <button class="soft-button" type="button" @click="emit('cancel')">{{ t("common.cancel") }}</button>
        <button class="action-button primary" type="button" :disabled="!selected" @click="confirm">{{ t("common.confirm") }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.media-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 27, 37, 0.56);
}

.media-picker-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  width: min(900px, 100%);
  height: min(620px, 90vh);
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 8px;
  background: #eef1f5;
  box-shadow: 0 24px 70px rgba(25, 34, 46, 0.38);
  outline: none;
}

.media-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.media-picker-header h2 {
  margin: 0;
  color: #2f3845;
  font-size: 18px;
  font-weight: 680;
}

.media-picker-header p {
  margin: 4px 0 0;
  color: #7c8795;
  font-size: 12px;
}

.media-picker-body {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
}

.media-picker-list {
  display: grid;
  grid-auto-rows: auto;
  gap: 4px;
  align-content: start;
  min-height: 0;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  background: #e6ebf2;
  box-shadow: inset 4px 4px 10px rgba(178, 187, 201, 0.34);
  overflow: auto;
}

.media-picker-row {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.media-picker-row:hover {
  background: rgba(255, 255, 255, 0.6);
}

.media-picker-row.selected {
  background: #f4f7fa;
  box-shadow: 4px 4px 10px rgba(178, 187, 201, 0.3), -4px -4px 10px rgba(255, 255, 255, 0.8);
}

.media-picker-row-name {
  color: #343d4a;
  font-size: 13px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-picker-row-path {
  color: #8a94a2;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-picker-preview {
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 14px;
  background: #070a0f;
  box-shadow: inset 4px 4px 10px rgba(0, 0, 0, 0.4);
  overflow: auto;
  color: #cdd6e0;
}

.media-picker-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.media-picker-video {
  max-width: 100%;
  max-height: 100%;
}

.media-picker-audio {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 18px;
  color: #e6ecf3;
}

.media-picker-audio-name {
  font-size: 13px;
}

.media-picker-hint {
  margin: 0;
  color: #c2cad4;
  font-size: 13px;
}

.media-picker-hint.error {
  color: #e0949b;
}

.media-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

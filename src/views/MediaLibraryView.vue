<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });

const mediaTree = ref([]);
const expandedPaths = ref(new Set());
const selectedPath = ref("");
const preview = ref(null);
const isLoading = ref(false);
const errorMessage = ref("");
const noticeMessage = ref("");
const rootExists = ref(true);
const audioElement = ref(null);

const mediaApi = computed(() => window.mediaLibrary);

const visibleRows = computed(() => {
  const rows = [];

  function visit(nodes, depth) {
    nodes.forEach((node) => {
      rows.push({ node, depth });
      if (node.kind === "directory" && expandedPaths.value.has(node.relativePath)) {
        visit(node.children || [], depth + 1);
      }
    });
  }

  visit(mediaTree.value, 0);
  return rows;
});

const emptyMessage = computed(() => {
  if (!rootExists.value) {
    return t("media.missingRoot");
  }
  return t("media.emptyRoot");
});

function iconFor(node) {
  if (node.kind === "directory") {
    return expandedPaths.value.has(node.relativePath) ? "▾" : "▸";
  }
  if (node.mediaType === "image") {
    return "IMG";
  }
  if (node.mediaType === "video") {
    return "VID";
  }
  if (node.mediaType === "audio") {
    return "AUD";
  }
  return "FILE";
}

function nodeTitle(node) {
  if (node.kind === "directory") {
    return t("media.openFolder");
  }
  if (node.previewable) {
    return t("media.previewFile");
  }
  return t("media.unsupportedTitle");
}

function toggleFolder(node) {
  const next = new Set(expandedPaths.value);
  if (next.has(node.relativePath)) {
    next.delete(node.relativePath);
  } else {
    next.add(node.relativePath);
  }
  expandedPaths.value = next;
}

async function selectNode(node) {
  stopAudioPreview();
  selectedPath.value = node.relativePath;
  noticeMessage.value = "";

  if (node.kind === "directory") {
    toggleFolder(node);
    return;
  }

  if (!node.previewable) {
    preview.value = {
      kind: "unsupported",
      name: node.name,
      relativePath: node.relativePath,
      mediaType: node.mediaType,
    };
    return;
  }

  try {
    const result = await mediaApi.value.getPreviewUrl(node.relativePath);
    preview.value = {
      kind: result.mediaType,
      name: node.name,
      relativePath: node.relativePath,
      url: result.url,
    };
  } catch (error) {
    preview.value = {
      kind: "error",
      name: node.name,
      relativePath: node.relativePath,
      message: error?.message || t("media.openFailed"),
    };
  }
}

async function loadMedia() {
  stopAudioPreview();
  errorMessage.value = "";
  noticeMessage.value = "";
  preview.value = null;

  if (!mediaApi.value?.list || !mediaApi.value?.getPreviewUrl) {
    mediaTree.value = [];
    rootExists.value = false;
    errorMessage.value = t("media.apiUnavailable");
    return;
  }

  isLoading.value = true;
  try {
    const result = await mediaApi.value.list();
    mediaTree.value = Array.isArray(result?.items) ? result.items : [];
    rootExists.value = result?.exists !== false;
    selectedPath.value = "";
    expandedPaths.value = new Set();
    if (mediaTree.value.length > 0) {
      noticeMessage.value = t("media.refreshed");
    }
  } catch (error) {
    mediaTree.value = [];
    rootExists.value = true;
    errorMessage.value = error?.message || t("media.readFailed");
  } finally {
    isLoading.value = false;
  }
}

function stopAudioPreview() {
  const player = audioElement.value;
  if (!player) {
    return;
  }
  player.pause();
  player.removeAttribute("src");
  player.load();
}

function handleAudioError() {
  const current = preview.value;
  if (!current || current.kind !== "audio") {
    return;
  }
  preview.value = {
    ...current,
    kind: "error",
    message: t("media.audioFailed"),
  };
}

onMounted(() => {
  loadMedia();
});

onBeforeUnmount(() => {
  stopAudioPreview();
});
</script>

<template>
  <section class="workspace media-view">
    <div class="page-heading media-heading">
      <div>
        <h1>{{ t("media.title") }}</h1>
        <p>{{ t("media.subtitle") }}</p>
      </div>
      <button class="soft-button media-refresh-button" type="button" :disabled="isLoading" @click="loadMedia">
        {{ isLoading ? t("common.refreshing") : t("common.refresh") }}
      </button>
    </div>

    <div class="media-library-layout">
      <aside class="media-tree-panel" :aria-label="t('media.treeLabel')">
        <div class="media-panel-header">
          <strong>media</strong>
          <span>{{ t("common.itemCount", { count: visibleRows.length }) }}</span>
        </div>

        <div v-if="isLoading" class="media-state-panel">
          <p>{{ t("media.reading") }}</p>
        </div>

        <div v-else-if="errorMessage" class="media-state-panel error">
          <p>{{ errorMessage }}</p>
        </div>

        <div v-else-if="visibleRows.length === 0" class="media-state-panel">
          <p>{{ emptyMessage }}</p>
        </div>

        <div v-else class="media-tree-list">
          <button
            v-for="{ node, depth } in visibleRows"
            :key="node.relativePath"
            class="media-tree-row"
            :class="{
              selected: selectedPath === node.relativePath,
              directory: node.kind === 'directory',
              unsupported: node.kind === 'file' && !node.previewable,
            }"
            type="button"
            :title="nodeTitle(node)"
            :style="{ paddingLeft: `${12 + depth * 18}px` }"
            @click="selectNode(node)"
          >
            <span class="media-row-icon" :class="node.mediaType">{{ iconFor(node) }}</span>
            <span class="media-row-name">{{ node.name }}</span>
          </button>
        </div>
      </aside>

      <section class="media-preview-panel" :aria-label="t('media.previewLabel')">
        <div v-if="!preview" class="media-preview-empty">
          <div class="empty-glyph" aria-hidden="true"></div>
          <p>{{ t("media.choosePreview") }}</p>
          <span v-if="noticeMessage">{{ noticeMessage }}</span>
        </div>

        <div v-else class="media-preview-content">
          <div class="media-preview-header">
            <div>
              <h2>{{ preview.name }}</h2>
              <p>{{ preview.relativePath }}</p>
            </div>
          </div>

          <div v-if="preview.kind === 'image'" class="media-preview-stage">
            <img :src="preview.url" :alt="preview.name" />
          </div>

          <div v-else-if="preview.kind === 'video'" class="media-preview-stage video">
            <video :src="preview.url" controls playsinline />
          </div>

          <div v-else-if="preview.kind === 'audio'" class="media-preview-stage audio">
            <div class="media-audio-player">
              <strong>{{ preview.name }}</strong>
              <audio
                ref="audioElement"
                :src="preview.url"
                controls
                preload="metadata"
                @error="handleAudioError"
              ></audio>
            </div>
          </div>

          <div v-else-if="preview.kind === 'unsupported'" class="media-preview-message">
            <strong>{{ t("media.unsupported") }}</strong>
            <p>{{ t("media.unsupportedBody") }}</p>
          </div>

          <div v-else class="media-preview-message error">
            <strong>{{ t("media.previewFailed") }}</strong>
            <p>{{ preview.message }}</p>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

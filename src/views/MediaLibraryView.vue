<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { createLatestAsyncValueLoader } from "../lib/latestAsyncTask.js";

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
const isOpeningFolder = ref(false);
const targetFolder = ref('');
const isWriting = ref(false);
const folderDialogOpen = ref(false);
const folderName = ref('');
const folderError = ref('');
const folderInput = ref(null);
let folderTrigger;
let mounted = false;
const mediaApi = computed(() => window.mediaLibrary);
const previewLoader = createLatestAsyncValueLoader({
  loadValue: (relativePath) => mediaApi.value.getPreviewUrl(relativePath),
  isActive: () => mounted,
  getCurrentKey: () => selectedPath.value,
  onSuccess(result, _relativePath, node) {
    preview.value = {
      kind: result.mediaType,
      name: node.name,
      relativePath: node.relativePath,
      url: result.url,
    };
  },
  onError(error, _relativePath, node) {
    preview.value = {
      kind: "error",
      name: node.name,
      relativePath: node.relativePath,
      message: error?.message || t("media.openFailed"),
    };
  },
});

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
  previewLoader.invalidate();
  preview.value = null;
  selectedPath.value = node.relativePath;
  targetFolder.value = node.kind === 'directory' ? node.relativePath : node.relativePath.split('/').slice(0, -1).join('/');
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

  await previewLoader.load(node.relativePath, node);
}

async function loadMedia() {
  stopAudioPreview();
  previewLoader.invalidate();
  errorMessage.value = "";
  noticeMessage.value = "";
  preview.value = null;
  selectedPath.value = "";

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
    if (targetFolder.value && !findFolder(mediaTree.value, targetFolder.value)) targetFolder.value = '';
  } catch (error) {
    mediaTree.value = [];
    rootExists.value = true;
    errorMessage.value = error?.message || t("media.readFailed");
  } finally {
    isLoading.value = false;
  }
}

function findFolder(nodes, relativePath) {
  for (const node of nodes) {
    if (node.kind !== 'directory') continue;
    if (node.relativePath === relativePath || findFolder(node.children || [], relativePath)) return true;
  }
  return false;
}

function expandFolder(relativePath) {
  const next = new Set(expandedPaths.value);
  const parts = relativePath.split('/');
  for (let index = 1; index <= parts.length; index++) next.add(parts.slice(0, index).join('/'));
  expandedPaths.value = next;
}

async function uploadMedia() {
  if (isWriting.value || isLoading.value) return;
  errorMessage.value = ''; noticeMessage.value = '';
  if (!mediaApi.value?.upload) { errorMessage.value = t('media.apiUnavailable'); return; }
  const folder = targetFolder.value;
  isWriting.value = true;
  try {
    const result = await mediaApi.value.upload(folder);
    if (result?.canceled) return;
    expandFolder(folder);
    await loadMedia();
    noticeMessage.value = t('mediaImport.uploaded', { count:result?.imported?.length || 0 });
    if (result?.failures?.length) errorMessage.value = result.failures.map(item => `${item.name}：${item.message}`).join('\n');
  } catch (error) { errorMessage.value = error?.message || t('mediaImport.failed'); }
  finally { isWriting.value = false; }
}

function openFolderDialog() {
  folderTrigger = document.activeElement;
  folderName.value = ''; folderError.value = ''; folderDialogOpen.value = true;
  nextTick(() => folderInput.value?.focus());
}
function closeFolderDialog() {
  if (isWriting.value) return;
  folderDialogOpen.value = false;
  nextTick(() => folderTrigger?.focus?.());
}
function handleFolderKey(event) {
  if (event.key === 'Escape') { event.stopPropagation(); closeFolderDialog(); }
  if (event.key !== 'Tab') return;
  const nodes = [...event.currentTarget.querySelectorAll('input:not(:disabled),button:not(:disabled)')];
  if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
  else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
}
async function createFolder() {
  if (isWriting.value) return;
  if (!folderName.value.trim()) { folderError.value = t('mediaImport.nameRequired'); return; }
  if (!mediaApi.value?.createFolder) { folderError.value = t('media.apiUnavailable'); return; }
  isWriting.value = true; folderError.value = '';
  try {
    const result = await mediaApi.value.createFolder(targetFolder.value, folderName.value.trim());
    targetFolder.value = result.relativePath;
    expandFolder(targetFolder.value);
    await loadMedia();
    noticeMessage.value = t('mediaImport.folderCreated');
    isWriting.value = false;
    closeFolderDialog();
  } catch (error) { folderError.value = error?.message || t('mediaImport.folderFailed'); }
  finally { isWriting.value = false; }
}

async function openMediaFolder() {
  if (isOpeningFolder.value) {
    return;
  }
  errorMessage.value = "";
  noticeMessage.value = "";
  if (!mediaApi.value?.openFolder) {
    errorMessage.value = t("media.apiUnavailable");
    return;
  }

  isOpeningFolder.value = true;
  try {
    await mediaApi.value.openFolder();
    noticeMessage.value = t("media.folderOpened");
  } catch (error) {
    errorMessage.value = error?.message || t("media.openFolderFailed");
  } finally {
    isOpeningFolder.value = false;
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
  mounted = true;
  loadMedia();
});

onBeforeUnmount(() => {
  stopAudioPreview();
  mounted = false;
  previewLoader.invalidate();
});
</script>

<template>
  <section class="workspace media-view">
    <div class="page-heading media-heading">
      <div>
        <h1>{{ t("media.title") }}</h1>
      </div>
      <div class="media-heading-actions">
        <button class="action-button primary media-upload-button" type="button" :disabled="isWriting || isLoading" @click="uploadMedia">{{ t(isWriting ? 'common.loading' : 'mediaImport.upload') }}</button>
        <button class="soft-button" type="button" :disabled="isWriting || isLoading" @click="openFolderDialog">{{ t('mediaImport.newFolder') }}</button>
        <button class="soft-button media-open-folder-button" type="button" :disabled="isOpeningFolder" @click="openMediaFolder">
          {{ isOpeningFolder ? t("media.openingFolder") : t("media.openFolder") }}
        </button>
        <button class="soft-button media-refresh-button" type="button" :disabled="isLoading || isWriting" @click="loadMedia">
          {{ isLoading ? t("common.refreshing") : t("common.refresh") }}
        </button>
      </div>
    </div>

    <div class="media-upload-target">
      <span>{{ t('mediaImport.target', { folder:targetFolder || t('mediaImport.root') }) }}</span>
      <button v-if="targetFolder" class="soft-button" type="button" :disabled="isWriting" @click="targetFolder = ''">{{ t('mediaImport.root') }}</button>
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
            :disabled="isWriting"
            :title="nodeTitle(node)"
            :style="{ paddingLeft: `${12 + depth * 18}px` }"
            @click="selectNode(node)"
          >
            <template v-if="node.kind === 'directory'">
              <span class="media-folder-chevron" aria-hidden="true">{{ expandedPaths.has(node.relativePath) ? '▾' : '▸' }}</span>
              <svg class="media-folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h6l2 2h10v11H3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M3 6V4h6l2 2h8v2" fill="none" stroke="currentColor" stroke-width="1.7" /></svg>
            </template>
            <span v-else class="media-row-icon" :class="node.mediaType">{{ iconFor(node) }}</span>
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
    <div v-if="folderDialogOpen" class="media-folder-backdrop" @mousedown.self="closeFolderDialog">
      <form class="media-folder-dialog" role="dialog" aria-modal="true" :aria-label="t('mediaImport.newFolder')" @submit.prevent="createFolder" @keydown="handleFolderKey">
        <h2>{{ t('mediaImport.newFolder') }}</h2>
        <p>{{ t('mediaImport.target', { folder:targetFolder || t('mediaImport.root') }) }}</p>
        <label>{{ t('mediaImport.folderName') }}<input ref="folderInput" v-model="folderName" maxlength="120" :disabled="isWriting" /></label>
        <p v-if="folderError" class="error-line" role="alert">{{ folderError }}</p>
        <footer>
          <button class="soft-button" type="button" :disabled="isWriting" @click="closeFolderDialog">{{ t('common.cancel') }}</button>
          <button class="action-button primary" type="submit" :disabled="isWriting">{{ t(isWriting ? 'common.loading' : 'common.confirm') }}</button>
        </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.media-upload-target { display:flex; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px; color:var(--ui-muted); overflow-wrap:anywhere; }
.media-folder-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); }
.media-folder-dialog { width:min(440px,100%); padding:24px; border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); background:var(--ui-elevated); box-shadow:var(--ui-shadow); }
.media-folder-dialog h2 { margin:0 0 12px; }
.media-folder-dialog label { display:grid; gap:8px; }
.media-folder-dialog input { width:100%; box-sizing:border-box; }
.media-folder-dialog footer { display:flex; justify-content:flex-end; gap:12px; margin-top:20px; }
</style>

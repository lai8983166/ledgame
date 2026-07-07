<script setup>
import { computed, onMounted, ref } from "vue";

const mediaTree = ref([]);
const expandedPaths = ref(new Set());
const selectedPath = ref("");
const preview = ref(null);
const isLoading = ref(false);
const errorMessage = ref("");
const noticeMessage = ref("");
const rootExists = ref(true);

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
    return "项目目录下还没有 media 文件夹";
  }
  return "media 目录中暂无可展示内容";
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
  return "FILE";
}

function nodeTitle(node) {
  if (node.kind === "directory") {
    return "打开文件夹";
  }
  if (node.previewable) {
    return "预览文件";
  }
  return "该文件暂不支持预览";
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
      message: error?.message || "无法打开该媒体文件",
    };
  }
}

async function loadMedia() {
  errorMessage.value = "";
  noticeMessage.value = "";
  preview.value = null;

  if (!mediaApi.value?.list || !mediaApi.value?.getPreviewUrl) {
    mediaTree.value = [];
    rootExists.value = false;
    errorMessage.value = "当前运行环境未提供媒体库接口";
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
      noticeMessage.value = "媒体列表已刷新";
    }
  } catch (error) {
    mediaTree.value = [];
    rootExists.value = true;
    errorMessage.value = error?.message || "读取媒体库失败";
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadMedia();
});
</script>

<template>
  <section class="workspace media-view">
    <div class="page-heading media-heading">
      <div>
        <h1>媒体库</h1>
        <p>Media Library</p>
      </div>
      <button class="soft-button media-refresh-button" type="button" :disabled="isLoading" @click="loadMedia">
        {{ isLoading ? "刷新中" : "刷新" }}
      </button>
    </div>

    <div class="media-library-layout">
      <aside class="media-tree-panel" aria-label="media file tree">
        <div class="media-panel-header">
          <strong>media</strong>
          <span>{{ visibleRows.length }} 项</span>
        </div>

        <div v-if="isLoading" class="media-state-panel">
          <p>正在读取媒体目录</p>
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

      <section class="media-preview-panel" aria-label="media preview">
        <div v-if="!preview" class="media-preview-empty">
          <div class="empty-glyph" aria-hidden="true"></div>
          <p>选择图片、GIF 或视频进行预览</p>
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

          <div v-else-if="preview.kind === 'unsupported'" class="media-preview-message">
            <strong>暂不支持预览</strong>
            <p>当前文件类型不能在媒体库中直接打开。</p>
          </div>

          <div v-else class="media-preview-message error">
            <strong>无法打开预览</strong>
            <p>{{ preview.message }}</p>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

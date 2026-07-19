<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SpiritPointEditorDialog from "../components/SpiritPointEditorDialog.vue";

const DEFAULT_PREVIEW_GAP = 2;
const { t } = useI18n();

const spirits = ref([]);
const selectedSpiritId = ref("");
const isLoading = ref(false);
const errorMessage = ref("");
const noticeMessage = ref("");
const editingSpirit = ref(null);
const creatingSpirit = ref(false);
const isSavingSpirit = ref(false);
const editErrorMessage = ref("");
const previewStageRef = ref(null);
const previewStageSize = ref({ width: 0, height: 0 });
let previewResizeObserver = null;

const spiritApi = computed(() => window.spiritLibrary);

const sortedSpirits = computed(() =>
  [...spirits.value].sort((left, right) =>
    String(left.name || left.id || "").localeCompare(String(right.name || right.id || ""), undefined, {
      sensitivity: "base",
    }),
  ),
);
const selectedSpirit = computed(() => {
  if (sortedSpirits.value.length === 0) {
    return null;
  }
  return (
    sortedSpirits.value.find((spirit) => spirit.id === selectedSpiritId.value) ||
    sortedSpirits.value[0]
  );
});
const previewPoints = computed(() => parsePoints(selectedSpirit.value?.points));
const previewWidth = computed(() =>
  Math.max(
    1,
    Number(selectedSpirit.value?.width) || inferPointExtent(previewPoints.value, 0),
  ),
);
const previewHeight = computed(() =>
  Math.max(
    1,
    Number(selectedSpirit.value?.height) || inferPointExtent(previewPoints.value, 1),
  ),
);
const previewPointSet = computed(
  () => new Set(previewPoints.value.map((point) => `${point.x}:${point.y}`)),
);
const previewCells = computed(() => {
  const cells = [];
  for (let y = 0; y < previewHeight.value; y += 1) {
    for (let x = 0; x < previewWidth.value; x += 1) {
      cells.push({
        key: `${x}:${y}`,
        active: previewPointSet.value.has(`${x}:${y}`),
      });
    }
  }
  return cells;
});
const previewCellGap = computed(() => {
  const availableSide = Math.min(previewStageSize.value.width, previewStageSize.value.height);
  const maxGapCount = Math.max(previewWidth.value - 1, previewHeight.value - 1, 0);
  if (availableSide <= 0 || maxGapCount <= 0) {
    return DEFAULT_PREVIEW_GAP;
  }
  return Math.min(DEFAULT_PREVIEW_GAP, (availableSide * 0.16) / maxGapCount);
});
const previewCellSize = computed(() => {
  const stageWidth = previewStageSize.value.width;
  const stageHeight = previewStageSize.value.height;
  const gap = previewCellGap.value;
  if (stageWidth <= 0 || stageHeight <= 0) {
    return 1;
  }
  const usableWidth = stageWidth - gap * Math.max(0, previewWidth.value - 1);
  const usableHeight = stageHeight - gap * Math.max(0, previewHeight.value - 1);
  return Math.max(0, Math.min(usableWidth / previewWidth.value, usableHeight / previewHeight.value));
});
const previewMatrixWidth = computed(
  () => previewWidth.value * previewCellSize.value + Math.max(0, previewWidth.value - 1) * previewCellGap.value,
);
const previewMatrixHeight = computed(
  () => previewHeight.value * previewCellSize.value + Math.max(0, previewHeight.value - 1) * previewCellGap.value,
);

function colorLabel(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return `Color ${value}`;
}

function sizeLabel(spirit) {
  const width = Number(spirit?.width);
  const height = Number(spirit?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return "-";
  }
  return `${width} x ${height}`;
}

function pointsSummary(points) {
  if (!points) {
    return t("spirits.noPointData");
  }
  const normalized = String(points).replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) {
    return normalized;
  }
  return `${normalized.slice(0, 96)}...`;
}

function spiritName(spirit) {
  return spirit?.name || spirit?.id || t("spirits.unnamed");
}

function selectSpirit(spirit) {
  selectedSpiritId.value = spirit?.id || "";
}

function openSpiritEditor() {
  if (!selectedSpirit.value) {
    return;
  }
  editErrorMessage.value = "";
  creatingSpirit.value = false;
  editingSpirit.value = { ...selectedSpirit.value };
}

function openSpiritCreator() {
  editErrorMessage.value = "";
  creatingSpirit.value = true;
  editingSpirit.value = {
    id: "",
    name: "",
    color: 0,
    width: 16,
    height: 16,
    points: "[]",
    basic: false,
  };
}

function closeSpiritEditor() {
  if (!isSavingSpirit.value) {
    editingSpirit.value = null;
    creatingSpirit.value = false;
    editErrorMessage.value = "";
  }
}

async function saveSpirit(payload) {
  const saveRequest = creatingSpirit.value ? spiritApi.value?.create : spiritApi.value?.update;
  if (!editingSpirit.value || !saveRequest) {
    editErrorMessage.value = t(
      creatingSpirit.value ? "spirits.createApiUnavailable" : "spirits.updateApiUnavailable",
    );
    return;
  }
  isSavingSpirit.value = true;
  editErrorMessage.value = "";
  try {
    const result = creatingSpirit.value
      ? await saveRequest(payload)
      : await saveRequest(editingSpirit.value.id, payload);
    const updated = result?.data;
    if (!updated?.id) {
      throw new Error(t("spirits.invalidSaveResponse"));
    }
    const index = spirits.value.findIndex((spirit) => spirit.id === updated.id);
    if (index >= 0) {
      spirits.value.splice(index, 1, updated);
    } else {
      spirits.value.push(updated);
    }
    selectedSpiritId.value = updated.id;
    editingSpirit.value = null;
    creatingSpirit.value = false;
    noticeMessage.value = t(index >= 0 ? "spirits.saved" : "spirits.created", {
      name: spiritName(updated),
    });
  } catch (error) {
    editErrorMessage.value = error?.message || t("spirits.saveFailed");
  } finally {
    isSavingSpirit.value = false;
  }
}

function parsePoints(points) {
  if (!points) {
    return [];
  }
  try {
    const parsed = JSON.parse(points);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => ({
        x: Number(point[0]),
        y: Number(point[1]),
      }))
      .filter((point) => Number.isInteger(point.x) && Number.isInteger(point.y));
  } catch (_error) {
    return [];
  }
}

function inferPointExtent(points, axisIndex) {
  if (points.length === 0) {
    return 1;
  }
  const values = points.map((point) => (axisIndex === 0 ? point.x : point.y));
  return Math.max(...values, 0) + 1;
}

function observePreviewStage(element) {
  previewResizeObserver?.disconnect();
  previewResizeObserver = null;
  previewStageSize.value = { width: 0, height: 0 };

  if (!element) {
    return;
  }

  previewResizeObserver = new ResizeObserver(([entry]) => {
    previewStageSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    };
  });
  previewResizeObserver.observe(element);
}

async function loadSpirits() {
  errorMessage.value = "";
  noticeMessage.value = "";

  if (!spiritApi.value?.list) {
    spirits.value = [];
    errorMessage.value = t("spirits.apiUnavailable");
    return;
  }

  isLoading.value = true;
  try {
    const result = await spiritApi.value.list();
    spirits.value = Array.isArray(result?.data) ? result.data : [];
    if (!spirits.value.some((spirit) => spirit.id === selectedSpiritId.value)) {
      selectedSpiritId.value = sortedSpirits.value[0]?.id || "";
    }
    if (spirits.value.length > 0) {
      noticeMessage.value = t("spirits.refreshed");
    }
  } catch (error) {
    spirits.value = [];
    errorMessage.value = error?.message || t("spirits.readFailed");
  } finally {
    isLoading.value = false;
  }
}

watch(previewStageRef, observePreviewStage, { flush: "post" });

onMounted(() => {
  loadSpirits();
});

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect();
});
</script>

<template>
  <section class="workspace spirit-library-view">
    <div class="page-heading spirit-heading">
      <div>
        <h1>{{ t("spirits.title") }}</h1>
        <p>Spirit Library</p>
      </div>
      <div class="spirit-heading-actions">
        <button class="icon-add-button" type="button" :title="t('spirits.add')" @click="openSpiritCreator">+</button>
        <button class="soft-button spirit-refresh-button" type="button" :disabled="isLoading" @click="loadSpirits">
          {{ t(isLoading ? "common.refreshing" : "common.refresh") }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="spirit-state-panel">
      <p>{{ t("spirits.reading") }}</p>
    </div>

    <div v-else-if="errorMessage" class="spirit-state-panel error">
      <p>{{ errorMessage }}</p>
    </div>

    <div v-else-if="sortedSpirits.length === 0" class="spirit-state-panel">
      <p>{{ t("spirits.empty") }}</p>
    </div>

    <section v-else class="spirit-library-layout">
      <aside class="spirit-list-panel" aria-label="spirit list">
        <div class="spirit-panel-header">
          <strong>{{ t("spirits.templates") }}</strong>
          <span>{{ t("common.itemCount", { count: sortedSpirits.length }) }}</span>
        </div>

        <div class="spirit-list">
          <button
            v-for="spirit in sortedSpirits"
            :key="spirit.id"
            class="spirit-list-row"
            :class="{ selected: selectedSpirit?.id === spirit.id }"
            type="button"
            @click="selectSpirit(spirit)"
          >
            <span>{{ spiritName(spirit) }}</span>
            <small>{{ sizeLabel(spirit) }}</small>
          </button>
        </div>
      </aside>

      <section class="spirit-preview-panel" aria-label="spirit preview">
        <div v-if="selectedSpirit" class="spirit-preview-content">
          <div class="spirit-preview-header">
            <div>
              <h2>{{ spiritName(selectedSpirit) }}</h2>
              <p>{{ selectedSpirit.id }}</p>
            </div>
            <div class="spirit-preview-actions">
              <span class="spirit-badge" :class="{ basic: selectedSpirit.basic }">
                {{ t(selectedSpirit.basic ? "spirits.basic" : "spirits.custom") }}
              </span>
              <button class="soft-button" type="button" @click="openSpiritEditor">{{ t("spirits.edit") }}</button>
            </div>
          </div>

          <div class="spirit-preview-body">
            <div ref="previewStageRef" class="spirit-preview-stage">
              <div
                class="spirit-matrix-preview"
                :style="{
                  width: `${previewMatrixWidth}px`,
                  height: `${previewMatrixHeight}px`,
                  gridTemplateColumns: `repeat(${previewWidth}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${previewHeight}, minmax(0, 1fr))`,
                  gap: `${previewCellGap}px`,
                }"
              >
                <span
                  v-for="cell in previewCells"
                  :key="cell.key"
                  class="spirit-preview-cell"
                  :class="{ active: cell.active }"
                ></span>
              </div>
            </div>

            <dl class="spirit-meta">
              <div>
                <dt>{{ t("spirits.color") }}</dt>
                <dd>{{ colorLabel(selectedSpirit.color) }}</dd>
              </div>
              <div>
                <dt>{{ t("spirits.size") }}</dt>
                <dd>{{ sizeLabel(selectedSpirit) }}</dd>
              </div>
              <div>
                <dt>{{ t("spirits.points") }}</dt>
                <dd>{{ previewPoints.length }}</dd>
              </div>
            </dl>

            <p class="spirit-points" :title="selectedSpirit.points || ''">
              {{ pointsSummary(selectedSpirit.points) }}
            </p>
          </div>
        </div>
      </section>
    </section>

    <p v-if="noticeMessage && !errorMessage" class="status-line">{{ noticeMessage }}</p>

    <SpiritPointEditorDialog
      v-if="editingSpirit"
      :spirit="editingSpirit"
      :creating="creatingSpirit"
      :saving="isSavingSpirit"
      :error="editErrorMessage"
      @cancel="closeSpiritEditor"
      @save="saveSpirit"
    />
  </section>
</template>

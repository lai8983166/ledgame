<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MediaPickerDialog from "./MediaPickerDialog.vue";

const props = defineProps({
  config: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["cancel", "save"]);

const dialogRef = ref(null);
const draft = ref({});
const picker = ref(null); // { path, accept, title } when a media picker is open
const audioPlayer = ref(null); // { name, url } when the audio player modal is open

const sections = [
  {
    title: "基本信息",
    columns: 1,
    fields: [
      { label: "游戏封面", path: "cover", kind: "media", accept: "image" },
      { label: "类型", path: "type", kind: "text" },
      { label: "模式", path: "mode", kind: "text" },
      { label: "名称", path: "name", kind: "text" },
      { label: "一级菜单", path: "firstCatalog", kind: "text" },
    ],
  },
  {
    title: "全局时间限制",
    fields: [
      { label: "启用全局时间限制", path: "globalTimeLimit", kind: "checkbox" },
      { label: "时间限制（秒）", path: "globalTimeLimitValue", kind: "number" },
    ],
  },
  {
    title: "音效",
    fields: [
      { label: "空闲状态背景音乐", path: "audio.globalBackgroundSound", kind: "media", accept: "audio" },
      { label: "得分音效", path: "audio.scoreSound", kind: "media", accept: "audio" },
      { label: "受伤音效", path: "audio.injurySound", kind: "media", accept: "audio" },
      { label: "double 音效", path: "audio.purpleSound", kind: "media", accept: "audio" },
    ],
  },
  {
    title: "语音",
    fields: [
      { label: "游戏开始语音", path: "commonConfig.gameStartAudio", kind: "media", accept: "audio" },
      { label: "游戏成功语音", path: "commonConfig.gameEndSuccessAudio", kind: "media", accept: "audio" },
      { label: "游戏失败语音", path: "commonConfig.gameEndFailAudio", kind: "media", accept: "audio" },
      { label: "关卡通过语音", path: "commonConfig.levelPassAudio", kind: "media", accept: "audio" },
      { label: "关卡重启语音", path: "commonConfig.levelRestartAudio", kind: "media", accept: "audio" },
    ],
  },
  {
    title: "动画",
    columns: 3,
    fields: [
      { label: "待机动画", path: "gif.standby", kind: "media", accept: "image" },
      { label: "关卡结算动画", path: "gif.levelSettlement", kind: "media", accept: "image" },
      { label: "关卡失败动画", path: "gif.levelFailure", kind: "media", accept: "image" },
      { label: "游戏失败动画", path: "gif.gameFailure", kind: "media", accept: "image" },
      { label: "游戏完成动画", path: "gif.gameOver", kind: "media", accept: "image" },
    ],
  },
];

function gridStyle(section) {
  const columns = Number(section?.columns) > 0 ? section.columns : 2;
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
}

function getPath(path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), draft.value);
}
function setPath(path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((acc, key) => {
    if (acc[key] == null || typeof acc[key] !== "object") {
      acc[key] = {};
    }
    return acc[key];
  }, draft.value);
  target[last] = value;
}

function resetDraft() {
  const source = props.config || {};
  draft.value = {
    cover: source.cover ?? "",
    type: source.type ?? "",
    mode: source.mode ?? "",
    name: source.name ?? "",
    firstCatalog: source.firstCatalog ?? "",
    globalTimeLimit: Boolean(source.globalTimeLimit),
    globalTimeLimitValue: source.globalTimeLimitValue ?? 0,
    audio: { ...(source.audio || {}) },
    gif: { ...(source.gif || {}) },
    commonConfig: { ...(source.commonConfig || {}) },
  };
}

function openPicker(field) {
  if (props.saving) {
    return;
  }
  picker.value = { path: field.path, accept: field.accept, title: field.label };
}

function applyPickerValue(relativePath) {
  if (picker.value) {
    setPath(picker.value.path, relativePath);
  }
  picker.value = null;
}

function clearMedia(field) {
  setPath(field.path, "");
}

function buildMediaPreviewUrl(relativePath) {
  if (!relativePath) {
    return "";
  }
  return `led-media://preview/${relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function openAudioPlayer(field) {
  const value = getPath(field.path);
  if (!value || props.saving) {
    return;
  }
  audioPlayer.value = { name: value.split("/").pop(), label: field.label, url: buildMediaPreviewUrl(value) };
}

function handleSave() {
  if (props.saving) {
    return;
  }
  emit("save", JSON.parse(JSON.stringify(draft.value)));
}

const canSave = computed(() => !props.saving);

function handleKeydown(event) {
  if (event.key === "Escape") {
    // Let the nested media picker handle Escape when it is open.
    if (picker.value) {
      return;
    }
    if (audioPlayer.value) {
      audioPlayer.value = null;
      return;
    }
    if (!props.saving) {
      emit("cancel");
    }
    return;
  }
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [...(dialogRef.value?.querySelectorAll("button:not(:disabled), input:not(:disabled)") || [])];
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

watch(() => props.config, resetDraft, { immediate: true });

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  nextTick(() => dialogRef.value?.focus());
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <div class="global-config-backdrop" @mousedown.self="!saving && !picker && emit('cancel')">
    <section
      ref="dialogRef"
      class="global-config-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-config-title"
      tabindex="-1"
    >
      <header class="global-config-header">
        <div>
          <h2 id="global-config-title">全局配置</h2>
          <p>游戏级封面、时间限制、音频与动画</p>
        </div>
        <button class="inline-symbol-button" type="button" title="关闭" :disabled="saving" @click="emit('cancel')">×</button>
      </header>

      <div class="global-config-body">
        <section v-for="section in sections" :key="section.title" class="global-config-section">
          <h3>{{ section.title }}</h3>
          <div class="global-config-fields" :style="gridStyle(section)">
            <label
              v-for="field in section.fields"
              :key="field.path"
              class="global-config-field"
            >
              <span class="global-config-label">{{ field.label }}</span>

              <input
                v-if="field.kind === 'text'"
                type="text"
                :value="getPath(field.path)"
                :disabled="saving"
                @input="setPath(field.path, $event.target.value)"
              />

              <input
                v-else-if="field.kind === 'number'"
                type="number"
                min="0"
                :value="getPath(field.path)"
                :disabled="saving"
                @input="setPath(field.path, Number($event.target.value))"
              />

              <label v-else-if="field.kind === 'checkbox'" class="global-config-checkbox">
                <input
                  type="checkbox"
                  :checked="Boolean(getPath(field.path))"
                  :disabled="saving"
                  @change="setPath(field.path, $event.target.checked)"
                />
                <span>{{ getPath(field.path) ? '已启用' : '未启用' }}</span>
              </label>

              <template v-else-if="field.kind === 'media'">
                <div class="global-config-media">
                  <input
                    type="text"
                    class="global-config-media-value"
                    :value="getPath(field.path) || ''"
                    placeholder="未选择"
                    readonly
                    :disabled="saving"
                  />
                  <button class="soft-button compact-button" type="button" :disabled="saving" @click="openPicker(field)">选择</button>
                  <button
                    class="soft-button compact-button"
                    type="button"
                    :disabled="saving || !getPath(field.path)"
                    title="清除"
                    @click="clearMedia(field)"
                  >清除</button>
                  <button
                    v-if="field.accept === 'audio'"
                    class="soft-button compact-button"
                    type="button"
                    title="试听"
                    :disabled="saving || !getPath(field.path)"
                    @click="openAudioPlayer(field)"
                  >▶ 试听</button>
                </div>
                <div v-if="field.accept === 'image' && field.path === 'cover'" class="global-config-cover-preview">
                  <img v-if="getPath(field.path)" :src="buildMediaPreviewUrl(getPath(field.path))" :alt="getPath(field.path)" />
                  <span v-else class="global-config-inline-preview-placeholder">未选择</span>
                </div>
                <div v-else-if="field.accept === 'image'" class="global-config-inline-preview">
                  <img v-if="getPath(field.path)" :src="buildMediaPreviewUrl(getPath(field.path))" :alt="getPath(field.path)" />
                  <span v-else class="global-config-inline-preview-placeholder">未选择</span>
                </div>
              </template>
            </label>
          </div>
        </section>
      </div>

      <p v-if="error" class="global-config-error">{{ error }}</p>

      <footer class="global-config-actions">
        <button class="soft-button" type="button" :disabled="saving" @click="emit('cancel')">取消</button>
        <button class="action-button primary" type="button" :disabled="!canSave" @click="handleSave">
          {{ saving ? "保存中" : "保存" }}
        </button>
      </footer>
    </section>

    <MediaPickerDialog
      v-if="picker"
      :accept="picker.accept"
      :current-value="getPath(picker.path) || ''"
      :title="picker.title"
      @cancel="picker = null"
      @select="applyPickerValue"
    />

    <div v-if="audioPlayer" class="audio-player-backdrop" @mousedown.self="audioPlayer = null">
      <section class="audio-player-dialog" role="dialog" aria-modal="true" :aria-label="audioPlayer.label">
        <header class="audio-player-header">
          <div>
            <h3>{{ audioPlayer.label }}</h3>
            <p>{{ audioPlayer.name }}</p>
          </div>
          <button class="inline-symbol-button" type="button" title="关闭" @click="audioPlayer = null">×</button>
        </header>
        <audio :src="audioPlayer.url" controls autoplay></audio>
      </section>
    </div>
  </div>
</template>

<style scoped>
.global-config-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 27, 37, 0.56);
}

.global-config-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  width: min(1080px, 100%);
  height: min(900px, 94vh);
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 8px;
  background: #eef1f5;
  box-shadow: 0 24px 70px rgba(25, 34, 46, 0.38);
  outline: none;
}

.global-config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.global-config-header h2 {
  margin: 0;
  color: #2f3845;
  font-size: 18px;
  font-weight: 680;
}

.global-config-header p {
  margin: 4px 0 0;
  color: #7c8795;
  font-size: 12px;
}

.global-config-body {
  display: grid;
  gap: 18px;
  min-height: 0;
  padding-right: 4px;
  overflow: auto;
}

.global-config-section h3 {
  margin: 0 0 10px;
  color: #425063;
  font-size: 14px;
  font-weight: 680;
}

.global-config-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.global-config-field {
  display: grid;
  gap: 6px;
  color: #687384;
  font-size: 13px;
  font-weight: 650;
}

.global-config-field input[type="text"],
.global-config-field input[type="number"] {
  width: 240px;
  max-width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 12px;
  background: #eef1f5;
  box-shadow: inset 4px 4px 8px rgba(178, 187, 201, 0.34), inset -4px -4px 8px rgba(255, 255, 255, 0.8);
  color: #343d4a;
  font-size: 13px;
}

.global-config-field input[type="number"] {
  width: 140px;
}

.global-config-media {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 6px;
  align-items: center;
}

.global-config-media-value {
  min-height: 38px;
  padding: 0 10px;
  border-radius: 12px;
  background: #e6ebf2;
  color: #425063;
  font-size: 12px;
  box-shadow: inset 3px 3px 6px rgba(178, 187, 201, 0.3);
}

.global-config-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #425063;
  font-size: 13px;
  font-weight: 600;
}

.global-config-error {
  margin: 0;
  color: #b66b73;
  font-size: 13px;
}

.global-config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.global-config-inline-preview {
  width: 150px;
  height: 150px;
  display: grid;
  place-items: center;
  justify-self: center;
  background: #070a0f;
  border-radius: 8px;
  overflow: hidden;
}

.global-config-inline-preview img {
  width: 150px;
  height: 150px;
  object-fit: contain;
  image-rendering: pixelated;
}

.global-config-inline-preview-placeholder {
  color: #5a6573;
  font-size: 12px;
}

.global-config-cover-preview {
  display: grid;
  place-items: center;
  min-height: 64px;
}

.global-config-cover-preview img {
  display: block;
  max-width: 100%;
  max-height: 240px;
  width: auto;
  height: auto;
  margin: 0 auto;
  border-radius: 8px;
}

.audio-player-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1150;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(20, 27, 37, 0.56);
}

.audio-player-dialog {
  display: grid;
  gap: 16px;
  width: min(420px, 100%);
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 8px;
  background: #eef1f5;
  box-shadow: 0 24px 70px rgba(25, 34, 46, 0.38);
}

.audio-player-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.audio-player-header h3 {
  margin: 0;
  color: #2f3845;
  font-size: 15px;
  font-weight: 680;
}

.audio-player-header p {
  margin: 4px 0 0;
  color: #7c8795;
  font-size: 12px;
}

.audio-player-dialog audio {
  width: 100%;
}
</style>

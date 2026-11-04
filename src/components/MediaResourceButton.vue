<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  id: { type: String, default: '' },
  value: { type: String, default: '' },
  label: { type: String, required: true },
  accept: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  contextKey: { default: null },
});
const emit = defineEmits(['select', 'clear']);
const { t } = useI18n();
const fileName = computed(() => props.value.replaceAll('\\', '/').split('/').pop());
const mainButton = ref(null);
const dialog = ref(null);
const player = ref(null);
const preview = ref(null);
let requestId = 0;
let mounted = true;

function stopPlayer() {
  if (!player.value) return;
  player.value.pause();
  player.value.removeAttribute('src');
  player.value.load();
}
function closePreview(restoreFocus = true) {
  requestId++;
  stopPlayer();
  preview.value = null;
  window.removeEventListener('keydown', handlePreviewKeydown, true);
  if (restoreFocus) void nextTick(() => mainButton.value?.focus());
}
async function activate() {
  if (props.disabled) return;
  if (!props.value) { emit('select'); return; }
  const currentRequest = ++requestId;
  const asset = props.value;
  preview.value = { url: '', error: '' };
  window.addEventListener('keydown', handlePreviewKeydown, true);
  await nextTick();
  dialog.value?.focus();
  try {
    const result = await window.mediaLibrary?.getPreviewUrl?.(asset);
    if (!mounted || currentRequest !== requestId || props.value !== asset) return;
    if (!result?.url) throw new Error(t('media.previewFailed'));
    preview.value = { url: result.url, error: '' };
  } catch (error) {
    if (mounted && currentRequest === requestId) preview.value = { url: '', error: error?.message || t('media.previewFailed') };
  }
}
function handlePreviewKeydown(event) {
  if (!preview.value) return;
  event.stopImmediatePropagation();
  if (event.key === 'Escape') { event.preventDefault(); closePreview(); return; }
  if (event.key !== 'Tab') return;
  const controls = [...(dialog.value?.querySelectorAll('button:not(:disabled), audio, video') || [])];
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault(); first.focus();
  }
}
function clear() {
  if (props.disabled) return;
  closePreview(false);
  emit('clear');
  void nextTick(() => mainButton.value?.focus());
}
watch(() => [props.value, props.contextKey, props.disabled], () => closePreview(false));
onBeforeUnmount(() => { mounted = false; closePreview(false); });
</script>

<template>
  <div class="media-resource" :data-resource="value">
    <button :id="id" ref="mainButton" class="media-resource-button" type="button" :disabled="disabled"
      :aria-label="t(value ? 'media.previewFile' : 'globalConfig.choose') + ' ' + label" :title="value || label" @click="activate">
      <svg v-if="value" class="media-resource-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M11 6 26 16 11 26Z" fill="currentColor" /></svg>
      <span v-else class="media-resource-icon media-resource-add" aria-hidden="true">+</span>
      <span v-if="value" class="media-resource-name">{{ fileName }}</span>
    </button>
    <button v-if="value" class="media-resource-clear" type="button" :disabled="disabled"
      :aria-label="t('globalConfig.clear') + ' ' + label" :title="t('globalConfig.clear')" @click.stop="clear">×</button>
  </div>
  <Teleport to="body">
    <div v-if="preview" class="media-resource-preview-backdrop" @mousedown.self="closePreview()">
      <section ref="dialog" class="media-resource-preview-dialog" role="dialog" aria-modal="true" :aria-label="label" tabindex="-1" data-testid="media-resource-preview">
        <header>
          <div><h3>{{ label }}</h3><p>{{ fileName }}</p></div>
          <button class="inline-symbol-button" type="button" :aria-label="t('common.close')" @click="closePreview()">×</button>
        </header>
        <p v-if="preview.error" class="media-resource-preview-error" role="alert">{{ preview.error }}</p>
        <template v-else-if="preview.url">
          <video v-if="accept === 'video'" ref="player" :src="preview.url" controls autoplay playsinline @error="preview.error = t('media.previewFailed')" />
          <audio v-else ref="player" :src="preview.url" controls autoplay @error="preview.error = t('media.audioFailed')" />
        </template>
        <p v-else>{{ t('mediaPicker.loadingPreview') }}…</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.media-resource { position: relative; width: min(112px, 100%); aspect-ratio: 1; }
.media-resource-button { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 1px solid var(--ui-border); border-radius: 12px; background: var(--ui-input); color: var(--ui-text); cursor: pointer; }
.media-resource-button:hover { border-color: var(--ui-accent); background: var(--ui-surface); }
.media-resource-button:focus-visible, .media-resource-clear:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.media-resource-icon { position: absolute; top: 50%; left: 50%; width: 36px; height: 36px; transform: translate(-50%, -50%); }
.media-resource-add { display: grid; place-items: center; font-size: 40px; line-height: 1; font-weight: 400; }
.media-resource-name { position: absolute; right: 6px; bottom: 7px; left: 6px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; color: var(--ui-text-secondary); font-size: 11px; line-height: 1.2; }
.media-resource-clear { position: absolute; top: -7px; right: -7px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 1px solid var(--ui-border); border-radius: 50%; background: var(--ui-elevated); color: var(--ui-text); font-size: 20px; line-height: 1; cursor: pointer; }
.media-resource-clear:hover { color: var(--ui-error); border-color: var(--ui-error); }
.media-resource button:disabled { opacity: .5; cursor: default; }
.media-resource-preview-backdrop { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 20px; background: var(--ui-overlay); }
.media-resource-preview-dialog { display: grid; gap: 16px; width: min(760px, 100%); max-height: 100%; min-width: 0; padding: 18px; overflow: auto; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-dialog); background: var(--ui-elevated); color: var(--ui-text); box-shadow: var(--ui-shadow); outline: none; }
.media-resource-preview-dialog header { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-width: 0; }
.media-resource-preview-dialog header > div { min-width: 0; }
.media-resource-preview-dialog h3 { margin: 0; font-size: 16px; }
.media-resource-preview-dialog p { margin: 6px 0 0; overflow-wrap: anywhere; color: var(--ui-text-secondary); font-size: 13px; }
.media-resource-preview-dialog video { display: block; width: 100%; max-height: 65vh; height: auto; object-fit: contain; background: #000; }
.media-resource-preview-dialog audio { display: block; width: 100%; }
.media-resource-preview-dialog .media-resource-preview-error { color: var(--ui-error); }
</style>

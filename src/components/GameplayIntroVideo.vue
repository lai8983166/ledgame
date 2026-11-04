<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { createLatestAsyncValueLoader } from '../lib/latestAsyncTask.js';

const props = defineProps({
  assetReference: { type: String, required: true },
  playbackId: { type: String, default: '' },
  positionMillis: { type: Number, default: null },
  paused: { type: Boolean, default: false },
});
const emit = defineEmits(['unavailable']);
const video = ref(null);
const url = ref('');
const failed = ref(false);
let mounted = true;
let observedAt = performance.now();
const loader = createLatestAsyncValueLoader({
  loadValue: asset => window.mediaLibrary.getPreviewUrl(asset),
  isActive: () => mounted,
  getCurrentKey: () => props.assetReference,
  async onSuccess(result) {
    const source = result?.url || (typeof result === 'string' ? result : '');
    if (!source || (result?.mediaType && result.mediaType !== 'video')) { unavailable(); return; }
    url.value = source;
    await nextTick();
    syncPlayback();
  },
  onError: unavailable,
});

function unavailable() {
  failed.value = true;
  video.value?.pause();
  emit('unavailable');
}
function syncPlayback() {
  const element = video.value;
  if (!element || failed.value) return;
  element.muted = true;
  if (props.positionMillis !== null && Number.isFinite(element.duration) && element.duration > 0) {
    const elapsed = props.positionMillis + (props.paused ? 0 : performance.now() - observedAt);
    const target = Math.max(0, elapsed / 1000) % element.duration;
    if (Math.abs(element.currentTime - target) > 0.5) element.currentTime = target;
  }
  if (props.paused) element.pause();
  else if (element.paused) void element.play().catch(() => {});
}
watch(() => [props.assetReference, props.playbackId], () => {
  video.value?.pause();
  loader.invalidate();
  url.value = '';
  failed.value = false;
  observedAt = performance.now();
  if (props.assetReference) void loader.load(props.assetReference);
}, { immediate: true });
watch(() => [props.positionMillis, props.paused], () => {
  observedAt = performance.now();
  void nextTick(syncPlayback);
});
onBeforeUnmount(() => {
  mounted = false;
  loader.invalidate();
  const element = video.value;
  if (element) { element.pause(); element.removeAttribute('src'); element.load(); }
});
</script>

<template>
  <video v-if="url && !failed" ref="video" :src="url" autoplay muted loop playsinline
    data-testid="gameplay-intro-video" :data-playback-id="playbackId" :data-asset="assetReference"
    @loadedmetadata="syncPlayback" @canplay="syncPlayback" @error="unavailable" />
</template>

<style scoped>
video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
</style>

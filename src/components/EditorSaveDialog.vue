<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
defineProps({ message: { type: String, required: true }, failed: Boolean });
const emit = defineEmits(['close']);
const { t } = useI18n();
const button = ref(null);
let previousFocus;
onMounted(() => { previousFocus = document.activeElement; nextTick(() => button.value?.focus()); });
onBeforeUnmount(() => { nextTick(() => { if (previousFocus?.isConnected) previousFocus.focus(); }); });
function keydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  if (event.key === 'Tab') { event.preventDefault(); button.value?.focus(); }
}
</script>

<template>
  <div class="editor-save-backdrop" @keydown.stop="keydown">
    <section class="editor-save-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-save-title">
      <h2 id="editor-save-title">{{ t(failed ? 'editorSave.failed' : 'simple.saveSuccess') }}</h2>
      <p :role="failed ? 'alert' : 'status'">{{ message }}</p>
      <button ref="button" type="button" class="soft-button primary" @click="emit('close')">{{ t('common.close') }}</button>
    </section>
  </div>
</template>

<style scoped>
.editor-save-backdrop { position:fixed; inset:0; z-index:1500; display:grid; place-items:center; padding:24px; background:var(--ui-overlay); }
.editor-save-dialog { width:min(520px,100%); max-height:80vh; overflow:auto; padding:24px; border-radius:12px; background:white; color:#111827; box-shadow:var(--ui-shadow); }
.editor-save-dialog h2 { margin:0 0 16px; font-size:20px; }
.editor-save-dialog p { white-space:pre-line; overflow-wrap:anywhere; line-height:1.65; }
.editor-save-dialog button { display:block; margin-left:auto; }
</style>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
const emit = defineEmits(['choose']);
const { t } = useI18n({ useScope: 'global' });
const dialog = ref(null);
let previousFocus;
function keydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('choose', 'stay'); }
  if (event.key === 'Tab') {
    const buttons = [...dialog.value.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
  }
}
onMounted(() => { previousFocus = document.activeElement; dialog.value.querySelector('[data-stay]').focus(); });
onUnmounted(() => previousFocus?.isConnected && previousFocus.focus());
</script>
<template>
  <div class="editor-leave-backdrop" @keydown="keydown" @click.self="emit('choose', 'stay')">
    <section ref="dialog" class="editor-leave-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-leave-title">
      <h2 id="editor-leave-title">{{ t('editorLeave.title') }}</h2>
      <p>{{ t('editorLeave.message') }}</p>
      <footer>
        <button class="soft-button" data-stay @click="emit('choose', 'stay')">{{ t('editorLeave.stay') }}</button>
        <button class="soft-button" @click="emit('choose', 'discard')">{{ t('editorLeave.discard') }}</button>
        <button class="soft-button primary" @click="emit('choose', 'save')">{{ t('editorLeave.save') }}</button>
      </footer>
    </section>
  </div>
</template>
<style scoped>
.editor-leave-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 18px; background: #0009; }
.editor-leave-dialog { width: min(460px, 100%); padding: 24px; border-radius: 12px; box-shadow: 0 20px 60px #0008; }
h2 { margin-top: 0; } p { margin: 20px 0; } footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
</style>

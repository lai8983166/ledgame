<script setup>
import { nextTick, onMounted, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import LanguageSelectionPanel from './LanguageSelectionPanel.vue';
const emit = defineEmits(['close']);
const { t } = useI18n();
const dialog = ref(null);
const busy = ref(false);
function cancel() { if (!busy.value) emit('close'); }
function onKeydown(event) {
  if (event.key === 'Escape') { event.stopPropagation(); cancel(); }
  if (event.key !== 'Tab') return;
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
  if (!controls.length) { event.preventDefault(); dialog.value.focus(); return; }
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => nextTick(() => dialog.value?.focus()));
onBeforeUnmount(() => { busy.value = false; });
</script>
<template>
  <div class="language-dialog-backdrop" @mousedown.self="cancel">
    <section ref="dialog" class="language-dialog" role="dialog" aria-modal="true" v-bind="{ 'aria-label': t('language.title') }" tabindex="-1" @keydown="onKeydown">
      <header><h2>{{ t('language.title') }}</h2><button type="button" :disabled="busy" v-bind="{ 'aria-label': t('common.close') }" @click="cancel">×</button></header>
      <LanguageSelectionPanel :show-intro="false" @selected="emit('close')" @busy="busy = $event" />
      <footer><button class="soft-button" type="button" :disabled="busy" @click="cancel">{{ t('common.cancel') }}</button></footer>
    </section>
  </div>
</template>
<style scoped>
.language-dialog-backdrop { position:fixed; inset:0; z-index:1200; background:var(--ui-overlay); display:grid; place-items:center; padding:24px; }
.language-dialog { width:min(720px,100%); max-height:90vh; overflow:auto; padding:24px; border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); background:var(--ui-elevated); box-shadow:var(--ui-shadow); outline:none; }
header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
header h2 { margin:0; }
header button { background:transparent; border:0; color:var(--ui-text); font-size:24px; }
footer { display:flex; justify-content:flex-end; margin-top:20px; }
</style>

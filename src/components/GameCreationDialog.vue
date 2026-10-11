<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({ saving: Boolean, error: { type: String, default: '' } });
const emit = defineEmits(['cancel', 'create']);
const { t } = useI18n();
const family = ref('entertainment');
const dialogRef = ref(null);
let previousFocus;
function close() { if (!props.saving) emit('cancel'); }
function onKey(event) {
  if (event.key === 'Escape') { event.stopPropagation(); close(); }
  if (event.key !== 'Tab') return;
  const nodes = [...dialogRef.value.querySelectorAll('button:not(:disabled)')];
  const first = nodes[0], last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(() => {
  previousFocus = document.activeElement;
  nextTick(() => dialogRef.value?.querySelector('button')?.focus());
});
onBeforeUnmount(() => previousFocus?.focus?.());
</script>

<template>
  <div class="game-creation-backdrop" @mousedown.self="close">
    <section ref="dialogRef" class="game-creation-dialog" role="dialog" aria-modal="true" :aria-label="t('gameCreation.title')" @keydown="onKey">
      <h2>{{ t('gameCreation.title') }}</h2>
      <div class="game-family-options" role="group" :aria-label="t('gameCreation.family')">
        <button v-for="option in ['entertainment', 'ranked', 'multidimensional']" :key="option"
          class="game-family-option" :class="{ selected: family === option }" type="button"
          :disabled="saving || option === 'multidimensional'" :aria-pressed="family === option"
          @click="family = option">
          <strong>{{ t(`gameCreation.${option}`) }}</strong>
          <span>{{ t(`gameCreation.${option}Hint`) }}</span>
        </button>
      </div>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <footer>
        <button class="soft-button" type="button" :disabled="saving" @click="close">{{ t('common.cancel') }}</button>
        <button class="action-button primary" type="button" :disabled="saving" @click="emit('create', family)">{{ t(saving ? 'common.loading' : 'gameCreation.create') }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.game-creation-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); }
.game-creation-dialog { width:min(540px,100%); padding:24px; background:var(--ui-elevated); border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); box-shadow:var(--ui-shadow); }
h2 { margin:0 0 20px; }
.game-family-options { display:grid; gap:12px; }
.game-family-option { display:grid; gap:6px; padding:16px; text-align:left; color:var(--ui-text); background:var(--ui-base); border:1px solid var(--ui-border); border-radius:var(--ui-radius-control); cursor:pointer; }
.game-family-option.selected { border-color:var(--ui-accent); box-shadow:var(--ui-selected-shadow); }
.game-family-option span { color:var(--ui-muted); font-size:13px; }
.game-family-option:disabled { opacity:.45; cursor:not-allowed; }
footer { display:flex; justify-content:flex-end; gap:12px; margin-top:22px; }
</style>

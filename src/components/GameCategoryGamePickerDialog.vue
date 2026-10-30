<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({ games: { type: Array, default: () => [] }, saving: Boolean, error: { type: String, default: '' } });
const emit = defineEmits(['cancel', 'save']);
const { t } = useI18n();
const dialog = ref(null);
const selectedIds = ref([]);
const availableSelection = computed(() => selectedIds.value.filter(id => props.games.some(game => game.id === id)));
let previousFocus;
function onKey(event) {
  if (event.key === 'Escape') { event.stopPropagation(); if (!props.saving) emit('cancel'); }
  if (event.key !== 'Tab') return;
  const nodes = [...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
  if (!nodes.length) { event.preventDefault(); return; }
  const first = nodes[0], last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(async () => { previousFocus = document.activeElement; await nextTick(); dialog.value?.querySelector('input, button')?.focus(); });
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
</script>

<template>
  <div class="category-game-picker-backdrop" @mousedown.self="!saving && emit('cancel')">
    <section ref="dialog" class="category-game-picker-dialog" role="dialog" aria-modal="true" :aria-label="t('gameCategories.addGames')" @keydown="onKey">
      <h2>{{ t('gameCategories.addGames') }}</h2>
      <div class="category-game-picker-list">
        <label v-for="game in games" :key="game.id" class="category-game-picker-option">
          <input v-model="selectedIds" type="checkbox" :value="game.id" :disabled="saving" />
          <span>{{ game.name }}</span>
        </label>
        <p v-if="!games.length">{{ t('games.noSupportedGames') }}</p>
      </div>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <footer>
        <button class="soft-button" type="button" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button class="action-button primary" type="button" :disabled="saving || !availableSelection.length" @click="emit('save', availableSelection)">{{ t(saving ? 'common.loading' : 'common.confirm') }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.category-game-picker-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); }
.category-game-picker-dialog { width:min(540px,100%); max-height:calc(100vh - 40px); display:flex; flex-direction:column; padding:24px; background:var(--ui-elevated); border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); box-shadow:var(--ui-shadow); }
h2 { margin:0 0 20px; }
.category-game-picker-list { display:grid; gap:8px; overflow:auto; min-height:0; }
.category-game-picker-option { display:flex; align-items:center; gap:12px; padding:12px; background:var(--ui-base); border:1px solid var(--ui-border); border-radius:var(--ui-radius-control); cursor:pointer; }
.category-game-picker-option span { overflow-wrap:anywhere; min-width:0; }
footer { display:flex; justify-content:flex-end; gap:12px; margin-top:22px; }
</style>

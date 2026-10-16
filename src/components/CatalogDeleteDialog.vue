<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
defineProps({ message: String, busy: Boolean, error: String });
const emit = defineEmits(['cancel', 'confirm']);
const { t } = useI18n();
const dialog = ref(null);
let previous;
function trap(event) {
  if (event.key !== 'Tab') return;
  const buttons = [...dialog.value.querySelectorAll('button:not(:disabled)')];
  if (!buttons.length) { event.preventDefault(); return; }
  const next = event.shiftKey ? buttons.at(-1) : buttons[0];
  if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) { event.preventDefault(); next.focus(); }
}
onMounted(async () => { previous = document.activeElement; await nextTick(); dialog.value?.querySelector('button')?.focus(); });
onBeforeUnmount(() => { if (previous?.isConnected) previous.focus({ preventScroll: true }); });
</script>
<template>
  <div class="catalog-confirm-backdrop" @mousedown.self="!busy && emit('cancel')">
    <section ref="dialog" class="catalog-confirm-dialog" role="dialog" aria-modal="true" :aria-label="t('catalogMaintenance.deleteTitle')" @keydown="trap" @keydown.esc.stop="!busy && emit('cancel')">
      <h2>{{ t('catalogMaintenance.deleteTitle') }}</h2>
      <p>{{ message }}</p>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <footer><button class="soft-button" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</button><button class="action-button" :disabled="busy" @click="emit('confirm')">{{ t('catalogMaintenance.delete') }}</button></footer>
    </section>
  </div>
</template>
<style scoped>
.catalog-confirm-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:20px; background:var(--ui-overlay); }
.catalog-confirm-dialog { width:min(480px,100%); padding:24px; background:var(--ui-elevated); border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); box-shadow:var(--ui-shadow); }
h2 { margin-top:0; } p { overflow-wrap:anywhere; } footer { display:flex; justify-content:flex-end; gap:12px; margin-top:24px; }
</style>

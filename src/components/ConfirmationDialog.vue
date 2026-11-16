<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { isComposingEvent } from '../lib/dialogInput.js';

const props = defineProps({ message: { type: String, required: true }, requestId: { type: Number, required: true } });
const emit = defineEmits(['accept', 'cancel']);
const { t } = useI18n();
const dialog = ref(null);
const cancelButton = ref(null);
let previousFocus;
const accept = () => emit('accept', props.requestId);
const cancel = () => emit('cancel', props.requestId);

function keydown(event) {
  if (isComposingEvent(event)) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = [...(dialog.value?.querySelectorAll('button:not(:disabled)') || [])];
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault(); first.focus();
  }
}

onMounted(async () => {
  previousFocus = document.activeElement;
  await nextTick();
  cancelButton.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  const ownedFocus = dialog.value?.contains(document.activeElement);
  // Restore synchronously only while this dialog still owns focus. A delayed
  // callback must never steal focus from a newly opened input or another app.
  if (ownedFocus && document.hasFocus() && previousFocus?.isConnected) {
    previousFocus.focus({ preventScroll: true });
  }
});
</script>

<template>
  <Teleport to="body">
    <div class="application-confirm-backdrop" @keydown.stop="keydown" @mousedown.self="cancel">
      <section ref="dialog" class="application-confirm-dialog" role="dialog" aria-modal="true"
        :aria-label="t('common.confirm')" tabindex="-1" data-testid="application-confirm-dialog">
        <h2>{{ t('common.confirm') }}</h2>
        <p>{{ message }}</p>
        <footer>
          <button ref="cancelButton" class="soft-button" type="button" @click="cancel">{{ t('common.cancel') }}</button>
          <button class="action-button primary" type="button" @click="accept">{{ t('common.confirm') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.application-confirm-backdrop { position:fixed; inset:0; z-index:2000; display:grid; place-items:center; padding:24px; background:var(--ui-overlay); }
.application-confirm-dialog { width:min(520px,100%); max-height:90vh; overflow:auto; padding:24px; border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); background:var(--ui-elevated); color:var(--ui-text); box-shadow:var(--ui-shadow); }
h2 { margin-top:0; } p { white-space:pre-line; overflow-wrap:anywhere; } footer { display:flex; justify-content:flex-end; gap:12px; margin-top:24px; }
</style>

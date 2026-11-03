<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({ status: { type: Object, default: null }, startupError: { type: String, default: '' } });
const emit = defineEmits(['close', 'status']);
const { t } = useI18n();
const dialog = ref(null);
const codeInput = ref(null);
const activationCode = ref('');
const busy = ref(false);
const error = ref('');
const copied = ref(false);

function close() { if (!busy.value) emit('close'); }
async function operation(action) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try { return await action(); }
  catch (failure) { error.value = failure?.message || t('activation.unavailable'); }
  finally { busy.value = false; }
}
function receive(response) {
  if (!response?.data || typeof response.data.activated !== 'boolean') throw new Error(t('activation.unavailable'));
  emit('status', response.data);
  return response.data;
}
function copyMachineCode() {
  return operation(async () => {
    receive(await window.ledGame.copyMachineCode());
    copied.value = true;
  });
}
async function pasteCode() {
  await operation(async () => {
    activationCode.value = String(await window.ledGame.pasteActivationCode() || '');
  });
  await nextTick();
  codeInput.value?.focus({ preventScroll: true });
}
function activate() {
  return operation(async () => {
    const result = receive(await window.ledGame.activate(activationCode.value.trim()));
    if (!result.activated) error.value = result.message || t('activation.failed');
    else activationCode.value = '';
  });
}
function onKeydown(event) {
  if (event.key === 'Escape') { event.stopPropagation(); close(); }
  if (event.key !== 'Tab') return;
  const controls = [...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); dialog.value.focus(); }
  else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault(); first.focus();
  }
}
onMounted(() => nextTick(() => dialog.value?.focus()));
</script>

<template>
  <div class="activation-backdrop">
    <section ref="dialog" class="activation-dialog" role="dialog" aria-modal="true" :aria-label="t('activation.title')" tabindex="-1" @keydown="onKeydown">
      <header><h2>{{ t('activation.title') }}</h2><button type="button" :disabled="busy" :aria-label="t('common.close')" @click="close">×</button></header>
      <p v-if="status" class="activation-state" role="status">{{ status.activated ? t('activation.activated') : t('activation.inactive') }}</p>
      <label class="activation-field"><span>{{ t('activation.machineCode') }}</span>
        <div class="activation-machine"><textarea readonly rows="3" :value="status?.machineCode || ''" /><button type="button" class="soft-button" :disabled="busy || !status?.machineCode" @click="copyMachineCode">{{ copied ? t('activation.copied') : t('activation.copy') }}</button></div>
      </label>
      <template v-if="!status?.activated">
        <label class="activation-field"><span>{{ t('activation.code') }}</span>
          <textarea ref="codeInput" v-model="activationCode" rows="4" :disabled="busy" spellcheck="false" @keydown.ctrl.v.prevent="pasteCode" @keydown.meta.v.prevent="pasteCode" />
        </label>
        <button type="button" class="soft-button" :disabled="busy" @click="pasteCode">{{ t('activation.paste') }}</button>
      </template>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <p v-else-if="startupError" class="error-line" role="alert">{{ startupError }}</p>
      <p v-else-if="!status?.activated && status?.reasonCode !== 'ACTIVATION_REQUIRED' && status?.message" class="error-line" role="alert">{{ status.message }}</p>
      <p v-else-if="status && !status.machineCode" class="error-line" role="alert">{{ t('activation.unavailable') }}</p>
      <footer>
        <button type="button" class="soft-button" :disabled="busy" @click="close">{{ t('common.close') }}</button>
        <button v-if="!status?.activated" type="button" class="action-button primary" :disabled="busy || !activationCode.trim() || !status?.machineCode" @click="activate">{{ busy ? t('activation.working') : t('activation.activate') }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.activation-backdrop { position:fixed; inset:0; z-index:1250; background:var(--ui-overlay); display:grid; place-items:center; padding:20px; }
.activation-dialog { width:min(640px,100%); max-height:90vh; overflow:auto; padding:24px; border:1px solid var(--ui-border); border-radius:var(--ui-radius-dialog); background:var(--ui-elevated); box-shadow:var(--ui-shadow); outline:none; }
header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
h2 { margin:0; }
header button { background:transparent; border:0; color:var(--ui-text); font-size:24px; }
.activation-state { font-weight:600; }
.activation-field { display:grid; gap:8px; margin:16px 0; }
.activation-machine { display:flex; align-items:center; gap:12px; }
textarea { min-width:0; width:100%; resize:vertical; padding:10px; border:1px solid var(--ui-border); border-radius:6px; color:var(--ui-text); background:var(--ui-input-bg,var(--ui-base)); overflow-wrap:anywhere; }
.activation-machine textarea { flex:1; }
footer { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:10px; margin-top:20px; }
@media (max-width:600px) { .activation-dialog { padding:16px; } .activation-machine { flex-wrap:wrap; } }
</style>

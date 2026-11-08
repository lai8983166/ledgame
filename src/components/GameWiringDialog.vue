<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import Elc408WiringPanel from './elc408/Elc408WiringPanel.vue';
import EditorSaveDialog from './EditorSaveDialog.vue';
import { createGameWiringDraft } from '../lib/gameWiring.js';

const props=defineProps({wiring:{type:Object,default:null},width:{type:Number,required:true},height:{type:Number,required:true},saving:Boolean,error:String,embedded:Boolean});
const emit=defineEmits(['cancel','save']);
const {t}=useI18n({useScope:'global'});
const dialog=ref(null), draft=ref(null), fallback=ref(false);
const validationError=ref('');
const panel=ref(null);
function getDraft() {
  if (!panel.value) throw new Error(t('common.loading'));
  panel.value.setDimensions(props.width, props.height);
  try { return panel.value.getDraft(); }
  catch(error) { throw new Error(error.message?.startsWith('gameWiring.') ? t(error.message) : error.message); }
}
function hasChanges() { return panel.value?.hasChanges() || false; }
function markSaved() { panel.value?.markSaved(); }
defineExpose({ getDraft, hasChanges, markSaved });
watch(() => [props.width, props.height], ([width,height]) => { if (props.embedded) panel.value?.setDimensions(width,height); });
const previousFocus=document.activeElement;
let mounted=true;
onMounted(async()=>{
  let global=null;
  if(props.wiring?.runtimeEnabled !== true) {
    try {global=await window.elc408Tools?.readWiring?.();} catch { /* Missing global file does not prevent editing. */ }
    fallback.value=!(global?.width===props.width && global?.height===props.height);
  }
  if(!mounted) return;
  draft.value=createGameWiringDraft(props.wiring,props.width,props.height,global);
  await nextTick();if (!props.embedded) dialog.value?.focus();
});
function keydown(event){if(!props.embedded&&event.key==='Escape'&&!props.saving){event.stopPropagation();emit('cancel');}}
onBeforeUnmount(()=>{mounted=false;if (!props.embedded) previousFocus?.focus?.();});
</script>
<template>
  <div :class="embedded ? 'game-wiring-page' : 'game-wiring-backdrop'" @mousedown.self="!embedded && !saving && emit('cancel')" @keydown="keydown">
    <section ref="dialog" class="game-wiring-dialog"  :role="embedded ? 'region' : 'dialog'" :aria-modal="embedded ? undefined : true" aria-labelledby="game-wiring-title" tabindex="-1">
      <header><h2 id="game-wiring-title">{{ t('gameWiring.title') }}</h2><button v-if="!embedded" class="soft-button" :disabled="saving" @click="emit('cancel')">{{ t('common.cancel') }}</button></header>
      <p v-if="fallback">{{ t('gameWiring.newDraft') }}</p>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <div class="game-wiring-content" :class="{saving}">
        <Elc408WiringPanel v-if="draft" ref="panel" :initial-document="draft" :embedded="embedded" game-scoped :saving="saving" @save="emit('save',$event)" @save-error="validationError = $event" @import="fallback = false" />
        <p v-else>{{ t('common.loading') }}</p>
      </div>
    </section>
    <EditorSaveDialog v-if="validationError" :message="validationError" failed @close="validationError = ''" />
  </div>
</template>
<style scoped>
.game-wiring-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:var(--ui-overlay)}
.game-wiring-dialog{width:min(1500px,96vw);height:92vh;display:flex;flex-direction:column;gap:12px;padding:20px;border:1px solid var(--ui-border);border-radius:12px;background:var(--ui-base);color:var(--ui-text);outline:none}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}h2,p{margin:0}
.game-wiring-content{flex:1;min-height:0;overflow:hidden}.saving{pointer-events:none;opacity:.75}
.game-wiring-page{height:100%;min-height:0;min-width:0}
.game-wiring-page > .game-wiring-dialog{width:100%;height:100%;box-sizing:border-box}
</style>

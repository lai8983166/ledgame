<script setup>
import {useI18n} from 'vue-i18n';
import {ref, onMounted, onBeforeUnmount, nextTick} from 'vue';
const props=defineProps({saving:Boolean,error:String});
const emit=defineEmits(['choose']);
const dialog=ref(null);
const previousFocus=document.activeElement;
onMounted(async()=>{await nextTick();dialog.value?.querySelector('button')?.focus();});
onBeforeUnmount(()=>previousFocus?.isConnected && previousFocus.focus?.());
function keydown(event){
  if(event.key==='Escape'){event.preventDefault();if(!props.saving)emit('choose','cancel');}
  if(event.key==='Tab'){
    const buttons=Array.from(dialog.value?.querySelectorAll('button:not(:disabled)')??[]);
    if(!buttons.length){event.preventDefault();return;}
    if(event.shiftKey && document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1).focus();}
    else if(!event.shiftKey && document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
  }
}
const {t}=useI18n({useScope:'global'});
</script>
<template>
  <div class="debug-entry-backdrop" @keydown="keydown">
    <section ref="dialog" role="dialog" aria-modal="true" :aria-label="t('editorDebug.unsaved')" class="debug-entry-dialog">
      <h2>{{t('editorDebug.unsaved')}}</h2><p>{{t('editorDebug.unsavedHint')}}</p><p v-if="error" class="error-line">{{error}}</p>
      <footer><button class="action-button primary" :disabled="saving" @click="$emit('choose','save')">{{t('editorDebug.saveEnter')}}</button>
        <button class="soft-button" :disabled="saving" @click="$emit('choose','saved')">{{t('editorDebug.useSaved')}}</button>
        <button class="soft-button" :disabled="saving" @click="$emit('choose','cancel')">{{t('common.cancel')}}</button></footer>
    </section>
  </div>
</template>
<style scoped>
.debug-entry-backdrop{position:fixed;inset:0;z-index:1000;background:var(--ui-overlay);display:grid;place-items:center}.debug-entry-dialog{background:var(--ui-base);padding:24px;border-radius:12px;max-width:650px}footer{display:flex;flex-wrap:wrap;gap:12px}h2{margin:0}
</style>

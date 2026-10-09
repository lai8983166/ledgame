<script setup>
import {computed,ref,reactive,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {useI18n} from 'vue-i18n';
import DebugLightBoard from '../components/DebugLightBoard.vue';
import {isDebugRuntimeAvailable,debugLaunchPayload,appendDebugWristband,pixelsFromDebugFrame} from '../lib/editorDebugSession.js';
import {wristbandErrorMessageKey,playerAccessRemainingSeconds} from '../lib/playerAccess.js';
const props=defineProps({game:{type:Object,required:true},startLevelIndex:{type:Number,default:0}});
const emit=defineEmits(['exit']);
const {t}=useI18n({useScope:'global'}), api=window.ledGame;
const state=ref({}),sessionId=ref(null),busy=ref(false),error=ref(''),scanOpen=ref(false),scanPrompt=ref(null),hover=ref(null);
const options=reactive({userCount:props.game.minPlayers || 1,startLevel:Math.min(props.startLevelIndex+1,props.game.levels?.length || 1),launchMethod:'debug',stageFailurePolicy:'END_GAME'});
const blank=()=>Array.from({length:props.game.siteSizeHeight},()=>Array.from({length:props.game.siteSizeWidth},()=>({r:0,g:0,b:0})));
const pixels=ref(blank());
const active=computed(()=>sessionId.value && state.value.sessionId===sessionId.value && ['STARTING','RUNNING','SETTLING','PAUSED'].includes(state.value.engineState));
const preparation=computed(()=>state.value.preparation?.sessionId===sessionId.value?state.value.preparation:null);
const participants=computed(()=>state.value.playerAccesses || []);
const balanceNow=ref(Date.now());
const enough=computed(()=>options.launchMethod!=='wristband' || participants.value.length===Number(options.userCount));
const gameplay=computed(()=>state.value.gameplay || {});
const lastGameTime=ref(null);
const countdown=computed(()=>{
  const time=state.value.gameTime || lastGameTime.value;
  // Rank's own finite round duration still applies without the optional global cap.
  const rankMillis=props.game.type==='rank'?gameplay.value.remainingMillis:null;
  if(typeof rankMillis==='number' && Number.isFinite(rankMillis)){
    const remaining=time?.mode==='LIMITED'?Math.min(rankMillis,time.remainingMillis || 0):rankMillis;
    return Math.ceil(Math.max(0,remaining)/1000);
  }
  if(time)return time.mode==='LIMITED'?Math.ceil((time.remainingMillis || 0)/1000):t('editorDebug.unlimited');
  if(props.game.type==='rank' && props.game.levels?.[0]?.durationSeconds>0)return props.game.levels[0].durationSeconds;
  return props.game.globalTimeLimit?props.game.globalTimeLimitValue:t('editorDebug.unlimited');
});
let removeState,removeFrame,balanceTimer,alive=true,scanBuffer='';
function apply(result){const data=result?.data || result;if(data && (!sessionId.value || data.sessionId===sessionId.value || isDebugRuntimeAvailable(data))){state.value=data;if(data.gameTime)lastGameTime.value=data.gameTime;}}
async function action(fn){if(busy.value)return;busy.value=true;error.value='';try{return await fn();}catch(e){const key=wristbandErrorMessageKey(e);error.value=e.message?.startsWith('editorDebug.')?t(e.message):key?t(key):e.message;}finally{busy.value=false;}}
async function prepare(){
  const current=(await api.gameState())?.data;
  if(!isDebugRuntimeAvailable(current))throw new Error('editorDebug.busy');
  const result=await api.createEditorPreparation(debugLaunchPayload(props.game,options));
  const data=result?.data || result;
  sessionId.value=data.preparation?.sessionId;
  if(!sessionId.value)throw new Error('editorDebug.prepareFailed');
  lastGameTime.value=null;apply(result);pixels.value=blank();
}
async function start(){const needsScan=await action(async()=>{
  if(!preparation.value)await prepare();
  if(options.launchMethod==='wristband'&&!enough.value)return true;
  apply(await api.confirmPreparation(sessionId.value));
});if(needsScan)await openScan();}
async function openScan(){scanBuffer='';scanOpen.value=true;await nextTick();scanPrompt.value?.focus();}
async function scanKey(event){
  if(!scanOpen.value||busy.value||event.ctrlKey||event.metaKey||event.altKey)return;
  if(/^\d$/.test(event.key)){event.preventDefault();scanBuffer=(scanBuffer+event.key).slice(-32);}
  else if(event.key==='Enter'){event.preventDefault();const uid=scanBuffer;scanBuffer='';
    await action(async()=>{const ids=appendDebugWristband(state.value,sessionId.value,uid);apply(await api.updatePreparation(sessionId.value,{launchMethod:'wristband',tokenList:ids}));scanOpen.value=false;});
  }else if(event.key==='Escape'){event.preventDefault();scanOpen.value=false;scanBuffer='';}
}
async function scan(){const ready=await action(async()=>{if(!preparation.value)await prepare();return true;});if(ready)await openScan();}
async function cleanup(){
  if(!sessionId.value)return;
  const result=await api.gameState();const current=result?.data || result;apply(result);
  if(current.sessionId!==sessionId.value) {if(isDebugRuntimeAvailable(current)){sessionId.value=null;return;}throw new Error('editorDebug.sessionLost');}
  if(current.engineState==='PREPARING')apply(await api.cancelPreparation(sessionId.value));
  else if(['STARTING','RUNNING','SETTLING','PAUSED'].includes(current.engineState))apply(await api.sendDebugCommand({command:'endgame',sessionId:sessionId.value}));
  const after=(await api.gameState())?.data;
  if(!isDebugRuntimeAvailable(after))throw new Error('editorDebug.cleanupFailed');
  sessionId.value=null;scanOpen.value=false;scanBuffer='';
}
async function restart(){const needsScan=await action(async()=>{await cleanup();await prepare();if(enough.value)apply(await api.confirmPreparation(sessionId.value));else return true;});if(needsScan)await openScan();}
async function exit(){await action(async()=>{await cleanup();emit('exit');});}
async function command(name){await action(async()=>{apply(await api.sendDebugCommand({command:name,sessionId:sessionId.value}));});}
function hoverCell(x,y){hover.value={x,y};}
async function clickCell(x,y){if(!active.value||state.value.engineState!=='RUNNING')return;await action(async()=>{apply(await api.sendDebugCommand({command:'tileinput',sessionId:sessionId.value,x,y}));});}
async function clickCircle(circleIndex){if(!active.value||state.value.engineState!=='RUNNING')return;await action(async()=>{apply(await api.sendDebugCommand({command:'circleinput',sessionId:sessionId.value,circleIndex}));});}
onMounted(async()=>{
  balanceTimer=setInterval(()=>balanceNow.value=Date.now(),1000);
  removeState=api.onEngineState?.(apply);
  removeFrame=api.onLedFrame?.(frame=>{if(alive && active.value){const value=pixelsFromDebugFrame(frame,props.game.siteSizeWidth,props.game.siteSizeHeight);if(value)pixels.value=value;}});
  window.addEventListener('keydown',scanKey);
  await action(async()=>{apply(await api.gameState());if(!isDebugRuntimeAvailable(state.value))throw new Error('editorDebug.busy');});
});
onBeforeUnmount(()=>{alive=false;clearInterval(balanceTimer);removeState?.();removeFrame?.();window.removeEventListener('keydown',scanKey);});
</script>
<template>
  <section class="editor-debug-workspace">
    <header><button class="soft-button" :disabled="busy" @click="exit">{{t('editorDebug.exit')}}</button><h1>{{game.displayName || game.name}}</h1><span>{{t('editorDebug.title')}}</span></header>
    <div class="debug-workspace-columns">
      <aside class="debug-workspace-controls">
        <label><span>{{t('editorDebug.method')}}</span><select v-model="options.launchMethod" :disabled="busy || active || !!preparation"><option value="debug">{{t('editorDebug.direct')}}</option><option value="wristband">{{t('editorDebug.wristband')}}</option></select></label>
        <label><span>{{t('editorDebug.players')}}</span><input v-model.number="options.userCount" type="number" :min="game.minPlayers || 1" :max="game.maxPlayers || game.participants || 1" :disabled="busy || active || !!preparation" /></label>
        <label><span>{{t('editorDebug.level')}}</span><input v-model.number="options.startLevel" type="number" min="1" :max="game.levels?.length || 1" :disabled="busy || active || !!preparation" /></label>
        <label><span>{{t('editorDebug.failurePolicy')}}</span><select v-model="options.stageFailurePolicy" :disabled="busy || active || !!preparation"><option value="END_GAME">{{t('rank.endGame')}}</option><option value="RETRY">{{t('rank.retry')}}</option></select></label>
        <div v-if="options.launchMethod==='wristband'" class="debug-participants"><button class="soft-button" :disabled="busy || active || enough" @click="scan">{{t('editorDebug.scan')}}</button><p>{{participants.length}} / {{options.userCount}}</p><p v-for="player in participants" :key="player.access.uid">{{player.member?.name}} · {{player.access.uid}}<br/>{{t('editorDebug.balance')}} {{playerAccessRemainingSeconds(player,balanceNow) ?? '—'}}s</p><small>{{t('editorDebug.balanceHint')}}</small></div>
        <div class="debug-workspace-actions"><button class="action-button primary" :disabled="busy || active" @click="start">{{t('editorDebug.start')}}</button><button class="soft-button" :disabled="busy || !active" @click="command(state.engineState==='PAUSED'?'resume':'pause')">{{t(state.engineState==='PAUSED'?'editorDebug.resume':'editorDebug.pause')}}</button><button class="soft-button" :disabled="busy || !sessionId" @click="restart">{{t('editorDebug.restart')}}</button></div>
        <p v-if="error" class="error-line" role="alert">{{error}}</p><p v-if="state.hardwareWarning" class="error-line">{{state.hardwareWarning}}</p>
        <dl><dt>{{t('editorDebug.state')}}</dt><dd>{{state.engineState || '—'}}</dd><dt>{{t('editorDebug.score')}}</dt><dd>{{gameplay.score ?? '—'}}</dd><dt>{{t('editorDebug.life')}}</dt><dd>{{game.type==='rank'?'—':gameplay.life ?? '—'}}</dd><dt>{{t('editorDebug.points')}}</dt><dd>{{gameplay.memberPoints ?? '—'}}</dd><dt>{{t('editorDebug.time')}}</dt><dd>{{countdown}}</dd><dt>{{t('editorDebug.currentLevel')}}</dt><dd>{{state.currentStageIndex==null?'—':state.currentStageIndex+1}}</dd></dl>
        <article v-for="player in gameplay.players || []" :key="player.playerNumber" class="debug-player"><i :style="{background:player.color || '#888'}"></i><span>{{player.playerNumber}} · {{player.totalScore ?? player.score}} / {{t('editorDebug.points')}} {{player.memberPoints ?? 0}}</span></article>
        <p v-if="state.terminationReason">{{t('editorDebug.finished')}} · {{state.terminationReason}}</p>
      </aside>
      <div class="debug-workspace-rgb"><DebugLightBoard :pixels="pixels" :layout="game.commonConfig?.pixelLightWiring" :runtime="state.sessionId===sessionId ? state.peripheralLights : undefined" :hover-cell="hover" :disabled="busy || state.engineState!=='RUNNING'" @hover-cell="hoverCell" @clear-hover="hover=null" @cell-click="clickCell" @circle-click="clickCircle" /></div>
    </div>
    <div v-if="scanOpen" class="debug-scan-backdrop"><section ref="scanPrompt" tabindex="-1" role="dialog" aria-modal="true" :aria-label="t('editorDebug.scan')"><h2>{{t('editorDebug.scan')}}</h2><p>{{t('editorDebug.scanHint')}}</p><p v-if="error" class="error-line">{{error}}</p><button class="soft-button" :disabled="busy" @click="scanOpen=false;scanBuffer=''">{{t('common.cancel')}}</button></section></div>
  </section>
</template>
<style scoped>
.editor-debug-workspace{height:calc(100dvh - 118px);min-height:0;display:flex;flex-direction:column;padding:16px 24px;gap:14px}
header{display:flex;align-items:center;gap:16px;flex-shrink:0}
h1{font-size:24px;margin:0}
.debug-workspace-columns{flex:1;min-height:0;display:grid;grid-template-columns:clamp(420px,32vw,560px) minmax(0,1fr);gap:22px}
.debug-workspace-controls{overflow:auto;min-width:0;min-height:0;padding:20px;background:var(--ui-panel);border:1px solid var(--ui-border);border-radius:12px}
.debug-workspace-controls label{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,52%);align-items:center;gap:16px;margin-bottom:14px}
.debug-workspace-controls label span{min-width:0;overflow-wrap:anywhere}
.debug-workspace-controls input,.debug-workspace-controls select{width:100%;max-width:none;min-width:0;box-sizing:border-box}
.debug-workspace-actions{display:flex;gap:8px;flex-wrap:wrap}
dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
dd{margin:0;text-align:right;overflow-wrap:anywhere}
.debug-workspace-rgb{min-width:0;min-height:0;overflow:hidden;display:flex}
.debug-workspace-rgb :deep(.debug-led-canvas-host){height:100%;width:100%}
.debug-player{display:flex;gap:8px;margin:12px 0}
.debug-player i{width:18px;height:18px;border-radius:50%;flex-shrink:0}
.debug-scan-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:var(--ui-overlay)}
.debug-scan-backdrop section{padding:32px;max-width:500px;background:var(--ui-base);border-radius:12px;outline:none}
@media(max-width:1000px){
  .debug-workspace-columns{grid-template-columns:minmax(300px,40%) minmax(0,1fr);gap:14px}
  .debug-workspace-controls{padding:16px}
  .debug-workspace-controls label{grid-template-columns:minmax(0,1fr) minmax(0,52%);gap:10px}
}
@media(max-width:750px){
  .debug-workspace-columns{grid-template-columns:minmax(240px,44%) minmax(0,1fr);gap:10px}
  .editor-debug-workspace{padding:8px}
}
</style>

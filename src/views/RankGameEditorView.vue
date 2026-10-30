<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractErrorMessage } from '../lib/gameFlowState.js';
import { RANK_BOMB_TYPES, RANK_RANGE_FIELDS, createRankEditorPayload, createRankLevel, normalizeRankEditorDocument, applyRankGlobalConfig, parseRankEditorRange, rankRangeText, setRankRangeDraft } from '../lib/rankGameEditor.js';
import { confirmWithRendererFocus } from '../lib/rendererFocus.js';
import { normalizeGameCategoryList } from '../lib/gameCategories.js';
import { buildMediaPreviewUrl } from '../lib/mediaPreview.js';
import { requiredEditorFields } from '../lib/editorRequiredFields.js';
import { withEditorSavingCursor } from '../lib/editorSavingCursor.js';
import { saveGameWiring } from '../lib/gameWiring.js';
import { deleteLevelAt, moveLevelAt } from '../lib/simpleLevelSequence.js';
import EditorActionIcon from '../components/EditorActionIcon.vue';
import EditorSaveDialog from '../components/EditorSaveDialog.vue';
import MediaPickerDialog from '../components/MediaPickerDialog.vue';
import GameGlobalConfigDialog from '../components/GameGlobalConfigDialog.vue';
import GameWiringDialog from '../components/GameWiringDialog.vue';

const props=defineProps({ gameId:{type:[Number,String],default:null}, initialDocument:{type:Object,default:null}, gameName:{type:String,default:''}, openGlobalConfigOnEntry:{type:Boolean,default:false} });
const emit=defineEmits(['back']);
const {t}=useI18n({useScope:'global'}), api=window.ledGame;
const document=ref(null), loading=ref(true), busy=ref(null), dirty=ref(false), errorMessage=ref(''), saveFeedback=ref(null);
const activeLevelIndex=ref(0), draggingLevelIndex=ref(null), levelDropIndex=ref(null), gameCategories=ref([]);
const levels=computed(()=>document.value?.levels || []), type1Config=computed(()=>levels.value[activeLevelIndex.value]);
const currentGameId=computed(()=>{const id=Number(document.value?.id ?? props.gameId);return Number.isInteger(id)&&id>0?id:null;});
const globalConfigOpen=ref(false), globalConfigDraft=ref({}), globalSaving=ref(false), globalError=ref('');
const gameWiringOpen=ref(false), gameWiringSaving=ref(false), gameWiringError=ref(''), mediaPicker=ref(null);
const canSave=computed(()=>!!document.value&&!busy.value&&!globalSaving.value&&!gameWiringSaving.value);
const rangeDrafts=reactive(new Map());
const levelKeys=new WeakMap();let nextLevelKey=0;
function levelKey(level){if(!levelKeys.has(level))levelKeys.set(level,++nextLevelKey);return levelKeys.get(level);}
let hydrating=false;
watch(document,()=>{if(!hydrating&&document.value)dirty.value=true;},{deep:true});
onMounted(async()=>{
  try {
    const result=props.gameId?await api.getRankGameEditor(props.gameId):{data:props.initialDocument};
    if(!result?.data||result.data.type!=='rank')throw Error(t('rank.loadFailed'));
    hydrating=true; document.value=normalizeRankEditorDocument(result.data); await nextTick(); dirty.value=!props.gameId;
  }catch(error){errorMessage.value=extractErrorMessage(error,t('rank.loadFailed'));}
  finally{hydrating=false;loading.value=false;}
  if(api?.listGameCategories)try{gameCategories.value=normalizeGameCategoryList(await api.listGameCategories());}catch{gameCategories.value=[];}
  if(document.value&&props.openGlobalConfigOnEntry)openGlobalConfig();
});

function addLevel(){
  if(!canSave.value)return;
  document.value.levels.push(createRankLevel(document.value.siteSizeWidth,document.value.siteSizeHeight,levels.value.length));
  activeLevelIndex.value=levels.value.length-1;
}
function deleteLevel(index){
  const target=levels.value[index];
  if(!canSave.value||draggingLevelIndex.value!==null||!target||levels.value.length<2||!confirmWithRendererFocus(t('rank.deleteLevelConfirm',{name:target.label})))return;
  const result=deleteLevelAt(levels.value,index,activeLevelIndex.value);
  rangeDrafts.delete(target);document.value.levels=result.levels;activeLevelIndex.value=result.activeIndex;
}
function dropLevel(index){
  if(!canSave.value||draggingLevelIndex.value===null)return;
  const result=moveLevelAt(levels.value,draggingLevelIndex.value,index,activeLevelIndex.value);
  document.value.levels=result.levels;activeLevelIndex.value=result.activeIndex;endDrag();
}
function endDrag(){draggingLevelIndex.value=null;levelDropIndex.value=null;}
function rangeText(kind){return rankRangeText(type1Config.value,kind,rangeDrafts);}
function setRange(kind,text){
  setRankRangeDraft(type1Config.value,kind,text,document.value,rangeDrafts);
  dirty.value=true;
}
function rangeInvalid(kind){return !parseRankEditorRange(kind,rangeText(kind),document.value);}
function mediaValue(field){return type1Config.value?.[field]||'';}
function chooseMedia(field,accept,label){mediaPicker.value={level:type1Config.value,field,accept,label};}
function applyMedia(path){if(mediaPicker.value&&levels.value.includes(mediaPicker.value.level))mediaPicker.value.level[mediaPicker.value.field]=path;mediaPicker.value=null;}

async function validatePayload(payload){
  const missing=requiredEditorFields(document.value,true);
  if(missing.length)throw Error(t('editorSave.required')+'\n'+missing.map(field=>t(field.label)).join('\n'));
  for(const [index,level] of levels.value.entries()){
    const invalid=!RANK_BOMB_TYPES.includes(level?.type)||Object.keys(RANK_RANGE_FIELDS).some(kind=>!parseRankEditorRange(kind,rankRangeText(level,kind,rangeDrafts),document.value));
    if(invalid){activeLevelIndex.value=index;throw Error(`${level?.label||index+1}: ${t(!RANK_BOMB_TYPES.includes(level?.type)?'rank.selectType':'rank.rangeInvalid')}`);}
  }
  const result=await api.validateRankGameEditor(payload), validation=result?.data??result;
  if(!validation?.valid){
    const first=validation?.errors?.[0], match=/^levels\[(\d+)\]/.exec(first?.path||'');
    if(match)activeLevelIndex.value=Number(match[1]);
    throw Error(first?`${first.path}: ${first.message}`:t('rank.validationFailed'));
  }
}
async function save(){
  if(!canSave.value)return;busy.value='save';errorMessage.value='';
  try{await withEditorSavingCursor(async()=>{
    const payload=createRankEditorPayload(document.value,currentGameId.value); await validatePayload(payload);
    const result=currentGameId.value?await api.saveRankGameEditor(currentGameId.value,payload):await api.createRankGameEditor(payload);
    const saved=result?.data??result;
    if(saved?.saved!==true||!Number.isInteger(saved.gameId)||saved.gameId<1)throw Error(result?.message||t('rank.saveFailed'));
    document.value.id=saved.gameId;document.value.displayName=document.value.name;await nextTick();dirty.value=false;
    saveFeedback.value={message:t('rank.saved')};
  });}catch(error){errorMessage.value=extractErrorMessage(error,t('rank.saveFailed'));saveFeedback.value={failed:true,message:errorMessage.value};}
  finally{busy.value=null;}
}
function openGlobalConfig(){
  globalError.value='';globalConfigDraft.value=JSON.parse(JSON.stringify(document.value));
  globalConfigOpen.value=true;
}
async function saveGlobalConfig(patch){
  if(globalSaving.value)return;globalSaving.value=true;globalError.value='';
  try{await withEditorSavingCursor(async()=>{
    if(currentGameId.value){
      const persisted=(await api.getRankGameEditor(currentGameId.value))?.data;
      if(!persisted)throw Error(t('rank.loadFailed'));
      applyRankGlobalConfig(persisted,patch);
      const result=await api.saveRankGameEditor(currentGameId.value,persisted);
      if(result?.data?.saved!==true)throw Error(result?.message||t('rank.saveFailed'));
    }
    applyRankGlobalConfig(document.value,patch);globalConfigOpen.value=false;
    saveFeedback.value={message:t(currentGameId.value?'rank.saved':'gameCreation.draftHint')};
  });}catch(error){globalError.value=extractErrorMessage(error,t('rank.saveFailed'));saveFeedback.value={failed:true,message:globalError.value};}
  finally{globalSaving.value=false;}
}
async function saveWiring(wiring){
  if(gameWiringSaving.value)return;gameWiringSaving.value=true;gameWiringError.value='';
  try{
    if(currentGameId.value)await withEditorSavingCursor(()=>saveGameWiring(api,currentGameId.value,true,wiring,document.value));
    else document.value.wiringData=JSON.parse(JSON.stringify(wiring));
    gameWiringOpen.value=false;saveFeedback.value={message:t(currentGameId.value?'simple.saveSuccess':'gameCreation.draftHint')};
  }catch(error){gameWiringError.value=error.message?.startsWith('gameWiring.')?t(error.message):error.message;saveFeedback.value={failed:true,message:gameWiringError.value};}
  finally{gameWiringSaving.value=false;}
}
function goBack(){if(!dirty.value||confirmWithRendererFocus(t('rank.confirmLeave')))emit('back');}
</script>

<template>
  <section class="rank-editor workspace" :aria-busy="busy === 'save'">
    <header class="rank-toolbar editor-heading-row">
      <button class="soft-button editor-back-button" type="button" @click="goBack">{{t('simple.backToList')}}</button>
      <div class="rank-actions editor-heading-actions">
        <button class="soft-button object-icon-button primary" type="button" :aria-label="t('simple.save')" :title="t('simple.save')" :disabled="!canSave" @click="save"><EditorActionIcon name="save" /></button>
        <button class="soft-button object-icon-button" type="button" :aria-label="t('simple.globalConfig')" :title="t('simple.globalConfig')" :disabled="!canSave" @click="openGlobalConfig"><EditorActionIcon name="settings" /></button>
        <button class="soft-button object-icon-button" type="button" :aria-label="t('gameWiring.title')" :title="t('gameWiring.title')" :disabled="!canSave" @click="gameWiringError='';gameWiringOpen=true"><EditorActionIcon name="wiring" /></button>
      </div>
      <div v-if="document" class="level-sequence-row">
        <div class="level-structure-actions">
          <button class="icon-add-button" type="button" :aria-label="t('simple.addLevel')" :title="t('simple.addLevel')" :disabled="!canSave" @click="addLevel">+</button>
        </div>
        <div class="sequence-list">
          <div v-for="(level,index) in levels" :key="levelKey(level)" class="rank-level-tab">
            <button class="sequence-pill" type="button" :class="{active:activeLevelIndex===index,'level-drop-target':levelDropIndex===index}"
              :disabled="!canSave" :draggable="canSave" @dragstart="draggingLevelIndex=index" @dragover.prevent="draggingLevelIndex!==null&&(levelDropIndex=index)" @drop.prevent="dropLevel(index)" @dragend="endDrag" @click="activeLevelIndex=index">{{level?.label||`Level ${index+1}`}}</button>
            <button class="rank-level-delete" type="button" :aria-label="t('rank.deleteLevel',{name:level?.label||`Level ${index+1}`})" :title="t('rank.deleteLevel',{name:level?.label||`Level ${index+1}`})"
              :disabled="!canSave||levels.length<2||draggingLevelIndex!==null" draggable="false" @pointerdown.stop @dragstart.prevent.stop @click.stop="deleteLevel(index)">×</button>
          </div>
        </div>
      </div>
    </header>
    <p v-if="errorMessage" class="error-line" role="alert">{{errorMessage}}</p>
    <p v-if="loading">{{t('common.loading')}}</p>
    <main v-else-if="type1Config" class="rank-config-editor" data-rank-field="levels">
      <label><span>{{t('rank.levelName')}}</span><input v-model="type1Config.label" data-rank-field="level.label" /></label>
      <label class="rank-level-media"><span>{{t('rank.gameplayIntro')}}</span><div>
        <div class="rank-media-control"><input :value="mediaValue('startGif')" :placeholder="t('globalConfig.notSelected')" readonly /><button class="soft-button compact-button" type="button" @click="chooseMedia('startGif','image',t('rank.gameplayIntro'))">{{t('globalConfig.choose')}}</button></div>
        <img v-if="mediaValue('startGif')" class="rank-intro-preview" :src="buildMediaPreviewUrl(mediaValue('startGif'))" :alt="t('rank.gameplayIntro')" />
      </div></label>
      <label><span>{{t('management.rankReward')}}</span><input v-model.number="type1Config.rewardPoints" data-rank-field="level.rewardPoints" type="number" min="0" max="1000000" /></label>
      <label><span>{{t('rank.timeLimit')}}</span><input v-model.number="type1Config.durationSeconds" data-rank-field="level.durationSeconds" type="number" min="1" /></label>
      <label><span>{{t('rank.gameDescription')}}</span><textarea v-model="type1Config.description" rows="3"></textarea></label>
      <label v-for="field in [{key:'gameplayIntro',label:'rank.voiceDescription'},{key:'backgroundVoice',label:'rank.levelBackgroundMusic'}]" :key="field.key" class="rank-level-media"><span>{{t(field.label)}}</span><div>
        <div class="rank-media-control"><input :value="mediaValue(field.key)" :placeholder="t('globalConfig.notSelected')" readonly /><button class="soft-button compact-button" type="button" @click="chooseMedia(field.key,'audio',t(field.label))">{{t('globalConfig.choose')}}</button><button class="soft-button compact-button" type="button" :disabled="!mediaValue(field.key)" @click="type1Config[field.key]=''">{{t('globalConfig.clear')}}</button></div>
        <audio v-if="mediaValue(field.key)" :key="mediaValue(field.key)" :src="buildMediaPreviewUrl(mediaValue(field.key))" controls preload="none" />
      </div></label>
      <label v-for="kind in ['x','y']" :key="kind"><span>{{t(`rank.${kind}Range`)}}</span><div>
        <input :value="rangeText(kind)" :data-rank-field="`level.bounds.${kind}`" :placeholder="t('rank.rangePlaceholder')" :aria-invalid="rangeInvalid(kind)" @input="setRange(kind,$event.target.value)" />
        <small v-if="rangeInvalid(kind)" class="field-error">{{t('rank.rangeInvalid')}}</small>
      </div></label>
      <label><span class="editor-required-label">{{t('globalConfig.type')}}</span><select v-model="type1Config.type" data-rank-field="level.type"><option :value="null" disabled>{{t('rank.selectType')}}</option><option v-for="type in RANK_BOMB_TYPES" :key="type" :value="type">{{t(`rank.type${type}`)}}</option></select></label>
      <template v-if="RANK_BOMB_TYPES.includes(type1Config.type)">
        <label v-for="field in [{key:'targets',label:'rank.targetRange'},{key:'bombs',label:'rank.bombRange'}]" :key="field.key"><span>{{t(field.label)}}</span><div>
          <input :value="rangeText(field.key)" :data-rank-field="`level.${field.key}`" :placeholder="t('rank.rangePlaceholder')" :aria-invalid="rangeInvalid(field.key)" @input="setRange(field.key,$event.target.value)" />
          <small v-if="rangeInvalid(field.key)" class="field-error">{{t('rank.rangeInvalid')}}</small>
        </div></label>
        <label><span>{{t('rank.bombAppearDelay')}}</span><input v-model.number="type1Config.bombWarningDelaySeconds" data-rank-field="level.bombWarningDelaySeconds" type="number" min="0" /></label>
        <label><span>{{t('rank.warningDuration')}}</span><input v-model.number="type1Config.bombWarningDurationSeconds" type="number" min="1" /></label>
        <label v-for="field in [{key:'bombWarningAudio',label:'rank.warningAudio'},{key:'bombExplosionAudio',label:'rank.explosionAudio'}]" :key="field.key" class="rank-level-media" :data-rank-field="`level.${field.key}`"><span>{{t(field.label)}}</span><div>
          <div class="rank-media-control"><input :value="mediaValue(field.key)" :placeholder="t('globalConfig.notSelected')" readonly /><button class="soft-button compact-button" type="button" @click="chooseMedia(field.key,'audio',t(field.label))">{{t('globalConfig.choose')}}</button><button class="soft-button compact-button" type="button" :disabled="!mediaValue(field.key)" @click="type1Config[field.key]=''">{{t('globalConfig.clear')}}</button></div>
          <audio v-if="mediaValue(field.key)" :key="mediaValue(field.key)" :src="buildMediaPreviewUrl(mediaValue(field.key))" controls preload="none" />
        </div></label>
        <label><span>{{t('rank.earlyRefresh')}}</span><input v-model="type1Config.earlyRefresh" type="checkbox" /></label>
        <label><span>{{t('rank.refreshSeconds')}}</span><input v-model.number="type1Config.refreshSeconds" type="number" min="1" /></label>
      </template>
    </main>
    <EditorSaveDialog v-if="saveFeedback" v-bind="saveFeedback" @close="saveFeedback=null" />
    <GameGlobalConfigDialog v-if="globalConfigOpen" rank :config="globalConfigDraft" :categories="gameCategories" :saving="globalSaving" :error="globalError" @cancel="globalConfigOpen=false" @save="saveGlobalConfig" />
    <GameWiringDialog v-if="gameWiringOpen" :wiring="document?.wiringData" :width="document.siteSizeWidth" :height="document.siteSizeHeight" :saving="gameWiringSaving" :error="gameWiringError" @cancel="gameWiringOpen=false" @save="saveWiring" />
    <MediaPickerDialog v-if="mediaPicker" :accept="mediaPicker.accept" :current-value="mediaPicker.level?.[mediaPicker.field]||''" :title="mediaPicker.label" @cancel="mediaPicker=null" @select="applyMedia" />
  </section>
</template>

<style scoped>
.rank-editor{display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;padding-bottom:12px}
.rank-toolbar{flex-shrink:0}
.rank-config-editor{display:grid;align-content:start;gap:12px;min-height:0;overflow:auto;padding:18px 24px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-surface)}
.rank-config-editor>label{display:grid;grid-template-columns:160px minmax(0,660px);align-items:start;gap:12px;color:var(--ui-text);font-size:13px}
.rank-config-editor>label>span{padding-top:9px}
input,textarea,select{width:100%;min-width:0;padding:8px 10px;border:1px solid var(--ui-border);border-radius:4px;background:var(--ui-input);color:var(--ui-text);font:inherit}
input[type=checkbox]{width:20px;height:20px;margin:8px 0}
.rank-media-control{display:flex;gap:6px;min-width:0}.rank-media-control input{flex:1}.rank-media-control button{flex-shrink:0}
.rank-intro-preview{display:block;max-width:220px;max-height:220px;margin-top:8px;object-fit:contain;image-rendering:pixelated}
audio{display:block;width:100%;height:32px;margin-top:6px}.field-error{display:block;margin-top:4px;color:var(--ui-error)}
.level-drop-target{outline:2px solid var(--ui-accent)}
.rank-level-tab{position:relative;display:flex;flex-shrink:0}
.rank-level-tab .sequence-pill{padding-right:28px}
.rank-level-delete{position:absolute;right:4px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:3px;background:var(--ui-surface);color:var(--ui-text);font-size:18px;line-height:1;cursor:pointer;opacity:0}
.rank-level-tab:hover .rank-level-delete,.rank-level-tab:focus-within .rank-level-delete{opacity:1}
.rank-level-delete:hover,.rank-level-delete:focus-visible{background:var(--ui-error);color:#fff}
.rank-level-delete:disabled{cursor:default;opacity:0}
.rank-level-tab:hover .rank-level-delete:disabled,.rank-level-tab:focus-within .rank-level-delete:disabled{opacity:.35}
@media(max-width:700px){.rank-config-editor{padding:12px}.rank-config-editor>label{grid-template-columns:120px minmax(0,1fr)}}
</style>

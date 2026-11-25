<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractErrorMessage } from '../lib/gameFlowState.js';
import { RANK_BOMB_TYPES, exceededScoreBlockCapacity, createRankEditorPayload, createRankLevel, duplicateRankLevel, normalizeRankEditorDocument, applyRankGlobalConfig, parseRankEditorRange, rankRangeText, setRankRangeDraft } from '../lib/rankGameEditor.js';
import ConfirmationDialog from '../components/ConfirmationDialog.vue';
import { useConfirmationDialog } from '../lib/useConfirmationDialog.js';
import { normalizeGameCategoryList } from '../lib/gameCategories.js';
import { buildMediaPreviewUrl } from '../lib/mediaPreview.js';
import { requiredEditorFields } from '../lib/editorRequiredFields.js';
import { withEditorSavingCursor } from '../lib/editorSavingCursor.js';
import { serializeGameWiring } from '../lib/gameWiring.js';
import { editorSnapshot } from '../lib/editorDirtyState.js';
import { gameFieldDimensionsValid } from '../lib/gameFieldDimensions.js';
import { deleteLevelAt, moveLevelAt } from '../lib/simpleLevelSequence.js';
import EditorActionIcon from '../components/EditorActionIcon.vue';
import EditorSaveToast from '../components/EditorSaveToast.vue';
import EditorSaveDialog from '../components/EditorSaveDialog.vue';
import MediaResourceButton from '../components/MediaResourceButton.vue';
import MediaPickerDialog from '../components/MediaPickerDialog.vue';
import GameGlobalConfigDialog from '../components/GameGlobalConfigDialog.vue';
import GameWiringDialog from '../components/GameWiringDialog.vue';

const wallFields = [
  {boundary:'minY', field:'wallGIF', label:'rank.wallGIF'}, {boundary:'maxY', field:'bottomWallGIF', label:'rank.bottomWallGIF'},
  {boundary:'minX', field:'leftWallGIF', label:'rank.leftWallGIF'}, {boundary:'maxX', field:'rightWallGIF', label:'rank.rightWallGIF'},
];

const props=defineProps({ gameId:{type:[Number,String],default:null}, initialDocument:{type:Object,default:null}, gameName:{type:String,default:''}, openGlobalConfigOnEntry:{type:Boolean,default:false} });
const emit=defineEmits(['back']);
const {t}=useI18n({useScope:'global'}), api=window.ledGame;
const { confirmation, confirmAction, resolveConfirmation, isConfirmationCurrent } = useConfirmationDialog();
const document=ref(null), loading=ref(true), busy=ref(null), dirty=ref(false), errorMessage=ref(''), saveFeedback=ref(null);
const activeLevelIndex=ref(0), draggingLevelIndex=ref(null), levelDropIndex=ref(null), gameCategories=ref([]);
const levels=computed(()=>document.value?.levels || []), type1Config=computed(()=>levels.value[activeLevelIndex.value]);
const visibleWalls = computed(() => wallFields.filter(wall => type1Config.value?.bounds?.[wall.boundary] > 0));
const currentGameId=computed(()=>{const id=Number(document.value?.id ?? props.gameId);return Number.isInteger(id)&&id>0?id:null;});
const editorPage=ref(props.openGlobalConfigOnEntry||!(props.gameId||props.initialDocument?.id)?'global':'levels'), globalConfigDraft=ref({}), mediaPicker=ref(null);
const globalPageMounted=ref(false), wiringPageMounted=ref(false);
const globalPageRef=ref(null), wiringPageRef=ref(null);
const canSave=computed(()=>!!document.value&&!busy.value);
let syncedGlobalDraft=null;
function syncGlobalPage(){
  const draft=globalPageRef.value?.getDraft();
  if(!draft||!document.value)return;
  const patch=Object.fromEntries(Object.entries(draft).filter(([key,value])=>
    JSON.stringify(value)!==JSON.stringify(syncedGlobalDraft?.[key])));
  if(Object.keys(patch).length)applyRankGlobalConfig(document.value,patch);
  syncedGlobalDraft=JSON.parse(JSON.stringify(draft));
}
async function selectEditorPage(page){
  if(!canSave.value)return;
  syncGlobalPage();
  if(page==='global'&&!globalPageMounted.value){
    globalConfigDraft.value=JSON.parse(JSON.stringify(document.value));
    globalPageMounted.value=true;
  }
  if(page==='wiring')wiringPageMounted.value=true;
  editorPage.value=page;
  await nextTick();
  if(page==='global'&&syncedGlobalDraft===null)syncedGlobalDraft=globalPageRef.value?.getDraft()||null;
}
function selectLevel(index){activeLevelIndex.value=index;selectEditorPage('levels');}
const rangeDrafts=reactive(new Map());
const levelKeys=new WeakMap();let nextLevelKey=0;
function levelKey(level){if(!levelKeys.has(level))levelKeys.set(level,++nextLevelKey);return levelKeys.get(level);}
let hydrating=false;
let savedEditorDocument=null;
function hasUnsavedChanges(){return Boolean(document.value&&(!currentGameId.value||globalPageRef.value?.hasChanges()||wiringPageRef.value?.hasChanges()||editorSnapshot(document.value)!==editorSnapshot(savedEditorDocument)||[...rangeDrafts].some(([level,drafts])=>Object.entries(drafts).some(([kind,text])=>!parseRankEditorRange(kind,text,document.value)))));}
async function saveForLeave(){return await save()===true;}
function canLeave(){return canSave.value;}
defineExpose({hasUnsavedChanges,saveForLeave,canLeave});
watch(document,()=>{if(!hydrating&&document.value)dirty.value=true;},{deep:true});
onMounted(async()=>{
  try {
    const result=props.gameId?await api.getRankGameEditor(props.gameId):{data:props.initialDocument};
    if(!result?.data||result.data.type!=='rank')throw Error(t('rank.loadFailed'));
    hydrating=true; document.value=normalizeRankEditorDocument(result.data); await nextTick(); dirty.value=!props.gameId;
    savedEditorDocument=JSON.parse(editorSnapshot(document.value));
    if(!currentGameId.value||props.openGlobalConfigOnEntry)await selectEditorPage('global');
  }catch(error){errorMessage.value=extractErrorMessage(error,t('rank.loadFailed'));}
  finally{hydrating=false;loading.value=false;}
  if(api?.listGameCategories)try{gameCategories.value=normalizeGameCategoryList(await api.listGameCategories());}catch{gameCategories.value=[];}
});

function addLevel(){
  if(!canSave.value)return;
  syncGlobalPage();
  document.value.levels.push(createRankLevel(document.value.siteSizeWidth,document.value.siteSizeHeight,levels.value.length,document.value.maxPlayers));
  activeLevelIndex.value=levels.value.length-1;
  selectEditorPage('levels');
}
function duplicateLevel(){
  const source=type1Config.value;
  if(!canSave.value||draggingLevelIndex.value!==null||!source)return;
  syncGlobalPage();
  const copy=duplicateRankLevel(source,levels.value.length);
  const drafts=rangeDrafts.get(source);
  if(drafts)rangeDrafts.set(copy,{...drafts});
  const index=activeLevelIndex.value+1;
  document.value.levels.splice(index,0,copy);
  activeLevelIndex.value=index;
  selectEditorPage('levels');
}
async function deleteLevel(index){
  const target=levels.value[index];
  if(!canSave.value||draggingLevelIndex.value!==null||!target||levels.value.length<2)return;
  const originalDocument=document.value;
  if(!await confirmAction(t('rank.deleteLevelConfirm',{name:target.label})))return;
  if(!isConfirmationCurrent()||document.value!==originalDocument||levels.value[index]!==target||!canSave.value||levels.value.length<2)return;
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
function rangeError(level, kind){
  if(!parseRankEditorRange(kind,rankRangeText(level,kind,rangeDrafts),document.value))return t('rank.rangeInvalid');
  if(kind==='scoreBlocks'){
    const capacity=exceededScoreBlockCapacity(level,document.value,rangeDrafts);
    if(capacity!==null)return t('rank.scoreBlockCapacity',{capacity});
  }
  return '';
}
function mediaValue(field){return type1Config.value?.[field]||'';}
function chooseMedia(field,accept,label){mediaPicker.value={level:type1Config.value,field,accept,label};}
function pickerValue(picker) {
  return picker.accept === 'visual'
    ? picker.level.playIntroVideo || picker.level.startGif || ''
    : picker.level[picker.field] || '';
}
function applyMedia(path, mediaType) {
  const picker = mediaPicker.value;
  if (picker && levels.value.includes(picker.level)) {
    if (picker.accept === 'visual' && mediaType === 'image') {
      picker.level.startGif = path;
      picker.level.playIntroVideo = '';
    } else {
      picker.level[picker.field] = path;
    }
  }
  mediaPicker.value = null;
}

async function validatePayload(payload){
  if(!gameFieldDimensionsValid(document.value))throw Error(t('editorSave.invalid')+'\n'+t('editorSave.fieldDimensions'));
  const missing=requiredEditorFields(document.value,true);
  if(missing.length)throw Error(t('editorSave.required')+'\n'+missing.map(field=>t(field.label)).join('\n'));
  for(const [index,level] of levels.value.entries()){
    const kinds=['x','y',level?.type===1?'scoreBlocks':'targets','bombs'];
    const error=!RANK_BOMB_TYPES.includes(level?.type)?t('rank.selectType'):kinds.map(kind=>rangeError(level,kind)).find(Boolean);
    if(error){activeLevelIndex.value=index;editorPage.value='levels';throw Error(`${level?.label||index+1}: ${error}`);}
  }
  const result=await api.validateRankGameEditor(payload), validation=result?.data??result;
  if(!validation?.valid){
    const first=validation?.errors?.[0], match=/^levels\[(\d+)\]/.exec(first?.path||'');
    if(match){activeLevelIndex.value=Number(match[1]);editorPage.value='levels';}
    throw Error(first?`${first.path}: ${first.message}`:t('rank.validationFailed'));
  }
}
async function save(){
  if(!canSave.value)return false;busy.value='save';errorMessage.value='';saveFeedback.value=null;
  try{await withEditorSavingCursor(async()=>{
    syncGlobalPage();
    await nextTick();
    try{
      if(wiringPageRef.value?.hasChanges())document.value.wiringData=wiringPageRef.value.getDraft();
      if(document.value.wiringData?.runtimeEnabled===true)serializeGameWiring(document.value.wiringData);
    }catch(error){
      wiringPageMounted.value=true;editorPage.value='wiring';
      throw Error(error.message?.startsWith('gameWiring.')?t(error.message):error.message);
    }
    const payload=createRankEditorPayload(document.value,currentGameId.value); await validatePayload(payload);
    const result=currentGameId.value?await api.saveRankGameEditor(currentGameId.value,payload):await api.createRankGameEditor(payload);
    const saved=result?.data??result;
    if(saved?.saved!==true||!Number.isInteger(saved.gameId)||saved.gameId<1)throw Error(result?.message||t('rank.saveFailed'));
    document.value.id=saved.gameId;document.value.displayName=document.value.name;await nextTick();dirty.value=false;
    savedEditorDocument=JSON.parse(editorSnapshot(document.value));rangeDrafts.clear();
    globalPageRef.value?.markSaved();wiringPageRef.value?.markSaved();
    saveFeedback.value={message:t('rank.saved')};
  });return true;}catch(error){errorMessage.value=extractErrorMessage(error,t('rank.saveFailed'));saveFeedback.value={failed:true,message:errorMessage.value};return false;}
  finally{busy.value=null;}
}
function openGlobalConfig(){
  selectEditorPage('global');
}
function goBack(){emit('back');}
</script>

<template>
  <section class="rank-editor workspace" :aria-busy="busy === 'save'">
    <header class="rank-toolbar editor-heading-row">
      <button class="soft-button editor-back-button" type="button" @click="goBack">{{t('simple.backToList')}}</button>
      <div class="rank-actions editor-heading-actions">
        <button class="soft-button object-icon-button primary" type="button" :aria-label="t('simple.save')" :title="t('simple.save')" :disabled="!canSave" @click="save"><EditorActionIcon name="save" /></button>
        <button class="soft-button object-icon-button" data-editor-page="global" :class="{active:editorPage==='global'}" type="button" :aria-label="t('simple.globalConfig')" :title="t('simple.globalConfig')" :disabled="!canSave" @click="openGlobalConfig"><EditorActionIcon name="settings" /></button>
        <button class="soft-button object-icon-button" data-editor-page="wiring" :class="{active:editorPage==='wiring'}" type="button" :aria-label="t('gameWiring.title')" :title="t('gameWiring.title')" :disabled="!canSave" @click="selectEditorPage('wiring')"><EditorActionIcon name="wiring" /></button>
      </div>
      <div v-if="document" class="level-sequence-row">
        <div class="level-structure-actions">
          <button class="icon-add-button" type="button" :aria-label="t('simple.addLevel')" :title="t('simple.addLevel')" :disabled="!canSave" @click="addLevel">+</button>
          <button class="icon-add-button rank-duplicate-level" type="button" :aria-label="t('rank.duplicateLevel')" :data-tip="t('rank.duplicateLevel')" :disabled="!canSave||!type1Config||draggingLevelIndex!==null" @click="duplicateLevel"><EditorActionIcon name="copy" /></button>
        </div>
        <div class="sequence-list">
          <div v-for="(level,index) in levels" :key="levelKey(level)" class="rank-level-tab">
            <button class="sequence-pill" type="button" :class="{active:editorPage==='levels'&&activeLevelIndex===index,'level-drop-target':levelDropIndex===index}"
              :disabled="!canSave" :draggable="canSave" @dragstart="draggingLevelIndex=index" @dragover.prevent="draggingLevelIndex!==null&&(levelDropIndex=index)" @drop.prevent="dropLevel(index)" @dragend="endDrag" @click="selectLevel(index)">{{level?.label||`Level ${index+1}`}}</button>
            <button class="rank-level-delete" type="button" :aria-label="t('rank.deleteLevel',{name:level?.label||`Level ${index+1}`})" :title="t('rank.deleteLevel',{name:level?.label||`Level ${index+1}`})"
              :disabled="!canSave||levels.length<2||draggingLevelIndex!==null" draggable="false" @pointerdown.stop @dragstart.prevent.stop @click.stop="deleteLevel(index)">×</button>
          </div>
        </div>
      </div>
    </header>
    <p v-if="errorMessage" class="error-line" role="alert">{{errorMessage}}</p>
    <p v-if="loading">{{t('common.loading')}}</p>
    <main v-else-if="type1Config" v-show="editorPage==='levels'" class="rank-config-editor" data-rank-field="levels">
      <label><span>{{t('rank.levelName')}}</span><input v-model="type1Config.label" data-rank-field="level.label" /></label>
      <label class="rank-level-media"><span>{{t('rank.gameplayIntro')}}</span><div>
        <div class="rank-media-control"><input :value="mediaValue('playIntroVideo') || mediaValue('startGif')" :placeholder="t('globalConfig.notSelected')" readonly /><button class="soft-button compact-button" type="button" @click="chooseMedia('playIntroVideo','visual',t('rank.gameplayIntro'))">{{t('globalConfig.choose')}}</button></div>
        <video v-if="mediaValue('playIntroVideo')" class="rank-intro-preview" :src="buildMediaPreviewUrl(mediaValue('playIntroVideo'))" controls playsinline preload="metadata" />
        <img v-else-if="mediaValue('startGif')" class="rank-intro-preview" :src="buildMediaPreviewUrl(mediaValue('startGif'))" :alt="t('rank.gameplayIntro')" />
      </div></label>
      <label><span>{{t('management.rankReward')}}</span><input v-model.number="type1Config.rewardPoints" data-rank-field="level.rewardPoints" type="number" min="0" max="1000000" /></label>
      <label><span>{{t('rank.timeLimit')}}</span><input v-model.number="type1Config.durationSeconds" data-rank-field="level.durationSeconds" type="number" min="1" /></label>
      <label><span>{{t('rank.gameDescription')}}</span><textarea v-model="type1Config.description" rows="3"></textarea></label>
      <label v-for="field in [{key:'gameplayIntro',label:'rank.voiceDescription'},{key:'backgroundVoice',label:'rank.levelBackgroundMusic'}]" :key="field.key" class="rank-level-media"><span>{{t(field.label)}}</span><div>
        <div class="rank-media-control"><input :value="mediaValue(field.key)" :placeholder="t('globalConfig.notSelected')" readonly /><button class="soft-button compact-button" type="button" @click="chooseMedia(field.key,'audio',t(field.label))">{{t('globalConfig.choose')}}</button><button class="soft-button compact-button" type="button" :disabled="!mediaValue(field.key)" @click="type1Config[field.key]=''">{{t('globalConfig.clear')}}</button></div>
        <audio v-if="mediaValue(field.key)" :key="mediaValue(field.key)" :src="buildMediaPreviewUrl(mediaValue(field.key))" controls preload="none" />
      </div></label>
      <label v-for="kind in ['x','y']" :key="kind"><span>{{t(`rank.${kind}Range`)}}</span><div>
        <input :value="rangeText(kind)" :data-rank-field="`level.bounds.${kind}`" :placeholder="t('rank.optionalBounds')" :aria-invalid="Boolean(rangeError(type1Config,kind))" @input="setRange(kind,$event.target.value)" />
        <small v-if="rangeError(type1Config,kind)" class="field-error">{{t('rank.rangeInvalid')}}</small>
      </div></label>
      <div v-if="visibleWalls.length" class="rank-wall-media">
        <div v-for="wall in visibleWalls" :key="wall.field" class="rank-wall-field">
          <label :for="wall.field">{{ t(wall.label) }}</label>
          <MediaResourceButton :id="wall.field" :value="mediaValue(wall.field)" :label="t(wall.label)" accept="gif"
            :context-key="type1Config" :disabled="!canSave"
            @select="chooseMedia(wall.field,'gif',t(wall.label))" @clear="type1Config[wall.field]=''" />
        </div>
      </div>
      <label><span class="editor-required-label">{{t('globalConfig.type')}}</span><select v-model="type1Config.type" data-rank-field="level.type"><option :value="null" disabled>{{t('rank.selectType')}}</option><option v-for="type in RANK_BOMB_TYPES" :key="type" :value="type">{{t(`rank.type${type}`)}}</option></select></label>
      <template v-if="RANK_BOMB_TYPES.includes(type1Config.type)">
        <label v-for="field in [type1Config.type===1?{key:'scoreBlocks',label:'rank.scoreBlockCount'}:{key:'targets',label:'rank.targetRange'},{key:'bombs',label:'rank.bombRange'}]" :key="field.key"><span>{{t(field.label)}}</span><div>
          <input :value="rangeText(field.key)" :data-rank-field="field.key==='scoreBlocks'?'level.targets':`level.${field.key}`" :placeholder="t('rank.rangePlaceholder')" :aria-invalid="Boolean(rangeError(type1Config,field.key))" @input="setRange(field.key,$event.target.value)" />
          <small v-if="rangeError(type1Config,field.key)" class="field-error">{{rangeError(type1Config,field.key)}}</small>
        </div></label>
        <label><span>{{t('rank.bombAppearDelay')}}</span><input v-model.number="type1Config.bombWarningDelaySeconds" data-rank-field="level.bombWarningDelaySeconds" type="number" min="0" /></label>
        <label><span>{{t('rank.warningDuration')}}</span><input v-model.number="type1Config.bombWarningDurationSeconds" type="number" min="1" /></label>
        <label v-for="field in [{key:'bombWarningAudio',label:'rank.warningAudio'},{key:'bombExplosionAudio',label:'rank.explosionAudio'}]" :key="field.key" class="rank-level-media" :data-rank-field="`level.${field.key}`"><span>{{t(field.label)}}</span><div>
          <div class="rank-media-control"><input :value="mediaValue(field.key)" :placeholder="t('globalConfig.notSelected')" readonly /><button class="soft-button compact-button" type="button" @click="chooseMedia(field.key,'audio',t(field.label))">{{t('globalConfig.choose')}}</button><button class="soft-button compact-button" type="button" :disabled="!mediaValue(field.key)" @click="type1Config[field.key]=''">{{t('globalConfig.clear')}}</button></div>
          <audio v-if="mediaValue(field.key)" :key="mediaValue(field.key)" :src="buildMediaPreviewUrl(mediaValue(field.key))" controls preload="none" />
        </div></label>
        <label class="rank-explosion-volume">
          <span>{{t('rank.explosionVolume')}}</span>
          <div>
            <input v-model.number="type1Config.bombExplosionVolumePercent" data-rank-field="level.bombExplosionVolumePercent"
              type="range" min="0" max="200" step="1" :aria-label="t('rank.explosionVolume')" :aria-valuetext="type1Config.bombExplosionVolumePercent+'%'" />
            <output>{{type1Config.bombExplosionVolumePercent}}%</output>
          </div>
        </label>
        <label><span>{{t('rank.earlyRefresh')}}</span><input v-model="type1Config.earlyRefresh" type="checkbox" /></label>
        <label><span>{{t(type1Config.type===1?'rank.frameUpdatePeriod':'rank.refreshSeconds')}}</span><input v-model.number="type1Config.refreshSeconds" type="number" min="1" /></label>
      </template>
    </main>
    <EditorSaveToast v-if="saveFeedback && !saveFeedback.failed" :message="saveFeedback.message" @dismiss="saveFeedback = null" />
    <EditorSaveDialog v-else-if="saveFeedback" v-bind="saveFeedback" @close="saveFeedback=null" />
    <GameGlobalConfigDialog v-if="globalPageMounted" v-show="editorPage==='global'" ref="globalPageRef" embedded rank class="rank-global-config-page" :config="globalConfigDraft" :categories="gameCategories" :saving="busy==='save'" />
    <GameWiringDialog v-if="wiringPageMounted" v-show="editorPage==='wiring'" ref="wiringPageRef" embedded class="rank-wiring-page" :wiring="document?.wiringData" :width="document.siteSizeWidth" :height="document.siteSizeHeight" :saving="busy==='save'" />
    <MediaPickerDialog v-if="mediaPicker" :accept="mediaPicker.accept" :current-value="pickerValue(mediaPicker)" :title="mediaPicker.label" @cancel="mediaPicker=null" @select="applyMedia" />
  </section>
  <ConfirmationDialog v-if="confirmation" :key="confirmation.id" :request-id="confirmation.id" :message="confirmation.message"
    @accept="resolveConfirmation(true, $event)" @cancel="resolveConfirmation(false, $event)" />
</template>

<style scoped>
.rank-editor{display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;padding-bottom:12px}
.rank-toolbar{flex-shrink:0}
.rank-duplicate-level{position:relative}
.rank-duplicate-level:hover,.rank-duplicate-level:focus-visible{z-index:60}
.rank-editor .level-structure-actions .rank-duplicate-level[data-tip]::after{position:absolute;top:calc(100% + 8px);right:auto;left:50%;z-index:60;width:max-content;max-width:220px;padding:6px 8px;border-radius:8px;color:var(--ui-text);background:var(--ui-surface);box-shadow:var(--ui-shadow);content:attr(data-tip);font-size:12px;line-height:1.3;opacity:0;pointer-events:none;white-space:normal;transform:translateX(-50%);transition:opacity 80ms ease}
.rank-editor .level-structure-actions .rank-duplicate-level[data-tip]:hover::after,.rank-editor .level-structure-actions .rank-duplicate-level[data-tip]:focus-visible::after{opacity:1}
.rank-global-config-page{width:min(1100px,100%);align-self:center;flex:1;min-height:0}
.rank-wiring-page{flex:1;min-height:0}
.rank-config-editor{flex:1}
.rank-actions .active{border-color:var(--ui-accent);background:var(--ui-elevated)}
.rank-config-editor{display:grid;align-content:start;gap:12px;min-height:0;overflow:auto;padding:18px 24px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-surface)}
.rank-config-editor>label{display:grid;grid-template-columns:160px minmax(0,660px);align-items:start;gap:12px;color:var(--ui-text);font-size:13px}
.rank-config-editor>label>span{padding-top:9px}
input,textarea,select{width:100%;min-width:0;padding:8px 10px;border:1px solid var(--ui-border);border-radius:4px;background:var(--ui-input);color:var(--ui-text);font:inherit}
input[type=checkbox]{width:20px;height:20px;margin:8px 0}
.rank-explosion-volume>div{display:flex;align-items:center;gap:12px;min-height:34px}
.rank-explosion-volume input{padding:0;accent-color:var(--ui-accent)}
.rank-explosion-volume output{min-width:4ch;text-align:right;font-variant-numeric:tabular-nums}
.rank-media-control{display:flex;gap:6px;min-width:0}.rank-media-control input{flex:1}.rank-media-control button{flex-shrink:0}
.rank-intro-preview{display:block;max-width:220px;max-height:220px;margin-top:8px;object-fit:contain;image-rendering:pixelated}
.rank-wall-media{display:grid;grid-template-columns:repeat(4,minmax(0,112px));gap:16px;align-items:end}
.rank-wall-field{display:grid;min-width:0;gap:9px;font-size:13px;color:var(--ui-text)}
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

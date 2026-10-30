<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SpiritPointEditorDialog from '../components/SpiritPointEditorDialog.vue';
import SpiritThumbnail from '../components/SpiritThumbnail.vue';
import { confirmWithRendererFocus } from '../lib/rendererFocus.js';
import { requestSpiritDeletion } from '../lib/spiritLibraryState.js';

const { t } = useI18n();
const spirits = ref([]);
const selectedSpiritId = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const noticeMessage = ref('');
const editingSpirit = ref(null);
const creatingSpirit = ref(false);
const isSavingSpirit = ref(false);
const editErrorMessage = ref('');
const deletingSpirit = ref(false);
const spiritApi = computed(() => window.spiritLibrary);
const sortedSpirits = computed(() => [...spirits.value].sort((left, right) =>
  spiritName(left).localeCompare(spiritName(right), undefined, { sensitivity: 'base' })));
const selectedSpirit = computed(() => sortedSpirits.value.find(spirit => spirit.id === selectedSpiritId.value) || sortedSpirits.value[0] || null);
function spiritName(spirit) { return spirit?.name || spirit?.id || t('spirits.unnamed'); }
function sizeLabel(spirit) { return `${Number(spirit.width) || 1} × ${Number(spirit.height) || 1}`; }
function selectSpirit(spirit) { selectedSpiritId.value = spirit.id; }
function openSpiritEditor() {
  if (!selectedSpirit.value || deletingSpirit.value || isLoading.value || isSavingSpirit.value) return;
  editErrorMessage.value = '';
  creatingSpirit.value = false;
  editingSpirit.value = { ...selectedSpirit.value };
}
function openSpiritCreator() {
  if (deletingSpirit.value || isLoading.value || isSavingSpirit.value) return;
  editErrorMessage.value = '';
  creatingSpirit.value = true;
  editingSpirit.value = { id:'', name:'', color:0, width:16, height:16, points:'[]', basic:false };
}
async function deleteSelectedSpirit() {
  const selected = selectedSpirit.value;
  if (!selected || deletingSpirit.value || !spiritApi.value?.delete) return;
  deletingSpirit.value = true; errorMessage.value = '';
  try {
    const result = await requestSpiritDeletion({
      selected, visibleItems:sortedSpirits.value,
      confirm:() => confirmWithRendererFocus(t('management.deleteSpiritConfirm', { name:spiritName(selected) })),
      remove:(id) => spiritApi.value.delete(id),
    });
    if (result.status !== 'deleted') return;
    spirits.value = spirits.value.filter(item => item.id !== selected.id);
    selectedSpiritId.value = result.selectedId;
    noticeMessage.value = t('management.spiritDeleted', { name:spiritName(selected) });
    await loadSpirits({ preserveNotice:true });
  } catch (error) { errorMessage.value = error?.message || t('management.spiritDeleteFailed'); }
  finally { deletingSpirit.value = false; }
}
function closeSpiritEditor() {
  if (isSavingSpirit.value) return;
  editingSpirit.value = null; creatingSpirit.value = false; editErrorMessage.value = '';
}
async function saveSpirit(payload) {
  if (isSavingSpirit.value) return;
  const saveRequest = creatingSpirit.value ? spiritApi.value?.create : spiritApi.value?.update;
  if (!editingSpirit.value || !saveRequest) {
    editErrorMessage.value = t(creatingSpirit.value ? 'spirits.createApiUnavailable' : 'spirits.updateApiUnavailable');
    return;
  }
  isSavingSpirit.value = true; editErrorMessage.value = '';
  try {
    const result = creatingSpirit.value ? await saveRequest(payload) : await saveRequest(editingSpirit.value.id, payload);
    const updated = result?.data;
    if (!updated?.id) throw new Error(t('spirits.invalidSaveResponse'));
    const index = spirits.value.findIndex(spirit => spirit.id === updated.id);
    if (index >= 0) spirits.value.splice(index, 1, updated);
    else spirits.value.push(updated);
    selectedSpiritId.value = updated.id;
    editingSpirit.value = null; creatingSpirit.value = false;
    noticeMessage.value = t(index >= 0 ? 'spirits.saved' : 'spirits.created', { name:spiritName(updated) });
    await loadSpirits({ preserveNotice:true });
  } catch (error) { editErrorMessage.value = error?.message || t('spirits.saveFailed'); }
  finally { isSavingSpirit.value = false; }
}
async function loadSpirits({ preserveNotice = false } = {}) {
  if (isLoading.value) return;
  errorMessage.value = '';
  if (!preserveNotice) noticeMessage.value = '';
  if (!spiritApi.value?.list) { spirits.value = []; errorMessage.value = t('spirits.apiUnavailable'); return; }
  isLoading.value = true;
  try {
    const result = await spiritApi.value.list();
    spirits.value = Array.isArray(result?.data) ? result.data : [];
    if (!spirits.value.some(spirit => spirit.id === selectedSpiritId.value)) selectedSpiritId.value = sortedSpirits.value[0]?.id || '';
  } catch (error) { errorMessage.value = error?.message || t('spirits.readFailed'); }
  finally { isLoading.value = false; }
}
onMounted(loadSpirits);
</script>

<template>
  <section class="workspace spirit-library-view">
    <div class="page-heading spirit-heading">
      <h1>{{ t('spirits.title') }}</h1>
      <div class="spirit-heading-actions">
        <button class="icon-add-button" type="button" :title="t('spirits.add')" :aria-label="t('spirits.add')" :disabled="isLoading || deletingSpirit || isSavingSpirit" @click="openSpiritCreator">+</button>
      </div>
    </div>
    <p v-if="errorMessage" class="error-line" role="alert">{{ errorMessage }}</p>
    <div v-if="isLoading" class="spirit-state-panel">{{ t('spirits.reading') }}</div>
    <div v-else-if="!sortedSpirits.length" class="spirit-state-panel">{{ t('spirits.empty') }}</div>
    <section v-else class="spirit-thumbnail-browser">
      <div class="spirit-browser-toolbar">
        <span>{{ t('common.itemCount', { count:sortedSpirits.length }) }}</span>
        <strong class="spirit-selected-name">{{ spiritName(selectedSpirit) }}</strong>
      </div>
      <div class="spirit-thumbnail-grid" :aria-label="t('spirits.templates')">
        <article v-for="spirit in sortedSpirits" :key="spirit.id" class="spirit-thumbnail-card"
          :class="{ selected:selectedSpirit?.id === spirit.id }" :data-id="spirit.id">
          <button class="spirit-thumbnail-select" type="button"
            :aria-pressed="selectedSpirit?.id === spirit.id" :disabled="deletingSpirit || isSavingSpirit"
            @click="selectSpirit(spirit)">
            <SpiritThumbnail :spirit="spirit" />
            <strong :title="spiritName(spirit)">{{ spiritName(spirit) }}</strong>
            <small>{{ sizeLabel(spirit) }}</small>
          </button>
          <div v-if="selectedSpirit?.id === spirit.id" class="spirit-card-actions">
            <button class="soft-button" type="button" :disabled="deletingSpirit || isSavingSpirit" @click="openSpiritEditor">{{ t('spirits.edit') }}</button>
            <button class="soft-button spirit-delete-button" type="button" :disabled="deletingSpirit || isSavingSpirit" @click="deleteSelectedSpirit">{{ t(deletingSpirit ? 'management.deleting' : 'management.delete') }}</button>
          </div>
        </article>
      </div>
    </section>
    <p v-if="noticeMessage && !errorMessage" class="status-line">{{ noticeMessage }}</p>
    <SpiritPointEditorDialog v-if="editingSpirit" :spirit="editingSpirit" :creating="creatingSpirit" :saving="isSavingSpirit" :error="editErrorMessage" @cancel="closeSpiritEditor" @save="saveSpirit" />
  </section>
</template>

<style scoped>
.spirit-thumbnail-browser { display:grid; gap:16px; min-width:0; }
.spirit-browser-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.spirit-browser-toolbar > span { color:var(--ui-muted); }
.spirit-selected-name { margin-left:auto; overflow-wrap:anywhere; }
.spirit-thumbnail-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:14px; }
.spirit-thumbnail-card { position:relative; min-width:0; color:var(--ui-text); background:var(--ui-elevated); border:1px solid var(--ui-border); border-radius:var(--ui-radius-control); }
.spirit-thumbnail-select { display:flex; flex-direction:column; align-items:center; gap:8px; width:100%; min-width:0; padding:12px 12px 48px; border:0; border-radius:inherit; color:inherit; background:transparent; cursor:pointer; }
.spirit-card-actions { position:absolute; right:8px; bottom:8px; left:8px; display:flex; justify-content:center; gap:8px; visibility:hidden; opacity:0; pointer-events:none; }
.spirit-thumbnail-card.selected:is(:hover, :focus-within) .spirit-card-actions { visibility:visible; opacity:1; pointer-events:auto; }
.spirit-card-actions .soft-button { min-height:30px; padding:4px 12px; }
.spirit-thumbnail-card.selected { border-color:var(--ui-accent); box-shadow:var(--ui-selected-shadow); }
.spirit-thumbnail-card strong { width:100%; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; }
.spirit-thumbnail-card small { color:var(--ui-muted); }
</style>

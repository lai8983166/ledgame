<script setup>
import { computed, onActivated, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CatalogDeleteDialog from "../components/CatalogDeleteDialog.vue";
import GameCreationDialog from "../components/GameCreationDialog.vue";
import GameCategoryCard from "../components/GameCategoryCard.vue";
import GameCategoryEditDialog from "../components/GameCategoryEditDialog.vue";
import SimpleGameCard from "../components/SimpleGameCard.vue";
import { useI18n } from "vue-i18n";
import { extractErrorMessage, unwrapBackendData } from "../lib/gameFlowState.js";
import { loadSupportedGames } from "../lib/gameCatalog.js";
import { reorderVisibleSlots, orderedGameIds } from "../lib/catalogOrdering.js";
import { gamesInCategory, normalizeGameCategoryList } from "../lib/gameCategories.js";

const { t } = useI18n({ useScope: "global" });
const api = window.ledGame;
const props = defineProps({
  section: { type: String, default: "home" },
});
const emit = defineEmits(["open-game", "play-game", "update:section"]);
const section = computed({
  get: () => props.section === "list" ? "list" : "home",
  set: (value) => emit("update:section", value === "list" ? "list" : "home"),
});
const games = ref([]);
const categories = ref([]);
const loading = ref(false);
const categoriesLoading = ref(false);
const errorMessage = ref("");
const categoryErrorMessage = ref("");
const warningMessage = ref("");
const creationOpen = ref(false);
const creationMode = ref('create');
const deleting = ref(null);
const deletionBusy = ref(false);
const deletionError = ref('');
const exportBusy = ref(false);
let removeCatalogListener;
onMounted(() => { removeCatalogListener = api?.onCatalogChanged?.(() => void Promise.all([loadGames(), loadCategories()])); });
onActivated(() => void Promise.all([loadGames(), loadCategories()]));
onBeforeUnmount(() => removeCatalogListener?.());
function beginDelete(kind, value) {
  if (deletionBusy.value || orderSaving.value) return;
  deletionError.value = '';
  deleting.value = { kind, value };
}
async function confirmDelete() {
  if (!deleting.value || deletionBusy.value) return;
  deletionBusy.value = true; deletionError.value = '';
  try {
    const {kind, value} = deleting.value;
    if (kind === 'category') await api.deleteGameCategory(value.id);
    else await api.deleteGame(value.id);
    deleting.value = null;
    await Promise.all([loadGames(), loadCategories()]);
  } catch (error) { deletionError.value = extractErrorMessage(error, t('catalogMaintenance.failed')); }
  finally { deletionBusy.value = false; }
}
async function exportGame(game) {
  if (exportBusy.value) return;
  exportBusy.value = true; errorMessage.value = '';
  try { await api.exportGame(game.id); }
  catch (error) { errorMessage.value = extractErrorMessage(error, t('catalogMaintenance.failed')); }
  finally { exportBusy.value = false; }
}
const creationSaving = ref(false);
const creationError = ref("");
const orderSaving = ref(false);
const dragSource = ref(null);
const dragKind = ref('');
const dropTarget = ref(null);
const selectedCategory = ref(null);
const categoryDialogOpen = ref(false);
const editingCategory = ref(null);
const categoryName = ref("");
const categoryCover = ref("");
const categorySaving = ref(false);
const categoryError = ref("");
const isDemoGame = (game) => String(game?.name || "").trim().toLowerCase() === "simple-demo";
const visibleGames = computed(() => (selectedCategory.value
  ? gamesInCategory(games.value, selectedCategory.value.id)
  : games.value).filter((game) => !isDemoGame(game)));
const displayGames = visibleGames;

watch(
  () => props.section,
  () => {
    selectedCategory.value = null;
    endDrag();
  },
);

onMounted(() => {
  void Promise.all([loadGames(), loadCategories()]);
});

async function loadGames() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  warningMessage.value = "";
  try {
    const result = await loadSupportedGames(api, { includeHidden: true });
    games.value = result.games;
    if (result.initializationError) {
      warningMessage.value = t("games.seedWarning", {
        message: extractErrorMessage(result.initializationError, t("games.seedFailed")),
      });
    }
    if (!games.value.length && result.initializationError) {
      errorMessage.value = warningMessage.value;
      warningMessage.value = "";
    }
  } catch (error) {
    games.value = [];
    errorMessage.value = extractErrorMessage(error, t("games.loadFailed"));
  } finally {
    loading.value = false;
  }
}

function beginCreateGame(mode = 'create') {
  creationMode.value = mode;
  creationError.value = "";
  creationOpen.value = true;
}

async function createGame(family) {
  if (creationSaving.value) return;
  creationSaving.value = true;
  creationError.value = "";
  try {
    if (creationMode.value === 'import') {
      const result = await api.importGame(family);
      creationOpen.value = false;
      if (!result.canceled) await loadGames();
      return;
    }
    if (!api?.newGameDraft) throw new Error(t('gameCreation.unavailable'));
    const game = unwrapBackendData(await api.newGameDraft(family));
    if (!game || game.id != null || !['default', 'rank'].includes(game.type)) throw new Error(t('gameCreation.invalidResponse'));
    creationOpen.value = false;
    emit('open-game', { ...game, draft: game });
  } catch (error) {
    creationError.value = extractErrorMessage(error, t('gameCreation.failed'));
  } finally { creationSaving.value = false; }
}

async function loadCategories() {
  if (!api?.listGameCategories || categoriesLoading.value) return;
  categoriesLoading.value = true;
  categoryErrorMessage.value = "";
  try {
    categories.value = normalizeGameCategoryList(await api.listGameCategories());
    if (selectedCategory.value) {
      selectedCategory.value = categories.value.find((item) => item.id === selectedCategory.value.id) || null;
    }
  } catch (error) {
    categories.value = [];
    categoryErrorMessage.value = extractErrorMessage(error, t("gameCategories.loadFailed"));
  } finally {
    categoriesLoading.value = false;
  }
}

function openCategory(category) {
  selectedCategory.value = category;
  section.value = "home";
  endDrag();
}

function beginAddCategory() {
  editingCategory.value = null;
  categoryName.value = "";
  categoryCover.value = "";
  categoryError.value = "";
  categoryDialogOpen.value = true;
}

function editCategory(category) {
  editingCategory.value = category;
  categoryName.value = category.name;
  categoryCover.value = category.cover || "";
  categoryError.value = "";
  categoryDialogOpen.value = true;
}

function closeCategoryDialog() {
  if (categorySaving.value) return;
  categoryDialogOpen.value = false;
  editingCategory.value = null;
  categoryError.value = "";
}

async function saveCategory() {
  if (!api || categorySaving.value) return;
  const name = categoryName.value.trim();
  if (!name) {
    categoryError.value = t("gameCategories.nameRequired");
    return;
  }
  categorySaving.value = true;
  categoryError.value = "";
  try {
    const payload = { name, cover: categoryCover.value || "" };
    const response = editingCategory.value
      ? await api.updateGameCategory(editingCategory.value.id, payload)
      : await api.createGameCategory(payload);
    const saved = normalizeGameCategoryList([response?.data ?? response])[0];
    if (!saved) throw new Error(t("gameCategories.saveFailed"));
    if (editingCategory.value) {
      categories.value = categories.value.map((item) => item.id === saved.id ? saved : item);
      if (selectedCategory.value?.id === saved.id) selectedCategory.value = saved;
    } else {
      categories.value = normalizeGameCategoryList([...categories.value, saved]);
    }
    categoryDialogOpen.value = false;
    editingCategory.value = null;
    categoryError.value = "";
  } catch (error) {
    categoryError.value = extractErrorMessage(error, t("gameCategories.saveFailed"));
  } finally {
    categorySaving.value = false;
  }
}

function openGame(game) {
  emit("open-game", game);
}

function startDrag(event, id, kind) {
  if (orderSaving.value) { event.preventDefault(); return; }
  dragSource.value = id; dragKind.value = kind;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `${kind}:${id}`);
}
function overDrag(id, kind) {
  if (dragSource.value !== null && dragKind.value === kind && !orderSaving.value) dropTarget.value = id;
}
function endDrag() { dragSource.value = null; dragKind.value = ''; dropTarget.value = null; }
async function dropCard(id, kind) {
  if (orderSaving.value || dragSource.value === null || dragKind.value !== kind || dragSource.value === id) { endDrag(); return; }
  const items = kind === 'category' ? categories : games;
  const before = [...items.value];
  const visibleIds = orderedGameIds(kind === 'category' ? categories.value : visibleGames.value);
  const next = reorderVisibleSlots(before, visibleIds, dragSource.value, id);
  endDrag();
  orderSaving.value = true;
  errorMessage.value = ''; categoryErrorMessage.value = '';
  items.value = next;
  try {
    const save = kind === 'category' ? api?.reorderGameCategories : api?.reorderGames;
    if (!save) throw new Error(t('management.orderSaveFailed'));
    const response = await save(orderedGameIds(next));
    if (response?.code && response.code !== 200) throw new Error(response.message);
    items.value = kind === 'category'
      ? normalizeGameCategoryList(response)
      : next.map((item, index) => ({ ...item, displayOrder: index }));
  } catch (error) {
    items.value = before;
    (kind === 'category' ? categoryErrorMessage : errorMessage).value = extractErrorMessage(error, t('management.orderSaveFailed'));
  } finally { orderSaving.value = false; }
}
</script>

<template>
  <section class="workspace game-list-view" :class="{ 'catalog-sorting': dragSource !== null || orderSaving }" :aria-busy="orderSaving">
    <div class="page-heading">
      <div>
        <h1>{{ selectedCategory ? selectedCategory.name : t(section === 'home' ? 'gameCategories.homeTitle' : 'games.title') }}</h1>
      </div>
      <div class="catalog-toolbar">
        <button class="soft-button" type="button" @click="beginCreateGame('import')">{{ t('catalogMaintenance.import') }}</button>
        <button class="action-button primary" type="button" @click="beginCreateGame()">{{ t('gameCreation.create') }}</button>
      </div>
    </div>

    <p v-if="warningMessage" class="status-line" role="status">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="error-line" role="alert">
      {{ errorMessage }}
      <button class="soft-button" type="button" :disabled="loading" @click="loadGames">
        {{ t("games.reload") }}
      </button>
    </p>

    <template v-if="section === 'home' && !selectedCategory">
      <div class="game-category-heading">
        <button class="action-button primary" type="button" @click="beginAddCategory">{{ t("gameCategories.add") }}</button>
      </div>
      <p v-if="categoryErrorMessage" class="error-line" role="alert">
        {{ categoryErrorMessage }}
        <button class="soft-button" type="button" :disabled="categoriesLoading" @click="loadCategories">{{ t("games.reload") }}</button>
      </p>
      <div v-if="categoriesLoading" class="editor-loading">{{ t("gameCategories.loading") }}</div>
      <div v-else-if="!categories.length" class="editor-loading">
        <p>{{ t("gameCategories.empty") }}</p>
        <button class="soft-button" type="button" @click="beginAddCategory">{{ t("gameCategories.add") }}</button>
      </div>
      <div v-else class="game-category-grid">
        <GameCategoryCard
          v-for="category in categories"
          :key="category.id"
          :category="category"
          :order-blocked="orderSaving"
          :dragging="dragSource === category.id && dragKind === 'category'"
          :drop-target="dropTarget === category.id && dragKind === 'category'"
          @reorder-start="(event, id) => startDrag(event, id, 'category')"
          @reorder-over="overDrag($event, 'category')"
          @reorder-drop="dropCard($event, 'category')"
          @reorder-end="endDrag"
          @open="openCategory"
          @edit="editCategory"
          @delete="beginDelete('category', $event)"
        />
      </div>
    </template>

    <template v-else>
      <div v-if="selectedCategory" class="game-category-breadcrumb">
        <button class="soft-button" type="button" @click="selectedCategory = null">{{ t("gameCategories.backHome") }}</button>
      </div>
      <div v-if="loading" class="editor-loading">{{ t("games.loading") }}</div>
      <div v-else-if="!displayGames.length && !errorMessage" class="editor-loading">
        <p>{{ selectedCategory ? t("gameCategories.noGames") : t("games.noSupportedGames") }}</p>
        <button class="soft-button" type="button" @click="loadGames">{{ t("games.reload") }}</button>
      </div>
      <div v-else class="game-card-grid">
          <SimpleGameCard
            v-for="game in displayGames"
            :key="game.id"
            :game="game"
            :order-blocked="orderSaving"
            :dragging="dragSource === game.id && dragKind === 'game'"
            :drop-target="dropTarget === game.id && dragKind === 'game'"
            @reorder-start="(event, id) => startDrag(event, id, 'game')"
            @reorder-over="overDrag($event, 'game')"
            @reorder-drop="dropCard($event, 'game')"
            @reorder-end="endDrag"
            @open-game="openGame"
            @play-game="emit('play-game', $event)"
            @export-game="exportGame"
            @delete-game="beginDelete('game', $event)"
          />
      </div>
    </template>

    <GameCreationDialog v-if="creationOpen" :mode="creationMode" :saving="creationSaving" :error="creationError"
      @cancel="creationOpen = false" @create="createGame" />


    <CatalogDeleteDialog v-if="deleting"
      :message="t(deleting.kind === 'category' ? 'catalogMaintenance.deleteCategory' : 'catalogMaintenance.deleteGame', { name: deleting.value.name })"
      :busy="deletionBusy" :error="deletionError" @cancel="deleting = null" @confirm="confirmDelete" />

    <GameCategoryEditDialog
      v-if="categoryDialogOpen"
      :category="editingCategory"
      :name="categoryName"
      :cover="categoryCover"
      :saving="categorySaving"
      :error="categoryError"
      @update:name="categoryName = $event"
      @update:cover="categoryCover = $event"
      @cancel="closeCategoryDialog"
      @save="saveCategory"
    />
  </section>
</template>

<style scoped>
.catalog-toolbar { display:flex; gap:12px; }
</style>

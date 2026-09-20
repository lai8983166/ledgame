<script setup>
import { computed, onMounted, ref, watch } from "vue";
import GameInfoEditDialog from "../components/GameInfoEditDialog.vue";
import GameCategoryCard from "../components/GameCategoryCard.vue";
import GameCategoryEditDialog from "../components/GameCategoryEditDialog.vue";
import SimpleGameCard from "../components/SimpleGameCard.vue";
import { useI18n } from "vue-i18n";
import { extractErrorMessage } from "../lib/gameFlowState.js";
import { loadSupportedGames } from "../lib/gameCatalog.js";
import { createOrderDraft, moveOrderItem, orderedGameIds } from "../lib/catalogOrdering.js";
import { gamesInCategory, normalizeGameCategoryList } from "../lib/gameCategories.js";

const { t } = useI18n({ useScope: "global" });
const api = window.ledGame;
const props = defineProps({
  section: { type: String, default: "home" },
});
const emit = defineEmits(["open-game", "update:section"]);
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
const editingGame = ref(null);
const editCover = ref("");
const editName = ref("");
const editChildModeVisible = ref(true);
const editFirstCatalog = ref("");
const editLoading = ref(false);
const editSaving = ref(false);
const editError = ref("");
const ordering = ref(false);
const orderDraft = ref([]);
const orderSaving = ref(false);
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
const displayGames = computed(() => ordering.value ? orderDraft.value : visibleGames.value);

watch(
  () => props.section,
  () => {
    selectedCategory.value = null;
    ordering.value = false;
    orderDraft.value = [];
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
    games.value = result.games.filter((game) => !isDemoGame(game));
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
  ordering.value = false;
  orderDraft.value = [];
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

function editGame(game) {
  editingGame.value = game;
  editCover.value = game.cover || "";
  editName.value = game.name || "";
  editChildModeVisible.value = game.childModeVisible !== false;
  editFirstCatalog.value = game.firstCatalog || "";
  editError.value = "";
}

function closeGameInfo() {
  if (editLoading.value || editSaving.value) {
    return;
  }
  editingGame.value = null;
  editCover.value = "";
  editName.value = "";
  editChildModeVisible.value = true;
  editFirstCatalog.value = "";
  editError.value = "";
}

async function saveGameInfo() {
  const game = editingGame.value;
  if (!game || editLoading.value || editSaving.value) {
    return;
  }
  editSaving.value = true;
  editError.value = "";
  try {
    const cover = editCover.value || "";
    const name = editName.value.trim();
    if (!name) throw new Error(t("management.nameRequired"));
    const childModeVisible = editChildModeVisible.value !== false;
    const firstCatalog = editFirstCatalog.value || "";
    await api.updateGameMetadata(game.id, { cover, name, childModeVisible, firstCatalog });
    games.value = games.value.map((item) =>
      Number(item.id) === Number(game.id)
        ? { ...item, cover, name, displayName: name, childModeVisible, firstCatalog }
        : item,
    );
    editingGame.value = null;
    editCover.value = "";
    editError.value = "";
  } catch (error) {
    editError.value = extractErrorMessage(error, t("games.saveGameInfoFailed"));
  } finally {
    editSaving.value = false;
  }
}

function beginOrdering() { orderDraft.value = createOrderDraft(games.value); ordering.value = true; }
function cancelOrdering() { ordering.value = false; orderDraft.value = []; }
function moveGame(index, delta) {
  orderDraft.value = moveOrderItem(orderDraft.value, index, delta);
}
async function saveOrder() {
  if (!api?.reorderGames || orderSaving.value) return;
  orderSaving.value = true; errorMessage.value = "";
  try { await api.reorderGames(orderedGameIds(orderDraft.value)); games.value = [...orderDraft.value]; cancelOrdering(); }
  catch (error) { errorMessage.value = extractErrorMessage(error, t("management.orderSaveFailed")); }
  finally { orderSaving.value = false; }
}
</script>

<template>
  <section class="workspace game-list-view">
    <div class="page-heading">
      <div>
        <h1>{{ t("games.title") }}</h1>
        <p>{{ selectedCategory ? selectedCategory.name : t("games.subtitle") }}</p>
      </div>
      <div v-if="section === 'list'" class="game-order-actions">
          <button v-if="!ordering" class="soft-button" type="button" @click="beginOrdering">{{ t('management.reorder') }}</button>
          <template v-else>
            <button class="soft-button" type="button" :disabled="orderSaving" @click="cancelOrdering">{{ t('common.cancel') }}</button>
            <button class="action-button primary" type="button" :disabled="orderSaving" @click="saveOrder">{{ orderSaving ? t('common.loading') : t('common.save') }}</button>
          </template>
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
        <div>
          <h2>{{ t("gameCategories.homeTitle") }}</h2>
          <p>{{ t("gameCategories.homeDescription") }}</p>
        </div>
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
          @open="openCategory"
          @edit="editCategory"
        />
      </div>
    </template>

    <template v-else>
      <div v-if="selectedCategory" class="game-category-breadcrumb">
        <button class="soft-button" type="button" @click="selectedCategory = null">{{ t("gameCategories.backHome") }}</button>
        <span>{{ selectedCategory.name }}</span>
      </div>
      <div v-if="loading" class="editor-loading">{{ t("games.loading") }}</div>
      <div v-else-if="!displayGames.length && !errorMessage" class="editor-loading">
        <p>{{ selectedCategory ? t("gameCategories.noGames") : t("games.noSupportedGames") }}</p>
        <button class="soft-button" type="button" @click="loadGames">{{ t("games.reload") }}</button>
      </div>
      <div v-else class="game-card-grid">
        <template v-if="!ordering">
          <SimpleGameCard
            v-for="game in displayGames"
            :key="game.id"
            :game="game"
            @open-game="openGame"
            @edit-game="editGame"
          />
        </template>
        <template v-else>
          <div v-for="(game, index) in orderDraft" :key="`order-${game.id}`" class="game-order-control">
            <strong>{{ game.displayName || game.name }}</strong>
            <button type="button" :disabled="index === 0" @click="moveGame(index, -1)">{{ t('management.moveUp') }}</button>
            <button type="button" :disabled="index === orderDraft.length - 1" @click="moveGame(index, 1)">{{ t('management.moveDown') }}</button>
          </div>
        </template>
      </div>
    </template>

    <GameInfoEditDialog
      v-if="editingGame"
      :game="editingGame"
      :cover="editCover"
      :name="editName"
      :child-mode-visible="editChildModeVisible"
      :first-catalog="editFirstCatalog"
      :categories="categories"
      :loading="editLoading"
      :saving="editSaving"
      :error="editError"
      @update:cover="editCover = $event"
      @update:name="editName = $event"
      @update:child-mode-visible="editChildModeVisible = $event"
      @update:first-catalog="editFirstCatalog = $event"
      @cancel="closeGameInfo"
      @save="saveGameInfo"
    />

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

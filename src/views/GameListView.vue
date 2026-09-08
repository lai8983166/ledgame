<script setup>
import { computed, onMounted, ref } from "vue";
import GameInfoEditDialog from "../components/GameInfoEditDialog.vue";
import SimpleGameCard from "../components/SimpleGameCard.vue";
import { useI18n } from "vue-i18n";
import { extractErrorMessage } from "../lib/gameFlowState.js";
import { loadSupportedGames } from "../lib/gameCatalog.js";
import { createOrderDraft, moveOrderItem, orderedGameIds } from "../lib/catalogOrdering.js";

const { t } = useI18n({ useScope: "global" });
const api = window.ledGame;
const emit = defineEmits(["open-game"]);
const games = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const warningMessage = ref("");
const editingGame = ref(null);
const editCover = ref("");
const editName = ref("");
const editChildModeVisible = ref(true);
const editLoading = ref(false);
const editSaving = ref(false);
const editError = ref("");
const ordering = ref(false);
const orderDraft = ref([]);
const orderSaving = ref(false);
const displayGames = computed(() => ordering.value ? orderDraft.value : games.value);

onMounted(loadGames);

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

function openGame(game) {
  emit("open-game", game);
}

function editGame(game) {
  editingGame.value = game;
  editCover.value = game.cover || "";
  editName.value = game.name || "";
  editChildModeVisible.value = game.childModeVisible !== false;
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
    await api.updateGameMetadata(game.id, { cover, name, childModeVisible });
    games.value = games.value.map((item) =>
      Number(item.id) === Number(game.id)
        ? { ...item, cover, name, displayName: name, childModeVisible }
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
        <p>{{ t("games.subtitle") }}</p>
      </div>
      <div class="game-order-actions"><button v-if="!ordering" class="soft-button" type="button" @click="beginOrdering">{{ t('management.reorder') }}</button><template v-else><button class="soft-button" type="button" :disabled="orderSaving" @click="cancelOrdering">{{ t('common.cancel') }}</button><button class="action-button primary" type="button" :disabled="orderSaving" @click="saveOrder">{{ orderSaving ? t('common.loading') : t('common.save') }}</button></template></div>
    </div>

    <p v-if="warningMessage" class="status-line" role="status">{{ warningMessage }}</p>
    <p v-if="errorMessage" class="error-line" role="alert">
      {{ errorMessage }}
      <button class="soft-button" type="button" :disabled="loading" @click="loadGames">
        {{ t("games.reload") }}
      </button>
    </p>

    <div v-if="loading" class="editor-loading">{{ t("games.loading") }}</div>
    <div v-else-if="!games.length && !errorMessage" class="editor-loading">
      <p>{{ t("games.noSupportedGames") }}</p>
      <button class="soft-button" type="button" @click="loadGames">{{ t("games.reload") }}</button>
    </div>
    <div v-else class="game-card-grid">
      <SimpleGameCard
        v-if="!ordering"
        v-for="(game, index) in displayGames"
        :key="game.id"
        :game="game"
        @open-game="openGame"
        @edit-game="editGame"
      />
      <div v-if="ordering" v-for="(game, index) in orderDraft" :key="`order-${game.id}`" class="game-order-control"><strong>{{ game.displayName || game.name }}</strong><button type="button" :disabled="index === 0" @click="moveGame(index, -1)">{{ t('management.moveUp') }}</button><button type="button" :disabled="index === orderDraft.length - 1" @click="moveGame(index, 1)">{{ t('management.moveDown') }}</button></div>
    </div>

    <GameInfoEditDialog
      v-if="editingGame"
      :game="editingGame"
      :cover="editCover"
      :name="editName"
      :child-mode-visible="editChildModeVisible"
      :loading="editLoading"
      :saving="editSaving"
      :error="editError"
      @update:cover="editCover = $event"
      @update:name="editName = $event"
      @update:child-mode-visible="editChildModeVisible = $event"
      @cancel="closeGameInfo"
      @save="saveGameInfo"
    />
  </section>
</template>

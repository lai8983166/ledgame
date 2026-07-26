<script setup>
import { onMounted, ref } from "vue";
import SimpleGameCard from "../components/SimpleGameCard.vue";
import { useI18n } from "vue-i18n";
import { extractErrorMessage } from "../lib/gameFlowState.js";
import { loadSimpleGameVariants } from "../lib/simpleGameVariants.js";

const { t } = useI18n({ useScope: "global" });
const api = window.ledGame;
const emit = defineEmits(["open-game"]);
const games = ref([]);
const loading = ref(false);
const errorMessage = ref("");
const warningMessage = ref("");

onMounted(loadGames);

async function loadGames() {
  if (loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  warningMessage.value = "";
  try {
    const result = await loadSimpleGameVariants(api);
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
</script>

<template>
  <section class="workspace game-list-view">
    <div class="page-heading">
      <div>
        <h1>{{ t("games.title") }}</h1>
        <p>{{ t("games.subtitle") }}</p>
      </div>
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
        v-for="game in games"
        :key="game.id"
        :game="game"
        @open-game="openGame"
      />
    </div>
  </section>
</template>

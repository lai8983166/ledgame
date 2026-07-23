<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n({ useScope: "global" });
const api = window.ledGame;
const refreshing = ref(false);
const result = ref(null);
const available = ref(true);
let reloadTimer = null;

const statusMessage = computed(() => {
  const status = result.value?.status;
  if (!status) {
    return "";
  }
  const key = `databaseRefresh.status.${status}`;
  const translated = t(key);
  return translated === key
    ? result.value?.message || t("databaseRefresh.status.REFRESH_FAILED")
    : translated;
});

const isSuccess = computed(() => result.value?.status === "SUCCESS");
const isRecoverableFailure = computed(() =>
  ["REPLACE_FAILED", "RESTART_FAILED_RECOVERED"].includes(result.value?.status),
);

async function refreshDatabase() {
  if (refreshing.value || !available.value) {
    return;
  }
  if (!api?.refreshDatabase) {
    result.value = {
      status: "API_UNAVAILABLE",
      message: t("databaseRefresh.status.API_UNAVAILABLE"),
    };
    return;
  }
  const confirmed = window.confirm(t("databaseRefresh.confirm"));
  if (!confirmed) {
    result.value = { status: "CANCELED" };
    return;
  }

  refreshing.value = true;
  result.value = null;
  try {
    result.value = await api.refreshDatabase();
    if (result.value?.status === "SUCCESS") {
      reloadTimer = window.setTimeout(() => window.location.reload(), 700);
    }
  } catch (error) {
    result.value = {
      status: "REFRESH_FAILED",
      message: error?.message || String(error),
    };
  } finally {
    refreshing.value = false;
  }
}

onMounted(async () => {
  try {
    const availability = await api?.databaseRefreshAvailability?.();
    if (availability && availability.available === false) {
      available.value = false;
      result.value = availability;
    }
  } catch (error) {
    available.value = false;
    result.value = {
      status: "API_UNAVAILABLE",
      message: error?.message || String(error),
    };
  }
});

onUnmounted(() => {
  if (reloadTimer) {
    window.clearTimeout(reloadTimer);
    reloadTimer = null;
  }
});
</script>

<template>
  <section class="workspace database-refresh-view">
    <div class="page-heading">
      <div>
        <h1>{{ t("databaseRefresh.title") }}</h1>
        <p>{{ t("databaseRefresh.subtitle") }}</p>
      </div>
    </div>

    <section class="database-refresh-panel" aria-labelledby="database-refresh-heading">
      <div class="database-refresh-copy">
        <span class="database-refresh-eyebrow">{{ t("databaseRefresh.eyebrow") }}</span>
        <h2 id="database-refresh-heading">{{ t("databaseRefresh.actionTitle") }}</h2>
        <p>{{ t("databaseRefresh.description") }}</p>
        <p class="database-refresh-warning">{{ t("databaseRefresh.warning") }}</p>
      </div>

      <button
        class="action-button primary database-refresh-button"
        type="button"
        :disabled="refreshing"
        @click="refreshDatabase"
      >
        {{ refreshing ? t("databaseRefresh.refreshing") : t("databaseRefresh.action") }}
      </button>
    </section>

    <section
      v-if="result"
      class="database-refresh-result"
      :class="{
        success: isSuccess,
        warning: isRecoverableFailure,
        error: !isSuccess && !isRecoverableFailure,
      }"
      aria-live="polite"
    >
      <strong>{{ statusMessage }}</strong>
      <small v-if="result.backupDirectory">
        {{ t("databaseRefresh.backup", { path: result.backupDirectory }) }}
      </small>
      <small v-if="result.message && statusMessage !== result.message">{{ result.message }}</small>
    </section>
  </section>
</template>

<style scoped>
.database-refresh-view {
  width: min(980px, 100%);
}

.database-refresh-panel {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 20px;
  background: rgba(238, 241, 245, 0.76);
  box-shadow:
    12px 12px 24px rgba(178, 187, 201, 0.35),
    -12px -12px 24px rgba(255, 255, 255, 0.84);
}

.database-refresh-copy {
  max-width: 660px;
}

.database-refresh-eyebrow {
  color: #748195;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.database-refresh-panel h2 {
  margin: 10px 0 0;
  color: #2f3845;
  font-size: 24px;
}

.database-refresh-panel p {
  line-height: 1.65;
}

.database-refresh-warning {
  color: #a86754;
  font-weight: 650;
}

.database-refresh-button {
  flex: 0 0 auto;
  min-width: 150px;
}

.database-refresh-result {
  display: grid;
  gap: 6px;
  margin-top: 22px;
  padding: 16px 18px;
  border: 1px solid transparent;
  border-radius: 14px;
  line-height: 1.5;
}

.database-refresh-result small {
  overflow-wrap: anywhere;
}

.database-refresh-result.success {
  color: #356849;
  border-color: #b8d8c2;
  background: #edf8f0;
}

.database-refresh-result.warning {
  color: #806132;
  border-color: #e7d4a9;
  background: #fff8e8;
}

.database-refresh-result.error {
  color: #8c5058;
  border-color: #e5bdc2;
  background: #fff1f2;
}

@media (max-width: 700px) {
  .database-refresh-panel {
    align-items: stretch;
    flex-direction: column;
    padding: 22px;
  }

  .database-refresh-button {
    width: 100%;
  }
}
</style>

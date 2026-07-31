<script setup>
import { onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(["close", "state"]);
const { t } = useI18n();
const api = window.secondaryDisplay;
const state = ref({
  displays: [],
  selectedId: null,
  selectedAvailable: false,
});
const loading = ref(false);
const selectingId = ref("");
const errorMessage = ref("");
let removeStateListener = null;

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    removeStateListener?.();
    removeStateListener = api?.onChanged?.((value) => applyState(value)) || null;
    await refresh();
  },
  { immediate: true },
);

onUnmounted(() => {
  removeStateListener?.();
});

async function refresh() {
  if (!api?.list || loading.value) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    applyState(await api.list());
  } catch (error) {
    errorMessage.value = error?.message || t("secondaryDisplay.listFailed");
  } finally {
    loading.value = false;
  }
}

function applyState(value) {
  state.value = {
    ...state.value,
    ...(value || {}),
    displays: Array.isArray(value?.displays) ? value.displays : [],
  };
  emit("state", state.value);
}

async function selectDisplay(display) {
  if (!api?.select || !display?.selectable || selectingId.value) return;
  selectingId.value = display.id;
  errorMessage.value = "";
  try {
    applyState(await api.select(display.id));
  } catch (error) {
    errorMessage.value =
      error?.message === "SECONDARY_DISPLAY_UNAVAILABLE"
        ? t("secondaryDisplay.errors.SECONDARY_DISPLAY_UNAVAILABLE")
        : error?.message || t("secondaryDisplay.selectFailed");
  } finally {
    selectingId.value = "";
  }
}
</script>

<template>
  <div v-if="open" class="display-picker-backdrop" @click.self="emit('close')">
    <section
      class="display-picker"
      role="dialog"
      aria-modal="true"
      :aria-label="t('secondaryDisplay.listTitle')"
    >
      <header>
        <div>
          <span>DISPLAY OUTPUT</span>
          <h2>{{ t("secondaryDisplay.listTitle") }}</h2>
        </div>
        <button type="button" :aria-label="t('common.close')" @click="emit('close')">×</button>
      </header>

      <p>{{ t("secondaryDisplay.listDescription") }}</p>

      <div v-if="loading" class="display-picker-empty">{{ t("common.loading") }}</div>
      <div v-else-if="!state.displays.length" class="display-picker-empty">
        {{ t("secondaryDisplay.noDisplays") }}
      </div>
      <div v-else class="display-picker-list">
        <button
          v-for="display in state.displays"
          :key="display.id"
          type="button"
          class="display-picker-item"
          :class="{ selected: state.selectedId === display.id }"
          :disabled="!display.selectable || Boolean(selectingId)"
          @click="selectDisplay(display)"
        >
          <span class="display-picker-screen" aria-hidden="true"></span>
          <span class="display-picker-copy">
            <strong>{{ display.label }}</strong>
            <small>
              {{ display.bounds.width }} × {{ display.bounds.height }}
              ·
              {{
                display.primary
                  ? t("secondaryDisplay.primary")
                  : t("secondaryDisplay.external")
              }}
            </small>
          </span>
          <span v-if="state.selectedId === display.id" class="display-picker-selected">
            {{ t("secondaryDisplay.selected") }}
          </span>
        </button>
      </div>

      <p v-if="errorMessage" class="display-picker-error" role="alert">
        {{ errorMessage }}
      </p>

      <footer>
        <button type="button" @click="refresh">{{ t("common.refresh") }}</button>
        <button type="button" @click="emit('close')">{{ t("common.close") }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.display-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(34, 43, 55, 0.38);
}

.display-picker {
  width: min(680px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  display: grid;
  gap: 18px;
  overflow: auto;
  padding: 24px;
  border: 1px solid #ccd5e0;
  border-radius: 8px;
  background: #f8fafc;
  box-shadow: 0 24px 70px rgba(34, 43, 55, 0.28);
}

.display-picker header,
.display-picker footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.display-picker header span {
  color: #6d7c8d;
  font-size: 11px;
  font-weight: 800;
}

.display-picker h2,
.display-picker p {
  margin: 0;
}

.display-picker header > button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 6px;
  color: #556273;
  background: #e8edf3;
  cursor: pointer;
  font-size: 24px;
}

.display-picker-list {
  display: grid;
  gap: 10px;
}

.display-picker-item {
  min-height: 78px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid #c8d1dc;
  border-radius: 7px;
  color: #3f4b5a;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.display-picker-item.selected {
  border-color: #4c739c;
  box-shadow: inset 0 0 0 1px #4c739c;
}

.display-picker-item:disabled {
  color: #9aa3ad;
  background: #edf0f3;
  cursor: not-allowed;
}

.display-picker-screen {
  width: 54px;
  height: 34px;
  border: 3px solid currentColor;
  border-radius: 4px;
}

.display-picker-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.display-picker-copy strong,
.display-picker-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.display-picker-copy small {
  color: #788493;
}

.display-picker-selected {
  color: #315f8d;
  font-size: 12px;
  font-weight: 750;
}

.display-picker footer {
  justify-content: flex-end;
}

.display-picker footer button {
  min-height: 40px;
  padding: 0 18px;
  border: 1px solid #bbc6d2;
  border-radius: 6px;
  color: #455363;
  background: #eef2f6;
  cursor: pointer;
}

.display-picker-empty {
  padding: 34px;
  color: #7b8794;
  text-align: center;
}

.display-picker-error {
  color: #ad3d45;
}
</style>

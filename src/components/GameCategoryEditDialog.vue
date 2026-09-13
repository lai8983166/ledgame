<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import MediaPickerDialog from "./MediaPickerDialog.vue";

defineProps({
  category: { type: Object, default: null },
  name: { type: String, default: "" },
  cover: { type: String, default: "" },
  saving: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["cancel", "save", "update:name", "update:cover"]);
const { t } = useI18n({ useScope: "global" });
const dialogRef = ref(null);
const pickerOpen = ref(false);

function close() {
  if (!pickerOpen.value) emit("cancel");
}

function handleKeydown(event) {
  if (pickerOpen.value) return;
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...(dialogRef.value?.querySelectorAll("input:not(:disabled), button:not(:disabled)") || [])];
  if (!focusable.length) {
    event.preventDefault();
    dialogRef.value?.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  nextTick(() => dialogRef.value?.querySelector("input")?.focus());
});
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));
</script>

<template>
  <div class="game-category-edit-backdrop" @mousedown.self="close">
    <section ref="dialogRef" class="game-category-edit-dialog" role="dialog" aria-modal="true" tabindex="-1">
      <header class="game-category-edit-header">
        <div>
          <h2>{{ category ? t("gameCategories.editTitle") : t("gameCategories.addTitle") }}</h2>
          <p>{{ t("gameCategories.description") }}</p>
        </div>
        <button class="inline-symbol-button" type="button" v-bind="{ title: t('common.close') }" :disabled="saving" @click="close">×</button>
      </header>

      <label class="game-category-edit-field">
        <span>{{ t("gameCategories.name") }}</span>
        <input :value="name" type="text" maxlength="255" :disabled="saving" @input="emit('update:name', $event.target.value)" />
      </label>
      <span class="game-category-edit-label">{{ t("gameCategories.cover") }}</span>
      <p class="game-category-edit-path">{{ cover || t("games.noCoverSelected") }}</p>
      <div class="game-category-edit-actions">
        <button class="soft-button" type="button" :disabled="saving" @click="pickerOpen = true">{{ t("gameCategories.chooseCover") }}</button>
        <button class="soft-button" type="button" :disabled="saving || !cover" @click="emit('update:cover', '')">{{ t("games.clearCover") }}</button>
      </div>
      <p v-if="error" class="error-line" role="alert">{{ error }}</p>
      <footer class="game-category-edit-footer">
        <button class="soft-button" type="button" :disabled="saving" @click="close">{{ t("common.cancel") }}</button>
        <button class="action-button primary" type="button" :disabled="saving" @click="emit('save')">{{ saving ? t("common.loading") : t("common.save") }}</button>
      </footer>
    </section>

    <MediaPickerDialog
      v-if="pickerOpen"
      accept="image"
      :current-value="cover"
      v-bind="{ title: t('gameCategories.chooseCover') }"
      @cancel="pickerOpen = false"
      @select="emit('update:cover', $event); pickerOpen = false"
    />
  </div>
</template>

<style scoped>
.game-category-edit-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 20px; background: rgba(20, 27, 37, 0.56); }
.game-category-edit-dialog { display: grid; gap: 14px; width: min(480px, 100%); padding: 22px; border: 1px solid rgba(255, 255, 255, 0.76); border-radius: 8px; background: #eef1f5; box-shadow: 0 24px 70px rgba(25, 34, 46, 0.38); outline: none; }
.game-category-edit-header, .game-category-edit-footer, .game-category-edit-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.game-category-edit-header h2, .game-category-edit-header p, .game-category-edit-path { margin: 0; }
.game-category-edit-header h2 { color: #2f3845; font-size: 18px; }
.game-category-edit-header p, .game-category-edit-path { margin-top: 4px; color: #76818f; font-size: 12px; }
.game-category-edit-field { display: grid; gap: 6px; color: #4f5b69; font-size: 13px; font-weight: 700; }
.game-category-edit-field input { min-height: 40px; padding: 0 12px; border: 1px solid #b9c5d2; border-radius: 6px; background: #fff; }
.game-category-edit-label { color: #4f5b69; font-size: 13px; font-weight: 700; }
.game-category-edit-path { overflow-wrap: anywhere; }
.game-category-edit-actions { justify-content: flex-start; }
.game-category-edit-footer { justify-content: flex-end; margin-top: 4px; }
</style>

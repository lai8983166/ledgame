<script setup>
import { useI18n } from "vue-i18n";

defineProps({
  modelValue: {
    type: String,
    required: true,
  },
  options: {
    type: Array,
    required: true,
  },
  groupName: {
    type: String,
    default: "editor-interaction-mode",
  },
});

const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();
let pointerActivation = false;

function selectOption(value) {
  emit("update:modelValue", value);
}

function markPointerActivation() {
  pointerActivation = true;
}

function releasePointerFocus(event) {
  if (!pointerActivation) {
    return;
  }
  pointerActivation = false;
  const input = event.currentTarget?.querySelector?.('input[type="radio"]');
  window.requestAnimationFrame(() => input?.blur());
}

function handleKeydown(event, index, option) {
  if (!(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))) {
    return;
  }
  event.preventDefault();
  const lastIndex = event.currentTarget?.closest?.('[role="radiogroup"]')?.querySelectorAll?.('input[type="radio"]')?.length - 1;
  const optionCount = Number.isInteger(lastIndex) && lastIndex >= 0 ? lastIndex + 1 : 0;
  if (!optionCount) {
    return;
  }
  let nextIndex = index;
  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = optionCount - 1;
  } else {
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    nextIndex = (index + direction + optionCount) % optionCount;
  }
  const nextOption = event.currentTarget?.closest?.('[role="radiogroup"]')?.querySelectorAll?.('input[type="radio"]')?.[nextIndex];
  nextOption?.focus();
  selectOption(nextOption?.value || option.value);
}
</script>

<template>
  <div class="editor-mode-switch" role="radiogroup" :aria-label="t('simple.editorModeLabel')">
    <label
      v-for="(option, index) in options"
      :key="option.value"
      class="editor-mode-option"
      :class="{ selected: modelValue === option.value }"
      :title="option.title || option.label"
      @pointerdown="markPointerActivation"
      @click="releasePointerFocus"
    >
      <span class="editor-mode-back-side" aria-hidden="true"></span>
      <input
        :name="groupName"
        type="radio"
        :value="option.value"
        :checked="modelValue === option.value"
        :aria-label="option.title || option.label"
        @change="selectOption(option.value)"
        @keydown="handleKeydown($event, index, option)"
      />
      <span class="editor-mode-icon" aria-hidden="true">{{ option.icon }}</span>
      <span class="editor-mode-text">{{ option.label }}</span>
      <span class="editor-mode-bottom-line" aria-hidden="true"></span>
    </label>
  </div>
</template>

<style scoped>
.editor-mode-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 82px;
  padding: 6px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--ui-surface);
  box-shadow:
    var(--ui-shadow);
}

.editor-mode-option {
  position: relative;
  z-index: 2;
  display: flex;
  width: 50%;
  min-width: 0;
  height: 70px;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 7px 5px;
  border: 1px solid var(--ui-border);
  border-top-color: var(--ui-border);
  border-radius: 4px;
  color: var(--ui-text-secondary);
  background: var(--ui-surface);
  box-shadow:
    var(--ui-shadow);
  cursor: pointer;
  transition: all 0.1s linear;
}

.editor-mode-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.editor-mode-option:focus-within {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.editor-mode-back-side {
  position: absolute;
  top: -9px;
  left: 0;
  z-index: 1;
  width: 100%;
  height: 13px;
  border-radius: 4px 4px 2px 2px;
  background: var(--ui-surface);
  box-shadow:
    var(--ui-shadow);
  opacity: 0;
  transform: perspective(300px) rotateX(50deg);
  transition: all 0.1s linear;
}

.editor-mode-option.selected {
  margin-top: 5px;
  border-color: var(--ui-border-strong);
  border-radius: 0 0 4px 4px;
  box-shadow:
    var(--ui-selected-shadow);
  background: var(--ui-active);
  transform: perspective(200px) rotateX(-14deg);
  transform-origin: 50% 40%;
}

.editor-mode-option.selected::after {
  content: "✓";
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 3;
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border: 1px solid var(--ui-border-strong);
  border-radius: 50%;
  color: var(--ui-text-secondary);
  background: var(--ui-active);
  box-shadow:
    var(--ui-selected-shadow);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
}

.editor-mode-option.selected .editor-mode-back-side {
  opacity: 1;
}

.editor-mode-icon {
  position: relative;
  z-index: 2;
  color: var(--ui-text-secondary);
  font-size: 18px;
  font-weight: 800;
  line-height: 18px;
}

.editor-mode-text {
  position: relative;
  z-index: 2;
  overflow: hidden;
  color: var(--ui-text-secondary);
  font-size: 11px;
  font-weight: 800;
  line-height: 13px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.editor-mode-option.selected .editor-mode-icon,
.editor-mode-option.selected .editor-mode-text {
  color: var(--ui-success);
  text-shadow: none;
}

.editor-mode-bottom-line {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 4px;
  border-top: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
}

.editor-mode-option.selected .editor-mode-bottom-line {
  border-top-color: var(--ui-border-strong);
  background: var(--ui-active);
}
</style>

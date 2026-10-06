<script setup>
import { computed, ref, useAttrs } from "vue";

defineOptions({
  inheritAttrs: false,
});

const attrs = useAttrs();
const buttonRef = ref(null);

const buttonType = computed(() => attrs.type || "button");

defineExpose({
  focus: () => buttonRef.value?.focus(),
  blur: () => buttonRef.value?.blur(),
  click: () => buttonRef.value?.click(),
});
</script>

<template>
  <button
    ref="buttonRef"
    class="button-mastery-2"
    :type="buttonType"
    v-bind="$attrs"
  >
    <span class="button-mastery-2__outer">
      <span class="button-mastery-2__inner">
        <slot name="icon" />
        <slot />
      </span>
    </span>
  </button>
</template>

<style scoped>
.button-mastery-2 {
  position: relative;
  min-height: 58px;
  padding: 3px;
  border: 1pt solid var(--ui-border);
  border-top-width: 0;
  border-radius: calc(6pt + 3px);
  appearance: none;
  color: var(--ui-text-secondary);
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  letter-spacing: 0;
  transition:
    transform 0.4s,
    box-shadow 0.4s;
}

.button-mastery-2:focus {
  outline: none;
}

.button-mastery-2:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 3px;
}

.button-mastery-2::before {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 50%;
  content: "";
  transition: inherit;
}

.button-mastery-2:hover:not(:disabled) {
  transform: translateY(-5px);
  box-shadow: var(--ui-selected-shadow);
}

.button-mastery-2:hover:not(:active, :disabled)::before {
  bottom: -6px;
}

.button-mastery-2:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: var(--ui-shadow);
  transition:
    transform 0.3s,
    box-shadow 0.3s;
}

.button-mastery-2:disabled {
  cursor: wait;
  opacity: 0.56;
}

.button-mastery-2.danger {
  color: var(--ui-error);
}

.button-mastery-2__outer {
  display: block;
  height: 100%;
  padding: 4pt;
  border-radius: 6pt;
  background: var(--ui-surface);
}

.button-mastery-2__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  height: 100%;
  gap: 4pt;
  padding: 8pt 14pt;
  border-radius: 9999px;
  background: var(--ui-surface);
  text-shadow: none;
  white-space: nowrap;
}

.button-mastery-2__inner :deep(svg) {
  width: 1.125rem;
  height: 1.125rem;
  flex: 0 0 auto;
  filter: drop-shadow(0 1px 0 #0007);
}

.button-mastery-2__inner,
.button-mastery-2__outer {
  background-size: 100% 200%;
  transition: background-position-y 0.5s;
}

.button-mastery-2:active:not(:disabled) .button-mastery-2__inner,
.button-mastery-2:active:not(:disabled) .button-mastery-2__outer {
  background-position-y: 100%;
}
</style>

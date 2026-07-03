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
  border: 1pt solid #e9ebea;
  border-top-width: 0;
  border-radius: calc(6pt + 3px);
  appearance: none;
  color: #20242a;
  background: linear-gradient(#dfe1e0, #7f8180);
  box-shadow: 0 5px 15px 0 #0004;
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
  outline: 2px solid rgba(46, 63, 83, 0.54);
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
  box-shadow: 0 10px 15px 0 #0004;
}

.button-mastery-2:hover:not(:active, :disabled)::before {
  bottom: -6px;
}

.button-mastery-2:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 5px 15px 0 #0000;
  transition:
    transform 0.3s,
    box-shadow 0.3s;
}

.button-mastery-2:disabled {
  cursor: wait;
  opacity: 0.56;
}

.button-mastery-2.danger {
  color: #5f2f39;
}

.button-mastery-2__outer {
  display: block;
  height: 100%;
  padding: 4pt;
  border-radius: 6pt;
  background: linear-gradient(#fdfffe, #eceeed, #fdfffe);
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
  background: linear-gradient(#eef0ef, #fafcfb, #eef0ef);
  text-shadow: 0 1px 1px #0004;
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

<script setup>
defineProps({
  text: { type: String, default: "" },
  fontSize: { type: Number, default: 72 },
  fading: { type: Boolean, default: false },
});
defineEmits(["animation-end"]);
</script>

<template>
  <strong
    class="touch-idle-prompt"
    :class="{ fading }"
    :style="{ '--idle-prompt-font-size': `${fontSize}px` }"
    aria-live="polite"
    @animationend="$emit('animation-end')"
  >
    <span
      class="touch-idle-title-layer touch-idle-title-depth"
      aria-hidden="true"
      v-text="text"
    ></span>
    <span
      class="touch-idle-title-layer touch-idle-title-glow"
      aria-hidden="true"
      v-text="text"
    ></span>
    <span
      class="touch-idle-title-layer touch-idle-title-face"
      v-text="text"
    ></span>
    <span
      class="touch-idle-title-layer touch-idle-title-highlight"
      aria-hidden="true"
      v-text="text"
    ></span>
  </strong>
</template>

<style scoped>
.touch-idle-prompt {
  position: relative;
  isolation: isolate;
  display: grid;
  width: min(90vw, 1280px);
  max-width: calc(100% - 40px);
  padding: 0.08em 0.2em 0.22em;
  color: #7ee8ff;
  font-family:
    "Arial Black", "Microsoft YaHei UI", "Microsoft YaHei", "Yu Gothic UI",
    "Malgun Gothic", Impact, sans-serif;
  font-size: min(var(--idle-prompt-font-size, 72px), 9vw, 13vh);
  font-stretch: expanded;
  font-weight: 1000;
  font-variation-settings:
    "wght" 1000,
    "wdth" 112;
  letter-spacing: 0;
  line-height: 0.96;
  text-align: center;
  white-space: nowrap;
  transform: skewX(-6deg);
  transform-origin: center;
}

.touch-idle-title-layer {
  grid-area: 1 / 1;
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transform: scaleX(1.1);
  transform-origin: center;
}

.touch-idle-title-depth {
  z-index: 0;
  color: #25156f;
  -webkit-text-stroke: clamp(5px, 0.52vw, 9px) #070d32;
  paint-order: stroke fill;
  text-shadow:
    1px 1px 0 #3a2891,
    2px 2px 0 #342486,
    3px 3px 0 #30207d,
    4px 4px 0 #291b70,
    5px 5px 0 #241765,
    6px 6px 0 #1d1359,
    7px 7px 0 #17104d,
    8px 8px 0 #11103f,
    11px 15px 18px rgba(2, 5, 27, 0.78);
  transform: scaleX(1.1);
}

.touch-idle-title-glow {
  z-index: 1;
  color: transparent;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: clamp(29px, 0.96vw, 38px) #06183f;
  filter: drop-shadow(0 0 3px rgba(48, 235, 255, 0.98))
    drop-shadow(0 0 14px rgba(25, 196, 255, 0.78));
  opacity: 0.98;
}

.touch-idle-title-face {
  z-index: 2;
  color: #6ee8ff;
  background: linear-gradient(
    180deg,
    #f8ffff 0%,
    #d7fbff 15%,
    #87efff 31%,
    #3fd8f4 55%,
    #20addd 76%,
    #1375b7 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: clamp(2px, 0.18vw, 3px) #0a234b;
  paint-order: stroke fill;
  text-shadow:
    0 -1px 0 rgba(255, 255, 255, 0.95),
    0 0 3px rgba(203, 255, 255, 0.9),
    0 0 12px rgba(43, 221, 255, 0.8),
    0 0 28px rgba(25, 196, 255, 0.66);
}

.touch-idle-title-highlight {
  z-index: 3;
  color: transparent;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 1) 0%,
    rgba(218, 255, 255, 0.96) 24%,
    rgba(116, 239, 255, 0.25) 48%,
    rgba(116, 239, 255, 0) 62%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 1px rgba(226, 255, 255, 0.34);
  clip-path: inset(0 0 54% 0);
  opacity: 0.92;
}

.touch-idle-prompt.fading {
  animation: touch-idle-prompt-fade 500ms ease-out both;
}

@keyframes touch-idle-prompt-fade {
  from {
    opacity: 1;
    filter: saturate(1);
  }
  to {
    opacity: 0;
    filter: saturate(0.7);
  }
}

@media (max-width: 760px) {
  .touch-idle-prompt {
    font-size: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .touch-idle-prompt.fading {
    animation: none;
  }
}
</style>

<script setup>
defineProps({
  text: { type: String, required: true },
  fontStyle: { type: String, default: "sans" },
  fontSize: { type: Number, default: 72 },
  fading: Boolean,
});
</script>

<template>
  <span class="secondary-subtitle" :class="[`secondary-subtitle--${fontStyle}`, { fading }]"
    :style="{ '--subtitle-size': fontSize + 'px' }">{{ text }}</span>
</template>

<style scoped>
.secondary-subtitle {
  display: block;
  max-width: 90%;
  margin-inline: auto;
  color: #f4fbff;
  font: 600 min(var(--subtitle-size), 9vw, 13vh) / 1.22 "Segoe UI", "Microsoft YaHei", sans-serif;
  letter-spacing: .06em;
  overflow-wrap: anywhere;
  text-align: center;
  text-shadow: 0 .03em .1em #071428, 0 0 .22em #17394c;
}

.secondary-subtitle--serif {
  font-family: Georgia, "Noto Serif CJK SC", SimSun, serif;
  font-weight: 700;
  letter-spacing: .1em;
  color: #ffedca;
  text-shadow: 0 .04em .09em #2a1604, 0 0 .18em #634726;
}

.secondary-subtitle--mono {
  font-family: Consolas, "Microsoft YaHei", monospace;
  font-weight: 700;
  letter-spacing: .16em;
  color: #a7ffe6;
  text-shadow: 0 .04em .08em #052f32, 0 0 .16em #19ac9d;
}

@media (prefers-reduced-motion: no-preference) {
  .secondary-subtitle.fading { animation: subtitle-fade 500ms ease-out both; }
}
@keyframes subtitle-fade { to { opacity: 0; } }
</style>

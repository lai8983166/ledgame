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
    :style="{ '--subtitle-size': fontSize + 'px' }">
    <span class="subtitle-face">{{ text }}</span>
    <span v-if="fontStyle === 'sans'" class="subtitle-glitch" aria-hidden="true" :data-text="text"></span>
  </span>
</template>

<style scoped>
.secondary-subtitle {
  position: relative;
  isolation: isolate;
  display: block;
  width: fit-content;
  max-width: 90%;
  min-width: 0;
  margin-inline: auto;
  font: 900 min(var(--subtitle-size), 9vw, 13vh) / 1.3 "Arial Black", "Microsoft YaHei", sans-serif;
  text-align: center;
  overflow-wrap: anywhere;
}

.subtitle-face { display: block; }

/* Offset complementary inks and a displaced horizontal slice. */
.secondary-subtitle--sans {
  transform: skewX(-6deg);
  letter-spacing: .045em;
  color: #f9ffff;
  text-shadow: -.055em 0 #00ecff, .065em .03em #ff168d, .09em .07em #500455,
    0 .045em .08em #070220, -.04em 0 .22em #009ebc, .06em .02em .23em #b91880;
}

.subtitle-glitch {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #63ffff;
  text-shadow: .055em 0 #ff1a9a;
  clip-path: inset(42% 0 45% 0);
  transform: translateX(.08em);
}

.subtitle-glitch::before { content: attr(data-text); }

/* A hard horizon in the reflection and a stepped, warm metal extrusion. */
.secondary-subtitle--serif {
  font-family: Georgia, "Noto Serif CJK SC", SimSun, serif;
  letter-spacing: .07em;
  filter: drop-shadow(0 .03em 0 #cb571f) drop-shadow(.035em .04em 0 #722047)
    drop-shadow(0 .045em 0 #300b37) drop-shadow(0 0 .08em #e7782970);
}

.secondary-subtitle--serif .subtitle-face {
  color: transparent;
  background: linear-gradient(#fffde4 12%, #ffebaa 34%, #ffb74b 47%, #874348 50%, #ffae4f 55%, #ffecb5 82%, #ffb65d);
  background-size: 100% 1.3em;
  background-clip: text;
  -webkit-text-stroke: .013em #ffde9e;
}

/* Fine phosphor scanlines and open corners of a terminal display. */
.secondary-subtitle--mono {
  padding: .02em .46em;
  font-family: Consolas, "Microsoft YaHei", monospace;
  letter-spacing: .1em;
  background:
    linear-gradient(#42ffaf, #42ffaf) top left / .29em .04em,
    linear-gradient(#42ffaf, #42ffaf) top left / .04em .22em,
    linear-gradient(#42ffaf, #42ffaf) bottom right / .29em .04em,
    linear-gradient(#42ffaf, #42ffaf) bottom right / .04em .22em;
  background-repeat: no-repeat;
  filter: drop-shadow(0 .04em .025em #00180b) drop-shadow(0 0 .08em #00ce76);
}

.secondary-subtitle--mono .subtitle-face {
  color: transparent;
  background: repeating-linear-gradient(0deg, #91ffc9 0 .055em, #1ca66f .061em .084em, #c7ffe7 .09em .13em);
  background-clip: text;
  -webkit-text-stroke: .012em #85ffb6;
}

@media (prefers-reduced-motion: no-preference) {
  .secondary-subtitle.fading { animation: subtitle-fade 500ms ease-out both; }
}
@keyframes subtitle-fade { to { opacity: 0; } }
</style>

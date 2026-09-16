<script setup>
defineProps({
  name: { type: String, required: true },
});
</script>

<template>
  <svg
    class="editor-action-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'rotate-left'">
      <path d="M8 5.2A8 8 0 1 1 5.2 17" />
      <path d="m8 5.2-4.4.5 1.6 4" />
      <text x="12" y="14.1" text-anchor="middle" font-size="6.5" font-family="Arial, sans-serif" font-weight="800">90</text>
    </template>
    <template v-else-if="name === 'rotate-right'">
      <path d="M16 5.2A8 8 0 1 0 18.8 17" />
      <path d="m16 5.2 4.4.5-1.6 4" />
      <text x="12" y="14.1" text-anchor="middle" font-size="6.5" font-family="Arial, sans-serif" font-weight="800">90</text>
    </template>
    <template v-else-if="name === 'anchor'">
      <circle cx="12" cy="5" r="2.25" />
      <path d="M12 7.25v11.25M8.5 10h7M5 18.5h14" />
      <path d="M7 18.5a5 5 0 0 0 10 0" />
    </template>
    <template v-else-if="name === 'layer-up'">
      <path d="M12 20V8" />
      <path d="m7.5 12.5 4.5-4.5 4.5 4.5" />
      <path d="m4 17 8 4 8-4" />
    </template>
    <template v-else-if="name === 'layer-down'">
      <path d="M12 4v12" />
      <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
      <path d="m4 7 8-4 8 4" />
    </template>
    <template v-else-if="name === 'layers'">
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 11 8 4 8-4M4 15l8 4 8-4" />
    </template>
    <template v-else-if="name === 'palette'">
      <path d="M12 4a8 8 0 0 0 0 16h1.4a1.6 1.6 0 0 0 0-3.2h-.8a1.6 1.6 0 0 1 0-3.2H15a5 5 0 0 0 5-5A8 8 0 0 0 12 4Z" />
      <circle cx="7.5" cy="10" r=".75" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7.5" r=".75" fill="currentColor" stroke="none" />
      <circle cx="14" cy="7.5" r=".75" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'sprite'">
      <rect x="4" y="4" width="6" height="6" rx=".8" />
      <rect x="14" y="4" width="6" height="6" rx=".8" />
      <rect x="4" y="14" width="6" height="6" rx=".8" />
      <rect x="14" y="14" width="6" height="6" rx=".8" />
      <path d="M12 9v6M9 12h6" />
    </template>
    <template v-else-if="name === 'copy-previous'">
      <rect x="10" y="4" width="10" height="14" rx="1.5" />
      <path d="M6 7v13h10" />
      <path d="M10 14H3m0 0 3-3m-3 3 3 3" />
    </template>
    <template v-else-if="name === 'copy-next'">
      <rect x="4" y="4" width="10" height="14" rx="1.5" />
      <path d="M18 7v13H8" />
      <path d="M14 14h7m0 0-3-3m3 3-3 3" />
    </template>
    <template v-else-if="name === 'copy-all'">
      <rect x="8" y="4" width="11" height="14" rx="1.5" />
      <path d="M5 8v10.5A1.5 1.5 0 0 0 6.5 20H15" />
      <path d="M11 8h5M11 12h5" />
    </template>
    <template v-else-if="name === 'copy-color'">
      <rect x="4" y="4" width="6" height="6" rx=".7" />
      <rect x="14" y="4" width="6" height="6" rx=".7" />
      <rect x="4" y="14" width="6" height="6" rx=".7" />
      <rect x="14" y="14" width="6" height="6" rx=".7" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l.8 13h8.4L17 7M10 10v7M14 10v7" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12 4.5 4.5L19 7" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m6 6 12 12M18 6 6 18" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="8" />
    </template>
  </svg>
</template>

<style scoped>
.editor-action-icon {
  display: block;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
}

.editor-action-icon text {
  fill: currentColor !important;
  stroke: none !important;
}
</style>

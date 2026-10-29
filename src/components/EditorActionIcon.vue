<script setup>
import { useId } from "vue";

defineProps({
  name: { type: String, required: true },
});
const gifGradientId = `editor-gif-${useId()}`;
</script>

<template>
  <svg
    class="editor-action-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'copy'">
      <rect x="8" y="8" width="12" height="13" rx="1.5" />
      <path d="M16 5V3H3v14h2" />
    </template>
    <template v-else-if="name === 'rotate-left'">
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
      <rect x="4" y="4" width="6" height="6" rx=".7" fill="currentColor" />
      <rect x="14" y="4" width="6" height="6" rx=".7" fill="currentColor" />
      <rect x="4" y="14" width="6" height="6" rx=".7" fill="currentColor" />
      <rect x="14" y="14" width="6" height="6" rx=".7" fill="currentColor" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8M14 5v2" />
    </template>
    <template v-else-if="name === 'play'">
      <path d="m7 4 13 8-13 8V4Z" />
    </template>
    <template v-else-if="name === 'preview'">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'gif'">
      <defs>
        <linearGradient :id="gifGradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#9063ff" />
          <stop offset="1" stop-color="#20a8fa" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" :fill="'url(#' + gifGradientId + ')'" stroke="#ffffff" stroke-width=".7" />
      <g color="#ffffff" stroke="#ffffff" stroke-width="1.3">
        <path d="M12 6.3v7.2m-2.8-4.4L12 6.3l2.8 2.8M6.7 12.3v5.5a1.9 1.9 0 0 0 1.9 1.9m8.7-7.4v5.5a1.9 1.9 0 0 1-1.9 1.9" />
        <text x="12" y="19.6" text-anchor="middle" font-size="6.4" font-family="Arial, sans-serif" font-weight="700">GIF</text>
      </g>
    </template>
    <template v-else-if="name === 'brush'">
      <path d="m10 14 9-11 3 3-11 9M10 14l1 1" />
      <path d="M10 15c-5-3-3 5-8 5 5 3 11 0 8-5Z" />
    </template>
    <template v-else-if="name === 'add'">
      <path d="M12 4v16M4 12h16" />
    </template>
    <template v-else-if="name === 'delete'">
      <path d="M4 12h16" />
    </template>
    <template v-else-if="name === 'region'">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke-linecap="square" />
    </template>
    <template v-else-if="name === 'select'">
      <path d="m5 3 14 10-7 1-3 7L5 3Z" />
    </template>
    <template v-else-if="name === 'export'">
      <path d="M8.5 7.8H6.3a3.6 3.6 0 0 0-3.6 3.6v6.9a3.6 3.6 0 0 0 3.6 3.6h11.4a3.6 3.6 0 0 0 3.6-3.6v-6.9a3.6 3.6 0 0 0-3.6-3.6h-2.2" stroke="#94a0b2" stroke-width="1.9" />
      <path d="M4 17.2h6.3v-1.8h9.8M10.3 17.2h5.6M15.1 15.4v-4l2.4 1.1-2.4 1.1" stroke="#94a0b2" stroke-width=".9" />
      <path d="M12 10.3V2.8m-3.4 3.4L12 2.8l3.4 3.4" stroke="#3d49bc" stroke-width="2.3" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="m9 3-.6 3-2 .9-2.6-1.1-2 3.4L4 11v2l-2.2 1.8 2 3.4 2.6-1.1 2 .9.6 3h4l.6-3 2-.9 2.6 1.1 2-3.4L18 13v-2l2.2-1.8-2-3.4-2.6 1.1-2-.9L13 3H9Z" />
      <circle cx="11" cy="12" r="3" />
    </template>
    <template v-else-if="name === 'import'">
      <path d="M8.7 6.8H6.4a3.2 3.2 0 0 0-3.2 3.2v8.3a3.2 3.2 0 0 0 3.2 3.2h11.2a3.2 3.2 0 0 0 3.2-3.2V10a3.2 3.2 0 0 0-3.2-3.2h-2.3" stroke="#94a0b2" stroke-width="1.9" />
      <path d="M7.7 17.4h8.6" stroke="#94a0b2" stroke-width="1.9" />
      <path d="M14 17.2v-4.3l2.5 1.3-2.5 1.4" stroke="#94a0b2" stroke-width="1.1" />
      <path d="M12 3.2v7.5m-2.7-2.7 2.7 2.7 2.7-2.7" stroke="#3d49bc" stroke-width="2.1" />
    </template>
    <template v-else-if="name === 'delete-frame'">
      <rect x="3" y="7.5" width="14.3" height="13.5" rx="2" stroke="#94a3b8" stroke-width="1.7" />
      <circle cx="6.8" cy="11.2" r="1.4" fill="#94a3b8" stroke="none" />
      <path d="m4 18.4 3.8-4 3.4 3.4 2.5-2.7 2.5 3" stroke="#94a3b8" stroke-width="1.7" />
      <path d="m14.8 3.5 6.4 6.4m0-6.4-6.4 6.4" stroke="#ff4048" stroke-width="3.1" />
    </template>
    <template v-else-if="name === 'pixel-light'">
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <circle cx="12" cy="3" r="1.5" /><circle cx="21" cy="12" r="1.5" />
      <circle cx="12" cy="21" r="1.5" /><circle cx="3" cy="12" r="1.5" />
      <path d="M12 5v2m7 5h-2M12 17v2m-7-7h2" />
    </template>
    <template v-else-if="name === 'wiring'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" opacity=".35" />
      <path d="M6 6h12v6H6v6h12" /><circle cx="6" cy="6" r="1" fill="currentColor" />
    </template>
    <template v-else-if="name === 'effect'">
      <path d="m4 19 11-11 3 3L7 22l-3-3Zm9-9 3 3M5 3v4M3 5h4M19 2v4M17 4h4M21 15v4M19 17h4" />
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

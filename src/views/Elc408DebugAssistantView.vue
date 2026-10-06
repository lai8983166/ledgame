<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import Elc408WiringPanel from "../components/elc408/Elc408WiringPanel.vue";
import Elc408DebugToolsPanel from "../components/elc408/Elc408DebugToolsPanel.vue";

const { t } = useI18n({ useScope: "global" });
const activePanel = ref("wiringTools");
const panels = [
  { id: "wiringTools", label: "elc408.tabs.wiringTools" },
  { id: "debugTools", label: "elc408.tabs.debugTools" },
];
</script>

<template>
  <section class="elc408-assistant">
    <header class="elc408-assistant-header">
      <div class="elc408-heading-copy">
        <h1>{{ t("elc408.title") }}</h1>
      </div>
      <nav class="elc408-segmented" role="tablist">
        <button
          v-for="panel in panels"
          :key="panel.id"
          type="button"
          role="tab"
          :aria-selected="activePanel === panel.id"
          :class="['elc408-segment', { active: activePanel === panel.id }]"
          @click="activePanel = panel.id"
        >
          {{ t(panel.label) }}
        </button>
      </nav>
    </header>
    <div class="elc408-panels">
      <Elc408WiringPanel v-show="activePanel === 'wiringTools'" />
      <Elc408DebugToolsPanel
        v-show="activePanel === 'debugTools'"
        :active="activePanel === 'debugTools'"
      />
    </div>
  </section>
</template>

<style scoped>
.elc408-assistant {
  --elc-accent: var(--ui-accent);
  --elc-accent-soft: var(--ui-active);
  --elc-border: var(--ui-border);
  --elc-surface: var(--ui-elevated);
  --elc-text: var(--ui-text);
  --elc-muted: var(--ui-muted);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px 4px 4px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.elc408-assistant-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding: 0 4px;
}
.elc408-heading-copy {
  min-width: 240px;
}
.elc408-assistant-header h1 {
  margin: 0;
  color: var(--elc-text);
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.2;
}
.elc408-subtitle {
  margin: 6px 0 0;
  color: var(--elc-muted);
  font-size: 0.875rem;
}
.elc408-segmented {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--elc-border);
  border-radius: 8px;
  background: var(--ui-surface);
}
.elc408-segment {
  min-height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 650;
  transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
}
.elc408-segment:hover {
  color: var(--elc-text);
}
.elc408-segment.active {
  color: var(--ui-accent);
  background: var(--elc-surface);
  box-shadow: var(--ui-selected-shadow);
}
.elc408-panels {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 18px;
  border: 1px solid var(--elc-border);
  border-radius: 8px;
  background: var(--ui-surface);
  box-shadow: var(--ui-shadow);
  overflow: hidden;
}
.elc408-panels > * {
  flex: 1;
  min-height: 0;
}
@media (max-width: 760px) {
  .elc408-assistant {
    padding-top: 18px;
    overflow: auto;
  }
  .elc408-assistant-header {
    align-items: stretch;
  }
  .elc408-segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .elc408-segment {
    padding: 0 8px;
  }
  .elc408-panels {
    flex: none;
    min-height: 620px;
    padding: 12px;
    overflow: visible;
  }
}
</style>

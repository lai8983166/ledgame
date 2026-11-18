<script setup>
import { onBeforeUnmount, onMounted } from 'vue';

defineProps({ message: { type: String, required: true } });
const emit = defineEmits(['dismiss']);

let timeout;
onMounted(() => { timeout = setTimeout(() => emit('dismiss'), 3000); });
onBeforeUnmount(() => clearTimeout(timeout));
</script>

<template>
  <Teleport to="body">
    <div class="editor-save-toast" role="status">{{ message }}</div>
  </Teleport>
</template>

<style scoped>
.editor-save-toast {
  position: fixed;
  z-index: 1500;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  box-sizing: border-box;
  width: min(500px, calc(100vw - 32px));
  min-height: 80px;
  display: grid;
  place-items: center;
  padding: 16px 24px;
  text-align: center;
  overflow-wrap: anywhere;
  font-size: 18px;
  font-weight: 600;
  border-radius: 8px;
  background: #21563d;
  color: #fff;
  box-shadow: var(--ui-shadow);
  pointer-events: none;
}
</style>

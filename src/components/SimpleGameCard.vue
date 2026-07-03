<script setup>
defineEmits(["open"]);
</script>

<template>
  <button class="game-card" type="button" @click="$emit('open')">
    <div class="game-card-mark" aria-hidden="true"></div>
    <div>
      <h2>simple</h2>
      <p>Simple editor demo</p>
    </div>
  </button>
</template>

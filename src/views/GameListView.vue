<script setup>
import SimpleGameCard from "../components/SimpleGameCard.vue";

defineEmits(["open-simple"]);
</script>

<template>
  <section class="workspace game-list-view">
    <div class="page-heading">
      <div>
        <h1>游戏列表</h1>
        <p>Game List</p>
      </div>
    </div>

    <div class="game-card-grid">
      <SimpleGameCard @open="$emit('open-simple')" />
    </div>
  </section>
</template>

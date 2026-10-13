<script setup>
defineProps({categories:{type:Array,default:()=>[]},coverUrls:{type:Object,default:()=>({})},selectedId:{default:null},disabled:Boolean});
defineEmits(['select']);
</script>

<template>
  <aside class="touch-category-rail">
    <button v-for="category in categories" :key="category.id" :data-testid="`game-category-${category.id}`" :data-game-ids="category.gameIds?.join(' ')"
      class="touch-category-card" :class="{selected:category.id===selectedId}"
      :aria-pressed="category.id===selectedId" :disabled="disabled" type="button" @click="$emit('select',category)">
      <img v-if="coverUrls[category.id]" :src="coverUrls[category.id]" alt="" draggable="false" />
      <div v-else class="touch-category-placeholder" aria-hidden="true"><span>◆</span></div>
      <strong>{{category.name}}</strong>
    </button>
  </aside>
</template>

<style scoped>
.touch-category-rail{display:flex;flex-direction:column;gap:clamp(16px,4vh,48px);min-height:0;overflow:auto;padding:8px 10px 10px 4px;scrollbar-width:thin;scrollbar-color:#29cce366 transparent;}
.touch-category-card{position:relative;flex:none;width:100%;aspect-ratio:2.55;border:2px solid #2e66c6;padding:5px;background:#06132e;color:#fff;cursor:pointer;clip-path:polygon(3% 0,98% 0,100% 7%,100% 96%,97% 100%,0 100%,0 5%);box-shadow:inset 0 0 0 2px #63b9ef66;}
.touch-category-card:before{content:'';position:absolute;inset:10px;border:1px solid #75dded70;pointer-events:none;z-index:1;}
.touch-category-card.selected{border-color:#9beaf4;box-shadow:0 0 22px #5bfbff70,inset 0 0 0 2px #5bfbff;filter:brightness(1.15);}
.touch-category-card img,.touch-category-placeholder{width:100%;height:100%;object-fit:cover;}
.touch-category-placeholder{display:grid;place-items:center;background:radial-gradient(ellipse at 45% 80%,#bb31bd70,transparent 60%),linear-gradient(125deg,#085773,#101737 60%,#63245e);}
.touch-category-placeholder span{font-size:clamp(32px,6vw,100px);color:#53e4f7;opacity:.65;}
.touch-category-card strong{position:absolute;left:12px;right:12px;bottom:10px;padding:8px 12px;background:linear-gradient(90deg,#061527c9,#05172c22);font-size:clamp(16px,1.8vw,34px);font-style:italic;line-height:1.1;text-align:left;overflow-wrap:anywhere;text-shadow:0 2px 3px #000;}
.touch-category-card:focus-visible{outline:3px solid #f5e7a6;outline-offset:-4px;}
.touch-category-card:disabled{cursor:wait;}
</style>

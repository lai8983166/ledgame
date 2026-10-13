<script setup>
import {computed, ref, onMounted, onBeforeUnmount} from 'vue';
import {useI18n} from 'vue-i18n';
import DebugLedCanvas from './DebugLedCanvas.vue';
import {debugPeripheralBoard} from '../lib/debugPeripheralLights.js';
const props=defineProps({pixels:{type:Array,required:true},layout:Object,runtime:Object,hoverCell:Object,disabled:Boolean});
const emit=defineEmits(['cell-click','hover-cell','clear-hover','circle-click']);
const {t}=useI18n({useScope:'global'});
const host=ref(null),size=ref({width:0,height:0});
const board=computed(()=>debugPeripheralBoard(props.layout,props.runtime,props.pixels[0]?.length || 1,props.pixels.length || 1));
const scale=computed(()=>board.value?Math.max(0,Math.min((size.value.width-12)/board.value.canvasWidth,(size.value.height-12)/board.value.canvasHeight)):1);
const sceneStyle=computed(()=>({width:`${board.value.canvasWidth*scale.value}px`,height:`${board.value.canvasHeight*scale.value}px`}));
const floorStyle=computed(()=>({left:`${board.value.floor.x*scale.value}px`,top:`${board.value.floor.y*scale.value}px`,width:`${board.value.floor.width*scale.value}px`,height:`${board.value.floor.height*scale.value}px`}));
const pointStyle=(point,light)=>{
  const diameter=Math.min(18,light.markerSize*scale.value);
  return {left:`${point.x*scale.value}px`,top:`${point.y*scale.value}px`,width:`${diameter}px`,height:`${diameter}px`,fontSize:`${diameter*.62}px`,boxShadow:`inset 0 0 0 ${Math.min(1,diameter*.08)}px #718096`};
};
const color=phase=>({BLUE:'#2583ff',GREEN:'#30e183',YELLOW:'#ffd84a',OFF:'#10151f'}[phase] || '#10151f');
const wallNames=computed(()=>[t('circleLights.top'),t('circleLights.right'),t('circleLights.bottom'),t('circleLights.left')]);
let observer;
onMounted(()=>{observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;size.value={width,height};});observer.observe(host.value);});
onBeforeUnmount(()=>observer?.disconnect());
</script>
<template>
  <div ref="host" class="debug-light-board">
    <div v-if="board" class="debug-light-scene" :style="sceneStyle">
      <div class="debug-light-floor" :style="floorStyle"><DebugLedCanvas :pixels="pixels" :hover-cell="hoverCell" :disabled="disabled" @cell-click="(x,y)=>emit('cell-click',x,y)" @hover-cell="(x,y)=>emit('hover-cell',x,y)" @clear-hover="emit('clear-hover')" /></div>
      <template v-for="light in board.lights" :key="light.key">
        <span class="debug-symbol-light" :data-wall="light.wall" :data-index="light.idx" :data-phase="light.phase" :style="{...pointStyle(light.symbol,light),color:color(light.phase)}">{{light.phase==='BLUE'?light.remaining:light.phase==='GREEN'?'✓':light.phase==='YELLOW'?'!':''}}</span>
        <button type="button" class="debug-circle-light" :data-wall="light.wall" :data-index="light.idx" :data-sequence="light.sequenceIndex" :data-phase="light.phase" :style="{...pointStyle(light.circle,light),backgroundColor:color(light.phase)}" :aria-label="t('circleLights.light',{wall:wallNames[light.wall],index:light.idx+1})" :disabled="disabled || light.phase==='OFF'" @pointerdown.stop @click.stop="emit('circle-click',light.sequenceIndex)"></button>
      </template>
    </div>
    <DebugLedCanvas v-else :pixels="pixels" :hover-cell="hoverCell" :disabled="disabled" @cell-click="(x,y)=>emit('cell-click',x,y)" @hover-cell="(x,y)=>emit('hover-cell',x,y)" @clear-hover="emit('clear-hover')" />
  </div>
</template>
<style scoped>
.debug-light-board{width:100%;height:100%;min-width:0;min-height:0;position:relative;overflow:hidden}
.debug-light-scene{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.debug-light-floor{position:absolute;overflow:hidden}
.debug-light-floor :deep(.debug-led-canvas-host){padding:0;border:0;border-radius:0;background:#080c12}
.debug-symbol-light,.debug-circle-light{position:absolute;box-sizing:border-box;transform:translate(-50%,-50%)}
.debug-symbol-light{display:grid;place-items:center;line-height:1;font-weight:700;border:0;background:#080c12;border-radius:2px;pointer-events:none}
.debug-circle-light{padding:0;min-width:0;min-height:0;border:0;border-radius:50%;cursor:pointer}
.debug-circle-light:disabled{opacity:1;cursor:default}
.debug-circle-light:focus-visible{outline:2px solid white;outline-offset:3px}
</style>

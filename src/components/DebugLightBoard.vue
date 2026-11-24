<script setup>
import {computed, ref, onMounted, onBeforeUnmount} from 'vue';
import {useI18n} from 'vue-i18n';
import DebugLedCanvas from './DebugLedCanvas.vue';
import {debugPeripheralBoard} from '../lib/debugPeripheralLights.js';
import {buildPixelLightPreview} from '../lib/pixelLightLayout.js';
const props=defineProps({pixels:{type:Array,required:true},layout:Object,runtime:Object,hoverCell:Object,disabled:Boolean});
const emit=defineEmits(['cell-click','hover-cell','clear-hover','circle-click']);
const {t}=useI18n({useScope:'global'});
const host=ref(null),size=ref({width:0,height:0});
const board=computed(()=>debugPeripheralBoard(props.layout,props.runtime,props.pixels[0]?.length || 16,props.pixels.length || 16));
const geometry=computed(()=>board.value || buildPixelLightPreview({},props.pixels[0]?.length || 16,props.pixels.length || 16));
const scale=computed(()=>{
  const width=Math.max(0,size.value.width-12),height=Math.max(0,size.value.height-12);
  const {floor,canvasWidth,canvasHeight}=geometry.value;
  const originalScale=Math.min(width/canvasWidth,height/canvasHeight);
  const margins=2*Math.min(20,size.value.width*.1,size.value.height*.1);
  return Math.max(0,Math.min(originalScale*1.5,(width-margins)/floor.width,(height-margins)/floor.height));
});
const lightMargin=computed(()=>{
  const {floor}=geometry.value;
  return Math.max(0,Math.min(44,(size.value.width-12-floor.width*scale.value)/2,(size.value.height-12-floor.height*scale.value)/2));
});
const sceneStyle=computed(()=>({width:`${geometry.value.floor.width*scale.value+2*lightMargin.value}px`,height:`${geometry.value.floor.height*scale.value+2*lightMargin.value}px`}));
const floorStyle=computed(()=>({left:`${lightMargin.value}px`,top:`${lightMargin.value}px`,width:`${geometry.value.floor.width*scale.value}px`,height:`${geometry.value.floor.height*scale.value}px`}));
const pointStyle=(point,light)=>{
  const margin=lightMargin.value, floor=geometry.value.floor;
  const diameter=Math.min(18,light.markerSize*scale.value,margin*.42);
  // The symbol sits in the outer lane; both lanes stay aligned to the enlarged floor.
  const offset=margin*(point===light.symbol ? .75 : .25);
  let x=(point.x-floor.x)*scale.value, y=(point.y-floor.y)*scale.value;
  if(light.wall===0)y=-offset;
  if(light.wall===1)x=floor.width*scale.value+offset;
  if(light.wall===2)y=floor.height*scale.value+offset;
  if(light.wall===3)x=-offset;
  return {left:`${margin+x}px`,top:`${margin+y}px`,width:`${diameter}px`,height:`${diameter}px`,fontSize:`${diameter*.62}px`,boxShadow:`inset 0 0 0 ${Math.min(1,diameter*.08)}px #718096`};
};
const color=phase=>({BLUE:'#2583ff',GREEN:'#30e183',YELLOW:'#ffd84a',OFF:'#10151f'}[phase] || '#10151f');
const wallNames=computed(()=>[t('circleLights.top'),t('circleLights.right'),t('circleLights.bottom'),t('circleLights.left')]);
let observer;
onMounted(()=>{observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;size.value={width,height};});observer.observe(host.value);});
onBeforeUnmount(()=>observer?.disconnect());
</script>
<template>
  <div ref="host" class="debug-light-board">
    <div class="debug-light-scene" :style="sceneStyle">
      <div class="debug-light-floor" :style="floorStyle"><DebugLedCanvas :cell-pitch="geometry.cellSize*scale" :pixels="pixels" :hover-cell="hoverCell" :disabled="disabled" @cell-click="(x,y)=>emit('cell-click',x,y)" @hover-cell="(x,y)=>emit('hover-cell',x,y)" @clear-hover="emit('clear-hover')" /></div>
      <template v-for="light in board?.lights || []" :key="light.key">
        <span class="debug-symbol-light" :data-wall="light.wall" :data-index="light.idx" :data-phase="light.phase" :style="{...pointStyle(light.symbol,light),color:color(light.phase)}">{{light.phase==='BLUE'?light.remaining:light.phase==='GREEN'?'✓':light.phase==='YELLOW'?'!':''}}</span>
        <button type="button" class="debug-circle-light" :data-wall="light.wall" :data-index="light.idx" :data-sequence="light.sequenceIndex" :data-phase="light.phase" :style="{...pointStyle(light.circle,light),backgroundColor:color(light.phase)}" :aria-label="t('circleLights.light',{wall:wallNames[light.wall],index:light.idx+1})" :disabled="disabled || light.phase==='OFF'" @pointerdown.stop @click.stop="emit('circle-click',light.sequenceIndex)"></button>
      </template>
    </div>
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

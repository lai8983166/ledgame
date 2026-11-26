<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import heart from '../assets/secondary-display/challenge-heart.png';
import emptyHeart from '../assets/secondary-display/challenge-heart-empty.png';

const props = defineProps({
  state: { type: Object, required: true },
  presentation: { type: Object, required: true },
});
const { t } = useI18n();
const gameplay = computed(() => props.state.gameplay || {});
const remainingTargets = computed(() => {
  const { targetCount, completedTargetCount } = gameplay.value;
  return Number.isFinite(targetCount) && Number.isFinite(completedTargetCount)
    ? Math.max(0, targetCount - completedTargetCount)
    : '—';
});
const unlimitedLife = computed(() => gameplay.value.lifeLimited === false);
const lifeText = computed(() => unlimitedLife.value ? '∞' : props.presentation.life ?? '—');
const clock = computed(() => props.presentation.gameTime.mode === 'UNLIMITED'
  ? '∞'
  : props.presentation.gameTime.text || '—');
const stageTitle = computed(() => gameplay.value.stageLabel || ('Level ' + (props.presentation.stageNumber ?? '—')));
</script>

<template>
  <section class="challenge-hud" data-testid="challenge-hud">
    <div class="life-strip" :aria-label="t('secondaryDisplay.life') + ' ' + lifeText">
      <img v-for="slot in 8" :key="slot" class="life-icon"
        :src="unlimitedLife || slot <= presentation.life ? heart : emptyHeart" alt="" />
      <span class="life-value">{{ 'x' + lifeText }}</span>
    </div>
    <article class="timer-panel">
      <h1 class="stage-title">{{ stageTitle }}</h1>
      <strong class="time-value" :class="{ 'long-clock': clock.length > 5 }">{{ clock }}</strong>
      <span class="clock-caption" lang="en">{{ t('secondaryDisplay.countdownCaption') }}</span>
    </article>
    <div class="statistics">
      <div class="stat-row">
        <strong>{{ gameplay.rewardPoints ?? '—' }}</strong>
        <span>{{ t('secondaryDisplay.rewardPoints') }}</span>
      </div>
      <div class="stat-row">
        <strong>{{ remainingTargets }}</strong>
        <span>{{ t('secondaryDisplay.remainingTargets') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.challenge-hud {
  position: absolute;
  inset: 0;
  container-type: size;
  overflow: hidden;
  color: #72feff;
  font-family: 'Secondary HUD', sans-serif;
  line-height: 1;
}
.life-strip {
  position: absolute;
  inset: 3.8% 0 auto;
  height: 14%;
  display: flex;
  align-items: center;
  gap: 1cqw;
  padding-left: 8.4%;
  background: url('../assets/secondary-display/challenge-life-line.png') right bottom / 24% 65% no-repeat;
}
.life-icon { display: block; width: min(7.36cqw, 15.5cqh); height: auto; }
.life-value {
  margin-left: 1.7cqw;
  font-size: min(7.1cqw, 15cqh);
  white-space: nowrap;
}
.timer-panel {
  position: absolute;
  left: 2.3%;
  top: 27%;
  width: 46.7%;
  height: 72%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: url('../assets/secondary-display/challenge-timer.png') center / 100% 100% no-repeat;
}
.stage-title {
  position: absolute;
  top: 5.3%;
  left: 4%;
  max-width: 92%;
  box-sizing: border-box;
  margin: 0;
  padding: .2em .75em .14em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: min(3.45cqw, 7.85cqh);
  color: azure;
  background: linear-gradient(90deg, #ca39cb 25%, transparent);
  clip-path: polygon(2% 0, 100% 0, 98% 100%, 0 100%);
}
.time-value {
  max-width: 96%;
  color: #fff1c1;
  font-weight: normal;
  font-size: min(13.2cqw, 29cqh);
  background: linear-gradient(180deg, #fdfff5 20%, #ffcf72 85%);
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: .15cqw #e57c00;
  filter: drop-shadow(0 .3cqw 1.8cqw rgba(255, 108, 0, .5));
}
.time-value.long-clock { font-size: min(8.5cqw, 19cqh); }
.clock-caption {
  position: absolute;
  bottom: 12%;
  font-size: min(5.6cqw, 12cqh);
}
.statistics {
  position: absolute;
  inset: 29% 6% 0 51.7%;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 7.8cqh;
}
.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .4em;
  padding: 0 4%;
  background: url('../assets/secondary-display/challenge-stat.png') center / 100% 100% no-repeat;
}
.stat-row strong {
  font-weight: normal;
  font-size: min(6.7cqw, 14cqh);
}
.stat-row span {
  min-width: 0;
  color: #ea14f9;
  text-align: right;
  font-size: min(5.65cqw, 12cqh);
  overflow-wrap: anywhere;
}
</style>

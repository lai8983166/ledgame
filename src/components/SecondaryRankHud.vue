<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({ state: { type: Object, required: true } });
const { t } = useI18n();
const gameplay = computed(() => props.state.gameplay || {});
const players = computed(() => gameplay.value.players || []);
const seconds = computed(() => {
  const time = gameplay.value.remainingMillis;
  return time == null || !Number.isFinite(Number(time)) ? '—' : Math.ceil(Math.max(0, Number(time)) / 1000);
});
</script>

<template>
  <section class="rank-hud" data-testid="secondary-rank-hud">
    <div class="rank-clock">
      <h1 class="rank-clock-title">{{ gameplay.levelLabel || 'Ranking' }}</h1>
      <strong class="rank-clock-value">{{ seconds }}</strong>
      <span class="rank-clock-caption">{{ t('secondaryDisplay.countdownCaption') }}</span>
    </div>
    <div class="rank-players" :style="{ '--count': players.length }">
      <article v-for="(player,index) in players" :key="player.playerNumber" class="rank-player"
        :style="{ '--offset': players.length > 1 ? index / (players.length - 1) : 0.5 }">
        <span class="rank-player-color" :style="{ backgroundColor: player.color }" aria-hidden="true"></span>
        <span class="rank-player-name">{{ t('rankSecondary.playerLabel', {letter: String.fromCharCode(64 + player.playerNumber)}) }}</span>
        <strong class="rank-player-score">{{ player.stageScore ?? '—' }}</strong>
      </article>
    </div>
  </section>
</template>

<style scoped>
.rank-hud {
  width: 100%;
  height: 100%;
  position: relative;
  container-type: size;
  overflow: hidden;
  font-family: 'Secondary HUD', sans-serif;
  font-weight: 400;
  color: #72feff;
}
.rank-clock {
  position: absolute;
  inset: 10% auto auto 1%;
  width: 53%;
  height: 86%;
  background: url('../assets/secondary-display/rank-clock.png') center / 100% 100% no-repeat;
}
.rank-clock-title {
  position: absolute;
  top: 4%;
  left: 15%;
  max-width: 80%;
  margin: 0;
  padding: .2em .52em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: min(3.3cqw, 7cqh);
  line-height: 1;
  font-weight: 400;
  color: azure;
  background: linear-gradient(90deg, #ca39cb 25%, transparent);
  clip-path: polygon(6% 0,100% 0,94% 100%,0 100%);
}
.rank-clock-value {
  position: absolute;
  inset: 49% 2% auto;
  transform: translateY(-50%);
  text-align: center;
  font-size: min(12cqw, 29cqh);
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  background: linear-gradient(#fdfff5 30%, #ffcf72 85%);
  background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: .12cqw #e57c00;
  filter: drop-shadow(0 .25cqh 1.8cqw rgb(255 108 0 / .65));
}
.rank-clock-caption {
  position: absolute;
  inset: auto 7% 15% 0;
  font-size: min(5.2cqw, 11cqh);
  line-height: 1;
  text-align: center;
}
.rank-players {
  position: absolute;
  inset: 4% 0 4% 47%;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  align-items: flex-end;
}
.rank-player {
  display: flex;
  align-items: center;
  gap: .7cqw;
  box-sizing: border-box;
  width: 90%;
  height: min(17.5cqh, calc(86cqh / max(1, var(--count))));
  margin-right: calc(10% * var(--offset));
  padding: 0 2.2cqw 0 3.2cqw;
  background: url('../assets/secondary-display/rank-player.png') center / 100% 100% no-repeat;
  font-size: min(5.2cqw, 10cqh);
  line-height: 1;
}
.rank-player-color {
  flex: none;
  width: min(3.45cqw, 7cqh);
  aspect-ratio: 1;
  border-radius: .42cqw;
}
.rank-player-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ea14f9;
}
.rank-player-score {
  flex: none;
  margin-left: auto;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
</style>

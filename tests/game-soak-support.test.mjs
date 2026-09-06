import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moveTouchCarousel, touchCarouselSlots } from '../src/lib/touchGamePreparation.js';

test('soak carousel observes real selected ID and uses existing arrows', () => {
  const source = readFileSync(new URL('../src/views/LedGameTouchView.vue', import.meta.url), 'utf8');
  assert.match(source, /data-testid="game-carousel-previous"[\s\S]*?@click="moveGameCarousel\(-1\)"/);
  assert.match(source, /data-testid="game-carousel-next"[\s\S]*?@click="moveGameCarousel\(1\)"/);
  assert.match(source, /:data-selected-game-id="carouselGame\?\.id/);
  const games = [{ id: 5 }, { id: 19 }, { id: 2 }];
  const index = moveTouchCarousel(0, -1, games.length);
  assert.equal(touchCarouselSlots(games, index).find((s) => s.offset === 0).item.id, 2);
});

test('embedded backend preserves default room connection but accepts explicit false', () => {
  const source = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  assert.match(source, /LED_ROOM_CONNECTION_ENABLED: process\.env\.LED_ROOM_CONNECTION_ENABLED \?\? 'true'/);
});

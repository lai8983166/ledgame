import { EFFECT_SPRITE_NAMES } from './effectEditor.js';

export const COMMON_EDITOR_SPRITES = Object.freeze([
  ...EFFECT_SPRITE_NAMES[0], ...EFFECT_SPRITE_NAMES[1],
  ...EFFECT_SPRITE_NAMES[3], ...EFFECT_SPRITE_NAMES[2],
]);

export function filterEditorSprites(sprites, text, colors = []) {
  if (colors.length) sprites = sprites.filter(sprite => colors.includes(Number(sprite.color ?? 0)));
  const query = String(text || '').trim();
  if (!query && colors.length) return sprites;
  if (!query) return COMMON_EDITOR_SPRITES
    .map(name => sprites.find(sprite => sprite.name === name))
    .filter(Boolean);
  const parts = query.split(/\s+/);
  if (parts.length !== 2 || !parts.every(part => /^\d+$/.test(part)
    && Number.isSafeInteger(Number(part)) && Number(part) > 0)) return [];
  const [width, height] = parts.map(Number);
  return sprites.filter(sprite => sprite.width === width && sprite.height === height);
}

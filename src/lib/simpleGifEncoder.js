import * as gifenc from "gifenc";

// gifenc 的 ESM 构建（Vite/Worker）里 GIFEncoder 是命名导出；CJS 构建（node --test）
// 里命名导出挂在 module.exports、经 Node 互操作作为 default 暴露。两种形状归一化：
const lib = gifenc.GIFEncoder ? gifenc : gifenc.default;
const { GIFEncoder, applyPalette } = lib;

export function encodePreparedSimpleGif(prepared, onProgress) {
  const { width, height, palette, frames } = prepared || {};
  if (!width || !height || !Array.isArray(frames) || frames.length === 0) {
    const error = new Error("SIMPLE_GIF_EMPTY_LEVEL");
    error.code = "SIMPLE_GIF_EMPTY_LEVEL";
    throw error;
  }
  const encoder = GIFEncoder();
  frames.forEach((frame, index) => {
    const rgba = frame.pixels instanceof Uint8Array ? frame.pixels : new Uint8Array(frame.pixels);
    const indexed = applyPalette(rgba, palette);
    encoder.writeFrame(indexed, width, height, {
      palette: index === 0 ? palette : undefined,
      delay: frame.delay,
      repeat: 0,
    });
    onProgress?.(index + 1, frames.length);
  });
  encoder.finish();
  return encoder.bytes();
}

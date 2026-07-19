import { encodePreparedSimpleGif } from "../lib/simpleGifEncoder.js";

self.onmessage = (event) => {
  try {
    const prepared = event.data || {};
    const bytes = encodePreparedSimpleGif(prepared, (completed, total) => {
      self.postMessage({ type: "progress", completed, total });
    });
    self.postMessage({ type: "complete", bytes: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      code: error?.code || "SIMPLE_GIF_ENCODING_FAILED",
      message: error?.message || String(error),
    });
  }
};

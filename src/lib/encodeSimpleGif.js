export function encodeSimpleGifInWorker(prepared, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/simpleGifEncoder.worker.js", import.meta.url), { type: "module" });
    const frames = prepared.frames.map((frame) => ({
      delay: frame.delay,
      pixels: frame.pixels.buffer,
    }));
    const transfers = frames.map((frame) => frame.pixels);

    worker.onmessage = (event) => {
      if (event.data?.type === "progress") {
        onProgress?.(event.data.completed, event.data.total);
        return;
      }
      worker.terminate();
      if (event.data?.type === "complete") {
        resolve(new Uint8Array(event.data.bytes));
      } else {
        const error = new Error(event.data?.message || "SIMPLE_GIF_ENCODING_FAILED");
        error.code = event.data?.code || "SIMPLE_GIF_ENCODING_FAILED";
        reject(error);
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      const error = new Error(event.message || "SIMPLE_GIF_WORKER_FAILED");
      error.code = "SIMPLE_GIF_WORKER_FAILED";
      reject(error);
    };
    worker.postMessage(
      {
        width: prepared.width,
        height: prepared.height,
        palette: prepared.palette,
        frames,
      },
      transfers,
    );
  });
}

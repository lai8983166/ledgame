import assert from "node:assert/strict";
import test from "node:test";

import { createRankEditorPayload } from "../src/lib/rankGameEditor.js";

test("Rank editor detaches reactive proxies before Electron IPC", () => {
  const level = new Proxy({ type: 1, bounds: { minX: 0, minY: 0, maxX: 15, maxY: 35 } }, {});
  const document = new Proxy({ id: 7, type: "rank", levels: [level] }, {});

  assert.throws(() => structuredClone(document), { name: "DataCloneError" });

  const payload = createRankEditorPayload(document, 12);
  assert.deepEqual(structuredClone(payload), {
    id: 12,
    type: "rank",
    levels: [{ type: 1, bounds: { minX: 0, minY: 0, maxX: 15, maxY: 35 } }],
  });
});

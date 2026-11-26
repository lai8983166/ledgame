import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPixelLightPreview,
  normalizePixelLightWiring,
  rebuildPixelLightRows,
  selectPixelLightRow,
  setPixelLightRowAlign,
  updatePixelLightWallCount,
  validatePixelLightAlign,
  validatePixelLightWiring,
} from "../src/lib/pixelLightLayout.js";

test("normalizes an empty layout without mutating the source", () => {
  const source = {};
  const normalized = normalizePixelLightWiring(source);
  assert.equal(normalized.form.open, 0);
  assert.equal(normalized.form.order, 1);
  assert.equal(normalized.form.topWallPixelLightNum, 0);
  assert.equal(normalized.form.rightWallPixelLightNum, 0);
  assert.equal(normalized.form.bottomWallPixelLightNum, 0);
  assert.equal(normalized.form.leftWallPixelLightNum, 0);
  assert.equal(normalized.form.pixelPort, 6);
  assert.equal(normalized.form.circlePort, 7);
  assert.deepEqual(normalized.rows, []);
  assert.deepEqual(source, {});
  assert.deepEqual(validatePixelLightWiring(normalized), []);
});

test("preserves explicit legacy values while filling missing fields", () => {
  const normalized = normalizePixelLightWiring({
    form: { open: 1, pixelPort: 2, topWallPixelLightNum: 2 },
    rows: [{ wall: 0, idx: 0, align: "4,5" }],
  });
  assert.equal(normalized.form.pixelPort, 2);
  assert.equal(normalized.form.circlePort, 7);
  assert.equal(normalized.form.topWallPixelLightNum, 2);
  assert.deepEqual(normalized.rows, [
    { wall: 0, idx: 0, align: "4,5" },
    { wall: 0, idx: 1, align: "" },
  ]);
});

test("rebuilds rows by wall|idx and preserves existing alignment", () => {
  const form = {
    topWallPixelLightNum: 2,
    rightWallPixelLightNum: 1,
    bottomWallPixelLightNum: 0,
    leftWallPixelLightNum: 1,
  };
  const rows = rebuildPixelLightRows(form, [
    { wall: 0, idx: 0, align: "1,2" },
    { wall: 0, idx: 1, align: "3,4" },
    { wall: 1, idx: 0, align: "5,6" },
  ]);
  assert.deepEqual(rows, [
    { wall: 0, idx: 0, align: "1,2" },
    { wall: 0, idx: 1, align: "3,4" },
    { wall: 1, idx: 0, align: "5,6" },
    { wall: 3, idx: 0, align: "" },
  ]);
});

test("changing a wall count only drops rows outside the new count", () => {
  const layout = normalizePixelLightWiring({
    form: { open: 1, topWallPixelLightNum: 3, rightWallPixelLightNum: 1 },
    rows: [
      { wall: 0, idx: 0, align: "1,1" },
      { wall: 0, idx: 1, align: "2,2" },
      { wall: 0, idx: 2, align: "3,3" },
      { wall: 1, idx: 0, align: "4,4" },
    ],
  });
  const reduced = updatePixelLightWallCount(layout, 0, 2);
  assert.deepEqual(reduced.rows, [
    { wall: 0, idx: 0, align: "1,1" },
    { wall: 0, idx: 1, align: "2,2" },
    { wall: 1, idx: 0, align: "4,4" },
  ]);
});

test("closing the layout preserves counts, rows, start and alignment", () => {
  const layout = normalizePixelLightWiring({
    selectedRow: "1|0",
    form: { open: 1, rightWallPixelLightNum: 1, pixelPort: 6, circlePort: 7 },
    rows: [{ wall: 1, idx: 0, align: "16,14" }],
  });
  layout.form.open = 0;
  const closed = normalizePixelLightWiring(layout);
  assert.equal(closed.form.open, 0);
  assert.equal(closed.form.rightWallPixelLightNum, 1);
  assert.equal(closed.selectedRow, "1|0");
  assert.deepEqual(closed.rows, [{ wall: 1, idx: 0, align: "16,14" }]);
});

test("only the first row of each wall can be selected as a start", () => {
  const layout = normalizePixelLightWiring({
    form: { open: 1, topWallPixelLightNum: 2 },
  });
  assert.equal(selectPixelLightRow(layout, 0, 1).selectedRow, "0|0");
  assert.equal(selectPixelLightRow(layout, 0, 0).selectedRow, "0|0");
});

test("validates channel conflicts, invalid alignment and required alignment", () => {
  const conflict = normalizePixelLightWiring({
    form: { open: 1, topWallPixelLightNum: 1, pixelPort: 2, circlePort: 2 },
  });
  assert.ok(validatePixelLightWiring(conflict).some((error) => error.code === "CHANNEL_CONFLICT"));

  const invalidAlign = setPixelLightRowAlign(
    normalizePixelLightWiring({ form: { open: 1, topWallPixelLightNum: 1 } }),
    0,
    0,
    "bad",
  );
  assert.ok(validatePixelLightWiring(invalidAlign).some((error) => error.code === "INVALID_ALIGN"));

  const requiredAlign = normalizePixelLightWiring({
    form: { open: 1, forceAlign: 1, topWallPixelLightNum: 1 },
  });
  assert.ok(validatePixelLightWiring(requiredAlign).some((error) => error.code === "ALIGN_REQUIRED"));

  assert.equal(validatePixelLightAlign("1,1", 16, 36), null);
  assert.equal(validatePixelLightAlign("16,36", 16, 36), null);
  assert.equal(validatePixelLightAlign("17,1", 16, 36)?.code, "ALIGN_OUT_OF_RANGE");
  assert.equal(validatePixelLightAlign("1,0", 16, 36)?.code, "ALIGN_OUT_OF_RANGE");
});

test("builds a preview from the current grid dimensions", () => {
  const preview = buildPixelLightPreview({
    form: { open: 1, topWallPixelLightNum: 2 },
    rows: [{ wall: 0, idx: 0, align: "3,4" }, { wall: 0, idx: 1, align: "" }],
  }, 16, 36);
  assert.equal(preview.width, 16);
  assert.equal(preview.height, 36);
  assert.equal(preview.lights.length, 2);
  assert.deepEqual(preview.lights[0].align, { x: 3, y: 4 });
  assert.equal(preview.walls.length, 4);
  assert.ok(preview.floor.x > 0);
  assert.ok(preview.canvasHeight > preview.floor.height);
  assert.equal(preview.symbolChain.length, 2);
  assert.equal(preview.circleChain.length, 2);
});

test("wall alignment projects row/column onto the wall and never moves a pair into the floor", () => {
  const layout = normalizePixelLightWiring({
    form: { open: 1, topWallPixelLightNum: 1, rightWallPixelLightNum: 1,
      bottomWallPixelLightNum: 1, leftWallPixelLightNum: 1 },
  });
  const before = buildPixelLightPreview(layout, 16, 36);
  layout.rows.forEach(row => { row.align = "16,36"; });
  const aligned = buildPixelLightPreview(layout, 16, 36);
  for (const light of aligned.lights) {
    const original = before.lights.find(item => item.wall === light.wall);
    for (const marker of ["symbol", "circle"]) {
      if (light.wall === 0 || light.wall === 2) {
        assert.equal(light[marker].x, aligned.floor.x + 15.5 * aligned.cellSize);
        assert.equal(light[marker].y, original[marker].y);
        assert.ok(light.wall === 0 ? light[marker].y < aligned.floor.y
          : light[marker].y > aligned.floor.y + aligned.floor.height);
      } else {
        assert.equal(light[marker].y, aligned.floor.y + 35.5 * aligned.cellSize);
        assert.equal(light[marker].x, original[marker].x);
        assert.ok(light.wall === 3 ? light[marker].x < aligned.floor.x
          : light[marker].x > aligned.floor.x + aligned.floor.width);
      }
    }
    layout.rows.find(row => row.wall === light.wall).align = light.wall % 2 ? "2,36" : "16,2";
  }
  const changedUnusedAxis = buildPixelLightPreview(layout, 16, 36);
  assert.deepEqual(changedUnusedAxis.symbolChain, aligned.symbolChain);
  assert.deepEqual(changedUnusedAxis.circleChain, aligned.circleChain);
  assert.equal(validatePixelLightWiring(layout, { gridWidth: 16, gridHeight: 36 }).length, 0);
});

test("empty positions have equal end gaps and reverse with the wall order", () => {
  for (const order of [0, 1]) {
    const layout = normalizePixelLightWiring({ form: { open: 1, order,
      topWallPixelLightNum: 2, rightWallPixelLightNum: 3, bottomWallPixelLightNum: 2, leftWallPixelLightNum: 3 } });
    const before = buildPixelLightPreview(layout, 16, 36);
    for (const wall of before.walls) {
      const horizontal = wall.wall % 2 === 0;
      const lights = before.lights.filter(light => light.wall === wall.wall);
      const length = horizontal ? wall.width : wall.height;
      const gap = (length - lights.length * before.cellSize) / (lights.length + 1);
      const reversed = wall.wall < 2 ? !order : Boolean(order);
      for (const light of lights) {
        const index = reversed ? lights.length - 1 - light.idx : light.idx;
        const expected = gap + before.cellSize / 2 + index * (gap + before.cellSize);
        assert.ok(Math.abs((horizontal ? light.circle.x - wall.x : light.circle.y - wall.y) - expected) < 1e-8);
      }
    }
    layout.rows[0].align = "4,7";
    const after = buildPixelLightPreview(layout, 16, 36);
    assert.equal(after.lights[0].circle.x, after.floor.x + 3.5 * after.cellSize);
    assert.deepEqual(after.lights.slice(1), before.lights.slice(1));
  }
});

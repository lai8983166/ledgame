import test from 'node:test';
import assert from 'node:assert/strict';
import { debugLedGrid, fitDebugLedGrid, debugLedCellAt } from '../src/lib/debugLedGeometry.js';
import { debugPeripheralBoard } from '../src/lib/debugPeripheralLights.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('standalone fitting uses the limiting dimension without integer-cell remainder', () => {
  for (const [columns, rows, width, height] of [[16, 36, 321.5, 701.25], [50, 50, 340, 219], [50, 1, 117, 53], [1, 50, 53, 117]]) {
    const grid = fitDebugLedGrid(columns, rows, width, height);
    assert.ok(grid.width <= width + 1e-8 && grid.height <= height + 1e-8);
    assert.ok(Math.abs(grid.width - width) < 1e-8 || Math.abs(grid.height - height) < 1e-8);
    near(grid.width / columns, grid.height / rows);
    // The last cell ends exactly one half-gap before the floor boundary.
    near(grid.height - ((rows - 1) * grid.pitch + grid.padding + grid.cellSize), grid.padding);
    near(grid.width - ((columns - 1) * grid.pitch + grid.padding + grid.cellSize), grid.padding);
  }
});

test('all four peripheral walls align with the actual first and last RGB cell centers after scaling', () => {
  for (const [columns, rows] of [[16, 36], [50, 50], [1, 50], [50, 1]]) {
    for (const scale of [.137, .75, 1.623]) {
      for (const [row, column] of [[0, 0], [rows - 1, columns - 1]]) {
        const board = debugPeripheralBoard({form:{open:1,topWallPixelLightNum:1,rightWallPixelLightNum:1,bottomWallPixelLightNum:1,leftWallPixelLightNum:1},
          rows:[0,1,2,3].map(wall => ({wall,idx:0,align:`${row},${column}`}))}, null, columns, rows);
        const grid = debugLedGrid(columns, rows, board.cellSize * scale);
        near(grid.width, board.floor.width * scale);
        near(grid.height, board.floor.height * scale);
        const centerX = board.floor.x * scale + grid.padding + column * grid.pitch + grid.cellSize / 2;
        const centerY = board.floor.y * scale + grid.padding + row * grid.pitch + grid.cellSize / 2;
        for (const light of board.lights) {
          for (const point of [light.symbol, light.circle]) {
            if (light.wall % 2 === 0) near(point.x * scale, centerX);
            else near(point.y * scale, centerY);
          }
        }
      }
    }
  }
});

test('fractional-pitch hit testing reaches the last cell and rejects gaps and outside edges', () => {
  const grid = debugLedGrid(16, 36, 13.375);
  assert.deepEqual(debugLedCellAt(grid, 15.5 * grid.pitch, 35.5 * grid.pitch), {x:15,y:35});
  assert.deepEqual(debugLedCellAt(grid, grid.width - grid.padding - .01, grid.height - grid.padding - .01), {x:15,y:35});
  for (const point of [[0,0], [grid.pitch, grid.pitch / 2], [-.01,10], [grid.width,10], [10,grid.height]]) {
    assert.equal(debugLedCellAt(grid, ...point), null);
  }
  assert.equal(debugLedCellAt(fitDebugLedGrid(16,36,0,0),0,0),null);
});

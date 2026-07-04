export const simpleMatrixOccupancyFixtures = {
  singleCell: {
    matrix: [
      { id: "obj-0-a-0", x: 1, y: 1, color: 0, points: [[0, 0]] },
    ],
    cell: { x: 1, y: 1 },
    expectedTopObjectId: "obj-0-a-0",
    expectedOccupants: 1,
  },
  overlappingCell: {
    matrix: [
      { id: "obj-0-a-0", x: 2, y: 2, color: 0, points: [[0, 0]] },
      { id: "obj-0-a-1", x: 2, y: 2, color: 1, points: [[0, 0]] },
    ],
    cell: { x: 2, y: 2 },
    expectedTopObjectId: "obj-0-a-1",
    expectedOccupants: 2,
  },
  selectedNonTopObject: {
    selectedObjectId: "obj-0-a-0",
    matrix: [
      { id: "obj-0-a-0", x: 3, y: 3, color: 0, points: [[0, 0]] },
      { id: "obj-0-a-1", x: 3, y: 3, color: 2, points: [[0, 0]] },
    ],
    cell: { x: 3, y: 3 },
    expectedTopObjectId: "obj-0-a-1",
    expectedSelectedVisible: true,
  },
  virtualCell: {
    matrix: [
      { id: "obj-0-a-0", x: -1, y: 0, color: 3, points: [[0, 0]] },
    ],
    cell: { x: -1, y: 0 },
    expectedTopObjectId: "obj-0-a-0",
    expectedSubmitted: false,
  },
};

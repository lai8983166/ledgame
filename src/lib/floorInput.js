export function floorInputPayload(action, x, y) {
  const normalizedAction = String(action || "").toUpperCase();
  if (normalizedAction !== "DOWN" && normalizedAction !== "UP") {
    throw new Error(`Unsupported floor input action: ${action}`);
  }
  return {
    type: "tile",
    x,
    y,
    value: normalizedAction === "DOWN" ? 1 : 0,
  };
}

export async function sendFloorTap(sendInput, x, y, onResponse = () => {}) {
  if (typeof sendInput !== "function") {
    throw new Error("Game runtime input API is unavailable");
  }
  const down = await sendInput(floorInputPayload("DOWN", x, y));
  onResponse(down);
  const up = await sendInput(floorInputPayload("UP", x, y));
  onResponse(up);
  return up;
}

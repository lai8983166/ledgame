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

export function floorClickPayload(x, y) {
  return { type: "click", x, y };
}

export async function sendFloorClick(sendInput, x, y, onResponse = () => {}) {
  if (typeof sendInput !== "function") {
    throw new Error("Game runtime input API is unavailable");
  }
  const response = await sendInput(floorClickPayload(x, y));
  onResponse(response);
  return response;
}

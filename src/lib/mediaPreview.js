export function buildMediaPreviewUrl(relativePath) {
  const value = String(relativePath || "").trim();
  if (!value) {
    return "";
  }
  return `led-media://preview/${value
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

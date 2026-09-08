export function normalizePrefix(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function filterByNamePrefix(items, value, nameOf = (item) => item?.name || item?.id || "") {
  const prefix = normalizePrefix(value);
  if (!prefix) return [...items];
  return items.filter((item) => normalizePrefix(nameOf(item)).startsWith(prefix));
}

export function createDebouncedPrefix({ onChange, delay = 250, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout }) {
  let timer = null;
  return {
    update(value) {
      if (timer) clearTimeoutFn(timer);
      timer = setTimeoutFn(() => {
        timer = null;
        onChange(String(value ?? "").trim());
      }, delay);
    },
    cancel() {
      if (timer) clearTimeoutFn(timer);
      timer = null;
    },
  };
}

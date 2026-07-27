const DEFAULT_HISTORY_LIMIT = 100;

export function createRgbEditHistory(options = {}) {
  const limit = normalizeLimit(options.limit);
  const undoStack = [];
  const redoStack = [];

  return {
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get undoCount() {
      return undoStack.length;
    },
    get redoCount() {
      return redoStack.length;
    },
    commit(before, after, metadata = {}) {
      if (areSnapshotsEqual(before, after)) {
        return false;
      }
      undoStack.push(cloneEntry({ before, after, metadata }));
      if (undoStack.length > limit) {
        undoStack.splice(0, undoStack.length - limit);
      }
      redoStack.length = 0;
      return true;
    },
    undo() {
      const entry = undoStack.pop();
      if (!entry) {
        return null;
      }
      redoStack.push(entry);
      return {
        snapshot: cloneValue(entry.before),
        metadata: cloneValue(entry.metadata),
      };
    },
    redo() {
      const entry = redoStack.pop();
      if (!entry) {
        return null;
      }
      undoStack.push(entry);
      return {
        snapshot: cloneValue(entry.after),
        metadata: cloneValue(entry.metadata),
      };
    },
    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
    },
  };
}

function normalizeLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.floor(number)
    : DEFAULT_HISTORY_LIMIT;
}

function areSnapshotsEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function cloneEntry(entry) {
  return {
    before: cloneValue(entry.before),
    after: cloneValue(entry.after),
    metadata: cloneValue(entry.metadata),
  };
}

function cloneValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

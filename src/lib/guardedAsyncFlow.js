export async function waitForGuardedPromise({
  promise,
  isCurrent,
  ignoreError = false,
}) {
  if (!isCurrent()) {
    return false;
  }
  try {
    await promise;
  } catch (error) {
    if (!ignoreError) {
      throw error;
    }
  }
  return isCurrent();
}

export async function runGuardedFrameSequence({
  frames,
  nextFrame,
  isCurrent,
  measure,
  reveal,
}) {
  for (let index = 0; index < frames; index += 1) {
    await nextFrame();
    if (!isCurrent()) {
      return false;
    }
    measure();
  }
  if (!isCurrent()) {
    return false;
  }
  reveal();
  measure();
  return true;
}

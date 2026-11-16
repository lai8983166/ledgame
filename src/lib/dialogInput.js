export function isComposingEvent(event) {
  return Boolean(event?.isComposing || event?.keyCode === 229);
}

export function hasVisibleModalDialog(targetDocument = globalThis.document, excludedDialog = null) {
  return [...(targetDocument?.querySelectorAll?.('[role="dialog"][aria-modal="true"]') || [])]
    .some((node) => node !== excludedDialog && node.getClientRects().length > 0);
}

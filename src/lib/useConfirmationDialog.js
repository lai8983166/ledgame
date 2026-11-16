import { getCurrentScope, onScopeDispose, shallowRef } from 'vue';

export function useConfirmationDialog() {
  const confirmation = shallowRef(null);
  let pending = null;
  let disposed = false;
  let sequence = 0;

  function resolveConfirmation(accepted, id = pending?.id) {
    if (!pending || pending.id !== id) return;
    const request = pending;
    pending = null;
    confirmation.value = null;
    request.resolve(accepted === true && !disposed);
  }

  function confirmAction(message) {
    // A second click must not queue a second destructive operation.
    if (disposed || pending) return Promise.resolve(false);
    const id = ++sequence;
    return new Promise(resolve => {
      pending = { id, resolve };
      confirmation.value = { id, message };
    });
  }

  if (getCurrentScope()) onScopeDispose(() => {
    disposed = true;
    resolveConfirmation(false);
  });

  return { confirmation, confirmAction, resolveConfirmation,
    isConfirmationCurrent: () => !disposed };
}

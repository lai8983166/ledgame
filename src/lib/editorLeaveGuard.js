export async function resolveEditorDeparture(editor, choose) {
  if (editor?.canLeave && !editor.canLeave()) return false;
  if (!editor?.hasUnsavedChanges?.()) return true;
  const choice = await choose();
  if (choice === 'discard') return true;
  if (choice !== 'save') return false;
  try { return await editor.saveForLeave() === true; }
  catch { return false; }
}

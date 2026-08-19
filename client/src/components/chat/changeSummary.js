export function summarizeChange(change) {
  const diff = change?.diff ?? {};
  const type = (change?.type ?? change?.editType ?? 'modified').toLowerCase();
  const label = type === 'created' ? 'Created' : type === 'deleted' ? 'Deleted' : 'Modified';
  const added = Number.isFinite(diff.linesAdded) ? diff.linesAdded : 0;
  const removed = Number.isFinite(diff.linesRemoved) ? diff.linesRemoved : 0;

  return {
    path: change?.path ?? 'unknown',
    label,
    added,
    removed,
    type
  };
}

// Simple diff algorithm for showing what changed in code edits
// Returns a structured representation of changes for UI display and logging

export function calculateDiff(oldContent, newContent) {
  if (oldContent === newContent) {
    return { type: 'unchanged', oldLines: 0, newLines: 0 };
  }

  if (!oldContent) {
    return { type: 'created', oldLines: 0, newLines: countLines(newContent), added: true };
  }

  if (!newContent) {
    return { type: 'deleted', oldLines: countLines(oldContent), newLines: 0, removed: true };
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const hunks = [];

  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      oldIndex++;
      newIndex++;
    } else {
      const hunk = { start: oldIndex, end: oldIndex, added: [], removed: [] };

      // Find removed lines
      while (oldIndex < oldLines.length && !newLines.includes(oldLines[oldIndex])) {
        hunk.removed.push(oldLines[oldIndex]);
        oldIndex++;
      }

      // Find added lines
      while (newIndex < newLines.length && !oldLines.includes(newLines[newIndex])) {
        hunk.added.push(newLines[newIndex]);
        newIndex++;
      }

      if (hunk.added.length > 0 || hunk.removed.length > 0) {
        hunks.push(hunk);
      }
    }
  }

  return {
    type: 'modified',
    oldLines: oldLines.length,
    newLines: newLines.length,
    hunks,
    linesAdded: hunks.reduce((sum, h) => sum + h.added.length, 0),
    linesRemoved: hunks.reduce((sum, h) => sum + h.removed.length, 0)
  };
}

function countLines(content) {
  return content.trim().split('\n').length;
}

export function createFileChangeSet(oldFile, newFile) {
  return {
    path: oldFile?.path || newFile.path,
    type: oldFile && !newFile ? 'deleted' : !oldFile ? 'created' : 'modified',
    oldContent: oldFile?.content || null,
    newContent: newFile?.content || null,
    language: newFile?.language || oldFile?.language || null,
    diff: calculateDiff(oldFile?.content || '', newFile?.content || '')
  };
}

export function summarizeChanges(changeSet) {
  const summary = [];

  changeSet.forEach((change) => {
    if (change.type === 'created') {
      summary.push(`✨ Created: ${change.path} (+${change.diff.newLines} lines)`);
    } else if (change.type === 'deleted') {
      summary.push(`🗑️  Deleted: ${change.path} (-${change.diff.oldLines} lines)`);
    } else if (change.type === 'modified') {
      const netChange = change.diff.linesAdded - change.diff.linesRemoved;
      const sign = netChange > 0 ? '+' : '';
      summary.push(
        `📝 Modified: ${change.path} (${sign}${netChange} lines, +${change.diff.linesAdded}/-${change.diff.linesRemoved})`
      );
    }
  });

  return summary.join('\n');
}

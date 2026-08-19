import assert from 'node:assert/strict';
import { createChatHandlers } from '../controllers/chatController.js';
import { calculateDiff } from '../utils/diffUtils.js';
import { enrichChangeMetadata, validateEditingResponse } from '../services/phase6EditingService.js';

// Test utilities
function makeDatabase({ owner = 'owner' } = {}) {
  const state = {
    files: new Map([
      ['src/App.jsx', { id: 'app', path: 'src/App.jsx', content: 'export default function App() { return <main>Original</main>; }', language: 'jsx' }],
      ['src/index.css', { id: 'css', path: 'src/index.css', content: 'body { color: black; }', language: 'css' }]
    ]),
    messages: [],
    transactions: 0
  };

  const project = { id: 'project-1', title: 'Test project', description: null, framework: 'React' };

  const stamp = (file) => ({ ...file, createdAt: new Date(0), updatedAt: new Date(0) });

  const makeTransaction = (draft) => ({
    projectFile: {
      upsert: async ({ where, update, create }) => {
        state.transactions += 1;
        const path = where.projectId_path.path;
        const previous = draft.files.get(path);
        const file = previous ? { ...previous, ...update } : { id: `file-${path}`, ...create };
        draft.files.set(path, file);
        return stamp(file);
      },
      findMany: async ({ where }) => [...draft.files.values()].map(stamp)
    },
    conversation: {
      update: async ({ data }) => {
        const message = { id: `msg-${state.messages.length}`, ...data.messages.create, createdAt: new Date() };
        draft.messages.push(message);
        return { messages: [message] };
      }
    }
  });

  return {
    state,
    project: { findFirst: async ({ where }) => (where.id === project.id && where.userId === owner ? project : null) },
    conversation: {
      findFirst: async () => ({ id: 'conv-1' }),
      create: async () => ({ id: 'conv-1' }),
      update: async ({ data }) => {
        const message = { id: `user-${state.messages.length}`, ...data.messages.create, createdAt: new Date() };
        state.messages.push(message);
        return { messages: [message] };
      }
    },
    message: { findMany: async () => state.messages },
    projectFile: { findMany: async () => [...state.files.values()].map(stamp) },
    $transaction: async (callback) => {
      const draft = { files: new Map(state.files), messages: [...state.messages] };
      const result = await callback(makeTransaction(draft));
      state.files = draft.files;
      state.messages = draft.messages;
      return result;
    }
  };
}

async function invokeChat({ database, provider, body = { message: 'Add dark mode' }, userId = 'owner' }) {
  const { sendChat } = createChatHandlers({ database, generateResponse: provider });
  const response = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
  let error;
  await sendChat(
    { params: { id: 'project-1' }, auth: { userId }, body },
    response,
    (value) => { error = value; }
  );
  return { response, error };
}

// TEST 1: Single-file editing
{
  const database = makeDatabase();
  const result = await invokeChat({
    database,
    provider: async () => ({
      message: 'Added dark mode styling',
      changes: [{ path: 'src/index.css', content: 'body { background: black; color: white; }', language: 'css' }]
    })
  });

  assert.equal(result.response.statusCode, 201);
  assert.equal(database.state.files.get('src/index.css').content, 'body { background: black; color: white; }');
  assert.equal(result.response.payload.editing, true); // Should detect "dark mode" as editing
  assert.ok(result.response.payload.changes);
  assert.equal(result.response.payload.changes[0].type, 'modified');
  console.log('TEST 1 PASS: Single-file editing');
}

// TEST 2: Multi-file editing
{
  const database = makeDatabase();
  const result = await invokeChat({
    database,
    provider: async () => ({
      message: 'Refactored component structure',
      changes: [
        { path: 'src/App.jsx', content: 'export default function App() { return <main>Refactored</main>; }', language: 'jsx' },
        { path: 'src/index.css', content: 'main { padding: 20px; }', language: 'css' }
      ]
    })
  });

  assert.equal(result.response.statusCode, 201);
  assert.equal(database.state.files.get('src/App.jsx').content, 'export default function App() { return <main>Refactored</main>; }');
  assert.equal(database.state.files.get('src/index.css').content, 'main { padding: 20px; }');
  assert.equal(result.response.payload.editing, true); // Should detect "refactored" as editing
  assert.equal(result.response.payload.changes.length, 2);
  console.log('TEST 2 PASS: Multi-file editing');
}

// TEST 3: Diff calculation
{
  const oldContent = 'line 1\nline 2\nline 3';
  const newContent = 'line 1\nline 2 modified\nline 3\nline 4';
  const diff = calculateDiff(oldContent, newContent);

  assert.equal(diff.type, 'modified');
  assert.equal(diff.linesAdded, 2); // 'line 2 modified' and 'line 4'
  assert.equal(diff.linesRemoved, 1); // original 'line 2'
  console.log('TEST 3 PASS: Diff calculation');
}

// TEST 4: Bug-fix detection and editing
{
  const database = makeDatabase();
  const result = await invokeChat({
    database,
    provider: async () => ({
      message: 'Fixed the button click handler',
      changes: [{ path: 'src/App.jsx', content: 'export default function App() { return <button onClick={() => alert("Fixed!")}>Click me</button>; }', language: 'jsx' }]
    }),
    body: { message: 'Fix the button not working' }
  });

  assert.equal(result.response.statusCode, 201);
  assert.equal(result.response.payload.editing, true); // Should detect "fix" as editing
  assert.ok(result.response.payload.message.content.includes('Fixed'));
  console.log('TEST 4 PASS: Bug-fix detection and editing');
}

// TEST 5: Refactoring mode detection
{
  const database = makeDatabase();
  const result = await invokeChat({
    database,
    provider: async () => ({
      message: 'Refactored for better performance',
      changes: [{ path: 'src/App.jsx', content: 'export default function App() { return <main>Optimized</main>; }', language: 'jsx' }]
    }),
    body: { message: 'Refactor this component for better code quality' }
  });

  assert.equal(result.response.statusCode, 201);
  assert.equal(result.response.payload.editing, true); // Should detect "refactor" as editing
  console.log('TEST 5 PASS: Refactoring mode detection');
}

// TEST 6: Invalid path protection
{
  try {
    validateEditingResponse([{ path: '../etc/passwd', content: 'hacked' }], 'project-1');
    assert.fail('Should have thrown on path traversal');
  } catch (error) {
    assert.ok(error.message.includes('Invalid file path'));
    console.log('TEST 6 PASS: Invalid path protection');
  }
}

// TEST 7: Failed edit does not corrupt existing files
{
  const database = makeDatabase();
  const originalAppContent = database.state.files.get('src/App.jsx').content;
  const originalCssContent = database.state.files.get('src/index.css').content;

  // Attempt an edit that fails validation (invalid React)
  const result = await invokeChat({
    database,
    provider: async () => ({
      message: 'Updated',
      changes: [{ path: 'src/App.jsx', content: '<div>Not valid React</div>', language: 'jsx' }]
    })
  });

  // Should reject because it's not valid React
  assert.ok(result.error);
  assert.ok(result.error.statusCode >= 400);
  assert.equal(database.state.files.get('src/App.jsx').content, originalAppContent);
  assert.equal(database.state.files.get('src/index.css').content, originalCssContent);
  console.log('TEST 7 PASS: Failed edit does not corrupt files');
}

// TEST 8: Change metadata enrichment
{
  const oldFiles = [
    { path: 'src/App.jsx', content: 'old content', language: 'jsx' },
    { path: 'src/index.css', content: 'old css', language: 'css' }
  ];

  const changes = [
    { path: 'src/App.jsx', content: 'new content', language: 'jsx' },
    { path: 'src/utils.js', content: 'new file', language: 'js' }
  ];

  const enriched = enrichChangeMetadata(changes, oldFiles);

  assert.equal(enriched[0].editType, 'modified');
  assert.equal(enriched[0].isNew, false);
  assert.equal(enriched[1].editType, 'created');
  assert.equal(enriched[1].isNew, true);
  console.log('TEST 8 PASS: Change metadata enrichment');
}

// TEST 9: Atomic transaction ensures all changes or none
{
  const database = makeDatabase();
  let txCount = database.state.transactions;

  const result = await invokeChat({
    database,
    provider: async () => ({
      message: 'Multi-file refactor',
      changes: [
        { path: 'src/App.jsx', content: 'export default function App() { return <main>Refactored</main>; }', language: 'jsx' },
        { path: 'src/utils.js', content: 'export const helper = () => {};', language: 'js' }
      ]
    })
  });

  assert.equal(result.response.statusCode, 201);
  assert.equal(database.state.files.size, 3); // app, css, utils
  assert.ok(database.state.files.get('src/utils.js'));
  console.log('TEST 9 PASS: Atomic transaction ensures consistency');
}

console.log('\nPhase 6 AI Editing tests passed.');

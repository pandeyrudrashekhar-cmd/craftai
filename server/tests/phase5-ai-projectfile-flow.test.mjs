import assert from 'node:assert/strict';
import { createChatHandlers } from '../controllers/chatController.js';
import { authenticate } from '../middleware/authenticate.js';

const initialApp = 'export default function App() { return <main>Original</main>; }';
const validApp = 'export default function App() { return <main>Updated content</main>; }';
const jsxCommentApp = 'export default function App() {\n  return (\n    <main>\n      {/* This is a valid JSX comment */}\n      <h1>mental healthcare</h1>\n    </main>\n  );\n}';

function makeDatabase({ owner = 'owner', failPath = null } = {}) {
  const state = { files: new Map([['src/App.jsx', { id: 'app', path: 'src/App.jsx', content: initialApp, language: 'jsx' }]]), messages: [], transactions: 0, upserts: 0, assistantWrites: 0 };
  const project = { id: 'project-1', title: 'Test project', description: null, framework: 'React' };
  const stamp = (file) => ({ ...file, createdAt: new Date(0), updatedAt: new Date(0) });
  const makeTransaction = (draft) => ({
    projectFile: { upsert: async ({ where, update, create }) => { const path = where.projectId_path.path; if (path === failPath) throw new Error('forced persistence failure'); state.upserts += 1; const previous = draft.files.get(path); const file = previous ? { ...previous, ...update } : { id: `file-${path}`, ...create }; draft.files.set(path, file); return stamp(file); } },
    conversation: { update: async ({ data }) => { const message = { id: `assistant-${draft.messages.length + 1}`, ...data.messages.create, createdAt: new Date() }; draft.messages.push(message); state.assistantWrites += 1; return { messages: [message] }; } }
  });
  return {
    state,
    project: { findFirst: async ({ where }) => where.id === project.id && where.userId === owner ? project : null },
    conversation: {
      findFirst: async () => ({ id: 'conversation-1' }), create: async () => ({ id: 'conversation-1' }),
      update: async ({ data }) => { const message = { id: `user-${state.messages.length + 1}`, ...data.messages.create, createdAt: new Date() }; state.messages.push(message); return { messages: [message] }; }
    },
    message: { findMany: async () => state.messages.map(({ role, content, createdAt }) => ({ role, content, createdAt })) },
    projectFile: { findMany: async () => [...state.files.values()].map(stamp) },
    $transaction: async (callback) => { state.transactions += 1; const draft = { files: new Map(state.files), messages: [...state.messages] }; const result = await callback(makeTransaction(draft)); state.files = draft.files; state.messages = draft.messages; return result; }
  };
}

async function invoke({ database, provider, body = { message: 'Update the app' }, userId = 'owner' }) {
  const { sendChat } = createChatHandlers({ database, generateResponse: provider });
  const response = { statusCode: null, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
  let error; await sendChat({ params: { id: 'project-1' }, auth: { userId }, body }, response, (value) => { error = value; });
  return { response, error };
}
const responseFor = (content, changes = [{ path: 'src/App.jsx', content, language: 'jsx' }]) => async () => ({ message: 'Applied safely.', changes });
const assertRejected = async (content) => { const database = makeDatabase(); let calls = 0; const result = await invoke({ database, provider: async () => { calls += 1; return { message: 'bad', changes: [{ path: 'src/App.jsx', content }] }; } }); assert.equal(result.response.payload, null); assert.ok(result.error?.statusCode >= 400); assert.equal(database.state.files.get('src/App.jsx').content, initialApp); assert.equal(database.state.transactions, 0); assert.equal(database.state.assistantWrites, 0); assert.equal(calls, 1); };

// Test 1: bare JSX return succeeds through the real controller path.
{ const database = makeDatabase(); const result = await invoke({ database, provider: responseFor(validApp) }); assert.equal(result.response.statusCode, 201); assert.equal(database.state.files.get('src/App.jsx').content, validApp); assert.equal(result.response.payload.files[0].content, validApp); assert.equal(database.state.assistantWrites, 1); console.log('TEST 1 PASS'); }
// Tests 2-8: provider output is validated before the transaction.
await assertRejected('<html><body><h1>Invalid Test</h1></body></html>'); console.log('TEST 2 PASS');
await assertRejected('export default function App() { return <main><!-- invalid HTML comment --></main>; }'); console.log('TEST 3 PASS');
{ const database = makeDatabase(); const result = await invoke({ database, provider: responseFor(jsxCommentApp) }); assert.equal(result.response.statusCode, 201); assert.match(database.state.files.get('src/App.jsx').content, /mental healthcare/); assert.equal(database.state.files.size, 1); console.log('TEST 4 PASS'); }
await assertRejected('<main>Hello</main>'); console.log('TEST 5 PASS');
await assertRejected('function App() { return <main>Hello</main>; }'); console.log('TEST 6 PASS');
await assertRejected('<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Invalid</h1></body></html>'); console.log('TEST 7 PASS');
await assertRejected('export default function App() { return <main class="something">Hello</main>; }'); console.log('TEST 8 PASS');
// Test 9: the owned-project lookup happens before provider invocation.
{ const database = makeDatabase(); let calls = 0; const result = await invoke({ database, userId: 'intruder', provider: async () => { calls += 1; return {}; } }); assert.equal(result.error.statusCode, 404); assert.equal(calls, 0); assert.equal(database.state.files.get('src/App.jsx').content, initialApp); console.log('TEST 9 PASS'); }
// Test 10: schema validation happens before ownership/provider/database mutation.
{ const database = makeDatabase(); let calls = 0; const result = await invoke({ database, body: { message: '   ' }, provider: async () => { calls += 1; return {}; } }); assert.equal(result.error.statusCode, 400); assert.equal(calls, 0); assert.equal(database.state.transactions, 0); assert.equal(database.state.messages.length, 0); console.log('TEST 10 PASS'); }
// Test 11: multi-file updates and the assistant message commit together, and all roll back on failure.
{ const changes = [{ path: 'src/App.jsx', content: validApp, language: 'jsx' }, { path: 'src/index.css', content: 'main { color: red; }', language: 'css' }]; const successfulDatabase = makeDatabase(); const success = await invoke({ database: successfulDatabase, provider: responseFor(validApp, changes) }); assert.equal(success.response.statusCode, 201); assert.equal(successfulDatabase.state.files.get('src/App.jsx').content, validApp); assert.equal(successfulDatabase.state.files.get('src/index.css').content, 'main { color: red; }'); assert.equal(successfulDatabase.state.assistantWrites, 1); assert.deepEqual(success.response.payload.files.map((file) => file.path).sort(), ['src/App.jsx', 'src/index.css']); const database = makeDatabase({ failPath: 'src/index.css' }); const result = await invoke({ database, provider: responseFor(validApp, changes) }); assert.ok(result.error); assert.equal(database.state.files.get('src/App.jsx').content, initialApp); assert.equal(database.state.files.has('src/index.css'), false); assert.equal(database.state.messages.filter((message) => message.role === 'ASSISTANT').length, 0); console.log('TEST 11 PASS'); }
// Test 12: authentication rejects missing credentials, then the controller completes the authenticated chain with authoritative persisted files.
{ let authError; authenticate({ headers: {} }, {}, (error) => { authError = error; }); assert.equal(authError.statusCode, 401); const database = makeDatabase(); const result = await invoke({ database, provider: responseFor(validApp) }); assert.equal(result.response.statusCode, 201); assert.deepEqual(result.response.payload.files.map((file) => file.content), [...database.state.files.values()].map((file) => file.content)); console.log('TEST 12 PASS'); }

console.log('Phase 5 AI-to-ProjectFile flow tests passed.');

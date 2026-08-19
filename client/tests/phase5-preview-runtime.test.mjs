import assert from 'node:assert/strict';
import { buildPreviewDocument } from '../src/components/preview/previewRuntime.js';
import { buildAssistantMessage } from '../src/store/conversationStore.js';
import { summarizeChange } from '../src/components/chat/changeSummary.js';

const standalone = buildPreviewDocument([
  { path: 'index.html', content: '<button id="btn">Click</button><div id="output"></div>' },
  { path: 'style.css', content: '#output { color: red; }' },
  { path: 'script.js', content: 'document.getElementById("btn").onclick=()=>document.getElementById("output").textContent="Clicked"; console.log("PHASE5_TEST_LOG");' }
]);
assert.equal(standalone.kind, 'standalone');
assert.match(standalone.document, /#output \{ color: red; \}/);
assert.match(standalone.document, /PHASE5_TEST_LOG/);
assert.match(standalone.document, /craftai-preview/);

const react = buildPreviewDocument([
  { path: 'src/App.jsx', content: 'export default function App(){ return <h1>mental healthcare</h1>; }' },
  { path: 'src/main.jsx', content: "import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);" },
  { path: 'src/index.css', content: 'h1 { color: green; }' }
]);
assert.equal(react.kind, 'react');
assert.match(react.document, /mental healthcare/);
assert.match(react.document, /allow-scripts|craftai-preview/);

const assistant = buildAssistantMessage({
  message: { id: 'assistant-1', role: 'assistant', content: 'Updated the layout.' },
  editing: true,
  changes: [
    { path: 'src/App.jsx', type: 'modified', diff: { linesAdded: 4, linesRemoved: 1 } },
    { path: 'src/components/Navbar.jsx', type: 'created', diff: { linesAdded: 8, linesRemoved: 0 } },
    { path: 'src/styles.css', type: 'deleted', diff: { linesAdded: 0, linesRemoved: 3 } }
  ]
});
assert.equal(assistant.editing, true);
assert.equal(assistant.changes.length, 3);
assert.equal(assistant.changes[0].type, 'modified');
assert.equal(summarizeChange(assistant.changes[0]).label, 'Modified');
assert.equal(summarizeChange(assistant.changes[1]).label, 'Created');
assert.equal(summarizeChange(assistant.changes[2]).label, 'Deleted');
console.log('Phase 5 preview runtime tests passed.');

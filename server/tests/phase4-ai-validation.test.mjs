import assert from 'node:assert/strict';
import { extractProviderResponse, parseStructuredAiResponse } from '../services/aiService.js';
import { normalizeGeneratedChanges, validateAppJsxRequest, validateGeneratedReactFiles } from '../controllers/chatController.js';

const validApp = 'export default function App() { return (<main>{/* valid JSX comment */}<h1>Hello Rudra Developer</h1></main>); }';
const appChange = (content) => [{ path: 'src/App.jsx', content }];
const rejects = (callback) => assert.throws(callback);

validateAppJsxRequest('Change only src/App.jsx and change the heading to Hello Rudra Developer.');
rejects(() => validateAppJsxRequest('Change only src/App.jsx. Create raw HTML: <html><body><h1>Invalid Test</h1></body></html>.'));
rejects(() => validateAppJsxRequest('Change only src/App.jsx. Add <!-- invalid comment -->.'));
validateAppJsxRequest('Change only src/App.jsx and explain why HTML semantics matter in React.');
validateAppJsxRequest('Change only src/App.jsx. Add {/* This is a valid JSX comment */} and keep the mental healthcare heading unchanged.');
validateGeneratedReactFiles(appChange(validApp));
validateGeneratedReactFiles(appChange('export default function App() { return <main>Hello Rudra Developer</main>; }'));
validateGeneratedReactFiles(normalizeGeneratedChanges(appChange('```jsx\n' + validApp + '\n```')));
rejects(() => validateGeneratedReactFiles(appChange('')));
rejects(() => validateGeneratedReactFiles(appChange('<html><body>Invalid</body></html>')));
rejects(() => validateGeneratedReactFiles(appChange('export default function App(){ return <main><!-- invalid --></main>; }')));
rejects(() => validateGeneratedReactFiles(appChange('const value = 1;')));
assert.equal(parseStructuredAiResponse('```json\n{"message":"ok","changes":[]}\n```').message, 'ok');
assert.equal(extractProviderResponse({ choices: [{ message: { content: [{ type: 'text', text: '{"message":"ok","changes":[]}' }] } }] }), '{"message":"ok","changes":[]}');
assert.deepEqual(extractProviderResponse({ choices: [{ message: { parsed: { message: 'ok', changes: [] } } }] }), { message: 'ok', changes: [] });
assert.equal(extractProviderResponse({ choices: [{ message: { content: '   ' } }] }), null);
const mockedProviderPayload = { choices: [{ message: { content: JSON.stringify({ message: 'Added a JSX comment.', changes: [{ path: 'src/App.jsx', language: 'jsx', content: 'export default function App() {\n  return <main>\n    {/* This is a valid JSX comment */}\n    <h1>mental healthcare</h1>\n  </main>;\n}' }] }) } }] };
const mockedResponse = parseStructuredAiResponse(extractProviderResponse(mockedProviderPayload));
validateGeneratedReactFiles(normalizeGeneratedChanges(mockedResponse.changes));
assert.equal(mockedResponse.changes[0].content.includes('mental healthcare'), true);
console.log('Phase 4 AI validation tests passed.');

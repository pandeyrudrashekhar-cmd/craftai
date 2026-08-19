import assert from 'node:assert/strict';
import { buildPublishedDocument } from '../services/publishService.js';

// Test 1: React projects are converted into a self-contained browser document.
{
  const document = buildPublishedDocument([
    { path: 'src/App.jsx', content: 'export default function App() { return <main><h1>Hello</h1></main>; }' },
    { path: 'src/main.jsx', content: "import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);" },
    { path: 'src/index.css', content: 'body { margin: 0; }' }
  ]);

  assert.match(document, /@babel\/standalone/);
  assert.match(document, /react-dom\/client/);
  assert.match(document, /Hello/);
  assert.match(document, /body \{ margin: 0; \}/);
  console.log('TEST 1 PASS: React project publishing');
}

// Test 2: Standalone HTML projects are published without requiring React files.
{
  const document = buildPublishedDocument([
    { path: 'index.html', content: '<main><h1>Portfolio</h1></main>' },
    { path: 'style.css', content: 'h1 { color: blue; }' },
    { path: 'script.js', content: 'console.log("published");' }
  ]);

  assert.match(document, /Portfolio/);
  assert.match(document, /h1 \{ color: blue; \}/);
  assert.match(document, /console\.log/);
  assert.match(document, /viewport/);
  console.log('TEST 2 PASS: Standalone HTML publishing');
}

// Test 3: Unsupported projects fail with a useful message.
{
  assert.throws(
    () => buildPublishedDocument([{ path: 'README.md', content: '# Hello' }]),
    /Publish requires a React entry.*index\.html/
  );
  console.log('TEST 3 PASS: Unsupported project validation');
}

console.log('Publish service tests passed.');

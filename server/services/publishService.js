import fs from 'node:fs/promises';
import path from 'node:path';

const publishRoot = path.resolve(process.env.PUBLISH_DIR ?? path.join(process.cwd(), '.published'));

const safeJson = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const findFile = (files, ...paths) => files.find((file) => paths.includes(file.path))?.content ?? '';

export function buildPublishedDocument(files) {
  const app = findFile(files, 'src/App.jsx');
  const main = findFile(files, 'src/main.jsx');

  if (app && main) {
    const css = findFile(files, 'src/index.css');
    const appSource = safeJson(app);
    const mainSource = safeJson(main);
    
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${css}</style>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="importmap">{"imports":{"react":"https://esm.sh/react@18","react/jsx-runtime":"https://esm.sh/react@18/jsx-runtime","react/jsx-dev-runtime":"https://esm.sh/react@18/jsx-runtime","react-dom/client":"https://esm.sh/react-dom@18/client"}}</script>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    try {
      const compile = (source) => Babel.transform(source, { presets: ['react'], sourceType: 'module' }).code;
      const strip = (source) => source.replace(/^\\s*import\\s+(?:[^'"\\n]+?\\s+from\\s+)?['"][^'"]+\\.css['"];?\\s*$/gm, '');
      const appUrl = URL.createObjectURL(new Blob([compile(strip(${appSource}))], { type: 'text/javascript' }));
      const entry = strip(${mainSource}).replace(/from\\s+(['"])\\.\\/?App(?:\\.jsx)?\\1/g, () => \`from "\${appUrl}"\`);
      await import(URL.createObjectURL(new Blob([compile(entry)], { type: 'text/javascript' })));
    } catch (error) {
      document.getElementById('root').innerHTML = '<pre style="padding:16px;color:#b91c1c;font-family:monospace">' + String(error.message).replace(/[<>&]/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[char])) + '</pre>';
    }
  </script>
</body>
</html>`;
  }

  const html = findFile(files, 'index.html', 'src/index.html');
  if (!html) throw new Error('Publish requires a React entry (src/App.jsx + src/main.jsx) or index.html.');

  const styles = findFile(files, 'style.css', 'styles.css', 'src/style.css', 'src/styles.css');
  const script = findFile(files, 'script.js', 'src/script.js');
  let document = html.trim();

  if (!/<html[\s>]/i.test(document)) {
    document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body>${document}<script>${script}</script></body></html>`;
  } else {
    if (!/<meta[^>]+name=["']viewport["']/i.test(document)) {
      document = document.replace(/<head[^>]*>/i, (tag) => `${tag}<meta name="viewport" content="width=device-width, initial-scale=1">`);
    }
    if (styles) document = /<\/head\s*>/i.test(document) ? document.replace(/<\/head\s*>/i, `<style>${styles}</style></head>`) : document.replace(/<html[^>]*>/i, (tag) => `${tag}<head><style>${styles}</style></head>`);
    if (script) document = /<\/body\s*>/i.test(document) ? document.replace(/<\/body\s*>/i, `<script>${script}</script></body>`) : `${document}<script>${script}</script>`;
  }

  return document;
}

export async function writePublishedDocument(deploymentId, document) {
  const directory = path.join(publishRoot, deploymentId);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'index.html'), document, 'utf8');
  return path.join(directory, 'index.html');
}

export async function removePublishedDocument(deploymentId) {
  await fs.rm(path.join(publishRoot, deploymentId), { recursive: true, force: true });
}

export async function readPublishedDocument(deploymentId) {
  return fs.readFile(path.join(publishRoot, deploymentId, 'index.html'), 'utf8');
}

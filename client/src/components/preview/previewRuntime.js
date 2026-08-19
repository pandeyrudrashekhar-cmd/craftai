const bridge = `<script>const send=(type,payload)=>parent.postMessage({source:'craftai-preview',type,payload},'*');['log','info','warn','error'].forEach(level=>{const original=console[level];console[level]=(...args)=>{send('console',{level,args:args.map(String)});original(...args)}});window.addEventListener('error',event=>send('error',event.message));window.addEventListener('unhandledrejection',event=>send('error',String(event.reason)));</script>`;

export function buildPreviewDocument(files) {
  const find = (...paths) => files.find((file) => paths.includes(file.path))?.content ?? '';
  const app = find('src/App.jsx'); const main = find('src/main.jsx');
  if (app && main) return { kind: 'react', document: `<!doctype html><html><head><meta charset="utf-8"><style>${find('src/index.css')}</style><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><script type="importmap">{"imports":{"react":"https://esm.sh/react@18","react/jsx-runtime":"https://esm.sh/react@18/jsx-runtime","react/jsx-dev-runtime":"https://esm.sh/react@18/jsx-dev-runtime","react-dom/client":"https://esm.sh/react-dom@18/client"}}</script></head><body><div id="root"></div>${bridge}<script type="module">try{const compile=(source)=>Babel.transform(source,{presets:['react'],sourceType:'module'}).code;const strip=(source)=>source.replace(/^\\s*import\\s+(?:[^'"\\n]+?\\s+from\\s+)?['"][^'"]+\\.css['"];?\\s*$/gm,'');const appUrl=URL.createObjectURL(new Blob([compile(strip(${JSON.stringify(app)}))],{type:'text/javascript'}));const entry=strip(${JSON.stringify(main)}).replace(/from\\s+(['"])\\.\\/?App(?:\\.jsx)?\\1/g,()=>\`from "\${appUrl}"\`);await import(URL.createObjectURL(new Blob([compile(entry)],{type:'text/javascript'})));}catch(error){send('error',error.message);document.getElementById('root').innerHTML='<pre style="padding:16px;color:#b91c1c;font-family:monospace">'+String(error.message).replace(/[<>&]/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[char]))+'</pre>'}</script></body></html>` };
  const html = find('index.html', 'src/index.html');
  if (!html) return { kind: null, document: '' };
  const styles = `<style>${find('style.css', 'styles.css', 'src/style.css', 'src/styles.css')}</style>`;
  const scripts = `${bridge}<script>try{${find('script.js', 'src/script.js')}}catch(error){send('error',error.message)}</script>`;
  let document = html.trim();
  if (!/<html[\s>]/i.test(document)) document = `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${document}${scripts}</body></html>`;
  else { document = /<\/head\s*>/i.test(document) ? document.replace(/<\/head\s*>/i, `${styles}</head>`) : document.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${styles}</head>`); document = /<\/body\s*>/i.test(document) ? document.replace(/<\/body\s*>/i, `${scripts}</body>`) : `${document}${scripts}`; }
  return { kind: 'standalone', document };
}

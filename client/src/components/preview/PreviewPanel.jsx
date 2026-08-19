import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Globe2, RefreshCw, TerminalSquare } from 'lucide-react';
import { buildPreviewDocument } from './previewRuntime';

export default function PreviewPanel({ files }) {
  const frame = useRef(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [logs, setLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const preview = useMemo(() => buildPreviewDocument(files), [files]);
  const srcDoc = useMemo(() => preview.document, [preview.document, refreshKey]);
  const latestError = [...logs].reverse().find((log) => log.type === 'error');

  useEffect(() => {
    const receive = (event) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== 'craftai-preview') return;
      setLogs((items) => [...items.slice(-49), event.data]);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  return <section className="flex min-h-[28rem] min-w-0 flex-col border-l border-white/10 bg-[#0a0e16]">
    <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-300/10 text-emerald-200"><Globe2 size={14} /></span><div><p className="section-label">Runtime</p><p className="mt-0.5 text-xs font-medium text-slate-300">Live preview</p></div></div><div className="flex items-center gap-1"><button onClick={() => setShowConsole(!showConsole)} aria-label="Toggle preview console" className={`focus-ring rounded-lg p-1.5 ${showConsole ? 'bg-violet-500/15 text-violet-300' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}><TerminalSquare size={15} /></button><button onClick={() => { setLogs([]); setRefreshKey((value) => value + 1); }} aria-label="Reload preview" className="focus-ring rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white"><RefreshCw size={15} /></button></div></header>
    {preview.kind ? <><div className="relative min-h-0 flex-1 bg-[#151a24] p-3 sm:p-5"><div className="h-full overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl"><div className="flex h-7 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3"><span className="h-2 w-2 rounded-full bg-rose-300" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" /><span className="ml-3 flex-1 rounded bg-slate-200 px-2 py-0.5 text-[9px] text-slate-400">localhost / preview</span></div><iframe ref={frame} key={refreshKey} title="Project live preview" sandbox="allow-scripts" srcDoc={srcDoc} className="h-[calc(100%-1.75rem)] w-full border-0 bg-white" /></div>{latestError && <div role="alert" className="absolute inset-x-5 bottom-5 rounded-lg border border-rose-400/40 bg-rose-950/95 p-3 text-xs text-rose-100 shadow-lg"><strong>Preview error:</strong> {latestError.payload}</div>}</div><div className="border-t border-white/10 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-500">Sandboxed runtime · changes update on save</div>{showConsole && <div className="max-h-36 overflow-auto border-t border-white/10 bg-slate-950 p-3 font-mono text-xs">{logs.length ? logs.map((log, index) => <p key={index} className={log.type === 'error' || log.payload?.level === 'error' ? 'text-rose-300' : 'text-slate-400'}>{log.type === 'error' ? log.payload : `[${log.payload.level}] ${log.payload.args.join(' ')}`}</p>) : <p className="text-slate-500">No preview output.</p>}</div>}</> : <div className="grid flex-1 place-items-center p-6 text-center"><div><AlertTriangle className="mx-auto text-amber-300" size={26} /><p className="mt-3 text-sm font-medium">Preview needs React entry files or index.html.</p><p className="mt-2 text-xs leading-5 text-slate-500">Add an entry file to see your site render here.</p></div></div>}
  </section>;
}

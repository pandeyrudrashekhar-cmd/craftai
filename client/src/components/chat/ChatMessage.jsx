import { lazy, Suspense } from 'react';
import { Bot, RefreshCw, UserRound } from 'lucide-react';
import { summarizeChange } from './changeSummary.js';

const ReactMarkdown = lazy(() => import('react-markdown'));
const timestamp = (value) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const markdownComponents = {
  code: ({ children, className }) => <code className={className ? 'block overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-violet-200' : 'rounded bg-slate-800 px-1.5 py-0.5 text-violet-200'}>{children}</code>,
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
};

export default function ChatMessage({ message, onRetry }) {
  const isUser = message.role === 'user';
  const changes = Array.isArray(message?.changes) ? message.changes : [];

  return (
    <article className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isUser ? 'bg-violet-600' : 'bg-slate-800 text-violet-300'}`}>
          {isUser ? <UserRound size={16} /> : <Bot size={17} />}
        </div>
        <div>
          <div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${isUser ? 'rounded-tr-sm bg-violet-600 text-white' : 'rounded-tl-sm border border-white/10 bg-slate-900 text-slate-200'}`}>
            <Suspense fallback={<p className="whitespace-pre-wrap">{message.content}</p>}>
              <ReactMarkdown components={markdownComponents}>{message.content}</ReactMarkdown>
            </Suspense>
            {changes.length > 0 && (
              <div className="mt-3 rounded-xl border border-violet-500/20 bg-slate-950/80 p-3 text-xs text-slate-300">
                <div className="mb-2 font-medium text-violet-200">AI changed:</div>
                <ul className="space-y-2">
                  {changes.map((change, index) => {
                    const summary = summarizeChange(change);
                    return (
                      <li key={`${summary.path}-${index}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-medium text-slate-100">{summary.path}</span>
                          <span className="shrink-0 rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-200">
                            {summary.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          <span className="text-emerald-300">+ {summary.added}</span>
                          <span className="mx-2">/</span>
                          <span className="text-rose-300">- {summary.removed}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          <div className={`mt-1 flex items-center gap-2 text-xs text-slate-500 ${isUser ? 'justify-end' : ''}`}>
            <span>{timestamp(message.createdAt)}</span>
            {message.pending && <span>Sending…</span>}
            {message.failed && (
              <button onClick={() => onRetry(message)} className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200">
                <RefreshCw size={12} />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const frameworks = ['React', 'Next.js', 'Vue', 'HTML', 'Node', 'Express', 'Other'];

export default function ProjectModal({ open, onClose, onSubmit, project }) {
  const [form, setForm] = useState({ title: '', description: '', framework: 'React' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ title: project?.title ?? '', description: project?.description ?? '', framework: project?.framework ?? 'React' });
      setError('');
    }
  }, [open, project]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (title.length < 3 || title.length > 60) {
      setError('Project name must be between 3 and 60 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit({ ...form, title });
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error ?? 'Unable to save this project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/75 p-4" role="presentation">
      <form onSubmit={submit} className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <div className="flex items-center justify-between">
          <h2 id="project-modal-title" className="text-xl font-semibold">{project ? 'Rename project' : 'Create a project'}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium">Project name
            <input autoFocus required maxLength="60" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 outline-none focus:border-violet-400" />
          </label>
          {!project && <>
            <label className="block text-sm font-medium">Description <span className="text-slate-500">(optional)</span>
              <textarea maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 min-h-24 w-full resize-y rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 outline-none focus:border-violet-400" />
            </label>
            <label className="block text-sm font-medium">Framework
              <select value={form.framework} onChange={(event) => setForm({ ...form, framework: event.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 outline-none focus:border-violet-400">
                {frameworks.map((framework) => <option key={framework}>{framework}</option>)}
              </select>
            </label>
          </>}
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5">Cancel</button>
          <button disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-50">{saving ? 'Saving...' : project ? 'Save name' : 'Create project'}</button>
        </div>
      </form>
    </div>
  );
}

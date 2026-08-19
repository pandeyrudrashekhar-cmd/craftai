import { useEffect, useState } from 'react';
import { Check, Github, LoaderCircle, LockKeyhole, RefreshCw, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { fetchGitHubStatus, startGitHubConnection } from '../services/authService';
import { fetchGitHubRepositories, fetchGitHubRepositoryBranches, pushProjectToGitHub } from '../services/githubService';
import { useToastStore } from '../store/toastStore';

export default function GitHubConnection({ projectId = null }) {
  const { pathname } = useLocation();
  const githubUsername = useAuthStore((state) => state.githubUsername);
  const setGitHubUsername = useAuthStore((state) => state.setGitHubUsername);
  const addToast = useToastStore((state) => state.addToast);
  const [connecting, setConnecting] = useState(false);
  const [repositories, setRepositories] = useState([]);
  const [selectedRepository, setSelectedRepository] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchError, setBranchError] = useState('');
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [repositoryError, setRepositoryError] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [pushError, setPushError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const isGitHubSurface = pathname === '/dashboard' || pathname.startsWith('/projects/');

  useEffect(() => {
    if (!isGitHubSurface) return;
    fetchGitHubStatus().then((status) => setGitHubUsername(status.connected ? status.username : null)).catch(() => setGitHubUsername(null));
  }, [isGitHubSurface, setGitHubUsername]);

  useEffect(() => {
    if (!isGitHubSurface || !githubUsername) return undefined;
    let active = true;
    setLoadingRepositories(true);
    setRepositoryError('');
    fetchGitHubRepositories()
      .then((items) => active && setRepositories(items))
      .catch((error) => active && setRepositoryError(error.response?.data?.error ?? 'Unable to load GitHub repositories.'))
      .finally(() => active && setLoadingRepositories(false));
    return () => { active = false; };
  }, [githubUsername, isGitHubSurface, pathname]);

  useEffect(() => {
    if (!selectedRepository) {
      setBranches([]);
      setSelectedBranch('');
      return undefined;
    }
    let active = true;
    setLoadingBranches(true);
    setBranchError('');
    setBranches([]);
    setSelectedBranch('');
    fetchGitHubRepositoryBranches(selectedRepository.owner, selectedRepository.name)
      .then((items) => {
        if (!active) return;
        setBranches(items);
        setSelectedBranch(items.some((branch) => branch.name === selectedRepository.defaultBranch) ? selectedRepository.defaultBranch : items[0]?.name || '');
      })
      .catch((error) => active && setBranchError(error.response?.data?.error ?? 'Unable to load repository branches.'))
      .finally(() => active && setLoadingBranches(false));
    return () => { active = false; };
  }, [selectedRepository]);

  if (pathname !== '/dashboard' && !pathname.startsWith('/projects/')) return null;

  const loadRepositories = async () => {
    setLoadingRepositories(true);
    setRepositoryError('');
    try {
      setRepositories(await fetchGitHubRepositories());
    } catch (error) {
      setRepositoryError(error.response?.data?.error ?? 'Unable to load GitHub repositories.');
    } finally {
      setLoadingRepositories(false);
    }
  };

  const selectRepository = (repository) => {
    if (!repository) {
      setSelectedRepository(null);
      return;
    }
    const owner = repository.owner?.login || repository.full_name?.split('/')[0] || '';
    setSelectedRepository({ owner, name: repository.name, id: repository.id, defaultBranch: repository.default_branch || '' });
    setPushResult(null);
    setPushError('');
  };

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const authorizationUrl = await startGitHubConnection();
      window.location.href = authorizationUrl;
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to connect GitHub.', 'error');
      setConnecting(false);
    }
  };

  const pushProject = async () => {
    if (!projectId || !selectedRepository || !selectedBranch || pushing) return;
    setPushing(true);
    setPushResult(null);
    setPushError('');
    try {
      const result = await pushProjectToGitHub(selectedRepository.owner, selectedRepository.name, { projectId, branch: selectedBranch });
      setPushResult(result);
      addToast('Successfully pushed to GitHub.');
    } catch (error) {
      const message = error.response?.data?.error ?? 'Unable to push project to GitHub.';
      setPushError(message);
      addToast(message, 'error');
    } finally {
      setPushing(false);
    }
  };

  const panel = (
    <div className="w-[min(26rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100vh-6rem))] overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between"><span className="section-label">GitHub integration</span><button type="button" onClick={() => setPanelOpen(false)} aria-label="Close GitHub" className="rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white"><X size={16} /></button></div>
      {githubUsername ? (
        <section className="w-[min(24rem,calc(100vw-3rem))]">
          <div className="flex items-center justify-between gap-3 text-sm text-emerald-300">
            <div className="flex min-w-0 items-center gap-2">
              <Github size={17} />
              <span className="truncate">GitHub connected as {githubUsername}</span>
            </div>
            <button type="button" onClick={loadRepositories} disabled={loadingRepositories} aria-label="Refresh GitHub repositories" className="text-slate-400 hover:text-white disabled:opacity-50">
              <RefreshCw size={15} className={loadingRepositories ? 'animate-spin' : ''} />
            </button>
          </div>
          {projectId ? (
            <div className="mt-3 border-t border-white/10 pt-3">
              <h2 className="text-sm font-semibold text-white">Push to GitHub</h2>
              <p className="mt-1 text-xs text-slate-400">Choose a repository and branch for this project.</p>
              {loadingRepositories ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={15} className="animate-spin" />Loading repositories...</div>
              ) : repositoryError ? (
                <p className="mt-3 text-xs text-rose-300">{repositoryError}</p>
              ) : repositories.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">No repositories found.</p>
              ) : (
                <>
                  <label className="mt-3 block text-[11px] font-medium text-slate-400" htmlFor="github-workspace-repository">Repository</label>
                  <select
                    id="github-workspace-repository"
                    value={selectedRepository?.id || ''}
                    onChange={(event) => selectRepository(repositories.find((repository) => String(repository.id) === event.target.value))}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                  >
                    <option value="">Select repository</option>
                    {repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.full_name || repository.name}{repository.private ? ' · private' : ''}</option>)}
                  </select>
                </>
              )}
              {selectedRepository && (
                <>
                  {loadingBranches ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" />Loading branches...</div>
                  ) : branchError ? (
                    <p className="mt-3 text-xs text-rose-300">{branchError}</p>
                  ) : branches.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-400">No branches found.</p>
                  ) : (
                    <>
                      <label className="mt-3 block text-[11px] font-medium text-slate-400" htmlFor="github-workspace-branch">Branch</label>
                      <select id="github-workspace-branch" value={selectedBranch} onChange={(event) => { setSelectedBranch(event.target.value); setPushResult(null); setPushError(''); }} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-violet-400">
                        <option value="">Select branch</option>
                        {branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? ' · protected' : ''}</option>)}
                      </select>
                    </>
                  )}
                </>
              )}
              <button type="button" disabled={!selectedRepository || !selectedBranch || loadingBranches || Boolean(branchError) || pushing} onClick={pushProject} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
                {pushing && <LoaderCircle size={14} className="animate-spin" />}
                {pushing ? 'Pushing...' : 'Push to GitHub'}
              </button>
              {pushError && <p className="mt-2 text-xs text-rose-300">{pushError}</p>}
              {pushResult && (
                <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-200">
                  <p className="font-semibold">Successfully pushed to GitHub</p>
                  <p className="mt-1">{pushResult.repository} · {pushResult.branch}</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-emerald-300">Commit: {pushResult.commitSha}</p>
                  <a href={pushResult.commitUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-emerald-300 underline">View on GitHub</a>
                </div>
              )}
            </div>
          ) : (
            <>
              <h2 className="mt-3 border-t border-white/10 pt-3 text-sm font-semibold text-white">GitHub Repositories</h2>
              {loadingRepositories ? (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={15} className="animate-spin" />Loading repositories...</div>
              ) : repositoryError ? (
                <p className="mt-3 text-xs text-rose-300">{repositoryError}</p>
              ) : repositories.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">No repositories found.</p>
              ) : (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {repositories.map((repository) => (
                    <div key={repository.id} className={`rounded-lg border p-3 ${selectedRepository?.id === repository.id ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-slate-800/70'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <a href={repository.html_url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-white hover:text-violet-300">{repository.full_name || repository.name}</a>
                        <div className="flex shrink-0 items-center gap-2">
                          {repository.private && <LockKeyhole size={13} className="text-amber-300" aria-label="Private repository" />}
                          <button type="button" onClick={() => selectRepository(repository)} className={`rounded px-2 py-1 text-[11px] font-medium ${selectedRepository?.id === repository.id ? 'bg-violet-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                            {selectedRepository?.id === repository.id ? <span className="inline-flex items-center gap-1"><Check size={12} />Selected</span> : 'Select'}
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{repository.description || 'No description.'}</p>
                      <p className="mt-2 text-[11px] text-slate-500">{repository.private ? 'Private' : 'Public'} · {repository.default_branch || 'No default branch'}</p>
                    </div>
                  ))}
                </div>
              )}
              {selectedRepository && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="text-xs font-medium text-slate-300">Branch for {selectedRepository.owner}/{selectedRepository.name}</p>
                  {loadingBranches ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" />Loading branches...</div>
                  ) : branchError ? (
                    <p className="mt-2 text-xs text-rose-300">{branchError}</p>
                  ) : branches.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">No branches found.</p>
                  ) : (
                    <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-violet-400">
                      {branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? ' · protected' : ''}</option>)}
                    </select>
                  )}
                  <button type="button" disabled={!selectedRepository || !selectedBranch || loadingBranches || Boolean(branchError) || pushing} onClick={() => addToast(`Selected ${selectedRepository.owner}/${selectedRepository.name} on ${selectedBranch}.`)} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
                    Continue
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {connecting ? <LoaderCircle size={17} className="animate-spin" /> : <Github size={17} />}
          {connecting ? 'Connecting...' : 'Connect GitHub'}
        </button>
      )}
    </div>
  );

  return <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
    {panelOpen && <div className="fixed inset-0 z-0" onMouseDown={() => setPanelOpen(false)} />}
    {panelOpen && <div className="relative z-10" onMouseDown={(event) => event.stopPropagation()}>{panel}</div>}
    <button type="button" onClick={() => setPanelOpen((value) => !value)} aria-label={panelOpen ? 'Close GitHub panel' : 'Open GitHub panel'} title="GitHub" className="focus-ring relative z-10 grid h-12 w-12 place-items-center rounded-2xl border border-violet-300/25 bg-slate-900/95 text-violet-200 shadow-xl shadow-black/30 transition hover:-translate-y-0.5 hover:border-violet-200/60 hover:bg-violet-500/20 hover:text-white">
      <Github size={21} />
    </button>
  </div>;
}

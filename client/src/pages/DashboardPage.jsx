import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FolderOpen, LogOut, Plus, Search, Sparkles, WandSparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import ProjectCard from '../components/projects/ProjectCard';
import ProjectSkeleton from '../components/projects/ProjectSkeleton';
import ProjectModal from '../components/projects/ProjectModal';
import DeleteProjectModal from '../components/projects/DeleteProjectModal';
import { useProjectStore } from '../store/projectStore';
import { useToastStore } from '../store/toastStore';
import GitHubConnection from '../components/GitHubConnection';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { projects, loading, error, searchQuery, setSearchQuery, loadProjects, createProject, updateProject, deleteProject } = useProjectStore();
  const addToast = useToastStore((state) => state.addToast);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameProject, setRenameProject] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const query = useDebouncedValue(searchQuery);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const visibleProjects = useMemo(() => projects.filter((project) => `${project.title} ${project.description ?? ''} ${project.framework}`.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);
  const submitCreate = async (data) => { const project = await createProject(data); addToast('Project created.'); navigate(`/projects/${project.id}`); };
  const submitRename = async ({ title }) => { await updateProject(renameProject.id, { title }); addToast('Project renamed.'); };
  const confirmDelete = async () => { setDeleting(true); try { await deleteProject(deleteTarget.id); addToast('Project deleted.'); setDeleteTarget(null); } catch (requestError) { addToast(requestError.response?.data?.error ?? 'Unable to delete project.', 'error'); } finally { setDeleting(false); } };

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-5 py-6 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200"><Sparkles size={18} /></span><div><p className="text-sm font-semibold tracking-wide">CraftAI</p><p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Developer workspace</p></div></div>
        <button onClick={logout} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-400 hover:border-white/20 hover:text-white"><LogOut size={15} />Sign out</button>
      </header>

      <section className="relative mt-10 overflow-hidden rounded-[28px] border border-violet-300/15 bg-gradient-to-br from-violet-500/15 via-slate-900/80 to-slate-950 p-7 shadow-2xl sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-violet-400/15 blur-3xl" />
        <div className="relative max-w-2xl"><p className="eyebrow">AI-native web development</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Build the next thing.</h1><p className="mt-4 max-w-lg text-base leading-7 text-slate-300">Welcome back, {user?.name}. Describe a product, shape the code, and ship from one intelligent workspace.</p><button onClick={() => setCreateOpen(true)} className="focus-ring mt-7 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:bg-violet-400"><WandSparkles size={17} />Create with AI<ArrowUpRight size={16} /></button></div>
      </section>

      <section className="mt-10"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">Workspace index</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Your projects</h2></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search projects" className="focus-ring w-full rounded-xl border border-white/10 bg-slate-900/70 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-500" /></div></div>{error && <div className="mt-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}<button onClick={loadProjects} className="ml-3 font-medium underline">Retry</button></div>}{loading ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <ProjectSkeleton key={index} />)}</div> : visibleProjects.length ? <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visibleProjects.map((project) => <ProjectCard key={project.id} project={project} onOpen={(id) => navigate(`/projects/${id}`)} onRename={setRenameProject} onDelete={setDeleteTarget} />)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-12 text-center"><FolderOpen className="mx-auto text-violet-300" size={30} /><h2 className="mt-4 text-xl font-semibold">No projects yet</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">Create your first project to get started.</p><button onClick={() => setCreateOpen(true)} className="mt-6 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium hover:bg-violet-500">Create project</button></div>}</section>
      {createOpen && <ProjectModal open onClose={() => setCreateOpen(false)} onSubmit={submitCreate} />}
      {renameProject && <ProjectModal open project={renameProject} onClose={() => setRenameProject(null)} onSubmit={submitRename} />}
      {deleteTarget && <DeleteProjectModal project={deleteTarget} deleting={deleting} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
      <GitHubConnection />
    </main>
  );
}

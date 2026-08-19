import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LoaderCircle, MessageSquare, Clock, Cloud } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { fetchProject } from '../services/projectService';
import { useConversationStore } from '../store/conversationStore';
import { useFileStore } from '../store/fileStore';
import { useToastStore } from '../store/toastStore';
import { useVersionStore } from '../store/versionStore';
import { useDeploymentStore } from '../store/deploymentStore';
import ChatMessage from '../components/chat/ChatMessage';
import ChatComposer from '../components/chat/ChatComposer';
import ChatEmptyState from '../components/chat/ChatEmptyState';
import FileExplorer from '../components/files/FileExplorer';
import FileEditor from '../components/files/FileEditor';
import { DeleteFileModal, NewFileModal } from '../components/files/FileModal';
import PreviewPanel from '../components/preview/PreviewPanel';
import VersionHistory from '../components/versions/VersionHistory';
import DeploymentPanel from '../components/deployments/DeploymentPanel';
import GitHubConnection from '../components/GitHubConnection';
import { downloadProject } from '../services/deploymentService';

export default function ProjectWorkspacePage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [projectError, setProjectError] = useState('');
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const bottomRef = useRef(null);
  const addToast = useToastStore((state) => state.addToast);

  const chat = useConversationStore();
  const files = useFileStore();
  const versions = useVersionStore();
  const deployments = useDeploymentStore();

  useEffect(() => {
    let active = true;
    setProject(null);
    setProjectError('');
    chat.clearConversation();
    files.clearFiles();
    deployments.clearDeployments();
    versions.clearVersions();
    versions.loadVersions(projectId);
    deployments.loadDeployments(projectId);

    fetchProject(projectId)
      .then(async (data) => {
        if (!active) return;
        setProject(data);
        chat.fetchMessages(projectId);
        const listedFiles = await files.loadFiles(projectId);
        if (active && listedFiles[0]) files.selectFile(projectId, listedFiles[0].id);
      })
      .catch((error) =>
        active &&
        setProjectError(
          error.response?.status === 404
            ? 'This project no longer exists or you do not have access to it.'
            : 'Unable to load this project.'
        )
      );

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages, chat.sending]);

  const latestDeployment = deployments.deployments[0] ?? null;

  useEffect(() => {
    if (!latestDeployment?.id) return;
    deployments.fetchCustomDomain(projectId, latestDeployment.id).catch(() => {});
  }, [latestDeployment?.id, projectId]);

  if (projectError)
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-semibold">Project unavailable</p>
          <p className="mt-2 max-w-sm text-sm text-slate-400">{projectError}</p>
          <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 text-sm text-violet-400">
            <ArrowLeft size={16} />
            Back to projects
          </Link>
        </div>
      </main>
    );

  if (!project)
    return (
      <main className="grid min-h-screen place-items-center">
        <LoaderCircle className="animate-spin text-violet-400" />
      </main>
    );

  const selectFile = (fileId) => files.selectFile(projectId, fileId);
  const saveFile = async (content) => {
    await files.saveFile(projectId, files.selectedFile.id, content);
    addToast('File saved.');
  };
  const createFile = async (payload) => {
    await files.createFile(projectId, payload);
    addToast('File created.');
  };
  const initialize = async () => {
    try {
      const initialized = await files.initializeFiles(projectId);
      if (initialized[0]) await files.selectFile(projectId, initialized[0].id);
      addToast('Starter files created.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to initialize starter files.', 'error');
    }
  };
  const sendMessage = async (content) => {
    const result = await chat.sendMessage(projectId, content);
    if (result.files?.length) {
      files.applyFiles(result.files);
      addToast(`${result.files.length} file${result.files.length === 1 ? '' : 's'} updated by AI.`);
    }
    return result;
  };
  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await files.deleteFile(projectId, deleteTarget.id);
      addToast('File deleted.');
      setDeleteTarget(null);
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to delete file.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateVersion = async (label) => {
    try {
      await versions.createVersion(projectId, { label });
      addToast('Version saved.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to save version.', 'error');
    }
  };

  const handleRestoreVersion = async (versionId) => {
    try {
      const restoredFiles = await versions.restoreVersion(projectId, versionId);
      files.applyFiles(restoredFiles);
      addToast('Version restored.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to restore version.', 'error');
    }
  };

  const handleViewVersion = async (versionId) => {
    try {
      return await versions.getVersion(projectId, versionId);
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to view version.', 'error');
      throw error;
    }
  };

  const handleDeleteVersion = async (versionId) => {
    try {
      await versions.deleteVersion(projectId, versionId);
      addToast('Version deleted.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to delete version.', 'error');
    }
  };

  const handleDeleteDeployment = async (deploymentId) => {
    try {
      await deployments.deleteDeployment(projectId, deploymentId);
      addToast('Deployment deleted.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to delete deployment.', 'error');
    }
  };

  const handlePublish = async () => {
    try {
      await deployments.publishProject(projectId);
      addToast('Website published successfully.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to publish website.', 'error');
    }
  };

  const handleDeployToVercel = async () => {
    try {
      await deployments.deployToVercel(projectId);
      addToast('Vercel deployment started.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to deploy to Vercel.', 'error');
    }
  };

  const handleDeployToNetlify = async () => {
    try {
      await deployments.deployToNetlify(projectId);
      addToast('Netlify deployment started.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to deploy to Netlify.', 'error');
    }
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const { data } = await downloadProject(projectId);
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-') || 'craftai-project'}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to download project ZIP.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleConnectCustomDomain = async (projectIdValue, deploymentIdValue, domain) => {
    try {
      await deployments.connectCustomDomain(projectIdValue, deploymentIdValue, domain);
      addToast('Custom domain connected.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to connect custom domain.', 'error');
      throw error;
    }
  };

  const handleRemoveCustomDomain = async (projectIdValue, deploymentIdValue) => {
    try {
      await deployments.deleteCustomDomain(projectIdValue, deploymentIdValue);
      addToast('Custom domain removed.');
    } catch (error) {
      addToast(error.response?.data?.error ?? 'Unable to remove custom domain.', 'error');
      throw error;
    }
  };

  return (
    <main className="flex h-screen min-w-0 flex-col bg-[#080b12]">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/dashboard"
            aria-label="Back to dashboard"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="truncate font-semibold tracking-tight">{project.title}</h1><span className="rounded-md border border-violet-300/20 bg-violet-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">{project.framework}</span></div>
            <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-600">{project.status.toLowerCase()} · AI workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-emerald-200 sm:inline">Local preview ready</span><MessageSquare size={16} className="text-violet-300" />
        </div>
      </header>

      <section className="grid min-h-0 flex-1 overflow-y-auto border-t border-white/[0.03] lg:grid-cols-[220px_minmax(300px,1fr)_minmax(300px,1fr)_340px] lg:overflow-hidden">
        <FileExplorer
          files={files.files}
          selectedFile={files.selectedFile}
          loading={files.loading}
          error={files.error}
          onSelect={selectFile}
          onNew={() => setNewFileOpen(true)}
          onDelete={setDeleteTarget}
          onInitialize={initialize}
        />

        <FileEditor
          file={files.selectedFile}
          loading={files.loadingFile}
          saving={files.saving}
          onSave={saveFile}
        />

        <PreviewPanel files={files.files} />

        <section className="flex min-h-[28rem] min-w-0 flex-col border-l border-white/10 bg-[#0b0f18]">
          <div className="flex shrink-0 border-b border-white/10 bg-slate-900/40 p-1">
            <button
              onClick={() => setActiveTab('chat')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                activeTab === 'chat'
                  ? 'bg-violet-500/15 text-violet-100'
                  : 'text-slate-500 hover:bg-white/5 hover:text-white'
              }`}
            >
              <MessageSquare size={16} />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('versions')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                activeTab === 'versions'
                  ? 'bg-violet-500/15 text-violet-100'
                  : 'text-slate-500 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Clock size={16} />
              Versions
            </button>
            <button
              onClick={() => setActiveTab('deployments')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                activeTab === 'deployments'
                  ? 'bg-violet-500/15 text-violet-100'
                  : 'text-slate-500 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Cloud size={16} />
              Deploy
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {activeTab === 'chat' && (
              <div className="flex min-h-full flex-col px-4 py-5">
                {chat.loading ? (
                  <div className="grid flex-1 place-items-center">
                    <LoaderCircle className="animate-spin text-violet-400" />
                  </div>
                ) : chat.messages.length ? (
                  <div className="space-y-5">
                    {chat.messages.map((message) => (
                      <ChatMessage
                        key={message.id}
                        message={message}
                        onRetry={(message) => chat.retryMessage(projectId, message)}
                      />
                    ))}
                    <div ref={bottomRef} />
                  </div>
                ) : (
                  <ChatEmptyState project={project} />
                )}
              </div>
            )}

            {activeTab === 'versions' && (
              <div className="px-4 py-5">
                <VersionHistory
                  versions={versions.versions}
                  loading={versions.loading}
                  error={versions.error}
                  onCreateVersion={handleCreateVersion}
                  onView={handleViewVersion}
                  onRestore={handleRestoreVersion}
                  onDelete={handleDeleteVersion}
                />
              </div>
            )}

            {activeTab === 'deployments' && (
              <div className="px-4 py-5">
                <DeploymentPanel
                  deployments={deployments.deployments}
                  loading={deployments.loading}
                  publishing={deployments.deployments.some((deployment) => deployment.provider === 'OTHER' && deployment.status === 'BUILDING')}
                  deployingVercel={deployments.vercelSubmitting || deployments.deployments.some((deployment) => deployment.provider === 'VERCEL' && deployment.status === 'BUILDING')}
                  deployingNetlify={deployments.netlifySubmitting || deployments.deployments.some((deployment) => deployment.provider === 'NETLIFY' && deployment.status === 'BUILDING')}
                  onPublish={handlePublish}
                  onDeployToVercel={handleDeployToVercel}
                  onDeployToNetlify={handleDeployToNetlify}
                  downloading={downloading}
                  onDownloadZip={handleDownloadZip}
                  onDeleteDeployment={handleDeleteDeployment}
                  onConnectCustomDomain={handleConnectCustomDomain}
                  onRemoveCustomDomain={handleRemoveCustomDomain}
                  customDomain={deployments.customDomain}
                  projectId={projectId}
                  deploymentId={latestDeployment?.id}
                />
              </div>
            )}
          </div>

          {activeTab === 'chat' && (
            <ChatComposer sending={chat.sending} onSend={sendMessage} />
          )}
        </section>
      </section>

      {newFileOpen && (
        <NewFileModal
          onClose={() => setNewFileOpen(false)}
          open={newFileOpen}
          onCreate={async (data) => {
            await createFile(data);
            setNewFileOpen(false);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteFileModal
          file={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
      <GitHubConnection projectId={projectId} />
    </main>
  );
}

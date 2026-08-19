import { useEffect } from 'react';
import { CheckCircle2, Github, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

export default function GitHubCallbackPage() {
  const [searchParams] = useSearchParams();
  const setGitHubUsername = useAuthStore((state) => state.setGitHubUsername);
  const addToast = useToastStore((state) => state.addToast);
  const success = searchParams.get('success') === 'true';
  const username = searchParams.get('username');
  const error = searchParams.get('error');
  const connected = success && Boolean(username);

  useEffect(() => {
    if (connected) {
      setGitHubUsername(username);
      addToast(`GitHub connected as ${username}.`);
    }
  }, [addToast, connected, setGitHubUsername, username]);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 text-center shadow-xl">
        {connected ? <CheckCircle2 className="mx-auto text-emerald-400" size={42} /> : <XCircle className="mx-auto text-rose-400" size={42} />}
        <h1 className="mt-4 text-xl font-semibold text-white">{connected ? 'GitHub connected' : 'GitHub connection cancelled'}</h1>
          <p className="mt-2 text-sm text-slate-400">{connected ? `Connected account: ${username}` : error ? 'GitHub connection was not completed. Please try again.' : 'No GitHub changes were made.'}</p>
        <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500">
          <Github size={16} />
          Continue to dashboard
        </Link>
      </section>
    </main>
  );
}

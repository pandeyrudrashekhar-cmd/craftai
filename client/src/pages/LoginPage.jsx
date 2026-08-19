import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { login } from '../services/authService';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const navigate = useNavigate(); const authenticate = useAuthStore((state) => state.authenticate);
  const [form, setForm] = useState({ email: '', password: '' }); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const submit = async (event) => { event.preventDefault(); setLoading(true); setError(''); try { authenticate(await login(form)); navigate('/dashboard'); } catch (err) { setError(err.response?.data?.error ?? 'Unable to sign in.'); } finally { setLoading(false); } };
  return <AuthLayout title="Welcome back" subtitle="Sign in to keep building."><form onSubmit={submit} className="mt-7 space-y-4"><input aria-label="Email" type="email" required placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 outline-none focus:border-violet-400"/><input aria-label="Password" type="password" required minLength="8" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2.5 outline-none focus:border-violet-400"/>{error && <p className="text-sm text-rose-400">{error}</p>}<button disabled={loading} className="w-full rounded-lg bg-violet-600 py-2.5 font-medium hover:bg-violet-500 disabled:opacity-50">{loading ? 'Signing in…' : 'Sign in'}</button></form><p className="mt-6 text-sm text-slate-400">New here? <Link className="text-violet-400" to="/signup">Create an account</Link></p></AuthLayout>;
}

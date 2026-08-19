import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ToastViewport from './components/ToastViewport';
import ProjectWorkspacePage from './pages/ProjectWorkspacePage';
import GitHubCallbackPage from './pages/GitHubCallbackPage';

export default function App() { return <><Routes><Route path="/login" element={<LoginPage />} /><Route path="/signup" element={<SignupPage />} /><Route path="/github/callback" element={<GitHubCallbackPage />} /><Route element={<ProtectedRoute />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/projects/:projectId" element={<ProjectWorkspacePage />} /></Route><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes><ToastViewport /></>; }

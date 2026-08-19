import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
export default function ProtectedRoute() { return useAuthStore((state) => state.token) ? <Outlet /> : <Navigate to="/login" replace />; }

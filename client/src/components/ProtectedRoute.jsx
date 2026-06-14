import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    // Preserve where the visitor was headed so login returns them there,
    // instead of dumping everyone on the dashboard root.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

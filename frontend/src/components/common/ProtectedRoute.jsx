import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  if (role && user.role !== role) {
    return <Navigate to={user.role === 'student' ? '/student' : '/parent'} replace />;
  }

  return children;
}

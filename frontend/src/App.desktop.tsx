import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { UploadProvider } from './context/UploadContext';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Editor = lazy(() => import('./pages/Editor').then((module) => ({ default: module.Editor })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));

const PageLoader = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center">
    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
  </div>
);

const protectedPage = (page: React.ReactNode) => (
  <ProtectedRoute>{page}</ProtectedRoute>
);

export default function DesktopApp() {
  return (
    <ThemeProvider>
      <Router>
        <AuthProvider>
          <UploadProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={protectedPage(<Dashboard />)} />
                <Route path="/collections" element={protectedPage(<Dashboard />)} />
                <Route path="/settings" element={protectedPage(<Settings />)} />
                <Route path="/editor/:id" element={protectedPage(<Editor />)} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </UploadProvider>
        </AuthProvider>
      </Router>
    </ThemeProvider>
  );
}

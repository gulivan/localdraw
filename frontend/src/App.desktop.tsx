import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { UploadProvider } from './context/UploadContext';
import {
  useDesktopWorkspaceChange,
  useDesktopWorkspaceEventSource,
} from './hooks/useDesktopWorkspaceEvents';
import {
  getDesktopWorkspace,
  openExistingDesktopWorkspace,
  type DesktopWorkspaceStatus,
} from './api';
import { PluginProvider } from './plugins/PluginProvider';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Home = lazy(() => import('./pages/Home').then((module) => ({ default: module.Home })));
const Project = lazy(() => import('./pages/Project').then((module) => ({ default: module.Project })));
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

const DesktopWorkspaceGate = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<DesktopWorkspaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    void getDesktopWorkspace()
      .then(setStatus)
      .catch((value) => setError(value instanceof Error ? value.message : 'Workspace unavailable'));
  }, []);
  useEffect(() => load(), [load]);
  useDesktopWorkspaceChange(load);
  if (!status && !error) return <PageLoader />;
  if (status?.state === 'ready') return <>{children}</>;
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold">Drawing folder unavailable</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          LocalDraw could not open its configured drawing folder. Reconnect it or choose another workspace.
        </p>
        {status?.path && <code className="mt-4 block overflow-x-auto rounded-lg bg-zinc-100 px-3 py-2 text-xs dark:bg-zinc-800">{status.path}</code>}
        {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={load} className="workspace-focus rounded-xl px-4 py-2 text-sm font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800">Retry</button>
          <button type="button" onClick={() => void openExistingDesktopWorkspace().then(setStatus).catch((value) => setError(value instanceof Error ? value.message : 'Could not open workspace'))} className="workspace-focus rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">Open another folder</button>
        </div>
      </section>
    </main>
  );
};

const CollectionsPage = () => {
  const [searchParams] = useSearchParams();
  return searchParams.get('id') === 'unorganized' ? <Project unfiled /> : <Dashboard />;
};

export default function DesktopApp() {
  useDesktopWorkspaceEventSource();
  return (
    <ThemeProvider>
      <DesktopWorkspaceGate>
        <Router>
          <AuthProvider>
            <PluginProvider>
              <UploadProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                <Route path="/" element={protectedPage(<Home />)} />
                <Route path="/projects/:id" element={protectedPage(<Project />)} />
                <Route path="/collections" element={protectedPage(<CollectionsPage />)} />
                <Route path="/settings" element={protectedPage(<Settings />)} />
                <Route path="/editor/:id" element={protectedPage(<Editor />)} />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              </UploadProvider>
            </PluginProvider>
          </AuthProvider>
        </Router>
      </DesktopWorkspaceGate>
    </ThemeProvider>
  );
}

import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { SiteHome, SiteProject } from './site/Site';

const Workspace = lazy(() => import('./app/routes'));

function Loading() {
  return (
    <div className="center-screen">
      <div className="spinner" aria-label="Loading" />
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { access } = useStore();
  const loc = useLocation();
  if (access === 'loading') return <Loading />;
  if (access !== 'ok') return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

function LoginRoute() {
  const { access } = useStore();
  const loc = useLocation();
  if (access === 'ok') return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/app'} replace />;
  return <Workspace login />;
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<SiteHome />} />
                <Route path="/p/:id" element={<SiteProject />} />
                <Route path="/login" element={<LoginRoute />} />
                <Route
                  path="/app/*"
                  element={
                    <Gate>
                      <Workspace />
                    </Gate>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ConfirmProvider>
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  );
}

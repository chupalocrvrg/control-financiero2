import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Layout from './components/Layout';
import SecurityGuard from './components/SecurityGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CURRENT_VERSION } from './lib/changelog';

const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CheckEntry = lazy(() => import('./pages/CheckEntry'));
const CheckSearch = lazy(() => import('./pages/CheckSearch'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Employees = lazy(() => import('./pages/Employees'));
const Sales = lazy(() => import('./pages/Sales'));
const Collections = lazy(() => import('./pages/Collections'));
const Inventory = lazy(() => import('./pages/Inventory'));
const NotFound = lazy(() => import('./pages/NotFound'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-8 text-center">
    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-6" />
    <h2 className="text-xl font-bold text-white tracking-widest uppercase">Cargando Módulo</h2>
    <p className="text-neutral-500 text-sm mt-2 font-medium">Control 360° • v{CURRENT_VERSION}</p>
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <SettingsProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  
                  <Route element={<Layout />}>
                    <Route path="/" element={<SecurityGuard><Dashboard /></SecurityGuard>} />
                    <Route path="/entry" element={<SecurityGuard><CheckEntry /></SecurityGuard>} />
                    <Route path="/search" element={<SecurityGuard><CheckSearch /></SecurityGuard>} />
                    <Route path="/sales" element={<SecurityGuard><Sales /></SecurityGuard>} />
                    <Route path="/collections" element={<SecurityGuard><Collections /></SecurityGuard>} />
                    <Route path="/employees" element={<SecurityGuard><Employees /></SecurityGuard>} />
                                        <Route path="/inventory/*" element={<SecurityGuard><Inventory /></SecurityGuard>} />
                    <Route path="/settings" element={<SecurityGuard><Settings /></SecurityGuard>} />
                    <Route path="/admin/*" element={<SecurityGuard><AdminPanel /></SecurityGuard>} />
                    <Route path="*" element={<SecurityGuard><NotFound /></SecurityGuard>} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </SettingsProvider>
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}


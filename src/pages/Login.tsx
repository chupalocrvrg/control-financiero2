import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, ExternalLink } from 'lucide-react';

export default function Login() {
  const { user, profile, loading, login } = useAuth();
  const [error, setError] = React.useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-6" />
        <h2 className="text-xl font-bold text-white tracking-widest uppercase">Verificando Credenciales</h2>
        <p className="text-neutral-500 text-sm mt-2 font-medium">Control 360°</p>
      </div>
    );
  }

  if (user && profile) {
    return <Navigate to="/" replace />;
  }

const inIframe = window.self !== window.top;

  const handleLogin = async () => {
    setError(null);
    try {
      await login();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleOpenNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-indigo-500 selection:text-white transition-colors duration-500">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-[2.5rem] shadow-xl animate-in zoom-in-50 duration-700">
            <img src="/logo.svg" alt="Control 360° Logo" className="h-16 w-16" referrerPolicy="no-referrer" />
          </div>
        </div>
        <h2 className="text-center text-4xl font-black text-neutral-900 dark:text-neutral-50 tracking-tighter uppercase italic">Control 360°</h2>
        <p className="text-center text-xs font-bold text-indigo-500 uppercase tracking-widest mt-1">by Trennd</p>
        <p className="mt-4 text-center text-sm font-bold text-neutral-400 uppercase tracking-[0.2em] max-w-xs mx-auto leading-relaxed">
          SISTEMA CENTRAL DE GESTIÓN DE EGRESOS Y PROYECCIONES
        </p>
      </div>

      <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-neutral-900 py-12 px-8 shadow-xl shadow-neutral-200/50 dark:shadow-none sm:rounded-[3rem] border border-neutral-100 dark:border-neutral-800 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-neutral-500 dark:text-neutral-400 text-sm font-medium">Inicia sesión con tu cuenta corporativa para acceder al panel de control.</p>
            </div>

{error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl animate-in fade-in zoom-in duration-300 flex flex-col items-center">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium text-center leading-relaxed mb-3">
                  {error}
                </p>
                {inIframe && error.includes('pestaña nueva') && (
                  <button onClick={handleOpenNewTab} className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold rounded-full hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors">
                    <ExternalLink className="w-3 h-3" />
                    Abrir en Nueva Pestaña
                  </button>
                )}
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 border-2 border-neutral-100 dark:border-neutral-800 rounded-[1.5rem] text-sm font-black text-neutral-900 dark:text-neutral-50 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all group active:scale-95"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all" />
              <span>Autenticar con Google</span>
            </button>
            <div className="pt-4 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] font-black text-neutral-300 dark:text-neutral-600 uppercase tracking-widest">Nodos de seguridad activos</span>
            </div>
          </div>
        </div>
        <p className="mt-10 text-center text-[10px] font-black text-neutral-300 dark:text-neutral-700 uppercase tracking-[0.3em]">
          ACCESO RESTRINGIDO &copy; 2024
        </p>
      </div>
    </div>
  );
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // Report error to firestore
    try {
      const user = auth.currentUser;
      addDoc(collection(db, 'system_errors'), {
        userId: user?.uid || 'anonymous',
        userEmail: user?.email || 'unknown',
        error: error.message || String(error),
        module: 'React App Error Boundary',
        componentStack: errorInfo.componentStack,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to report error to Firestore", e);
    }
  }

  public render() {
    if (this.state.hasError) {
      const errMsg = (this.state.error?.message || '').toLowerCase();
      const errName = (this.state.error?.name || '').toLowerCase();
      
      const isChunkError = 
        errMsg.includes('failed to fetch dynamically imported module') ||
        errMsg.includes('loading chunk') ||
        errMsg.includes('dynamically imported module') ||
        errMsg.includes('importing a module script failed') ||
        errName.includes('chunkloaderror');

      const handleHardReload = () => {
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => {
              caches.delete(name);
            });
          });
        }
        window.location.reload();
      };

      if (isChunkError) {
        return (
          <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-8 text-center transition-colors">
            <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-neutral-200 dark:border-neutral-800">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCcw className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight mb-2">
                ¡Nuevas funciones disponibles!
              </h2>
              <p className="text-neutral-600 dark:text-neutral-300 text-sm mb-6 leading-relaxed">
                Se han añadido nuevas funciones, dale clic al botón de abajo para disfrutar del sistema.
              </p>
              <button 
                onClick={handleHardReload}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/25 cursor-pointer"
              >
                <RefreshCcw className="w-5 h-5" />
                <span>Actualizar Sistema</span>
              </button>
            </div>
          </div>
        );
      }

      const isDomError = this.state.error?.message?.includes('insertBefore') || 
                         this.state.error?.message?.includes('removeChild') || 
                         this.state.error?.message?.includes('Node');

      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-8 text-center transition-colors">
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-neutral-200 dark:border-neutral-800">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight mb-2">Algo salió mal</h2>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-6">
              {isDomError 
                ? 'Se detectó un conflicto de traducción automática del navegador o actualización de pantalla. Puedes reintentar directamente.' 
                : 'Ha ocurrido un error inesperado. Puedes intentar reintentar la acción o recargar la página.'}
            </p>
            <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl text-left mb-6 overflow-auto max-h-32">
              <p className="text-xs font-mono text-red-600 dark:text-red-400 break-words">
                {this.state.error?.message || "Error desconocido"}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 dark:shadow-none cursor-pointer"
              >
                <RefreshCcw className="w-5 h-5" />
                <span>Reintentar Acción</span>
              </button>
              <button 
                onClick={handleHardReload}
                className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-medium rounded-xl transition-all text-sm cursor-pointer"
              >
                <span>Recargar Página Completa</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

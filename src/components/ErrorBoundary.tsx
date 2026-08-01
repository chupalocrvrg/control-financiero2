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
      return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-8 text-center transition-colors">
          <div className="bg-white dark:bg-neutral-900 p-8 rounded-3xl shadow-2xl max-w-md w-full border border-neutral-200 dark:border-neutral-800">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight mb-4">Algo salió mal</h2>
            <p className="text-neutral-500 dark:text-neutral-400 text-sm mb-8">
              Ha ocurrido un error inesperado. Hemos notificado al administrador. Puedes intentar recargar la página.
            </p>
            <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-xl text-left mb-8 overflow-auto max-h-32">
              <p className="text-xs font-mono text-red-600 dark:text-red-400 break-words">
                {this.state.error?.message || "Error desconocido"}
              </p>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
            >
              <RefreshCcw className="w-5 h-5" />
              Recargar Página
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

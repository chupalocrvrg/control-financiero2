import React from 'react';
import { RefreshCcw, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '../lib/utils';

interface AsyncStateProps {
  loading: boolean;
  error: Error | string | null;
  isEmpty: boolean;
  onRetry: () => void;
  loadingMessage?: string;
  emptyMessage?: string;
  emptySubMessage?: string;
  children: React.ReactNode;
  className?: string;
}

export default function AsyncState({
  loading,
  error,
  isEmpty,
  onRetry,
  loadingMessage = 'Cargando datos...',
  emptyMessage = 'No hay datos disponibles',
  emptySubMessage = 'No se encontraron registros para tu búsqueda o filtro actual.',
  children,
  className
}: AsyncStateProps) {
  if (loading) {
    return (
      <div className={cn("w-full py-12 flex flex-col items-center justify-center animate-in fade-in duration-500", className)}>
        <div className="w-12 h-12 border-4 border-indigo-200 dark:border-indigo-900/50 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin mb-4" />
        <p className="text-neutral-500 dark:text-neutral-400 font-medium animate-pulse">{loadingMessage}</p>
        <div className="w-full max-w-md mt-8 space-y-4">
          {/* Skeleton Loaders */}
          <div className="h-16 bg-neutral-100 dark:bg-neutral-800/50 rounded-xl animate-pulse" />
          <div className="h-16 bg-neutral-100 dark:bg-neutral-800/50 rounded-xl animate-pulse delay-75" />
          <div className="h-16 bg-neutral-100 dark:bg-neutral-800/50 rounded-xl animate-pulse delay-150" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("w-full py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300", className)}>
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">Error al cargar datos</h3>
        <p className="text-neutral-500 dark:text-neutral-400 max-w-sm mb-6 text-sm">
          {typeof error === 'string' ? error : error.message || 'Ha ocurrido un error inesperado al procesar la solicitud.'}
        </p>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg"
        >
          <RefreshCcw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={cn("w-full py-16 flex flex-col items-center justify-center text-center animate-in fade-in duration-500", className)}>
        <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 dark:text-neutral-500 rounded-full flex items-center justify-center mb-6">
          <Inbox className="w-10 h-10" />
        </div>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-2">{emptyMessage}</h3>
        <p className="text-neutral-500 dark:text-neutral-400 max-w-sm text-sm">{emptySubMessage}</p>
      </div>
    );
  }

  return <>{children}</>;
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-red-500 blur-3xl opacity-20 rounded-full animate-pulse"></div>
        <div className="bg-white dark:bg-neutral-900 p-10 rounded-[3rem] shadow-2xl border border-red-100 dark:border-red-900/30 max-w-lg relative z-10">
          <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ShieldAlert className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black text-neutral-900 dark:text-white uppercase tracking-tight mb-4">
            Acceso No Válido
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 text-base mb-10 leading-relaxed font-medium">
            La página a la que intentas ingresar <strong className="text-red-600 dark:text-red-400">no existe</strong> o <strong className="text-red-600 dark:text-red-400">no está habilitada</strong> para tu usuario. Verifica la URL.
          </p>
          <button 
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver al Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

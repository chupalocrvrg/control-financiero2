import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { cn } from '../lib/utils';

export default function PWAPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      // Prevenir que el navegador muestre su propio prompt automáticamente
      e.preventDefault();
      setInstallPrompt(e);
      
      // Mostrar nuestro banner después de un corto delay para no saturar al entrar
      const timer = setTimeout(() => {
        if (!localStorage.getItem('pwa-prompt-dismissed')) {
          setIsVisible(true);
        }
      }, 3000);
      
      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Detectar si ya está instalada (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsVisible(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    
    setIsVisible(false);
    installPrompt.prompt();
    
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setInstallPrompt(null);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    // Guardar preferencia para no molestar de nuevo en esta sesión larga
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (!isVisible || isDismissed) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 md:w-96 z-[100] animate-in slide-in-from-bottom-10 fade-in duration-700">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 shadow-2xl rounded-[2rem] p-6 flex flex-col gap-4 relative overflow-hidden group">
        {/* Decorative background blur */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all" />
        
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-black text-neutral-900 dark:text-neutral-50 text-sm uppercase tracking-tight">Instalar Control 360°</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mt-1">
              Accede más rápido, recibe notificaciones y usa la app sin distracciones desde tu pantalla de inicio.
            </p>
          </div>
        </div>

        <button
          onClick={handleInstall}
          className="w-full bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-950 font-black py-3 rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all text-xs uppercase tracking-widest shadow-xl shadow-neutral-900/10 dark:shadow-neutral-50/5"
        >
          <Download className="w-4 h-4" /> Instalar Aplicación
        </button>
      </div>
    </div>
  );
}

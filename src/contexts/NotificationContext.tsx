import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Info, 
  HelpCircle, 
  X 
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface AlertData {
  title: string;
  message: string;
  type: ToastType;
  resolve: () => void;
}

export interface ConfirmData {
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
  resolve: (value: boolean) => void;
}

interface NotificationContextType {
  showToast: (message: string, type?: ToastType) => void;
  showAlert: (title: string, message: string, type?: ToastType) => Promise<void>;
  showConfirm: (
    title: string, 
    message: string, 
    options?: { type?: 'danger' | 'warning' | 'info'; confirmText?: string; cancelText?: string }
  ) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alert, setAlert] = useState<AlertData | null>(null);
  const [confirm, setConfirm] = useState<ConfirmData | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const showAlert = useCallback((title: string, message: string, type: ToastType = 'info') => {
    return new Promise<void>((resolve) => {
      setAlert({ title, message, type, resolve });
    });
  }, []);

  const showConfirm = useCallback((
    title: string, 
    message: string, 
    options?: { type?: 'danger' | 'warning' | 'info'; confirmText?: string; cancelText?: string }
  ) => {
    return new Promise<boolean>((resolve) => {
      setConfirm({
        title,
        message,
        type: options?.type || 'warning',
        confirmText: options?.confirmText || 'Confirmar',
        cancelText: options?.cancelText || 'Cancelar',
        resolve,
      });
    });
  }, []);

  const handleAlertClose = () => {
    if (alert) {
      alert.resolve();
      setAlert(null);
    }
  };

  const handleConfirmAction = (value: boolean) => {
    if (confirm) {
      confirm.resolve(value);
      setConfirm(null);
    }
  };

  return (
    <NotificationContext.Provider value={{ showToast, showAlert, showConfirm }}>
      {children}

      {/* Floating Toasts container */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            let bgColor = 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-100';
            let icon = <Info className="w-5 h-5 text-indigo-500" />;

            if (t.type === 'success') {
              bgColor = 'bg-white dark:bg-neutral-900 border-emerald-100 dark:border-emerald-950/30 text-neutral-800 dark:text-neutral-100';
              icon = <CheckCircle className="w-5 h-5 text-emerald-500" />;
            } else if (t.type === 'error') {
              bgColor = 'bg-white dark:bg-neutral-900 border-rose-100 dark:border-rose-950/30 text-neutral-800 dark:text-neutral-100';
              icon = <XCircle className="w-5 h-5 text-rose-500" />;
            } else if (t.type === 'warning') {
              bgColor = 'bg-white dark:bg-neutral-900 border-amber-100 dark:border-amber-950/30 text-neutral-800 dark:text-neutral-100';
              icon = <AlertCircle className="w-5 h-5 text-amber-500" />;
            }

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className={`flex items-start gap-3 p-4 rounded-2xl border shadow-xl ${bgColor} pointer-events-auto overflow-hidden relative`}
              >
                <div className="flex-shrink-0 mt-0.5">{icon}</div>
                <div className="flex-1 text-xs font-semibold leading-relaxed pr-2">{t.message}</div>
                <button 
                  onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                  className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                {/* Visual duration indicator bar */}
                <motion.div 
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 4, ease: 'linear' }}
                  className={`absolute bottom-0 left-0 h-1 ${
                    t.type === 'success' ? 'bg-emerald-500' :
                    t.type === 'error' ? 'bg-rose-500' :
                    t.type === 'warning' ? 'bg-amber-500' : 'bg-indigo-500'
                  }`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Global Alert Modal */}
      <AnimatePresence>
        {alert && (
          <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white dark:bg-neutral-900 border border-neutral-150 dark:border-neutral-800 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${
                    alert.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40' :
                    alert.type === 'error' ? 'bg-rose-50 dark:bg-rose-950/40' :
                    alert.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-indigo-50 dark:bg-indigo-950/40'
                  }`}>
                    {alert.type === 'success' && <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />}
                    {alert.type === 'error' && <XCircle className="w-7 h-7 text-rose-600 dark:text-rose-400" />}
                    {alert.type === 'warning' && <AlertCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />}
                    {alert.type === 'info' && <Info className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Notificación del Sistema</span>
                    <h3 className="text-xl font-black text-neutral-950 dark:text-neutral-50 uppercase tracking-tight leading-none mt-1">
                      {alert.title}
                    </h3>
                  </div>
                </div>

                <div className="mt-6 text-neutral-600 dark:text-neutral-300 text-sm font-medium leading-relaxed bg-neutral-50 dark:bg-neutral-800/20 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800/40">
                  {alert.message}
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={handleAlertClose}
                    className="w-full md:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg transition-transform active:scale-95 cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Confirm Modal */}
      <AnimatePresence>
        {confirm && (
          <div className="fixed inset-0 bg-neutral-950/60 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white dark:bg-neutral-900 border border-neutral-150 dark:border-neutral-800 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-4">
                  <div className={`p-4 rounded-2xl ${
                    confirm.type === 'danger' ? 'bg-rose-50 dark:bg-rose-950/40' :
                    confirm.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/40' : 'bg-indigo-50 dark:bg-indigo-950/40'
                  }`}>
                    {confirm.type === 'danger' && <AlertCircle className="w-7 h-7 text-rose-600 dark:text-rose-400" />}
                    {confirm.type === 'warning' && <HelpCircle className="w-7 h-7 text-amber-600 dark:text-amber-400" />}
                    {confirm.type === 'info' && <Info className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">Confirmación Requerida</span>
                    <h3 className="text-xl font-black text-neutral-950 dark:text-neutral-50 uppercase tracking-tight leading-none mt-1">
                      {confirm.title}
                    </h3>
                  </div>
                </div>

                <div className="mt-6 text-neutral-600 dark:text-neutral-300 text-sm font-medium leading-relaxed bg-neutral-50 dark:bg-neutral-800/20 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800/40">
                  {confirm.message}
                </div>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => handleConfirmAction(false)}
                    className="flex-1 px-6 py-4 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-200 text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer"
                  >
                    {confirm.cancelText}
                  </button>
                  <button
                    onClick={() => handleConfirmAction(true)}
                    className={`flex-1 px-6 py-4 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg transition-transform active:scale-95 cursor-pointer ${
                      confirm.type === 'danger' 
                        ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200 dark:shadow-none' 
                        : confirm.type === 'warning' 
                          ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200 dark:shadow-none'
                          : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none'
                    }`}
                  >
                    {confirm.confirmText}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
};

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, Clock, User } from 'lucide-react';

interface SystemError {
  id: string;
  userId: string;
  userEmail: string;
  error: string;
  module: string;
  componentStack?: string;
  createdAt: any;
}

export default function AdminNotifications() {
  const [errors, setErrors] = useState<SystemError[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchErrors = async () => {
      try {
        const q = query(collection(db, 'system_errors'), orderBy('createdAt', 'desc'), limit(50));
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SystemError[];
        setErrors(data);
      } catch (err) {
        console.error("Failed to fetch system errors", err);
      } finally {
        setLoading(false);
      }
    };
    fetchErrors();
  }, []);

  if (loading) {
    return <div className="text-center py-8">Cargando notificaciones...</div>;
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 border border-neutral-200 dark:border-neutral-800 shadow-xl">
      <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-6">Notificaciones de Error del Sistema</h2>
      {errors.length === 0 ? (
        <p className="text-neutral-500">No hay errores registrados.</p>
      ) : (
        <div className="space-y-4">
          {errors.map(err => (
            <div key={err.id} className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-bold text-red-700 dark:text-red-400">{err.error}</h3>
                  <div className="mt-2 text-sm text-red-600/80 dark:text-red-400/80 space-y-1">
                    <p className="flex items-center gap-2"><User className="w-4 h-4" /> {err.userEmail || err.userId || 'Usuario desconocido'}</p>
                    <p className="flex items-center gap-2"><Clock className="w-4 h-4" /> {err.createdAt?.toDate ? format(err.createdAt.toDate(), "PPpp", { locale: es }) : 'Fecha desconocida'}</p>
                    <p><strong>Módulo/Servicio:</strong> {err.module}</p>
                  </div>
                  {err.componentStack && (
                    <div className="mt-3 bg-white dark:bg-neutral-950 p-3 rounded-xl overflow-x-auto border border-red-100 dark:border-red-900/30">
                      <pre className="text-xs text-red-800 dark:text-red-300 font-mono whitespace-pre-wrap">{err.componentStack}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

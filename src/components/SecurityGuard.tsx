import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, Lock, ShieldAlert, Power, ShieldCheck, Fingerprint, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import * as OTPAuth from 'otpauth';

export default function SecurityGuard({ children }: { children: React.ReactNode }) {
  const { isExpired, sessionVerified, verifyPin, logout, profile, updateProfile, setSessionVerified } = useAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Progressive lockout state
  const [failedAttempts, setFailedAttempts] = useState(() => parseInt(localStorage.getItem('pin_failed_attempts') || '0'));
  const [lockUntil, setLockUntil] = useState(() => parseInt(localStorage.getItem('pin_lock_until') || '0'));
  const [currentPenalty, setCurrentPenalty] = useState(() => parseInt(localStorage.getItem('pin_current_penalty') || '60'));
  const [remainingLockTime, setRemainingLockTime] = useState(0);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [totpCode, setTotpCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    if (!sessionVerified) {
      setPin('');
    }
  }, [sessionVerified]);

  useEffect(() => {
    if (lockUntil > Date.now()) {
      const updateRemaining = () => {
        const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          setRemainingLockTime(0);
        } else {
          setRemainingLockTime(remaining);
        }
      };
      
      updateRemaining();
      const interval = setInterval(updateRemaining, 1000);
      return () => clearInterval(interval);
    } else {
      setRemainingLockTime(0);
    }
  }, [lockUntil]);

  
  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    
    if (!profile?.totpEnabled || !profile.totpSecret) {
      setResetError('Autenticador de Google no configurado. Póngase en contacto con el administrador para el restablecimiento manual de su PIN.');
      return;
    }
    
    if (newPin !== confirmNewPin) {
      setResetError('Los nuevos PINs no coinciden.');
      return;
    }
    
    if (newPin.length !== 6) {
      setResetError('El PIN debe tener 6 dígitos.');
      return;
    }
    
    const totp = new OTPAuth.TOTP({
      issuer: 'Control Financiero',
      label: profile?.email || 'Usuario',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(profile.totpSecret)
    });
    
    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) {
      setResetError('Código de autenticador inválido.');
      return;
    }
    
    try {
      setLoading(true);
      await updateProfile({ pin: newPin });
      
      // Success, login with new PIN
      // We manually set verified because the profile listener might not have updated the state yet
      setSessionVerified(true);
      setShowResetModal(false);
      setTotpCode('');
      setNewPin('');
      setConfirmNewPin('');
      
      // Reset lockouts
      localStorage.removeItem('pin_failed_attempts');
      localStorage.removeItem('pin_lock_until');
      localStorage.removeItem('pin_current_penalty');
      setFailedAttempts(0);
      setCurrentPenalty(60);
      setLockUntil(0);
    } catch (err) {
      setResetError('Error al restablecer el PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6 || remainingLockTime > 0) return;
    
    setLoading(true);
    setError(false);
    const success = await verifyPin(pin);
    if (!success) {
      setError(true);
      setPin('');
      
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      localStorage.setItem('pin_failed_attempts', newAttempts.toString());

      if (newAttempts >= 3) {
        const penalty = currentPenalty;
        const maxPenalty = 3 * 24 * 60 * 60; // 3 days in seconds
        const nextPenalty = Math.min(penalty * 2, maxPenalty);
        const until = Date.now() + penalty * 1000;
        
        setLockUntil(until);
        setCurrentPenalty(nextPenalty);
        
        localStorage.setItem('pin_lock_until', until.toString());
        localStorage.setItem('pin_current_penalty', nextPenalty.toString());
      }
    } else {
      setPin(''); // Clear PIN so it doesn't stay pre-filled if logged out again
      localStorage.removeItem('pin_failed_attempts');
      localStorage.removeItem('pin_lock_until');
      localStorage.removeItem('pin_current_penalty');
      setFailedAttempts(0);
      setCurrentPenalty(60);
      setLockUntil(0);
    }
    setLoading(false);
  };

  const formatLockTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ${seconds % 60}s`;
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    return `${h}h ${m % 60}m`;
  };

  if (isExpired) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center items-center p-6 text-center transition-colors duration-500">
        <div className="bg-white dark:bg-neutral-900 p-10 rounded-[3rem] shadow-2xl dark:shadow-none max-w-md w-full border border-neutral-100 dark:border-neutral-800 animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <ShieldAlert className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-3xl font-black text-neutral-900 dark:text-neutral-50 mb-4 tracking-tighter uppercase italic">Acceso Restringido</h2>
          <p className="text-neutral-500 dark:text-neutral-400 mb-10 font-medium px-4">
            Tu suscripción corporativa o periodo de validación ha finalizado. Es necesario regularizar tu estatus para continuar operando.
          </p>
          <div className="space-y-4">
            <a
              href="https://wa.me/593985441487"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full px-8 py-5 bg-emerald-600 dark:bg-emerald-500 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 dark:shadow-none hover:scale-[1.02] active:scale-95"
            >
              <MessageCircle className="mr-3 h-6 w-6" />
              Soporte Ventas
            </a>
            <button
              onClick={logout}
              className="flex items-center justify-center w-full px-8 py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
            >
              <Power className="mr-2 h-4 w-4" /> Finalizar Sesión
            </button>
          </div>
        </div>
        <p className="mt-12 text-[10px] font-black text-neutral-300 dark:text-neutral-700 uppercase tracking-[0.3em]">
          SECURITY LAYER V.1.1.0
        </p>
      </div>
    );
  }

  if (!sessionVerified) {
    return (
      <>
      <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center p-6 text-center animate-in fade-in duration-700">
        <div className="bg-neutral-900 p-12 rounded-[3.5rem] shadow-2xl max-w-md w-full border border-neutral-800 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="w-16 h-16 bg-neutral-800 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner border border-neutral-700 group-hover:scale-110 transition-transform duration-500">
            <Lock className="h-7 w-7 text-indigo-500" />
          </div>
          
          <h2 className="text-3xl font-black text-white mb-3 tracking-tighter uppercase italic italic">Protocolo de Identidad</h2>
          <p className="text-neutral-500 mb-10 text-[10px] font-black uppercase tracking-[0.2em]">
            Ingresa tu PIN de 6 dígitos para autenticar
          </p>
          
          <form onSubmit={handlePinSubmit} className="space-y-10">
            <div className="relative group/input">
              <input
                type="text" style={{ WebkitTextSecurity: "disc" }} autoComplete="off"
                maxLength={6}
                value={pin}
                autoFocus
                disabled={remainingLockTime > 0}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className={cn(
                  "w-full text-center text-4xl tracking-[0.6em] font-black px-4 py-6 bg-neutral-950 border rounded-3xl text-white outline-none transition-all",
                  error ? "border-red-500 shadow-lg shadow-red-500/10 animate-shake" : "border-neutral-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10",
                  remainingLockTime > 0 && "opacity-50 cursor-not-allowed border-red-900"
                )}
                placeholder="000000"
              />
              <div className="absolute right-6 top-1/2 -translate-y-1/2">
                {remainingLockTime > 0 ? (
                  <Clock className="w-6 h-6 text-red-500 animate-pulse" />
                ) : (
                  <Fingerprint className={cn("w-6 h-6 transition-colors", error ? "text-red-500" : "text-neutral-700 group-focus-within/input:text-indigo-500")} />
                )}
              </div>
              
              {remainingLockTime > 0 ? (
                <p className="text-red-500 text-[10px] mt-4 font-black uppercase tracking-widest animate-in slide-in-from-top-1 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" /> Bloqueado por {formatLockTime(remainingLockTime)}
                </p>
              ) : error ? (
                <p className="text-red-500 text-[10px] mt-4 font-black uppercase tracking-widest animate-in slide-in-from-top-1">
                  Autorización Denegada
                </p>
              ) : failedAttempts > 0 ? (
                <p className="text-amber-500 text-[10px] mt-4 font-black uppercase tracking-widest animate-in slide-in-from-top-1">
                  Intentos fallidos: {failedAttempts}/3
                </p>
              ) : null}
            </div>
            
            <button
              type="submit"
              disabled={loading || pin.length !== 6 || remainingLockTime > 0}
              className="w-full flex justify-center py-5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-500/20 disabled:opacity-30 disabled:shadow-none transition-all active:scale-95"
            >
              {loading ? 'Validando...' : 'Desbloquear Sistema'}
            </button>
          </form>
            <button onClick={() => setShowResetModal(true)} className="mt-6 w-full text-center text-[11px] font-bold text-neutral-500 hover:text-indigo-400 uppercase tracking-widest transition-colors">
              ¿Olvidaste tu PIN?
            </button>
          
          <button
            onClick={logout}
            className="mt-12 group/logout flex items-center justify-center gap-2 mx-auto text-[10px] text-neutral-600 hover:text-neutral-400 font-black uppercase tracking-[0.2em] transition-colors"
          >
            <Power className="w-3 h-3 group-hover:text-red-500 transition-colors" /> Cerrar Terminal
          </button>
        </div>
        
        <div className="mt-12 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
            <p className="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">Encriptación AES-256</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <p className="text-[9px] text-neutral-600 font-bold uppercase tracking-widest">En Línea</p>
          </div>
        </div>
      </div>

      {/* Reset PIN Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-[2rem] p-8 w-full max-w-md shadow-2xl relative">
            <h3 className="text-2xl font-black mb-2 text-center text-neutral-900 dark:text-white">Restablecer PIN</h3>
            
            {!profile?.totpEnabled ? (
              <div className="text-center mt-6">
                <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                  <ShieldAlert className="w-8 h-8 text-red-500" />
                </div>
                <p className="text-sm font-bold text-neutral-600 dark:text-neutral-400">
                  Autenticador de Google no configurado. Póngase en contacto con el administrador para el restablecimiento manual de su PIN.
                </p>
                <button
                  onClick={() => setShowResetModal(false)}
                  className="mt-8 w-full py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-[1.5rem] font-bold"
                >
                  Volver
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPin} className="space-y-6 mt-6">
                <div>
                  <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest block mb-2 text-center">Código Autenticador (6 dígitos)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                    placeholder="000000"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest block mb-2 text-center">Nuevo PIN</label>
                  <input
                    type="text" style={{ WebkitTextSecurity: "disc" }} autoComplete="off" inputMode="numeric" pattern="[0-9]*"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                    placeholder="••••••"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-neutral-600 dark:text-neutral-300 uppercase tracking-widest block mb-2 text-center">Confirmar Nuevo PIN</label>
                  <input
                    type="text" style={{ WebkitTextSecurity: "disc" }} autoComplete="off" inputMode="numeric" pattern="[0-9]*"
                    maxLength={6}
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600"
                    placeholder="••••••"
                  />
                </div>
                
                {resetError && <p className="text-red-500 text-[12px] font-bold text-center animate-in slide-in-from-top-1">{resetError}</p>}
                
                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowResetModal(false); setResetError(''); }}
                    className="flex-1 py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-[1.5rem] font-bold active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || totpCode.length !== 6 || newPin.length !== 6 || confirmNewPin.length !== 6}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all"
                  >
                    {loading ? 'Procesando...' : 'Restablecer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      </>
    );
  }

  return <>{children}</>;
}

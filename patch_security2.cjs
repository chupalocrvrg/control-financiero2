const fs = require('fs');
let content = fs.readFileSync('src/components/SecurityGuard.tsx', 'utf8');

// 3. Fix auto-save password and 4. Clear PIN when locking
content = content.replace(
  'type="password"',
  'type="text" style={{ WebkitTextSecurity: "disc" }} autoComplete="off"'
);
content = content.replace(
  'if (!sessionVerified && !isExpired && profile) {',
  'if (!sessionVerified && !isExpired && profile) {\n    if (pin.length > 0) setPin("");'
);

// 1. Add missing modal for Reset PIN
const modalUI = `
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
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 text-center">Código Autenticador (6 dígitos)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\\D/g, ''))}
                    className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all"
                    placeholder="000000"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 text-center">Nuevo PIN</label>
                  <input
                    type="text" style={{ WebkitTextSecurity: "disc" }} autoComplete="off" inputMode="numeric" pattern="[0-9]*"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\\D/g, ''))}
                    className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all"
                    placeholder="••••••"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest block mb-2 text-center">Confirmar Nuevo PIN</label>
                  <input
                    type="text" style={{ WebkitTextSecurity: "disc" }} autoComplete="off" inputMode="numeric" pattern="[0-9]*"
                    maxLength={6}
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\\D/g, ''))}
                    className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all"
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
`;

content = content.replace('  return <>{children}</>;', modalUI + '\n  return <>{children}</>;');

fs.writeFileSync('src/components/SecurityGuard.tsx', content);

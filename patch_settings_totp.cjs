const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const totpModalJSX = `
      {/* 2FA TOTP Setup Modal */}
      {showTotpModal && totpSetup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-neutral-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl relative border border-neutral-100 dark:border-neutral-800">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight">Configurar Autenticador</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 font-medium">Escanea este código QR con la app de Google Authenticator u otra similar.</p>
            </div>
            
            <div className="flex justify-center bg-white p-4 rounded-3xl border border-neutral-200 shadow-sm mx-auto w-fit mb-6">
              <QRCodeSVG value={totpSetup.uri} size={180} />
            </div>
            
            <div className="text-center mb-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1">Clave Secreta</p>
              <code className="bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg text-xs font-mono text-neutral-700 dark:text-neutral-300 break-all select-all">
                {totpSetup.secret.base32}
              </code>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block text-center">Código de Verificación (6 dígitos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center text-3xl tracking-[0.5em] font-black px-4 py-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl outline-none focus:border-indigo-500 transition-all"
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowTotpModal(false); setTotpSetup(null); setTotpCode(''); }}
                  className="flex-1 py-4 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white rounded-[1.5rem] font-bold active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleVerifyAndSaveTotp}
                  disabled={loading || totpCode.length !== 6}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-[1.5rem] font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all"
                >
                  {loading ? 'Verificando...' : 'Verificar y Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace('    </>\n  );\n}', totpModalJSX + '\n    </>\n  );\n}');

fs.writeFileSync('src/pages/Settings.tsx', content);

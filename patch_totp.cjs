const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const functionsToAdd = `
  const handleSetupTotp = () => {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'Control Financiero',
      label: profile?.email || 'Usuario',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret
    });
    setTotpSetup({ secret, uri: totp.toString() });
    setShowTotpModal(true);
  };

  const handleVerifyAndSaveTotp = async () => {
    if (!totpSetup || !totpCode) return;
    
    const totp = new OTPAuth.TOTP({
      issuer: 'Control Financiero',
      label: profile?.email || 'Usuario',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: totpSetup.secret
    });

    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) {
      showToast('Código incorrecto', 'error');
      return;
    }

    try {
      setLoading(true);
      await updateProfile({ 
        totpSecret: totpSetup.secret.base32,
        totpEnabled: true
      });
      showToast('Autenticador configurado exitosamente', 'success');
      setShowTotpModal(false);
      setTotpSetup(null);
      setTotpCode('');
    } catch (error) {
      showToast('Error al guardar configuración', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTotp = async () => {
    if (!window.confirm('¿Está seguro de que desea eliminar el autenticador de dos pasos? Esto disminuirá la seguridad de su cuenta.')) return;
    try {
      setLoading(true);
      await updateProfile({
        totpSecret: '',
        totpEnabled: false
      });
      showToast('Autenticador removido', 'success');
    } catch (error) {
      showToast('Error al remover el autenticador', 'error');
    } finally {
      setLoading(false);
    }
  };
`;

content = content.replace('const handleSaveSecurity = async () => {', functionsToAdd + '\n  const handleSaveSecurity = async () => {');

const uiToAdd = `
              <div className="p-8 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-50 mb-1">Autenticador de Google (2FA)</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      Utiliza Google Authenticator para reestablecer tu PIN en caso de olvido.
                    </p>
                  </div>
                  <div>
                    {profile?.totpEnabled ? (
                      <button 
                        onClick={handleRemoveTotp}
                        disabled={loading}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors"
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button 
                        onClick={handleSetupTotp}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-colors"
                      >
                        Configurar
                      </button>
                    )}
                  </div>
                </div>
              </div>
`;

content = content.replace('</div>\n              <div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">', '</div>' + uiToAdd + '\n              <div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">');

const modalToAdd = `
      {/* TOTP Setup Modal */}
      {showTotpModal && totpSetup && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <h3 className="text-xl font-bold mb-4 text-center">Configurar Autenticador</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center mb-6">
              Escanea este código QR con la aplicación Google Authenticator o similar.
            </p>
            <div className="flex justify-center mb-6 bg-white p-4 rounded-xl border-2 border-indigo-100">
              <QRCodeSVG value={totpSetup.uri} size={200} />
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Ingresa el código generado</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\\D/g, ''))}
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded-2xl p-4 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono tracking-widest text-lg text-center"
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => { setShowTotpModal(false); setTotpSetup(null); }}
                  className="flex-1 px-4 py-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-xl font-bold"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleVerifyAndSaveTotp}
                  disabled={loading || totpCode.length !== 6}
                  className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  Verificar y Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace('</div>\n    </div>\n  );\n}', modalToAdd + '\n    </div>\n  );\n}');

fs.writeFileSync('src/pages/Settings.tsx', content);

const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const ui2fa = `              <div className="p-8 border-t border-neutral-100 dark:border-neutral-800">
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
              </div>`;

content = content.replace(ui2fa + '\n', ''); // Remove from GENERAL

// Add it to SECURITY right before `<div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">`
// Wait, the previous patch also added it there... no, the previous patch added it to the FIRST "flex justify-end" it found which was in GENERAL.
// Let's use string replace carefully for SECURITY tab.
const securityTabSaveLine = `<button onClick={handleSaveSecurity} disabled={loading} className="px-6 py-3 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all flex items-center gap-2">`;
// To make it safe:
content = content.replace(
  '<div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">\n                <button onClick={handleSaveSecurity}', 
  ui2fa + '\n              <div className="px-8 py-4 bg-neutral-50 dark:bg-neutral-950/40 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">\n                <button onClick={handleSaveSecurity}'
);

fs.writeFileSync('src/pages/Settings.tsx', content);

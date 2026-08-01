const fs = require('fs');
let content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const regex = /<button\s*onClick={\(\) => updateSettings\({ uiStyle: 'liquid-glass' }\)}\s*className={cn\([\s\S]*?<\/button>/g;

// Find all matches
const matches = [...content.matchAll(regex)];

if (matches.length > 1) {
  // We want to remove the one in FINANCIAL tab which is the second one usually, or just look for the one next to "Nuevo Banco"
  // Let's do a more precise replacement.
  const preciseBlock = `                    <button onClick={handleAddBank} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-xs hover:bg-blue-100 transition-all flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Nuevo Banco
                    </button>
                    <button
                      onClick={() => updateSettings({ uiStyle: 'liquid-glass' })}
                      className={cn(
                        "p-6 rounded-2xl border-2 transition-all font-bold text-left space-y-1 relative overflow-hidden sm:col-span-2",
                        settings.uiStyle === 'liquid-glass' ? "bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-500 text-indigo-700 dark:text-indigo-300" : "bg-white dark:bg-neutral-800/40 border-neutral-100 dark:border-neutral-800 text-neutral-500"
                      )}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 pointer-events-none backdrop-blur-md" />
                      <div className="relative z-10 text-base">Liquid Glass</div>
                      <div className="relative z-10 text-xs font-normal opacity-80">Efecto avanzado con desenfoques acrílicos, transparencias orgánicas y texturas.</div>
                    </button>`;

  const replaceWith = `                    <button onClick={handleAddBank} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-xs hover:bg-blue-100 transition-all flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Nuevo Banco
                    </button>`;

  content = content.replace(preciseBlock, replaceWith);
}

fs.writeFileSync('src/pages/Settings.tsx', content);

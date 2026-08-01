const fs = require('fs');
let content = fs.readFileSync('src/components/inventory/InventoryDashboard.tsx', 'utf8');

// Replace limit(3) for lrQ
content = content.replace(
  "limit(3)",
  "// limit(3) removed to calculate full stock for commercial houses"
);

// We need to calculate commercial house stocks
const aggregationLogic = `  // Aggregations
  const lowStockArticles = articles.filter(art => art.quantity <= art.minStockAlert);
  const totalArticlesCount = articles.reduce((acc, art) => acc + art.quantity, 0);
  
  // Calculate Commercial House Stock
  const houseStock: Record<string, Record<string, number>> = {};
  recentLoansReturns.forEach(lr => {
    const house = lr.commercialHouse;
    if (!houseStock[house]) houseStock[house] = {};
    
    lr.articles.forEach(art => {
      if (!houseStock[house][art.articleId]) houseStock[house][art.articleId] = 0;
      if (lr.type === 'LOAN') {
        houseStock[house][art.articleId] += art.quantity;
      } else if (lr.type === 'RETURN') {
        houseStock[house][art.articleId] -= art.quantity;
      }
    });
  });

  // Filter out empty stocks
  const activeHouseStocks = Object.entries(houseStock).map(([house, stock]) => {
    const activeArticles = Object.entries(stock).filter(([_, qty]) => qty > 0);
    return { house, articles: activeArticles };
  }).filter(h => h.articles.length > 0);

  const activeLoans = recentLoansReturns.filter(l => l.type === 'LOAN');`;

content = content.replace(
  "  // Aggregations\n  const lowStockArticles = articles.filter(art => art.quantity <= art.minStockAlert);\n  const totalArticlesCount = articles.reduce((acc, art) => acc + art.quantity, 0);\n  const activeLoans = recentLoansReturns.filter(l => l.type === 'LOAN');",
  aggregationLogic
);

// Now update the UI for "Préstamos Recientes de Casas Comerciales"
// I will change it to "Stock en Casas Comerciales"

const uiBlockRegex = /<ShoppingBag className="w-5 h-5 text-indigo-500" \/>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;

const newUIBlock = `<ShoppingBag className="w-5 h-5 text-indigo-500" />
              <h3 className="text-base font-extrabold text-neutral-950 dark:text-neutral-50 uppercase tracking-tight">Stock en Casas Comerciales</h3>
            </div>
            {activeHouseStocks.length === 0 ? (
              <div className="py-6 text-center text-xs font-semibold text-neutral-400 bg-neutral-50 dark:bg-neutral-800/20 rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800">
                No hay stock actualmente en préstamo en casas comerciales.
              </div>
            ) : (
              <div className="space-y-4">
                {activeHouseStocks.map(({ house, articles: houseArts }) => {
                  const hasAlert = houseArts.some(([_, qty]) => qty >= 3);
                  return (
                    <div key={house} className={\`p-4 bg-neutral-50 dark:bg-neutral-800/20 border \${hasAlert ? 'border-amber-400 dark:border-amber-600' : 'border-neutral-100 dark:border-neutral-800'} rounded-2xl space-y-3 relative overflow-hidden\`}>
                      {hasAlert && (
                        <div className="absolute top-0 right-0 bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-bl-xl shadow-sm flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          ¡Alerta: 3 o más!
                        </div>
                      )}
                      <div className="flex justify-between items-start border-b border-neutral-100 dark:border-neutral-800 pb-2 pt-1">
                        <div>
                          <span className="text-xs font-black text-neutral-950 dark:text-neutral-50 uppercase tracking-tight block">{house}</span>
                          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider block">Artículos en préstamo activo</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {houseArts.map(([artId, qty]) => {
                          const article = articles.find(a => a.id === artId);
                          if (!article) return null;
                          const isWarning = qty >= 3;
                          return (
                            <span key={artId} className={\`px-2.5 py-1 bg-white dark:bg-neutral-900 border \${isWarning ? 'border-amber-300 dark:border-amber-700/50 text-amber-700 dark:text-amber-400' : 'border-neutral-100 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'} rounded-lg text-[10px] font-bold\`}>
                              {article.name} ({qty} uds)
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>`;

content = content.replace(uiBlockRegex, newUIBlock);

fs.writeFileSync('src/components/inventory/InventoryDashboard.tsx', content);

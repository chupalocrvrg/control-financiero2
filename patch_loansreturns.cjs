const fs = require('fs');
let content = fs.readFileSync('src/components/inventory/LoansReturnsTab.tsx', 'utf8');

// We need to calculate houseStock dynamically
const houseStockHook = `  // Calculate houseStock dynamically
  const houseStock = React.useMemo(() => {
    const stock: Record<string, number> = {};
    if (type === 'LOAN' && commercialHouse) {
      logs.forEach(lr => {
        if (lr.commercialHouse.toLowerCase() === commercialHouse.trim().toLowerCase()) {
          lr.articles.forEach(art => {
            if (!stock[art.articleId]) stock[art.articleId] = 0;
            if (lr.type === 'RETURN') {
              // Egreso to commercial house
              stock[art.articleId] += art.quantity;
            } else if (lr.type === 'LOAN') {
              // Ingreso from commercial house
              stock[art.articleId] -= art.quantity;
            }
          });
        }
      });
    }
    return stock;
  }, [type, commercialHouse, logs]);

  const availableArticles = React.useMemo(() => {
    if (type === 'LOAN' && commercialHouse) {
      return articles.filter(a => houseStock[a.id] && houseStock[a.id] > 0);
    }
    return articles;
  }, [type, commercialHouse, articles, houseStock]);
  
  // Create a fake inventories array for LOAN so the max is restricted
  const effectiveInventories = React.useMemo(() => {
    if (type === 'LOAN' && commercialHouse) {
      return availableArticles.map(a => ({
        id: a.id,
        warehouseId: warehouseId,
        articleId: a.id,
        quantity: houseStock[a.id] || 0,
        userId: currentEnterpriseId
      })) as WarehouseInventory[];
    }
    return inventories;
  }, [type, commercialHouse, availableArticles, houseStock, warehouseId, currentEnterpriseId, inventories]);
`;

content = content.replace(
  "  const currentEnterpriseId = profile?.role === 'BODEGUERO' ? profile?.enterpriseId : user?.uid;",
  "  const currentEnterpriseId = profile?.role === 'BODEGUERO' ? profile?.enterpriseId : user?.uid;\n" + houseStockHook
);

// Now update ArticleSelector to use availableArticles and effectiveInventories
// Also change isReceiving so we actually enforce limits when type === 'LOAN' (because they can't return more than they have!)
content = content.replace(
  "                        articles={articles}\n                        inventories={inventories}",
  "                        articles={availableArticles}\n                        inventories={effectiveInventories}"
);
content = content.replace(
  "                        isReceiving={type === 'LOAN'}",
  "                        isReceiving={false} // We enforce limits for BOTH (either warehouse limit or house limit)"
);

// Wait, we need to fix the submit validation!
// In handleSubmit, there's a check: 
// if (type === 'RETURN') { const available = getWarehouseStock(item.articleId, warehouseId); ... }
// We need to also add a check for type === 'LOAN' to check houseStock!
const newSubmitCheck = `      for (const item of items) {
        if (!item.articleId) {
          setError('Debe seleccionar artículos válidos');
          return;
        }
        if (type === 'RETURN') { // Egreso
          const available = inventories
            .filter(inv => inv.warehouseId === warehouseId && inv.articleId === item.articleId)
            .reduce((acc, inv) => acc + inv.quantity, 0);
          if (item.quantity > available) {
            const articleName = articles.find(a => a.id === item.articleId)?.name || 'Artículo';
            setError(\`Stock insuficiente en bodega para egresar "\${articleName}". Disponible: \${available} uds.\`);
            return;
          }
        } else if (type === 'LOAN' && commercialHouse) { // Ingreso
          const available = houseStock[item.articleId] || 0;
          if (item.quantity > available) {
            const articleName = articles.find(a => a.id === item.articleId)?.name || 'Artículo';
            setError(\`Stock insuficiente en casa comercial para devolver "\${articleName}". Disponible: \${available} uds.\`);
            return;
          }
        }
      }`;

const oldSubmitCheckRegex = /for \(const item of items\) \{[\s\S]*?return;\n\s*\}\n\s*\}/;
content = content.replace(oldSubmitCheckRegex, newSubmitCheck);

// Let's verify we replaced oldSubmitCheck successfully.

fs.writeFileSync('src/components/inventory/LoansReturnsTab.tsx', content);

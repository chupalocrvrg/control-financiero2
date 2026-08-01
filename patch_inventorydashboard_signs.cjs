const fs = require('fs');
let content = fs.readFileSync('src/components/inventory/InventoryDashboard.tsx', 'utf8');

content = content.replace(
  "      if (lr.type === 'LOAN') {\n        houseStock[house][art.articleId] += art.quantity;\n      } else if (lr.type === 'RETURN') {\n        houseStock[house][art.articleId] -= art.quantity;\n      }",
  "      if (lr.type === 'RETURN') {\n        // Egreso: went to commercial house\n        houseStock[house][art.articleId] += art.quantity;\n      } else if (lr.type === 'LOAN') {\n        // Ingreso: came back from commercial house\n        houseStock[house][art.articleId] -= art.quantity;\n      }"
);

fs.writeFileSync('src/components/inventory/InventoryDashboard.tsx', content);

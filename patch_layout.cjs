const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

content = content.replace(
  "{ name: 'Presupuestos', href: '/budgets', icon: Target },",
  ""
);

fs.writeFileSync('src/components/Layout.tsx', content);

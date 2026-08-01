const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace("const Budgets = lazy(() => import('./pages/Budgets'));\n", "");
content = content.replace("<Route path=\"/budgets\" element={<SecurityGuard><Budgets /></SecurityGuard>} />\n", "");

fs.writeFileSync('src/App.tsx', content);

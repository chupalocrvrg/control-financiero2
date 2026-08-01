const fs = require('fs');
let file = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

file = file.replace(/if \(backupPin !== profile\?\.pin\) \{/g, 'if (!(await verifyPin(backupPin))) {');

fs.writeFileSync('src/pages/Settings.tsx', file);

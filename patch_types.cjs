const fs = require('fs');
let file = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

file = file.replace(
  /docs\.map\(d => \(\{id: d\.id, \.\.\.d\.data\(\)\}\)\)/g,
  "docs.map(d => ({id: d.id, ...(d.data() as any)}))"
);

fs.writeFileSync('src/pages/Settings.tsx', file);

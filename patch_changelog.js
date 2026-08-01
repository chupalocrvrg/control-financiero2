import fs from 'fs';
const content = fs.readFileSync('src/lib/changelog.ts', 'utf8');
const newEntry = `  {
    version: "4.14.7",
    date: new Date().toISOString(),
    changes: [
      "Se ha silenciado el error inofensivo de permisos al intentar registrar versiones automáticamente por usuarios sin rol de administrador."
    ]
  },
`;
const updatedContent = content.replace('export const staticChangelog: ChangelogRelease[] = [\n', 'export const staticChangelog: ChangelogRelease[] = [\n' + newEntry);
fs.writeFileSync('src/lib/changelog.ts', updatedContent);

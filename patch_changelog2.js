import fs from 'fs';
const content = fs.readFileSync('src/lib/changelog.ts', 'utf8');
const newEntry = `  {
    version: "4.14.8",
    date: new Date().toISOString(),
    changes: [
      "Corrección de visualización en módulo de Cobranzas: Se asegura que se muestren todas las cobranzas de la empresa (sin ocultarlas por inconsistencias de empleados eliminados) y se evita el error de permisos en Firebase al buscar registros globales."
    ]
  },
`;
const updatedContent = content.replace('export const staticChangelog: ChangelogRelease[] = [\n', 'export const staticChangelog: ChangelogRelease[] = [\n' + newEntry);
fs.writeFileSync('src/lib/changelog.ts', updatedContent);

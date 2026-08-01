const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '4.14.0';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

let changelog = fs.readFileSync('src/lib/changelog.ts', 'utf8');
const newLog = `  {
    version: '4.14.0',
    date: new Date().toISOString(),
    changes: [
      'Refactorización profunda del submódulo Empleados integrando la gestión de Presupuestos.',
      'Implementación de nuevos roles para Supervisores de Ventas y Cobranza, con objetivos y metas globales.',
      'Mejoras en el Dashboard de Rendimiento Comercial con tarjetas dinámicas expandibles para vendedores y cobradores.',
      'Paginación implementada en Finanzas (Consultas) y Comercio (Cobranzas).',
      'El Registro de Cobranzas ahora agrupa registros por cobrador en tarjetas expandibles.',
      'Dashboard Bodegueros: visualización de stock real en préstamo en Casas Comerciales y alertas (>=3 uds).',
      'Lógica predictiva y restrictiva para Devoluciones de Casas Comerciales basada en stock real en consignación.',
      'Permiso para cargar, subir o importar foto de perfil (Google/URL/Archivo).',
      'Correcciones de usabilidad en inputs numéricos e inputs en versión móvil.',
    ],
  },
`;
changelog = changelog.replace('export const staticChangelog: ChangelogEntry[] = [', 'export const staticChangelog: ChangelogEntry[] = [\n' + newLog);
changelog = changelog.replace("export const CURRENT_VERSION = '4.13.4';", "export const CURRENT_VERSION = '4.14.0';");
fs.writeFileSync('src/lib/changelog.ts', changelog);

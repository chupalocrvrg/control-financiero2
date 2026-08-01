const fs = require('fs');
let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '4.15.0';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));

let changelog = fs.readFileSync('src/lib/changelog.ts', 'utf8');
const newLog = `  {
    version: '4.15.0',
    date: new Date().toISOString(),
    changes: [
      'Implementación del módulo de configuración de autenticación de dos factores (2FA) en la pestaña Seguridad.',
      'Uso exclusivo de Google Authenticator (TOTP) para el restablecimiento del PIN de acceso en el SecurityGuard.'
    ],
  },
`;
changelog = changelog.replace('export const staticChangelog: ChangelogEntry[] = [', 'export const staticChangelog: ChangelogEntry[] = [\n' + newLog);
changelog = changelog.replace("export const CURRENT_VERSION = '4.14.0';", "export const CURRENT_VERSION = '4.15.0';");
fs.writeFileSync('src/lib/changelog.ts', changelog);

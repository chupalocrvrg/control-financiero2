# Control Financiero 360° - Plataforma de Gestión de Cheques y Finanzas

Control Financiero 360° es una aplicación full-stack moderna y robusta diseñada para el control, registro, conciliación y auditoría de cheques, presupuestos, ventas, cobros y nóminas de empleados. Integra capacidades avanzadas de sincronización fuera de línea (PWA), generación de reportes y análisis predictivo mediante inteligencia artificial.

## 🚀 Arquitectura del Sistema

El proyecto sigue una arquitectura híbrida optimizada para el rendimiento y la seguridad:

- **Frontend (Cliente):** Escrito en **React 19**, utilizando **TypeScript** y empaquetado mediante **Vite**. La interfaz está estilizada con **Tailwind CSS**, ofreciendo un diseño responsivo adaptado tanto a computadoras de escritorio como a dispositivos móviles.
- **Backend (Servidor):** Un servidor **Express** (`server.ts`) que maneja las solicitudes API seguras, gestiona la integración con la API de Gemini, procesa la sincronización con Firebase Admin y protege las claves de API sensibles para que nunca queden expuestas en el navegador.
- **Base de Datos y Seguridad:** Utiliza **Firebase Firestore** para persistencia en tiempo real y **Firebase Authentication** para la gestión de usuarios. La seguridad de la base de datos está regida por políticas estrictas en `firestore.rules`.

---

## 🔒 Modelo de Seguridad y Roles de Usuario

Para proteger la información financiera y cumplir con las mejores prácticas de seguridad, el sistema implementa un control de acceso basado en el rol del usuario:

### 1. Roles y Permisos (Custom Claims)
En lugar de depender exclusivamente de correos electrónicos fijos en el cliente, el sistema utiliza **Custom Claims de Firebase Auth** y validaciones directas en Firestore:
- **SUPERADMIN / ADMIN:** Cuenta con acceso de lectura y escritura global. Se le asigna el claim `{ admin: true, role: 'SUPERADMIN' }` de forma segura en el backend (`server.ts`) al registrarse o loguearse por primera vez.
- **USER:** Solo puede ver, crear o modificar sus propios datos (cheques, facturas, beneficiarios, etc.).

### 2. Reglas de Acceso a Firestore (`firestore.rules`)
Las colecciones críticas (`checks`, `invoices`, `beneficiaries`) están protegidas a nivel de documento mediante la regla `isOwnerOrAdmin`:
```javascript
match /checks/{id} {
  allow read: if isVerified() && (resource.data.userId == request.auth.uid || isAdmin());
  allow write: if isVerified() && (resource.data.userId == request.auth.uid || isAdmin());
}
```
*Nota:* El método de verificación requiere que los usuarios tengan su correo electrónico verificado (`email_verified == true`) para prevenir accesos no autorizados mediante cuentas falsas.

---

## 📦 Sincronización y Caché Offline (PWA)

La aplicación está configurada como una Progressive Web App (PWA) de alto rendimiento:
- **Caché Multitestaña Moderno:** Implementa `persistentLocalCache` y `persistentMultipleTabManager` de Firestore para compartir datos de manera local entre múltiples pestañas abiertas, reduciendo las llamadas a la base de datos y garantizando la fluidez offline sin el error de bloqueo "failed-precondition".
- **Fragmentación Manual de Código:** Vite y Rollup segmentan las librerías más pesadas (`firebase`, `lucide-react`, `recharts` y `d3`) en fragmentos individuales para que la PWA cargue de manera casi instantánea en conexiones móviles.

---

## 🛠️ Configuración y Variables de Entorno

Declara las siguientes variables en tu archivo `.env` o en el panel de configuración de tu plataforma de despliegue:

```env
# Configuración del Cliente (Vite)
VITE_SUPER_ADMIN_EMAIL=admin@tusistema.com
VITE_SUPER_ADMIN_EMAILS=superadmin@tusistema.com,otro_admin@tusistema.com

# Claves Privadas de Backend (Exclusivamente del Servidor)
GEMINI_API_KEY=tu_clave_de_gemini_aqui
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@project.iam.gserviceaccount.com
```

---

## 🚀 Despliegue Dual (Servidor Tradicional vs Serverless)

El proyecto soporta dos metodologías de despliegue según tus necesidades de infraestructura:

### Opción A: Servidor Tradicional Node.js (Recomendado para Máxima Velocidad)
Ideal para VPS, Docker o plataformas que soportan contenedores persistentes como Cloud Run:
1. Compila el cliente y empaqueta el servidor con esbuild:
   ```bash
   npm run build
   ```
   Esto compila el backend TypeScript en un solo archivo compatible: `dist/server.cjs`.
2. Inicia el servidor de producción:
   ```bash
   npm run start
   ```

### Opción B: Despliegue Serverless en Vercel
Para desplegar de manera gratuita y automática en Vercel, el proyecto incluye un archivo `vercel.json` configurado para enrutar las solicitudes de frontend a través de la SPA y las llamadas `/api/*` hacia funciones Serverless de Express.
1. Conecta tu repositorio de GitHub a Vercel.
2. Configura las variables de entorno correspondientes.
3. Vercel detectará el archivo de configuración y desplegará la applet de manera óptima.

---

## 🧪 Pruebas Automatizadas y Calidad

El sistema cuenta con una suite de pruebas automatizadas con **Vitest** para garantizar que los cálculos matemáticos (como la división exacta de cuotas con algoritmo de Penny Drop) y los formateadores no sufran regresiones:

- **Ejecutar Pruebas de Unidad:**
  ```bash
  npm run test
  ```
- **Verificación de Tipos y Linter:**
  ```bash
  npm run lint
  ```

---

## 📄 Licencia y Contribuciones

Desarrollado para la automatización financiera inteligente con soporte de PWA y analítica integrada.

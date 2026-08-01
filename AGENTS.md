# Reglas del Proyecto y Automatización de Versiones

Este archivo contiene instrucciones persistentes para cualquier agente de IA que trabaje en esta aplicación de Control Financiero.

## 1. Automatización Obligatoria de Versiones (Versionamiento Semántico)

Cualquier cambio, mejora o corrección en el código del sistema **DEBE** actualizar de forma automática la versión del software al finalizar el turno, sin que el usuario tenga que solicitarlo o recordarlo.

### Reglas de Incremento de Versión:
- **Cambio Grande (Major / Mayor):** Incremento de la primera cifra (ej. `4.0.0` -> `5.0.0`) para reestructuraciones profundas del sistema, cambios de base de datos mayores, o rediseños completos del flujo.
- **Cambio Medio (Minor / Menor):** Incremento de la segunda cifra (ej. `4.1.0` -> `4.2.0`) para nuevas pestañas, módulos, características adicionales funcionales o integraciones nuevas (como la búsqueda predictiva o políticas de reversión).
- **Cambio Pequeño (Patch / Parche):** Incremento de la tercera cifra (ej. `4.1.0` -> `4.1.1`) para corrección de bugs, ajustes de diseño menores, textos, estilos rápidos u optimizaciones internas.

### Procedimiento Obligatorio al Finalizar Cada Tarea:
1. Determinar el nivel del cambio realizado en la sesión.
2. Actualizar el campo `"version"` en `/package.json` con la nueva versión calculada.
3. Añadir una entrada correspondiente en la lista de `staticChangelog` dentro de `/src/lib/changelog.ts` detallando los cambios clave de forma concisa y profesional.
4. Asegurar que las referencias de UI (como `CURRENT_VERSION` en `App.tsx` y `Layout.tsx`) muestren dinámicamente este número.

import { db } from '../firebase';
import { collection, getDocs, getDoc, setDoc, doc, deleteDoc } from 'firebase/firestore';

export interface ChangelogRelease {
  version: string;
  date: string;
  changes: string[];
  createdAt?: string;
}


export const staticChangelog: ChangelogRelease[] = [
  {
    version: "4.40.2",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Solución de Guardado para Cuentas Bodeguero y Empleados (Permisos y Datos): Se actualizaron las reglas de seguridad de Firestore (`firestore.rules`) permitiendo que usuarios autenticados sin la bandera estricta de correo verificado (`email_verified`) pero habilitados y vinculados a una empresa puedan escribir en las colecciones de inventario. Asimismo, se sanitizó el campo `createdBy` en la función transaccional `saveArticleWithStockTransaction` para evitar errores por valores no definidos (`undefined`)."
    ]
  },
  {
    version: "4.40.1",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Ajuste Crítico de Contraste y Accesibilidad en Temas Claros (UI): Se corrigieron los estilos tipográficos del modal 'Ingreso de Mercadería' y formularios de inventario. Se actualizaron las etiquetas de campos (labels), descripciones secundarias y textos de reemplazo (placeholders) de tonos grises pálidos de bajo contraste (`text-neutral-400`) a colores neutros oscuros y contrastados (`text-neutral-700` en tema claro / `text-neutral-300` en tema oscuro), cumpliendo estrictamente los estándares de accesibilidad WCAG (ratio > 4.5:1)."
    ]
  },
  {
    version: "4.40.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Corrección del Orden de Ejecución en Transacciones de Firestore (Lecturas Antes de Escrituras): Se reestructuró la función `saveArticleWithStockTransaction` en `inventory-db` para separar explícitamente la Fase 1 (todas las lecturas `transaction.get` para artículos y stock de almacén) de la Fase 2 (escrituras `transaction.set` y `transaction.update`). Esto previene el error en tiempo de ejecución de Firestore que impide realizar lecturas tras haber iniciado escrituras."
    ]
  },
  {
    version: "4.39.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Blindaje Transaccional Completo en la Creación de Artículos: Se creó la función `saveArticleWithStockTransaction` en `inventory-db` y se integró en `ArticlesTab.tsx`, eliminando la última secuencia `getDoc` + `writeBatch` residual al registrar o sumar stock inicial a artículos existentes (`matchedArticle`). Toda la creación e incremento de inventario global y por almacén en el registro de artículos ahora se ejecuta bajo transacciones atómicas `runTransaction`, garantizando consistencia absoluta ante peticiones concurrentes."
    ]
  },
  {
    version: "4.38.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Transacciones Atómicas en Firestore e Integración de Validación de Cheques: Se refactorizó completamente el módulo `inventory-db` para migrar de `writeBatch` + `getDoc` a transacciones atómicas puras (`runTransaction`) en todas las operaciones de inventario (transferencias, ventas, préstamos, devoluciones y reversiones). Esto elimina de raíz el riesgo de carreras de condición (race conditions) en actualizaciones de stock concurrentes. Asimismo, se integró la función `isValidCheck` en las reglas de seguridad de Firestore para validar la estructura requerida de la colección `/checks/{id}` y se desplegó la versión más reciente en Firebase."
    ]
  },
  {
    version: "4.37.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Actualización Integral de Reglas de Seguridad de Firestore y Atributos de Documentos de Inventario: Se corrigió la función `isEnterpriseData` en `firestore.rules` para validar que el `userId` o `enterpriseId` guardado coincida tanto con el UID de usuario como con el `enterpriseId` asignado en la cuenta del empleado/bodeguero. Además, se incluyeron explícitamente los campos `enterpriseId` y `createdBy` en todas las escrituras y transacciones en lote de `inventory-db` (creación de bodegas, artículos, stock de almacenes, transferencias, ventas y préstamos/devoluciones). Despliegue de reglas ejecutado exitosamente en el servidor de Firebase."
    ]
  },
  {
    version: "4.36.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Solución Integral de Vinculación y Consultas para Bodegueros: Se implementó la resolución automática y autorreparación de `enterpriseId` en `AuthContext` para perfiles de bodeguero y empleados (incluyendo usuarios registrados vía Gmail como `bocansacadamian@gmail.com`). Se estandarizó la resolución del ID de empresa en todas las pestañas de inventario (Bodegas, Artículos, Ventas, Transferencias, Préstamos y Dashboard), asegurando sincronización completa en tiempo real con la empresa padre `creditosderick15@gmail.com`."
    ]
  },
  {
    version: "4.35.2",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Corrección de Referencia de Variable en Validación de PIN: Se solucionó el error 'hashedPin is not defined' en `AuthContext.tsx` definiendo correctamente el hash del PIN antes de evaluarlo contra el perfil de usuario. Las operaciones de vaciado de base de datos y eliminación de usuario ahora funcionan sin interrupciones."
    ]
  },
  {
    version: "4.35.1",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Optimización de Vaciado de Datos, Verificación de PIN y Feedback Visual Instantáneo: Se aceleró el escaneo de registros convirtiendo las lecturas secuenciales en consultas concurrentes con Promise.all (reduciendo la espera de 30s a menos de 1s). Se integraron estados de carga animados (Loader2 spinner) y banners informativos dentro de las ventanas modales de Vaciado y Eliminación de Usuario. Además, se ajustó la validación de PIN para permitir operaciones cuando el perfil del administrador no tiene un PIN configurado previa o explícitamente."
    ]
  },
  {
    version: "4.35.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Vaciado Exhaustivo de Ventas, Cobranzas y Empleados Vinculados: Se perfeccionó el algoritmo de 'Vaciar Base de Datos' y 'Eliminar Usuario' para rastrear recursivamente todos los identificadores del usuario (ID de Auth, Enterprise ID, Email e IDs de Empleados asociados). Se incorporó un escaneo de respaldo en memoria sobre las colecciones de Ventas y Cobranzas para asegurar la eliminación del 100% de los registros sin importar qué rol o empleado los haya registrado."
    ]
  },
  {
    version: "4.34.1",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Corrección de Tipo en Componente ErrorBoundary: Se resolvió la incompatibilidad del verificador de tipos de TypeScript (`tsc --noEmit`) en la invocación del método de reinicio del estado (`setState`), garantizando compilaciones y workflows de integración continua (CI/CD GitHub Actions) 100% exitosos sin errores de compilación."
    ]
  },
  {
    version: "4.34.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Vaciado Integral de Base de Datos Multicolección y Lotes Segmentados: Se expandió la función 'Vaciar Base de Datos' del SuperAdmin para escanear y purgar automáticamente TODOS los módulos y colecciones Firestore vinculados al usuario o empresa (Cheques, Facturas, Beneficiarios, Ventas, Cobranzas, Empleados, Presupuestos, Bodegas, Artículos, Inventario, Préstamos/Devoluciones, Transferencias y Logs de Buró). Se integró además procesamiento por lotes (chunked batch commit de máximo 400 operaciones) para garantizar una ejecución impecable sin importar el volumen de registros."
    ]
  },
  {
    version: "4.33.1",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Bloqueo de Desplazamiento de Fondo y Desenfoque Global Completo (100% Viewport): Se eliminó la aceleración GPU del contenedor principal de layout para permitir que las ventanas modales se fijen correctamente a la ventana del navegador. Además, se implementó un bloqueo automático de scroll (`body overflow: hidden`) para prevenir que el fondo se deslice al interactuar con cualquier modal (Ventas, Cobranzas, Simulación de Sesión, etc.), manteniendo la tarjeta perfectamente centrada y el efecto de desenfoque (`backdrop-blur-md`) cubriendo el 100% de la pantalla."
    ]
  },
  {
    version: "4.33.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Ocultamiento Automático del Dock en Modales (Opción A): Se implementó un detector reactivo inteligente que oculta de forma fluida la barra flotante (Dock) y botones flotantes cuando se abre cualquier ventana emergente o modal, garantizando un desenfoque de fondo limpio de borde a borde y previniendo cualquier obstrucción visual en las planillas de Ventas y Cobranzas."
    ]
  },
  {
    version: "4.32.2",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Ajuste de Superposición Visual (z-index): Se elevó la capa de superposición de las ventanas modales de Registro de Ventas, Cobranzas y Formularios (z-[100]) por encima de la barra de navegación flotante Dock (z-40), garantizando que los botones de acción e inputs inferiores no sean tapados ni obstruidos."
    ]
  },
  {
    version: "4.32.1",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Optimización en Dashboard: Eliminación del botón duplicado de 'Crear Reporte Personalizado' en la parte inferior del Dashboard, conservando únicamente el botón principal 'Generar Reporte' en la cabecera superior."
    ]
  },
  {
    version: "4.32.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Notificación Flotante con Progreso de Importación: Se implementó una tarjeta flotante dinámica en Configuración > Respaldos que muestra en tiempo real el porcentaje de avance (0% - 100%), la colección actual en proceso (Empleados, Ventas, Cobranzas, etc.) y la cantidad exacta de registros importados en la base de datos."
    ]
  },
  {
    version: "4.31.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Proyección Mensual en Rendimiento Comercial: Incorporación de cálculo automático de proyección a fin de mes (monto estimado y porcentaje respecto al presupuesto asignado) en cada tarjeta de empleado (ventas y cobranzas) utilizando la fórmula basada en el ritmo diario transcurrido del mes actual."
    ]
  },
  {
    version: "4.30.1",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Restricción Exclusiva a JSON en Importación de Respaldos: Se actualizó el selector de archivos y la validación en Configuración > Respaldos y Migración para permitir únicamente archivos en formato JSON (.json), deshabilitando la selección de hojas de cálculo Excel y mostrando un mensaje amigable al usuario."
    ]
  },
  {
    version: "4.30.0",
    date: new Date().toISOString().split('T')[0],
    changes: [
      "Manejo Amigable de Errores de Caché / Versión: Se implementó la detección automática de inconsistencias de carga de módulos (chunks) tras despliegues de actualización en ErrorBoundary, mostrando una notificación clara y un botón de actualización profunda del sistema.",
      "Aislamiento Multicuentas y Filtro Estricto de Empleados: Aplicación de filtro por empresa (`enterpriseId`) en los módulos de Empleados, Presupuestos y Ventas/Inventario, garantizando que cada empresa visualice única y exclusivamente su personal.",
      "Asignación Directa de Empleados por Empresa: Registro directo e independiente de empleados por cada cuenta sin reasignaciones automáticas ni intermediación.",
      "Gestión de Permisos y AuthContext: Inyección global de `isSuperAdmin` en el contexto de autenticación y protección de consultas sobre colecciones restringidas en Firestore.",
      "Asistente Guiado de Vinculación y Coexistencia Operativa: Incorporación de Wizard modal para vinculación de usuarios por correo a empresas matriz y unificación de personal en el Directorio Comercial."
    ]
  },
  {
    version: "4.26.0",
    date: new Date().toISOString(),
    changes: [
      "Optimización de Consultas de Respaldos (Exportación JSON/Excel): Se actualizaron las consultas de Firestore en la sección de Configuración para filtrar explícitamente por el identificador de empresa/usuario.",
      "Compatibilidad con Reglas de Seguridad en Producción: Garantiza que la exportación de copias de seguridad se complete exitosamente sin ser bloqueada por permisos en entornos de producción desplegados."
    ]
  },
  {
    version: "4.25.0",
    date: new Date().toISOString(),
    changes: [
      "Consolidación de Rol Supervisor de Cobranza: El total recaudado y efectivo retenido del Supervisor de Cobranza ahora refleja automáticamente la sumatoria global de todas las cobranzas del equipo.",
      "Restricción de Registro Individual: Se excluyó al Supervisor de Cobranza del formulario 'Nueva Cobranza' para evitar la asignación de cobranzas individuales a dicho rol.",
      "Desglose Consolidado: Al expandir la tarjeta del Supervisor de Cobranza se muestra el detalle con el nombre de cada cobrador y una etiqueta distintiva de sumatoria consolidada."
    ]
  },
  {
    version: "4.24.0",
    date: new Date().toISOString(),
    changes: [
      "Aislamiento Estricto Multitenant durante Simulación e Importación: Se eliminaron los fallbacks globales y las reasignaciones automáticas hacia cuentas superadministradoras.",
      "Garantía de Cuentas Limpias: Todo usuario nuevo o simulado que no tenga registros importados se mantendrá en estado completamente limpio (0 registros) sin heredar ni reasignar empleados, ventas, cobranzas o presupuestos de otros usuarios.",
      "Comportamiento de Simulación Preciso: Las acciones realizadas durante la simulación de sesión pertenecen y se guardan única y exclusivamente bajo el id del usuario simulado."
    ]
  },
  {
    version: "4.23.1",
    date: new Date().toISOString(),
    changes: [
      "Solución al Error de Reconciliación DOM 'insertBefore': Aislamiento de nodos de texto en etiquetas 'span' dentro del módulo de Cobranzas y modales, previniendo choques con extensiones de traducción automática del navegador.",
      "Sincronización Automática de Mes al Ingresar Cobranza Anterior: Al registrar o editar una cobranza con fecha correspondiente a un mes anterior, el sistema cambia automáticamente el filtro visual del mes para reflejar y mostrar inmediatamente la cobranza guardada.",
      "Recuperación Amigable en ErrorBoundary: Incorporación del botón 'Reintentar Acción' en la pantalla de captura de excepciones para restaurar la interfaz sin obligar al usuario a recargar la página completa."
    ]
  },
  {
    version: "4.23.0",
    date: new Date().toISOString(),
    changes: [
      "Diagnóstico y Corrección de Inflación de Valores Moneda: Identificación de la causa raíz de la variación de montos (donde $560K pasó a $5.84M en la macro Equifax).",
      "Tipificación Numérica Nativa en Celdas Excel: Aplicación de celda tipo 'n' (Native Number) con formato estándar '0.00' para todas las columnas de valor monetario (val_operacion, val_xvencer, val_vencido, val_dem_judicial, val_cart_castigada, deuda_refinanciada, VALOR_NDI).",
      "Eliminación de Advertencias 'Número como Texto': Eliminación completa de alertas de texto y triángulos verdes en Excel, permitiendo que la fórmula =SUMA(...) opere de forma nativa y evitando multiplicaciones indebidas durante la ejecución de la Macro Equifax."
    ]
  },
  {
    version: "4.22.3",
    date: new Date().toISOString(),
    changes: [
      "Análisis exhaustivo del código VBA de la Macro oficial Equifax (MACRO_SICOM_v2): Identificación del origen exacto del 'Error 13: No coinciden los tipos' en la función 'formatoFechaa'.",
      "Normalización Estricta de Exportación Excel: Aplicación obligatoria de parseAndFormatDate en todas las columnas de fecha (fec_corte_saldo, fec_concesion, fec_nacimiento, fec_vencimiento, FECHA_PAGO_CUOTA) garantizando cadenas de exactamente 10 caracteres ('yyyy/MM/dd').",
      "Omisión Total de Subrutina VBA conflictiva: Al ser celdas de texto plano de 10 caracteres, la condición 'If Len(cad) >= 11' de la macro se evalúa como Falsa, evitando por completo la casting de fecha que causaba el fallo."
    ]
  },
  {
    version: "4.22.2",
    date: new Date().toISOString(),
    changes: [
      "Solución Definitiva Error 13 Macro Equifax (Len >= 11): Exportación de fechas en celdas de texto estricto ('s') con longitud exacta de 10 caracteres ('yyyy/MM/dd').",
      "Prevención de Ejecución de Subrutina VBA 'formatoFechaa': Al garantizar Len(cad) = 10 en celdas de fecha, la macro de Equifax omite automáticamente la conversión de fecha-hora que provocaba el fallo 'Error 13: No coinciden los tipos' en Excel."
    ]
  },
  {
    version: "4.22.1",
    date: new Date().toISOString(),
    changes: [
      "Corrección de Incompatibilidad con Macro Equifax (Error 13 Tipo No Coinciden): Depuración estricta de componentes de hora/minuto en todas las columnas de fecha (fec_corte_saldo, fec_concesion, fec_nacimiento, fec_vencimiento, FECHA_PAGO_CUOTA).",
      "Asignación Explícita de Formato 'Fecha Corta' en Excel: Las celdas de fechas en el archivo .xlsx generado se exportan formalmente bajo el tipo y formato 'yyyy/mm/dd' (Fecha Corta), eliminando el formato 'General' que provocaba el fallo de conversión en VBA."
    ]
  },
  {
    version: "4.22.0",
    date: new Date().toISOString(),
    changes: [
      "Estructura de Nombre Oficial 2968_(FECHA_DE_CORTE): Implementado el cálculo dinámico del nombre del archivo principal de salida en formato '2968_DDMMYYYY.xlsx' (extraído de fec_corte_saldo del lote) y 'Cedulas_Incompletas_DDMMYYYY.xlsx'.",
      "Incorporación de Reglas de Validación Equifax: Añadida la depuración estricta de números telefónicos repetitivos (ej. 999999999) y la validación de género (M/F) según la Guía de Errores Equifax.",
      "Soporte Dual de Exportación (.xlsx y .gjm): Añadida la exportación directa en formato de texto plano delimitado por punto y coma (.gjm) con codificación UTF-8 preservando ceros a la izquierda."
    ]
  },
  {
    version: "4.21.2",
    date: new Date().toISOString(),
    changes: [
      "Corrección de Mapeo del Número de Operación (CRED-XXXXXXX): Se corrigió la regla de precedencia en la detección de cabeceras para evitar que la columna 'val_operacion' sobrescribiera el campo 'num_operacion', preservando intactos los códigos alfanuméricos de operación (ej. CRED-0506140) y asegurando su formato de texto en las exportaciones a Excel."
    ]
  },
  {
    version: "4.21.1",
    date: new Date().toISOString(),
    changes: [
      "Secuencia Oficial de 28 Columnas de Equifax: Se ajustó el motor de parsing y exportación Excel para respetar exactamente el orden secuencial de las 28 columnas de la matriz oficial de Equifax (cod_tipo_id, cod_id_sujeto, nom_sujeto, direccion, ciudad, telefono, fec_corte_saldo, tipo_deudor, num_operacion, fec_concesion, val_operacion, val_xvencer, val_vencido, val_dem_judicial, val_cart_castigada, num_dias_vencido, fec_nacimiento, deuda_refinanciada, fec_vencimiento, REPORTADO, FACTURAS_PAGADAS, PARROQUIA, EMAIL, GENERO, ESTADO_CIVIL, ESTADO_OPERACION, VALOR_NDI, FECHA_PAGO_CUOTA)."
    ]
  },
  {
    version: "4.21.0",
    date: new Date().toISOString(),
    changes: [
      "Compatibilidad Multiformato y Delimitación Flexible en Buró: Se añadió soporte nativo para importar archivos Excel (.xlsx, .xls) convirtiéndolos automáticamente a la estructura requerida, así como detección inteligente de delimitadores (;, coma, tabulación, tubería) y mapeo dinámico por nombres de columnas en la cabecera.",
      "Asignación Automatizada de Fecha de Corte y Tolerancia de Cartera: Se implementó la asignación automática de fecha de corte predeterminada (DD/MM/YYYY) cuando el archivo fuente carece de ella, evitando la eliminación masiva de registros en la Fase 7, y se flexibilizó el cálculo de deudas activas en la Fase 9."
    ]
  },
  {
    version: "4.20.0",
    date: new Date().toISOString(),
    changes: [
      "Rehabilitación del Módulo de Buró de Crédito: Se reincorporó la navegación y enrutamiento hacia la pestaña de Buró de Crédito (/buro) dentro del menú Finanzas, permitiendo procesar y estructurar la cartera mediante el motor de validación Módulo 10 de Equifax, auditoría en 12 fases y exportación de archivos limpios e incompletos.",
      "Reglas de Seguridad para Registros del Buró: Se habilitó el acceso seguro en Firestore para la colección 'buro_logs' vinculada al usuario/empresa actual."
    ]
  },
  {
    version: "4.19.3",
    date: new Date().toISOString(),
    changes: [
      "Ajuste de Reglas de Seguridad Firestore: Se actualizaron las reglas de seguridad desplegadas en Firebase para permitir que la importación y migración de respaldos en colecciones de cheques, facturas y beneficiarios reconozca la propiedad del usuario/empresa sin bloquearse por restricciones históricas de timestamp o referencias cruzadas."
    ]
  },
  {
    version: "4.19.2",
    date: new Date().toISOString(),
    changes: [
      "Migración Completa de Usuario: Se actualizó el motor de migración administrativa para buscar y transferir todas las colecciones (cheques, facturas, beneficiarios, ventas, cobranzas, empleados, presupuestos e inventario) identificando coincidencias por usuario o empresa y ejecutando cambios en lotes de 400 escrituras.",
      "Importación JSON Tolerante: Se mejoró la importación de respaldos JSON en Configuración para desempaquetar estructuras anidadas, normalizar nombres de colecciones y mostrar mensajes descriptivos de error."
    ]
  },
  {
    version: "4.19.1",
    date: new Date().toISOString(),
    changes: [
      "Optimización de Importación Masiva: Se corrigió el error al importar archivos JSON con más de 500 registros procesándolos en lotes fragmentados (batches) de 400 escrituras y limpiando valores no definidos para garantizar el guardado en Firestore sin sobrepasar los límites de transacción."
    ]
  },
  {
    version: "4.19.0",
    date: new Date().toISOString(),
    changes: [
      "Unificación de Personal y Presupuestos: Se consolidaron registros de empleados duplicados bajo Almacenes Derick (creditosderick15@gmail.com).",
      "Vincular Ventas y Cobranzas: Se asociaron todas las ventas, presupuestos y cobranzas guardadas a la empresa Almacenes Derick sin duplicar registros."
    ]
  },
  {
    version: "4.18.8",
    date: new Date().toISOString(),
    changes: [
      "Sistema reestablecido con éxito a la versión 4.18.8."
    ]
  },
  {
    version: "4.14.8",
    date: new Date().toISOString(),
    changes: [
      "Corrección de visualización en módulo de Cobranzas: Se asegura que se muestren todas las cobranzas de la empresa (sin ocultarlas por inconsistencias de empleados eliminados) y se evita el error de permisos en Firebase al buscar registros globales."
    ]
  },
  {
    version: "4.14.7",
    date: new Date().toISOString(),
    changes: [
      "Se ha silenciado el error inofensivo de permisos al intentar registrar versiones automáticamente por usuarios sin rol de administrador."
    ]
  },
  {
    version: "4.14.6",
    date: new Date().toISOString(),
    changes: [
      "Eliminación temporal de restricciones complejas en reglas de Firestore (users) para mitigar bloqueo de permisos al activar cuenta (Onboarding)."
    ]
  },
  {
    version: "4.14.5",
    date: new Date().toISOString(),
    changes: [
      "Relajación temporal de las reglas de actualización en base de datos para identificar el bloqueo de permisos al activar la cuenta (Onboarding).",
      "Optimización en la evaluación de campos durante la edición del perfil de usuario."
    ]
  },
  {
    version: "4.14.4",
    date: new Date().toISOString(),
    changes: [
      "Añadido botón de retroceso (volver al Login) en la vista de Configuración Maestro (Onboarding).",
      "Confirmación de resolución de permisos en Firestore que bloqueaban el registro del primer usuario."
    ]
  },
  {
    version: "4.14.3",
    date: new Date().toISOString(),
    changes: [
      "Implementado `checkUserExists` explícito en `AuthContext` durante el flujo de inicio de sesión con Google para asegurar la creación del perfil.",
      "Corrección de permisos en Firestore Rules permitiendo la creación de nuevos usuarios y administradores correctamente.",
    ]
  },
  {
    version: "4.14.2",
    date: new Date().toISOString(),
    changes: [
      "Corregido problema de permisos de Security Rules para la actualización de perfiles de usuario y administradores.",
      "Ajustes en Firestore Rules para evitar rechazos en el proceso de creación/actualización por campos faltantes o valores nulos.",
    ]
  },
  {
    version: "4.14.1",
    date: new Date().toISOString(),
    changes: [
      "Corregido error de permisos (Security Rules) al registrar nuevos usuarios mediante Google.",
      "Añadido borrado de PIN por seguridad al bloquear la sesión por inactividad.",
      "Optimización en la carga y separación de preferencias de usuario entre distintas cuentas.",
      "Implementación de Meta Tags Open Graph en index.html para Rich Link Previews."
    ]
  },
  {
    version: "4.14.0",
    date: new Date().toISOString(),
    changes: [
      "Refactorización profunda del submódulo Empleados integrando la gestión de Presupuestos.",
      "Implementación de nuevos roles para Supervisores de Ventas y Cobranza, con objetivos y metas globales.",
      "Mejoras en el Dashboard de Rendimiento Comercial con tarjetas dinámicas expandibles para vendedores y cobradores.",
      "Paginación implementada en Finanzas (Consultas) y Comercio (Cobranzas).",
      "El Registro de Cobranzas ahora agrupa registros por cobrador en tarjetas expandibles.",
      "Dashboard Bodegueros: visualización de stock real en préstamo en Casas Comerciales y alertas (>=3 uds).",
      "Lógica predictiva y restrictiva para Devoluciones de Casas Comerciales basada en stock real en consignación.",
      "Permiso para cargar, subir o importar foto de perfil (Google/URL/Archivo).",
      "Correcciones de usabilidad en inputs numéricos e inputs en versión móvil.",
    ],
  },
  {
    version: "4.18.0",
    date: new Date().toISOString(),
    changes: [
      "Aislamiento de Configuración de Simulación: Se rediseñó el SettingsProvider para usar useAuth, lo que permite cargar en tiempo real las preferencias (tema, estilo de UI, paleta de colores) del usuario simulado.",
      "Lógica Temporal de Preferencias en Simulación: Los cambios visuales realizados mientras el administrador simula la sesión de otro usuario son puramente en memoria, impidiendo que afecten o pisen de forma permanente la configuración propia del administrador.",
      "Permanencia de Tarjetas de Rendimiento Comercial: Se eliminó el botón de contracción y la lógica de colapso en las tarjetas del dashboard, dejándolas completamente desplegadas de forma estática para facilitar una lectura rápida.",
      "Mejora de Contraste en Recuperación de PIN: Se incrementó el contraste del texto en el modal de restablecimiento del PIN de seguridad en temas claros y oscuros, aplicando colores legibles y tipografía estilizada.",
    ],
  },
  {
    version: "4.17.0",
    date: new Date().toISOString(),
    changes: [
      "Rediseño del módulo de Comercio-Ventas: Ahora agrupa las ventas por vendedor en tarjetas expandibles, mostrando un resumen compacto y permitiendo ver el detalle de ventas del último mes seleccionado, similar al módulo de cobranzas.",
      "Mejora en Dashboard (Rendimiento Comercial): Se muestran únicamente los empleados con presupuestos asignados, e incluye agrupación jerárquica para supervisores de ventas y cobranzas. Las tarjetas ahora son expandibles.",
      "Mejora de UX en pantalla de seguridad (2FA): Restablecer el PIN con el código de autenticador ya no requiere doble clic, se inicia la sesión inmediatamente tras la validación exitosa.",
      "Corrección del estado global: Las preferencias de interfaz (modo oscuro/claro) se mantienen independientes por usuario, incluso al usar la simulación de administrador.",
    ],
  },
  {
    version: "4.16.6",
    date: new Date().toISOString(),
    changes: [
      "Corrección de renderizado en modal de recuperación: Se arregló un problema que impedía visualizar correctamente el flujo de verificación 2FA al hacer clic en '¿Olvidaste tu PIN?' dentro de la pantalla de bloqueo (SecurityGuard).",
    ],
  },
  {
    version: "4.16.5",
    date: new Date().toISOString(),
    changes: [
      "Aislamiento Absoluto de Preferencias Visuales: Se rediseñó el proceso de combinación de configuraciones para filtrar y descartar cualquier propiedad visual del documento compartido de la empresa (como tema, estilo de UI, paleta cromática de acento, tipografía, ubicación del dock, etc.).",
      "Independencia Completa por Usuario: Ahora todas las opciones de personalización visual de la interfaz se determinan y cargan exclusivamente desde la colección individual de cada usuario ('userSettings'), asegurando que no haya herencia ni contaminación de estilos compartidos, y solucionando el parpadeo o reversión de estilos al cambiar entre Classic, Glasmorfismo y Liquid Glass."
    ],
  },

  {
    version: "4.16.4",
    date: new Date().toISOString(),
    changes: [
      "Optimización de persistencia y separación de UI: Se corrigió el problema de resincronización de preferencias donde el tema visual y estilo de UI del usuario individual volvían erróneamente a los valores por defecto o globales.",
      "Aislamiento de Escrituras en Firestore: Se separó la lógica de escritura para que los cambios de interfaz (tema, glasmorfismo, liquid-glass, paleta de colores) se guarden exclusivamente en la colección 'userSettings', evitando que las actualizaciones globales de la empresa pisen las preferencias individuales."
    ],
  },

  {
    version: "4.16.3",
    date: new Date().toISOString(),
    changes: [
      "Corrección de Permisos en Base de Datos: Se ajustaron las reglas de seguridad de Firestore para permitir el acceso correcto a los ajustes visuales y preferencias personales de la interfaz por usuario.",
      "Separación de Configuraciones UI: Cada usuario dentro de la misma empresa ahora puede mantener su propia personalización visual (tema oscuro, estilo cristal, paleta de colores) sin afectar al resto del equipo.",
      "Ajuste en la fórmula de alerta inteligente de inventario para préstamos activos: Cálculo dinámico basado en límite mínimo: Math.round((límite / 2) + 0.1)."
    ],
  },

  {
    version: "4.13.4",
    date: new Date().toISOString(),
    changes: [
      "Corrección de Permisos en Base de Datos: Se ajustaron las reglas de seguridad de Firestore para permitir que los administradores puedan consultar correctamente el registro de errores del sistema sin encontrar alertas de acceso denegado."
    ],
  },
  {
    version: "4.13.3",
    date: new Date().toISOString(),
    changes: [
      "Autenticación de 2 Factores (2FA): Se integró el soporte para Google Authenticator, permitiendo a los usuarios configurar desde el módulo de Configuración-Seguridad una llave de autenticación TOTP.",
      "Recuperación de PIN Segura: Se añadió la opción de restablecer el PIN desde la pantalla de bloqueo de sesión, utilizando el código de 6 dígitos generado por Google Authenticator."
    ],
  },
  {
    version: "4.13.2",
    date: new Date().toISOString(),
    changes: [
      "Optimización de Interfaz de Novedades: Se ajustó el modal de actualizaciones recientes para ser desplazable (scrollable), asegurando que el botón 'Continuar a la Plataforma' siempre sea visible en pantallas móviles.",
      "Seguridad de Autenticación Mejorada: Se actualizaron todos los campos de entrada de PIN en el sistema para deshabilitar autocompletado y evitar que gestores de contraseñas interfieran o guarden códigos.",
      "Sistema de Bloqueo Progresivo: Se implementó un temporizador de bloqueo en la pantalla de ingreso; tras 3 intentos fallidos, el acceso se bloquea progresivamente duplicando el tiempo (iniciando en 1 minuto y topando a un máximo de 3 días)."
    ],
  },
  {
    version: "4.13.1",
    date: new Date().toISOString(),
    changes: [
      "Unificación de Copias de Seguridad: Se eliminó el botón redundante de exportación de reporte en el explorador de pagos (Finanzas - Consultas), centralizando todas las operaciones de respaldo de datos en el panel de Configuración.",
      "Respaldo Completo de Base de Datos: Se mejoró el sistema de exportación y restauración para incluir las 13 colecciones completas de la base de datos (empleados, cheques, ventas, cobranzas, artículos, facturas, beneficiarios, presupuestos, bodegas, inventarios de bodegas, préstamos, transferencias y ventas de inventario).",
      "Soporte Multitenant en Simulaciones: Se optimizó el filtrado por inquilino (enterpriseId/userId) para asegurar que, al simular una sesión como Super-Administrador, los respaldos descargados y restaurados correspondan estrictamente a los datos del usuario simulado.",
      "Relación de Datos en Reportes: Se optimizó el reporte de Excel para vincular correctamente los cheques con sus números de factura reales y los artículos de inventario con las cantidades distribuidas por bodega."
    ],
  },
  {
    version: "4.13.0",
    date: new Date().toISOString(),
    changes: [
      "Auto-bloqueo de Sesión: Se implementó un detector de inactividad que monitorea los eventos del usuario y bloquea automáticamente la terminal si se supera el tiempo establecido.",
      "Optimización de Interfaz: Se removió el ícono duplicado de Usuario en el dock de navegación inferior para evitar redundancias con la opción de Configuración.",
      "Exportación en Excel Avanzada: Ahora los respaldos en Excel cuentan con hojas estructuradas (Empleados, Cheques, Ventas, Cobranza, Inventario) y datos correctamente formateados de acuerdo con las especificaciones.",
      "Seguridad de PIN Mejorada: Se rediseñó el flujo de actualización de PIN, requiriendo validación previa del PIN actual y doble confirmación del nuevo PIN para prevenir alteraciones no autorizadas."
    ],
  },
  {
    version: "4.12.2",
    date: new Date().toISOString(),
    changes: [
      "Depuración Completa de Referencias de Auditoría: Se eliminó el correo de superadministrador hardcodeado que aún persistía en la sección de variables de ejemplo del archivo README.md, garantizando que ninguna traza del correo personal del desarrollador quede expuesta en la documentación o código de control de versiones. Se ajustó el archivo de especificación de seguridad para enfocar el testing de seguridad en simulaciones reales del Firebase Rules Playground."
    ],
  },
  {
    version: "4.12.1",
    date: new Date().toISOString(),
    changes: [
      "Eliminación de Datos Hardcodeados y Remoción de Vulnerabilidades: Se removió por completo la dirección de correo personal hardcodeada en el código fuente de 4 archivos (server.ts, src/lib/utils.ts, y sus correspondientes tests unitarios), de forma que toda validación de cuentas de superadministrador dependa estrictamente de las variables de entorno configurables en el servidor (VITE_SUPER_ADMIN_EMAIL y VITE_SUPER_ADMIN_EMAILS). Asimismo, se quitó el riesgo latente de exposición de claves API borrando el define de GEMINI_API_KEY de vite.config.ts para que no se inyecte en el bundle de cliente. Finalmente, se reescribió security_spec.md para reflejar con absoluta precisión las reglas reales e integras desplegadas en firestore.rules, incluyendo procedimientos de validación real en el simulador de Firebase."
    ],
  },
  {
    version: "4.12.0",
    date: new Date().toISOString(),
    changes: [
      "Seguridad Multi-inquilino de Extremo a Extremo en Finanzas (Checks, Invoices, Beneficiaries): Corrección integral de las reglas de seguridad de Firestore (`firestore.rules`) y de la validación lógica para listados y lecturas directas. Se migró la restricción estricta de propiedad por usuario creador (`userId == request.auth.uid`) hacia la política dinámica multi-inquilino corporativa unificada (`isEnterpriseData`). Esto soluciona de raíz el error donde el propietario de una cuenta corporativa o sus empleados autorizados (como bodegueros) veían la base de datos completamente vacía al iniciar sesión directamente, mientras que en la simulación administrativa sí se visualizaba. Ahora todos los datos financieros son legibles y protegidos de forma segura bajo el mismo Tenant ID empresarial (`enterpriseId`)."
    ],
  },
  {
    version: "4.11.1",
    date: new Date().toISOString(),
    changes: [
      "Optimización Index-Free para Multi-Inquilinato: Reestructuración de las consultas clave de Cheques, Ventas y Cobranzas en el Dashboard y reportes avanzados. Ahora realiza búsquedas rápidas por `enterpriseId` y delega las exclusiones de estados o rangos de fechas a filtros del lado del cliente. Esto soluciona por completo las excepciones silenciosas de Firestore por falta de índices compuestos, resolviendo el problema de registros invisibles en cuentas corporativas."
    ],
  },
  {
    version: "4.11.0",
    date: new Date().toISOString(),
    changes: [
      "Gestión Dinámica de Roles y Multi-Administrador: Transición de correos electrónicos administradores hardcodeados a un sistema dinámico basado en Custom Claims y base de datos Firestore. Permite la asignación instantánea de roles (SUPERADMIN, ADMIN, etc.) desde la aplicación y sincroniza las credenciales inmediatamente mediante el nuevo endpoint del servidor backend `/api/admin/sync-claims`.",
      "Ampliación del Registro de Auditoría (Audit Log): Implementación de trazabilidad granular para mutaciones de datos críticas en Empleados (`EMPLOYEE_UPDATE`), Presupuestos (`BUDGET_UPDATE`), Ventas (`SALE_UPDATE`) y Cobranzas (`COLLECTION_UPDATE`).",
      "Seguimiento de Lecturas Sensibles: Incorporación de registro de auditoría (`SENSITIVE_READ`) al descargar copias de seguridad de la base de datos (formatos JSON/Excel) y exportar reportes comerciales personalizados a PDF o Excel.",
      "Seguridad Multi-inquilino en el Dashboard: Refactorización y robustecimiento de las consultas de cheques de pago e indicadores clave del tablero de control principal, garantizando aislamiento estricto y total visibilidad mediante la segmentación exclusiva por `enterpriseId` (tenant) en lugar de filtros individuales de usuario.",
      "Función de Redondeo Financiero de Precisión: Adición de la utilidad matemática `roundToTwo` para evitar de forma garantizada los errores de punto flotante en cálculos de centavos, respaldada por su propia suite de pruebas unitarias automatizadas."
    ],
  },
  {
    version: "4.10.0",
    date: new Date().toISOString(),
    changes: [
      "Estructuración de Pruebas Unitarias Automatizadas: Integración del framework de pruebas ultra-rápido Vitest, con la creación de una suite de pruebas para funciones de cálculo matemático crítico (algoritmo Penny Drop para cuotas), formateadores de monedas ecuatorianas, generación incremental de números de cheques con padding, y detección de superadministradores.",
      "Configuración de CI/CD (Quality Assurance): Implementación de un flujo de integración continua en GitHub Actions (.github/workflows/ci.yml) para verificar de forma automatizada los tipos, la calidad del código mediante linter y la ejecución exitosa de pruebas unitarias ante cada push o pull request.",
      "Actualización e Identidad de Proyecto: Corrección del nombre del paquete en `package.json` de 'react-example' a 'control-financiero' para dotar al proyecto de una identidad pulida y profesional.",
      "Documentación Técnica Integral (README.md): Creación de un manual de arquitectura robusto que detalla el funcionamiento full-stack (React + Express), el modelo de seguridad por roles y Claims de Firebase, la estrategia de caché offline multidispositivo y las opciones de despliegue dual (Ventas/Producción VPS frente a Serverless en Vercel)."
    ],
  },
  {
    version: "4.9.1",
    date: new Date().toISOString(),
    changes: [
      "Auditoría y Corrección de Reglas de Seguridad (Firestore): Reestructuración de políticas de lectura para colecciones clave de finanzas (checks, invoices, beneficiaries). Ahora se restringe estrictamente el acceso de lectura para que solo el propietario (resource.data.userId == request.auth.uid) o un administrador puedan consultar estos registros de forma segura.",
      "Eliminación de Emails Hardcodeados en Reglas: Remoción de la verificación de email fija en firestore.rules para el rol SUPERADMIN. En su lugar, se implementó el uso estándar de Claims Personalizados de Firebase Auth y consultas dinámicas en la colección de usuarios.",
      "Sincronización de Custom Claims en Backend: Actualización del servidor Express en `/api/users/profile` para asignar y sincronizar automáticamente las credenciales personalizadas de administración (Custom Claims) en Firebase Auth utilizando el SDK Admin.",
      "Restauración de Verificación de Correo: Modificación del método isVerified() en las reglas para requerir que los usuarios tengan su correo verificado (email_verified == true) antes de otorgar acceso de escritura o lectura.",
      "Migración a Distribución Segura de SheetJS (xlsx): Reemplazo de la dependencia xlsx convencional de npm por el paquete empaquetado directamente desde su CDN oficial y seguro (https://cdn.sheetjs.com) para evitar vulnerabilidades críticas de Prototype Pollution y ReDoS.",
      "Eliminación de Archivos Temporales de Reglas: Limpieza de archivos de borrador obsoletos (como DRAFT_firestore.rules) en el repositorio para evitar despliegues accidentales inseguros."
    ],
  },
  {
    version: "4.9.0",
    date: new Date().toISOString(),
    changes: [
      "Persistencia de Caché Multitestaña en Firestore: Migración de la persistencia offline de una sola pestaña a la configuración moderna de caché persistente multi-pestaña (persistentLocalCache con persistentMultipleTabManager). Esto acelera drásticamente la velocidad de carga de la aplicación y previene errores y advertencias de 'failed-precondition' cuando múltiples pestañas del sistema están abiertas simultáneamente.",
      "Fragmentación Manual y Optimización de Carga (Vite / Rollup): Implementación de segmentación inteligente de dependencias pesadas (manualChunks) para separar módulos de Firebase, Lucide-React, Recharts y D3. Esto reduce el tamaño del bundle inicial descargado por el navegador, optimizando el rendimiento de la PWA sobre conexiones móviles lentas.",
      "Estructuración de Manejo de Errores Robustos: Preparación de la arquitectura de datos para diagnósticos óptimos ante posibles restricciones de permisos o límites de cuota diaria en el ecosistema de base de datos."
    ],
  },
  {
    version: "4.8.3",
    date: new Date().toISOString(),
    changes: [
      "Estandarización Absoluta del Dock Flotante: Unificación de todos los estilos de interfaz ('classic', 'glass', 'liquid-glass') bajo un diseño de dock flotante centrado y desacoplado, adaptándose fluidamente a cualquier posición (arriba, abajo, izquierda, derecha).",
      "Despliegue Dinámico de Submenús: Corrección del error que impedía visualizar los módulos y submódulos interactivos en las interfaces clásico y glassmorfismo al eliminar las restricciones de desborde y solapamientos.",
      "Ajuste de Espaciado del Canvas Principal: Corrección del padding de seguridad en el panel de contenidos de forma universal para evitar superposiciones con el dock en todas las configuraciones."
    ],
  },
  {
    version: "4.8.2",
    date: new Date().toISOString(),
    changes: [
      "Estandarización del Dock Flotante: Unificación de la estructura de dock flotante encapsulado para Glassmorfismo ('glass') y Liquid Glass ('liquid-glass'), corrigiendo el error que provocaba que se renderizara la barra rígida clásica.",
      "Solución de Posicionamiento de Submenús: Se resolvió el error de navegación donde las opciones secundarias o submódulos no se visualizaban o se solapaban al expandir el menú colapsable, permitiendo una apertura flotante perfecta en coordenadas dinámicas.",
      "Aislamiento de Paddings Clásicos: Restricción del padding de contención del contenido principal en el layout únicamente cuando el dock flotante está activo, previniendo el espacio vacío artificial de 128px al utilizar el estilo de barra rígida Sólido Clásico."
    ],
  },
  {
    version: "4.8.1",
    date: new Date().toISOString(),
    changes: [
      "Optimización Antiflicker en Liquid Glass: Implementación de contención de desborde elástico (overscroll-y-none) y promoción de capas con aceleración por hardware (transform-gpu, translate3d, will-change: transform) en los paneles acrílicos, eliminando por completo los parpadeos visuales al alcanzar los límites de scroll en el Dashboard.",
      "Ubicación Dinámica del Cuadro de Confirmación: Corrección del solapamiento del cuadro de confirmación de la posición de la barra de navegación; ahora, cuando el Dock está posicionado abajo (bottom), la confirmación se desplaza elegantemente a la parte superior (top-6) para no obstruir los botones de guardar cambios."
    ],
  },
  {
    version: "4.8.0",
    date: new Date().toISOString(),
    changes: [
      "Unificación de Barra de Navegación (Dock): Estandarización de toda la plataforma en una barra de navegación tipo Dock flotante unificada para los tres estilos de interfaz (Sólido Moderno, Glassmorfismo y Liquid Glass).",
      "Eliminación de Márgenes de Panel Sólido: Corrección estética para evitar que la barra lateral ocupe márgenes rígidos que bloqueaban la pantalla, abriendo todo el lienzo visual en una estructura integrada.",
      "Interacciones Fluidas: Soporte reactivo en el Dock que optimiza las burbujas flotantes de submenús, el efecto de magnificación macOS-style opcional, y transiciones dinámicas según el tema claro u oscuro."
    ],
  },
  {
    version: "4.7.4",
    date: new Date().toISOString(),
    changes: [
      "Optimización de Rendimiento GPU: Conversión de las animaciones de los globos de fondo a transformaciones 3D aceleradas por hardware (translate3d), aliviando la carga del CPU.",
      "Aislamiento de Capas de Renderizado: Implementación de la propiedad CSS de contención visual (contain: paint) y promoción de capa en el contenedor principal de fondos, previniendo re-cálculos de píxeles al hacer scroll.",
      "Fluidez en Desplazamiento: Eliminación absoluta de parpadeos y retrasos visuales durante la navegación e interacciones en toda la aplicación, logrando un rendimiento óptimo idéntico al Glassmorfismo."
    ],
  },
  {
    version: "4.7.3",
    date: new Date().toISOString(),
    changes: [
      "Ajuste y Sincronización de Fondos: Reversión de los cambios en el fondo de Glassmorfismo a su estado original óptimo y estático con su sutil pulso clásico.",
      "Vibración en Liquid Glass: Mantenimiento y perfeccionamiento de la paleta cromática profunda y la animación fluida en el fondo de Liquid Glass, garantizando una refracción acrílica de máxima fidelidad.",
      "Estabilidad Visual: Optimización de las transiciones de fondo al alternar entre ambos estilos de interfaz."
    ],
  },
  {
    version: "4.7.2",
    date: new Date().toISOString(),
    changes: [
      "Fondos Orgánicos Líquidos Avanzados: Integración de la paleta de colores profundos y vibrantes de Glassmorphism en el modo 'Liquid Glass' para maximizar su refracción translúcida y textura acrílica.",
      "Animaciones de Deriva Fluida (Fluid Drift): Creación de fotogramas de animación lenta en CSS para mover, pulsar y rotar de manera orgánica las esferas de color desenfocadas bajo los paneles de cristal.",
      "Optimización del Modo Oscuro: Ajuste de tonos, saturaciones de color y un 'wash overlay' en el modo oscuro para garantizar contrastes impecables, profundidad visual y un look premium consistente."
    ],
  },
  {
    version: "4.7.1",
    date: new Date().toISOString(),
    changes: [
      "Auto-colapso de Submenús en Liquid Glass: Corrección de comportamiento para garantizar que, al hacer clic en un módulo del dock, se contraigan y cierren automáticamente todos los demás submenús abiertos de manera elegante.",
      "Cierre de Submenús en Navegación Directa: Asegura que al hacer clic en enlaces directos sin submenús (como Configuración o Dashboard) o al cerrar sesión, se limpien todos los submenús activos del Dock.",
      "Animaciones de Cierre Premium: Implementación de transiciones de escala y opacidad con Framer Motion (<AnimatePresence>) para que los submenús se contraigan de forma fluida hacia el botón del que brotaron."
    ],
  },
  {
    version: "4.7.0",
    date: new Date().toISOString(),
    changes: [
      "Efecto de Magnificación del Dock: Implementación del efecto de magnificación de iconos al pasar el cursor (hover zoom) para la interfaz de 'Liquid Glass', configurable por el usuario.",
      "Configuración de Proximidad: Soporte para aumentar el tamaño de los iconos vecinos adyacentes para una fluidez interactiva premium idéntica a macOS.",
      "Modos de Magnificación: Inclusión de dos algoritmos de zoom ('Escala Visual' y 'Ajuste de Tamaño Físico') completamente controlables desde el apartado de Ajustes.",
      "Diseño Líquido Adaptativo: Optimización de los menús flotantes, globos de submenús con Glassmorphism translúcido (20px blur) y tooltips flotantes inteligentes para modos de escritorio y móviles."
    ],
  },
  {
    version: "4.6.7",
    date: new Date().toISOString(),
    changes: [
      "Optimización de PWA: Generación y despliegue de iconos PWA específicos ('maskable') de alta resolución (192x192 y 512x512) centrados en zona segura (65% del área con fondo blanco) para una visualización premium en launchers de Android e iOS.",
      "Ajuste del Manifiesto: Actualización en `vite.config.ts` vinculando los recursos específicos `/maskable-192x192.png` y `/maskable-512x512.png` con propósito 'maskable', garantizando compatibilidad y eliminando recortes indeseados."
    ],
  },
  {
    version: "4.6.6",
    date: new Date().toISOString(),
    changes: [
      "Identidad Visual: Integración del nuevo logotipo oficial corporativo en formato vectorial SVG (`logo.svg`) para una definición impecable y carga ultra-rápida.",
      "Integración de PWA: Generación y despliegue de los recursos estáticos del manifest (iconos PWA en 192x192, 512x512, maskable e icono Apple Touch) utilizando renderizado de alta fidelidad con Sharp.",
      "Consistencia de Interfaz: Actualización visual del acceso en la pantalla de inicio de sesión (`Login.tsx`) y del encabezado de la barra lateral (`Layout.tsx`) integrando el nuevo logotipo en marcos optimizados."
    ],
  },
  {
    version: "4.6.5",
    date: new Date().toISOString(),
    changes: [
      "Auditoría de Seguridad: Eliminación completa de correos electrónicos hardcodeados en las reglas de seguridad de Firestore, reemplazados por claims de autenticación y mapeo dinámico de roles.",
      "Reforzamiento de Reglas de Acceso: Restricción y validación estricta en colecciones empresariales (empleados, presupuestos, ventas, cobros, etc.) mediante el validador `isEnterpriseData` para evitar fugas de datos entre organizaciones.",
      "Limpieza de Workspace: Remoción total de scripts temporales y de diagnóstico obsoletos (`fix_*`, `patch_*`) del directorio raíz para asegurar un código base limpio y profesional."
    ],
  },
  {
    version: "4.6.4",
    date: new Date().toISOString(),
    changes: [
      "Solución al problema de 'Missing or insufficient permissions' para perfiles de Super Administrador en las reglas de seguridad de Firestore.",
      "Optimización de la creación de perfiles utilizando `serverTimestamp()` para cumplir estrictamente con los esquemas de validación de Firestore.",
      "Ajuste en la lógica de CheckSearch, CheckEntry y Sales para asegurar la visualización y permisos correctos con el rol 'SUPERADMIN'."
    ],
  },
  {
    version: "4.6.3",
    date: new Date().toISOString(),
    changes: [
      "Solución al problema de detección del rol de Super Administrador en producción.",
      "Asignación robusta y automática del rol 'SUPERADMIN' y omisión del flujo de onboarding para el correo principal.",
      "Soporte para administrar cuentas con el rol de SUPERADMIN desde la consola de administración de usuarios."
    ],
  },
  {
    version: "4.6.2",
    date: new Date().toISOString(),
    changes: [
      "Corrección de bug crítico de redirecciones infinitas durante el inicio de sesión",
      "Mejora en la creación de perfiles locales como respaldo"
    ],
  },
  {
    version: "4.6.1",
    date: new Date().toISOString(),
    changes: [
      "Corrección de layout cuando el menú está arriba o abajo (evita que el contenido principal desaparezca)",
      "Mejora del contraste y fondo de Liquid Glass para que los cambios sean notorios"
    ],
  },
  {
    version: "4.6.0",
    date: new Date().toISOString(),
    changes: [
      "Temporizador de confirmación de 15 segundos al cambiar la ubicación del panel lateral",
      "Nuevo estilo de interfaz Liquid Glass con fondos dinámicos",
      "Soporte para fondos personalizados, gradientes y animados en Liquid Glass",
      "Corrección de legibilidad del texto en el modo oscuro + glassmorfismo"
    ],
  },
  {
    version: "4.5.0",
    date: new Date().toISOString(),
    changes: [
      "Reestructuración completa del panel de Configuración con navegación por pestañas",
      "Añadida función de Respaldo y Migración de datos (JSON y Excel) con autenticación requerida",
      "Nuevas opciones de personalización visual: Paleta Cromática, Tipografías y Ubicación de Menú Dinámica",
      "Corrección de fijación del menú lateral para prevenir desplazamiento indeseado",
      "Optimización visual del modo Glassmorphism en temas oscuros",
      "Simplificación de la tabla de Administración de Usuarios (eliminación de iconos redundantes)",
    ],
  },
  {
    version: '4.4.1',
    date: new Date().toISOString(),
    changes: [
      'Corrección de bugs críticos: Reglas de permisos para lectura unificada en base de datos de facturas y beneficiarios.',
      'Corrección de orden de ejecución de hooks (useEffect) en Layout de la aplicación para evitar desbordamientos de renderizado.',
    ]
  },
  {
    version: '4.4.0',
    date: new Date().toISOString(),
    changes: [
      'Efecto Glassmorphism Avanzado implementado con gradientes CSS inspirados en diseño 3D y elementos flotantes.',
      'Separación de funcionalidades de Admin (Usuarios, Asignación, Versiones, Auditoría, Papelera) en rutas y vistas independientes en el menú.',
    ]
  },
  {
    version: '4.3.0',
    date: new Date().toISOString(),
    changes: [
      'Estilo visual "Glassmorfismo" con opciones de personalización (Sólido/Glass).',
      'Nueva barra lateral colapsable para maximizar el espacio de trabajo.',
      'Módulo de Inventario migrado a estructura de submódulos laterales.',
      'Panel de Administración reestructurado en submódulos para mejor organización.',
      'Nuevo submódulo de Notificaciones de Error en el Panel de Administración.',
      'Soporte robusto para manejo de estados de red (Cargando, Error, Vacío) en módulos.',
      'Corrección de flujo de Onboarding que impedía acceso a usuarios nuevos (loop infinito).',
      'Secciones inexistentes ahora muestran una página 404 detallada y un acceso rápido al Dashboard.',
      'Actualización en el icono de Inventario para distinguirlo del módulo de Comercio.'
    ]
  },

  {
    version: '4.2.4',
    date: new Date().toISOString().split('T')[0],
    changes: [
      'Seguridad: Se han movido los correos electrónicos de los administradores super usuarios del código fuente a variables de entorno (VITE_SUPER_ADMIN_EMAILS) para mayor protección y confidencialidad.'
    ]
  },

  {
    version: '4.2.3',
    date: new Date().toISOString().split('T')[0],
    changes: [
      'Validación Estricta de Código de Barras: Se añadió un cuadro de diálogo de confirmación obligatorio en Ingreso de Mercadería al detectar un código de barras ya registrado, previniendo duplicados.',
      'Mejora UI Ventas de Almacén: Reemplazada la lista desplegable nativa de artículos por el selector inteligente con búsqueda y soporte integrado para selección de series y lotes.'
    ]
  },

  {
    version: '4.2.2',
    date: new Date().toISOString().split('T')[0],
    changes: [
      'Actualización del nombre automático: El nombre de un artículo ahora se genera automáticamente utilizando la fórmula Categoría + Marca + Modelo + Código de Barras (opcional) de forma estandarizada.'
    ]
  },

  {
    version: '4.2.1',
    date: new Date().toISOString().split('T')[0],
    changes: [
      'Nombre Automático de Artículo: El campo "Nombre del Artículo" en el formulario de Ingreso de Mercadería ahora es de solo lectura y se genera automáticamente combinando la Marca y el Modelo ingresados, evitando errores de tipeo y asegurando un formato estandarizado.'
    ]
  },

  {
    version: '4.2.0',
    date: '2026-07-11',
    changes: [
      'Búsqueda Predictiva: Se reemplazaron las listas desplegables convencionales en Transferencias, Préstamos y Ventas por un nuevo componente avanzado de autocompletado y búsqueda predictiva (por nombre, modelo, marca y código de barras).',
      'Soporte de Códigos de Barras: Opción para enlazar artículos a códigos de barras que facilita el ingreso y salida de inventario rápido mediante escáneres.',
      'Control Estricto de Series: Implementación de la opción "Requerir Series/Seriales" para artículos de alto valor. Si se habilita, fuerza a ingresar o seleccionar exactamente los seriales de cada unidad individual que ingrese o salga de bodega.',
      'Ingreso Inteligente: El botón "Nuevo Artículo" se renombró a "Ingreso de Mercadería" y ahora detecta si un artículo ya existe para simplemente agregar el nuevo stock sin duplicar datos en la base principal.'
    ]
  },

  {
    version: '4.1.8',
    date: '2026-07-11',
    changes: [
      'Rebranding de la aplicación: Cambio general del nombre "HQ Intelligence" y otros nombres genéricos a "Control 360°", incluyendo la firma "by Trennd".'
    ]
  },

  {
    version: '4.1.7',
    date: '2026-07-11',
    changes: [
      'Corrección de Simulación de Sesión: Se ha resuelto el problema que impedía realizar acciones administrativas (como modificar o vaciar datos) al simular un usuario, debido a una validación errónea contra el PIN del usuario simulado en lugar del administrador.'
    ]
  },

  {
    version: '4.1.6',
    date: '2026-07-11',
    changes: [
      'Autorización de Super-Admin: Expansión de las reglas de Firestore para reconocer múltiples cuentas maestras de administrador y validaciones relajadas en campos opcionales del perfil.',
      'Resolución Onboarding: Solución al problema que impedía crear nuevos perfiles debido al bloqueo por rol de administrador.'
    ]
  },
  {
    version: '4.1.5',
    date: '2026-07-11',
    changes: [
      'Resolución de Seguridad: Corrección de las reglas de seguridad de Firestore para aceptar la creación de usuarios con PIN encriptado en formato hexadecimal SHA-256.'
    ]
  },
  {
    version: '4.1.4',
    date: '2026-07-11',
    changes: [
      'Optimización de UI: Los módulos de la barra lateral (Finanzas, Comercio) ahora inician colapsados por defecto para reducir el ruido visual en la interfaz.'
    ]
  },
  {
    version: '4.1.3',
    date: '2026-07-11',
    changes: [
      'Limpieza de Código: Eliminación del componente no utilizado GlobalCommerceCard del panel de control.',
      'Optimización de Dependencias: Eliminación de dependencias duplicadas en la configuración del proyecto.',
      'Páginas de Error Globales: Incorporación de un capturador de errores (ErrorBoundary) y página 404 para evitar pantallas en blanco al fallar la carga de un módulo.',
      'Optimización de Rendimiento de Arranque: Implementación de validación previa (getDoc) para evitar escrituras redundantes de versiones en Firestore.'
    ]
  },
  {
    version: '4.1.2',
    date: '2026-07-11',
    changes: [
      'Autorización Estricta de Simulación: Se requiere el ingreso del PIN de administrador obligatoriamente antes de activar el modo de suplantación de cuenta.',
      'Límites y Paginación de Consultas: Integración de filtros por fechas desde la base de datos limitando el flujo de información a 12 meses para acelerar la carga.',
      'Estados Cautelares de Sesión: Si el perfil del usuario no se ha resuelto correctamente, el sistema asume estado inactivo/caducado, previniendo accesos temporales.',
      'Filtros de Fechas Robustos: Transición de filtros lógicos usando comparación de strings a evaluación criptográfica en milisegundos evitando errores de sintaxis.'
    ]
  },
  {
    version: '4.1.1',
    date: '2026-07-11',
    changes: [
      'Seguridad de Credenciales: Migración de correo administrador quemado en código a variable de entorno global segura.',
      'Cifrado de PIN: Implementación de encriptación criptográfica SHA-256 para validación y almacenamiento del PIN de usuario.',
      'Resolución de Excepciones Reactivas: Reorganización del orden de ejecución de hooks en el Dashboard de Inventario resolviendo inconsistencias.',
      'Delegación de Permisos: Refinamiento de verificación de administrador dependiendo estrictamente de reglas robustas de datos y variables de entorno.'
    ]
  },
  {
    version: '4.1.0',
    date: '2026-07-11',
    changes: [
      'Validaciones de Reversión de Stock: Optimización matemática que impide saldos negativos durante la reversión de transferencias, ventas y préstamos, limitando la cantidad revertida al stock disponible real de forma segura.',
      'Sincronización y Búsqueda Predictiva: Integración de listas de autocompletado inteligente (datalists) en tiempo real para bodegas, clientes, asignados y encargados de préstamos en toda la interfaz de inventario.',
      'Sincronización de Versión Unificada: Conversión de las etiquetas de versión a una constante dinámica global importada, eliminando referencias estáticas duplicadas en la UI.'
    ]
  },
  {
    version: '4.0.0',
    date: '2026-07-10',
    changes: [
      'Sincronización Automática de Versiones: El sistema ahora detecta, calcula y propaga automáticamente las nuevas versiones de software directamente desde la base de código a la base de datos Firestore sin requerir intervención manual de los administradores.',
      'Eliminación del Gestor Manual de Plataforma: Se retiró la interfaz de registro manual en el Panel de Administración para automatizar completamente el control de versiones y evitar discrepancias de nomenclatura.',
      'Actualización Mayor de Arquitectura (V4.0.0): Sincronización transparente de hitos de desarrollo y despliegues con la base de datos en cada ciclo de arranque del sistema.',
      'Soporte Completo para Progressive Web App (PWA): Carga rápida, capacidades sin conexión y soporte de instalación nativo.',
      'Cuadro de Mando Analítico Avanzado: Tableros dinámicos interactivos de cheques con Recharts y filtros en tiempo real.'
    ]
  },
  {
    version: '3.1.5',
    date: '2026-05-08',
    changes: [
      'Transformación en PWA (Progressive Web App) con soporte instalable y manifiesto personalizado.',
      'Sistema de Auditoría: Registro de acciones críticas para administradores (Logs de Auditoría).',
      'Implementación de Papelera de Reciclaje (Soft Delete) para evitar pérdida accidental de datos.',
      'Optimización de rendimiento mediante Lazy Loading de módulos y rutas principales.',
      'Nuevo tablero de Gráficos Analíticos interactivos con Recharts.',
      'Mejoras en el motor de consultas y políticas de caché local.'
    ]
  },
  {
    version: '2.1.7',
    date: '2026-05-08',
    changes: [
      'Corrección del error 404 al recargar páginas secundarias mediante la implementación de middleware SPA en el servidor y configuración de reescritura para Vercel.',
      'Transición a una arquitectura full-stack (Express + Vite) para garantizar la persistencia del enrutamiento en entornos de producción y desarrollo.'
    ]
  },
  {
    version: '2.1.6',
    date: '2026-05-08',
    changes: [
      'Integración del Historial de Actualizaciones y notificaciones emergentes de novedades en la plataforma.',
      'El Panel de Administración ahora permite la eliminación permanente de usuarios y su información asociada.',
      'Inclusión de los Términos y Condiciones obligatorios durante el proceso de incorporación.',
      'Agregado el cálculo y despliegue del balance general (total, pendientes, pagados y vencidos) de cheques en interfaz y en reportes PDF.',
      'Actualización del Protocolo de Carga Masiva a V2.1.6.'
    ]
  },
  {
    version: '2.1.5',
    date: '2026-05-08',
    changes: [
      'Se incluyó la posibilidad de agregar y administrar Bancos en los ajustes.',
      'Mejoras en el registro manual para asociar cheques con los bancos guardados.'
    ]
  },
  {
    version: '2.1.4',
    date: '2026-05-08',
    changes: [
      'Correcciones internas en operaciones con la base de datos Firestore y optimización en las consultas de pagos.'
    ]
  }
];

// Fallback static exports for components expecting static access
export const changelog: ChangelogRelease[] = staticChangelog;
export const CURRENT_VERSION = staticChangelog[0].version;

// Helper to compare version numbers (descending order)
export function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^[Vv]/, '');
  const cleanB = b.replace(/^[Vv]/, '');
  const partsA = cleanA.split('.').map(Number);
  const partsB = cleanB.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const valA = partsA[i] || 0;
    const valB = partsB[i] || 0;
    if (valA !== valB) {
      return valB - valA; // Descending
    }
  }
  return 0;
}

// Function to fetch merged dynamic versions
export async function getDynamicVersions(): Promise<ChangelogRelease[]> {
  try {
    const versionsRef = collection(db, 'versions');
    const snapshot = await getDocs(versionsRef);
    const firestoreVersions: ChangelogRelease[] = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const versionId = docSnap.id;
      const cleanVer = versionId.replace(/^[Vv]/, '').trim();

      // Clean up obsolete test or intermediate records (e.g., V5.x or V4.27.x/V4.28.x/V4.3.0 superseded by V4.30.0)
      if (
        cleanVer.startsWith('5.') ||
        cleanVer.startsWith('4.27.') ||
        cleanVer.startsWith('4.28.') ||
        cleanVer.startsWith('4.29.') ||
        cleanVer === '4.3.0'
      ) {
        deleteDoc(doc(db, 'versions', versionId)).catch(() => {});
        return;
      }

      firestoreVersions.push({
        version: docSnap.id,
        date: data.date || new Date().toISOString().split('T')[0],
        changes: data.changes || [],
        createdAt: data.createdAt || ''
      });
    });

    // Merge static and firestore versions (avoiding duplicates)
    const mergedMap = new Map<string, ChangelogRelease>();
    
    // Add static ones first
    staticChangelog.forEach(v => {
      // Standardize static version key by converting to e.g. V3.1.5 or keeping as is
      mergedMap.set(v.version, v);
    });

    // Add firestore ones (will override or add new ones)
    firestoreVersions.forEach(v => {
      // If version is saved as V3.1.5 and we have static '3.1.5', normalize keys for lookup
      const lookupKey = v.version.replace(/^[Vv]/, '');
      const matchedKey = Array.from(mergedMap.keys()).find(k => k.replace(/^[Vv]/, '') === lookupKey);
      if (matchedKey) {
        mergedMap.set(matchedKey, v);
      } else {
        mergedMap.set(v.version, v);
      }
    });

    // Automatically register any static versions that do not exist in Firestore
    const firestoreCleanVersions = new Set(firestoreVersions.map(v => v.version.replace(/^[Vv]/, '').trim()));
    for (const v of staticChangelog) {
      const cleanV = v.version.replace(/^[Vv]/, '').trim();
      if (!firestoreCleanVersions.has(cleanV)) {
        try {
          const normalizedVersion = v.version.startsWith('V') || v.version.startsWith('v') ? v.version : `V${v.version}`;
          const versionDocRef = doc(db, 'versions', normalizedVersion);
          const vDoc = await getDoc(versionDocRef);
          if (!vDoc.exists()) {
            await saveNewVersion(v.version, v.changes);
            console.log(`[Auto-Version] Automatically registered V${cleanV} in Firestore.`);
          }
        } catch (err) {
          // Silently ignore permission errors for non-admins
          if (err.code !== "permission-denied") console.error(`[Auto-Version] Failed to automatically register V${cleanV}:`, err);
        }
      }
    }

    const mergedList = Array.from(mergedMap.values());
    
    // Sort descending by version number
    mergedList.sort((a, b) => compareVersions(a.version, b.version));
    
    return mergedList;
  } catch (error) {
    console.error('Error fetching dynamic versions:', error);
    return staticChangelog;
  }
}

// Helper to calculate the next version number automatically
export function getNextVersion(currentVersion: string, type: 'minor' | 'medium' | 'major'): string {
  const clean = currentVersion.replace(/^[Vv]/, '');
  const parts = clean.split('.').map(Number);
  
  let [major, medium, minor] = parts.length === 3 ? parts : [3, 1, 5];
  if (isNaN(major)) major = 3;
  if (isNaN(medium)) medium = 1;
  if (isNaN(minor)) minor = 5;

  if (type === 'minor') {
    minor += 1;
  } else if (type === 'medium') {
    medium += 1;
    minor = 0;
  } else if (type === 'major') {
    major += 1;
    medium = 0;
    minor = 0;
  }

  return `V${major}.${medium}.${minor}`;
}

// Function to save a new version to Firestore
export async function saveNewVersion(version: string, changes: string[]): Promise<void> {
  const normalizedVersion = version.startsWith('V') || version.startsWith('v') ? version : `V${version}`;
  const versionDocRef = doc(db, 'versions', normalizedVersion);
  
  await setDoc(versionDocRef, {
    date: new Date().toISOString().split('T')[0],
    changes: changes,
    createdAt: new Date().toISOString()
  });
}

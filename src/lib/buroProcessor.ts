import { parseISO, format, addYears, isAfter, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { validateEcuadorianId, Modulo10Result } from './ecuadorModulo10';

export interface BuroRecord {
  // Native 19 fields
  cod_id_sujeto: string;
  nom_sujeto: string;
  fec_nacimiento: string;
  telefono: string;
  direccion: string;
  num_operacion: string;
  fec_concesion: string;
  fec_vencimiento: string;
  fec_corte_saldo: string;
  monto_concedido: number;
  val_xvencer: number;
  val_vencido: number;
  val_dem_judicial: number;
  val_cart_castigada: number;
  num_dias_vencido: number;
  num_cuotas_vencidas: number;
  val_cuota: number;
  periodicidad_pago: string;
  tipo_garantia: string;

  // Injected Equifax Bureau Variables
  REPORTADO?: string;
  FACTURAS_PAGADAS?: string;
  PARROQUIA?: string;
  EMAIL?: string;
  GENERO?: string;
  ESTADO_CIVIL?: string;
  ESTADO_OPERACION?: string;
  FECHA_PAGO_CUOTA?: string;

  // Injected NDI Variable
  VALOR_NDI: number;

  // Calculated / Internal metadata
  deuda_total?: number;
  fecha_parcheada?: boolean;
  morosidad_alineada?: boolean;
  validation_result?: Modulo10Result;
  [key: string]: any;
}

export interface PhaseAudit {
  phase: number;
  name: string;
  description: string;
  status: 'COMPLETED' | 'WARNED' | 'INFO';
  inputCount: number;
  outputCount: number;
  details: string[];
}

export interface BuroProcessingResult {
  principalRecords: BuroRecord[];
  invalidRecords: BuroRecord[];
  allProcessedRecords: BuroRecord[];
  audits: PhaseAudit[];
  principalFilename: string;
  secondaryFilename: string;
  stats: {
    totalRawRows: number;
    ghostRowsRemoved: number;
    mandatoryFieldsMissingRemoved: number;
    morosityAlignedCount: number;
    inactiveAccountsRemoved: number;
    datesPatchedCount: number;
    validCedulasCount: number;
    invalidCedulasCount: number;
    totalDeudaProcessed: number;
  };
}

/**
 * Safely parses numbers from Ecuadorian format (e.g., "1.234,56" or "1234.56" or empty)
 */
function parseNumberSafe(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).trim();
  // Remove currency symbols or spaces
  str = str.replace(/[$ ]/g, '');
  if (!str) return 0;
  // If comma is used as decimal separator and dot as thousand separator
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalizes date to DD/MM/YYYY format
 */
function parseAndFormatDate(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '';
  const clean = dateStr.trim();

  // Try parsing common formats
  const formatsToTry = [
    'dd/MM/yyyy',
    'yyyy-MM-dd',
    'dd-MM-yyyy',
    'yyyy/MM/dd',
    'd/M/yyyy',
    'dd.MM.yyyy'
  ];

  for (const fmt of formatsToTry) {
    try {
      const parsed = parse(clean, fmt, new Date());
      if (isValid(parsed)) {
        return format(parsed, 'dd/MM/yyyy');
      }
    } catch {
      // continue
    }
  }

  // Fallback to ISO parse
  try {
    const iso = parseISO(clean);
    if (isValid(iso)) return format(iso, 'dd/MM/yyyy');
  } catch {
    // ignore
  }

  return clean; // return as-is if unparseable
}

/**
 * Parses date string into JS Date object for comparisons
 */
function parseDateToObj(dateStr: string): Date | null {
  if (!dateStr) return null;
  const normalized = parseAndFormatDate(dateStr);
  if (!normalized) return null;
  try {
    const parsed = parse(normalized, 'dd/MM/yyyy', new Date());
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Main 12-Phase Pipeline Processor for Equifax .gjm files
 */
export function processBuroFile(rawText: string): BuroProcessingResult {
  const audits: PhaseAudit[] = [];
  const currentMonthName = format(new Date(), 'MMMM', { locale: es }).toUpperCase();
  const principalFilename = `2968_${currentMonthName}.xlsx`;
  const secondaryFilename = `Cedulas_Incompletas.xlsx`;

  // Stats counters
  let totalRawRows = 0;
  let ghostRowsRemoved = 0;
  let mandatoryFieldsMissingRemoved = 0;
  let morosityAlignedCount = 0;
  let inactiveAccountsRemoved = 0;
  let datesPatchedCount = 0;

  // ----------------------------------------------------
  // FASE 1: IMPORTACIÓN Y DELIMITACIÓN
  // ----------------------------------------------------
  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  totalRawRows = rawLines.length;

  let records: BuroRecord[] = [];
  const phase1Details: string[] = [];

  // Check if first line is header
  let startIndex = 0;
  if (rawLines.length > 0) {
    const firstLineLower = rawLines[0].toLowerCase();
    if (firstLineLower.includes('cod_id_sujeto') || firstLineLower.includes('cedula') || firstLineLower.includes('identificacion')) {
      startIndex = 1; // Skip header line
      phase1Details.push('Cabecera original detectada y omitida de los registros de datos.');
    }
  }

  for (let i = startIndex; i < rawLines.length; i++) {
    const line = rawLines[i];
    // Split by semicolon ;
    const parts = line.split(';').map(p => p.trim().replace(/^["']|["']$/g, ''));

    // Map 19 native fields
    const rec: BuroRecord = {
      cod_id_sujeto: parts[0] || '',
      nom_sujeto: parts[1] || '',
      fec_nacimiento: parts[2] || '',
      telefono: parts[3] || '',
      direccion: parts[4] || '',
      num_operacion: parts[5] || '',
      fec_concesion: parts[6] || '',
      fec_vencimiento: parts[7] || '',
      fec_corte_saldo: parts[8] || '',
      monto_concedido: parseNumberSafe(parts[9]),
      val_xvencer: parseNumberSafe(parts[10]),
      val_vencido: parseNumberSafe(parts[11]),
      val_dem_judicial: parseNumberSafe(parts[12]),
      val_cart_castigada: parseNumberSafe(parts[13]),
      num_dias_vencido: Math.round(parseNumberSafe(parts[14])),
      num_cuotas_vencidas: Math.round(parseNumberSafe(parts[15])),
      val_cuota: parseNumberSafe(parts[16]),
      periodicidad_pago: parts[17] || '',
      tipo_garantia: parts[18] || '',
      VALOR_NDI: 0
    };
    records.push(rec);
  }

  audits.push({
    phase: 1,
    name: 'Importación y Delimitación',
    description: 'Carga y separación del archivo .gjm mediante delimitador punto y coma (;)',
    status: 'COMPLETED',
    inputCount: totalRawRows,
    outputCount: records.length,
    details: [
      `Se procesaron ${totalRawRows} líneas del archivo plano fuente.`,
      `Se estructuraron ${records.length} registros nativos basados en 19 columnas delimitadas por ';'.`,
      ...phase1Details
    ]
  });

  // ----------------------------------------------------
  // FASE 2: TIPIFICACIÓN DE IDENTIFICADORES
  // ----------------------------------------------------
  const phase2Input = records.length;
  records = records.map(r => {
    // Preserve strings strictly, pad zeros if truncaed
    let idStr = String(r.cod_id_sujeto || '').trim();
    if (/^\d{9}$/.test(idStr)) idStr = '0' + idStr;
    if (/^\d{12}$/.test(idStr)) idStr = '0' + idStr;

    return {
      ...r,
      cod_id_sujeto: idStr,
      telefono: String(r.telefono || '').trim(),
      num_operacion: String(r.num_operacion || '').trim()
    };
  });

  audits.push({
    phase: 2,
    name: 'Tipificación de Identificadores',
    description: 'Asignación estricta de formato texto a identificadores para conservar ceros a la izquierda',
    status: 'COMPLETED',
    inputCount: phase2Input,
    outputCount: records.length,
    details: [
      'Campos cod_id_sujeto, telefono y num_operacion tipificados como Texto plano.',
      'Ceros iniciales preservados en códigos de identificación y operaciones.'
    ]
  });

  // ----------------------------------------------------
  // FASE 3: TIPIFICACIÓN CRONOLÓGICA
  // ----------------------------------------------------
  const phase3Input = records.length;
  records = records.map(r => ({
    ...r,
    fec_corte_saldo: parseAndFormatDate(r.fec_corte_saldo),
    fec_concesion: parseAndFormatDate(r.fec_concesion),
    fec_nacimiento: parseAndFormatDate(r.fec_nacimiento),
    fec_vencimiento: parseAndFormatDate(r.fec_vencimiento)
  }));

  audits.push({
    phase: 3,
    name: 'Tipificación Cronológica',
    description: 'Estandarización de fechas al formato Día-Mes-Año (DMA: DD/MM/YYYY)',
    status: 'COMPLETED',
    inputCount: phase3Input,
    outputCount: records.length,
    details: [
      'Normalización aplicada a fec_corte_saldo, fec_concesion, fec_nacimiento y fec_vencimiento.',
      'Formato estandarizado: DD/MM/YYYY para compatibilidad con Equifax.'
    ]
  });

  // ----------------------------------------------------
  // FASE 4: LIMPIEZA ESTRUCTURAL
  // ----------------------------------------------------
  const phase4Input = records.length;
  const cleanedPhase4 = records.filter(r => {
    const idClean = (r.cod_id_sujeto || '').trim();
    // Must not be empty, and must have at least 5 digits
    return idClean.length >= 5 && /[0-9]/.test(idClean);
  });
  ghostRowsRemoved = phase4Input - cleanedPhase4.length;
  records = cleanedPhase4;

  audits.push({
    phase: 4,
    name: 'Limpieza Estructural',
    description: 'Eliminación de registros fantasma o filas corruptas sin identificación válida',
    status: ghostRowsRemoved > 0 ? 'WARNED' : 'COMPLETED',
    inputCount: phase4Input,
    outputCount: records.length,
    details: [
      `Se eliminaron ${ghostRowsRemoved} filas vacías, de encabezados corruptos o columnas residuales.`
    ]
  });

  // ----------------------------------------------------
  // FASE 5: INYECCIÓN DE VARIABLES DEL BURÓ
  // ----------------------------------------------------
  const phase5Input = records.length;
  records = records.map(r => ({
    ...r,
    REPORTADO: r.REPORTADO ?? '',
    FACTURAS_PAGADAS: r.FACTURAS_PAGADAS ?? '',
    PARROQUIA: r.PARROQUIA ?? '',
    EMAIL: r.EMAIL ?? '',
    GENERO: r.GENERO ?? '',
    ESTADO_CIVIL: r.ESTADO_CIVIL ?? '',
    ESTADO_OPERACION: r.ESTADO_OPERACION ?? '',
    FECHA_PAGO_CUOTA: r.FECHA_PAGO_CUOTA ?? ''
  }));

  audits.push({
    phase: 5,
    name: 'Inyección de Variables del Buró',
    description: 'Integración de las 8 columnas requeridas por el estándar externo de Equifax',
    status: 'COMPLETED',
    inputCount: phase5Input,
    outputCount: records.length,
    details: [
      'Variables inyectadas: REPORTADO, FACTURAS_PAGADAS, PARROQUIA, EMAIL, GENERO, ESTADO_CIVIL, ESTADO_OPERACION, FECHA_PAGO_CUOTA.'
    ]
  });

  // ----------------------------------------------------
  // FASE 6: INICIALIZACIÓN DE VALOR NDI
  // ----------------------------------------------------
  const phase6Input = records.length;
  records = records.map(r => ({
    ...r,
    VALOR_NDI: 0
  }));

  audits.push({
    phase: 6,
    name: 'Inicialización de Variable NDI',
    description: 'Asignación e inyección de la columna VALOR_NDI fijada estrictamente en 0',
    status: 'COMPLETED',
    inputCount: phase6Input,
    outputCount: records.length,
    details: [
      'Columna VALOR_NDI inyectada y rellenada con valor numérico 0 en el 100% de los registros.'
    ]
  });

  // ----------------------------------------------------
  // FASE 7: LIMPIEZA DE CAMPOS OBLIGATORIOS
  // ----------------------------------------------------
  const phase7Input = records.length;
  const cleanedPhase7 = records.filter(r => {
    const hasId = !!(r.cod_id_sujeto && r.cod_id_sujeto.trim());
    const hasFecCorte = !!(r.fec_corte_saldo && r.fec_corte_saldo.trim());
    return hasId && hasFecCorte;
  });
  mandatoryFieldsMissingRemoved = phase7Input - cleanedPhase7.length;
  records = cleanedPhase7;

  audits.push({
    phase: 7,
    name: 'Limpieza de Campos Obligatorios',
    description: 'Depuración definitiva de registros con vacíos críticos en cod_id_sujeto o fec_corte_saldo',
    status: mandatoryFieldsMissingRemoved > 0 ? 'WARNED' : 'COMPLETED',
    inputCount: phase7Input,
    outputCount: records.length,
    details: [
      `Se depuraron ${mandatoryFieldsMissingRemoved} registros por falta de cédula/RUC o fecha de corte.`
    ]
  });

  // ----------------------------------------------------
  // FASE 8: ALINEACIÓN DE MOROSIDAD
  // ----------------------------------------------------
  const phase8Input = records.length;
  records = records.map(r => {
    if (r.val_vencido > 0 && r.num_dias_vencido <= 0) {
      morosityAlignedCount++;
      return {
        ...r,
        num_dias_vencido: 1, // Minimum 1 day overdue if value is overdue
        morosidad_alineada: true
      };
    }
    return r;
  });

  audits.push({
    phase: 8,
    name: 'Alineación de Morosidad',
    description: 'Auditoría y corrección automatizada de días de atraso en valores vencidos',
    status: morosityAlignedCount > 0 ? 'WARNED' : 'COMPLETED',
    inputCount: phase8Input,
    outputCount: records.length,
    details: [
      `Se alinearon ${morosityAlignedCount} registros donde existía monto vencido pero los días de mora marcaban 0.`
    ]
  });

  // ----------------------------------------------------
  // FASE 9: FILTRADO DE CUENTAS INACTIVAS
  // ----------------------------------------------------
  const phase9Input = records.length;
  records = records.map(r => {
    const deudaTotal = (r.val_xvencer || 0) + (r.val_vencido || 0) + (r.val_dem_judicial || 0) + (r.val_cart_castigada || 0);
    return {
      ...r,
      deuda_total: parseNumberSafe(deudaTotal.toFixed(2))
    };
  });

  const activeRecords = records.filter(r => (r.deuda_total || 0) > 0);
  inactiveAccountsRemoved = phase9Input - activeRecords.length;
  records = activeRecords;

  audits.push({
    phase: 9,
    name: 'Filtrado de Cuentas Inactivas',
    description: 'Eliminación de registros con Deuda Total <= 0 (Suma de saldos igual a cero)',
    status: inactiveAccountsRemoved > 0 ? 'INFO' : 'COMPLETED',
    inputCount: phase9Input,
    outputCount: records.length,
    details: [
      `Fórmula aplicada: Deuda Total = val_xvencer + val_vencido + val_dem_judicial + val_cart_castigada.`,
      `Se retiraron ${inactiveAccountsRemoved} operaciones sin deuda activa.`
    ]
  });

  // ----------------------------------------------------
  // FASE 10: PARCHADO LÓGICO TEMPORAL
  // ----------------------------------------------------
  const phase10Input = records.length;
  records = records.map(r => {
    const dtConcesion = parseDateToObj(r.fec_concesion);
    const dtVencimiento = parseDateToObj(r.fec_vencimiento);

    if (dtConcesion && dtVencimiento && isAfter(dtConcesion, dtVencimiento)) {
      datesPatchedCount++;
      const correctedVencimiento = addYears(dtVencimiento, 1);
      const newFecVencimiento = format(correctedVencimiento, 'dd/MM/yyyy');

      return {
        ...r,
        fec_vencimiento: newFecVencimiento,
        fecha_parcheada: true
      };
    }
    return r;
  });

  audits.push({
    phase: 10,
    name: 'Parchado Lógico Temporal',
    description: 'Corrección de inconsistencias donde la fecha de concesión es posterior al vencimiento',
    status: datesPatchedCount > 0 ? 'WARNED' : 'COMPLETED',
    inputCount: phase10Input,
    outputCount: records.length,
    details: [
      `Se detectaron y corrigieron ${datesPatchedCount} registros con fec_concesion > fec_vencimiento sumando +1 año a la fecha de vencimiento.`
    ]
  });

  // ----------------------------------------------------
  // FASE 11: VALIDACIÓN DE IDENTIDAD (MÓDULO 10)
  // ----------------------------------------------------
  const phase11Input = records.length;
  const principalRecords: BuroRecord[] = [];
  const invalidRecords: BuroRecord[] = [];

  records.forEach(r => {
    const valResult = validateEcuadorianId(r.cod_id_sujeto);
    const updatedRec = {
      ...r,
      cod_id_sujeto: valResult.cleanedId || r.cod_id_sujeto,
      validation_result: valResult
    };

    if (valResult.isValid) {
      principalRecords.push(updatedRec);
    } else {
      invalidRecords.push(updatedRec);
    }
  });

  audits.push({
    phase: 11,
    name: 'Validación de Identidad (Módulo 10)',
    description: 'Auditoría matemática de Cédulas y RUCs según el algoritmo oficial del Registro Civil',
    status: invalidRecords.length > 0 ? 'WARNED' : 'COMPLETED',
    inputCount: phase11Input,
    outputCount: principalRecords.length,
    details: [
      `Registros con Cédula/RUC válida (Módulo 10 correcto): ${principalRecords.length} (Destino: ${principalFilename}).`,
      `Registros con Cédula/RUC errónea o incompleta: ${invalidRecords.length} (Destino: ${secondaryFilename}).`
    ]
  });

  // ----------------------------------------------------
  // FASE 12: CONSOLIDACIÓN Y EXPORTACIÓN FINAL
  // ----------------------------------------------------
  const totalDeudaProcessed = principalRecords.reduce((sum, r) => sum + (r.deuda_total || 0), 0);

  audits.push({
    phase: 12,
    name: 'Consolidación y Exportación Final',
    description: 'Estructuración final de la matriz de cartera limpia lista para Equifax',
    status: 'COMPLETED',
    inputCount: principalRecords.length,
    outputCount: principalRecords.length,
    details: [
      `Base limpia consolidada con ${principalRecords.length} filas y monto total por $ ${totalDeudaProcessed.toLocaleString('es-EC', { minimumFractionDigits: 2 })}.`,
      `Generación habilitada para libros Excel: ${principalFilename} y ${secondaryFilename}.`
    ]
  });

  return {
    principalRecords,
    invalidRecords,
    allProcessedRecords: records,
    audits,
    principalFilename,
    secondaryFilename,
    stats: {
      totalRawRows,
      ghostRowsRemoved,
      mandatoryFieldsMissingRemoved,
      morosityAlignedCount,
      inactiveAccountsRemoved,
      datesPatchedCount,
      validCedulasCount: principalRecords.length,
      invalidCedulasCount: invalidRecords.length,
      totalDeudaProcessed
    }
  };
}

/**
 * Generates and downloads an Excel file from BuroRecord array
 */
export function exportBuroToExcel(records: BuroRecord[], filename: string, isErrorFile = false) {
  if (!records || records.length === 0) return;

  // Transform records into flat objects with official Equifax headers
  const exportData = records.map((r, idx) => {
    if (isErrorFile) {
      return {
        '#': idx + 1,
        'CÉDULA / RUC': String(r.cod_id_sujeto),
        'MOTIVO_ERROR': r.validation_result?.reason || 'Error de validación Módulo 10',
        'TIPO_IDENTIFICACION': r.validation_result?.type || 'INVALIDO',
        'CLIENTE / SUJETO': r.nom_sujeto,
        'NÚMERO_OPERACIÓN': String(r.num_operacion),
        'TELÉFONO': String(r.telefono),
        'FECHA_CORTE': r.fec_corte_saldo,
        'MONTO_CONCEDIDO': r.monto_concedido,
        'VALOR_X_VENCER': r.val_xvencer,
        'VALOR_VENCIDO': r.val_vencido,
        'DEUDA_TOTAL': r.deuda_total || 0,
        'DÍAS_VENCIDO': r.num_dias_vencido
      };
    }

    return {
      'cod_id_sujeto': String(r.cod_id_sujeto),
      'nom_sujeto': r.nom_sujeto,
      'fec_nacimiento': r.fec_nacimiento,
      'telefono': String(r.telefono),
      'direccion': r.direccion,
      'num_operacion': String(r.num_operacion),
      'fec_concesion': r.fec_concesion,
      'fec_vencimiento': r.fec_vencimiento,
      'fec_corte_saldo': r.fec_corte_saldo,
      'monto_concedido': r.monto_concedido,
      'val_xvencer': r.val_xvencer,
      'val_vencido': r.val_vencido,
      'val_dem_judicial': r.val_dem_judicial,
      'val_cart_castigada': r.val_cart_castigada,
      'num_dias_vencido': r.num_dias_vencido,
      'num_cuotas_vencidas': r.num_cuotas_vencidas,
      'val_cuota': r.val_cuota,
      'periodicidad_pago': r.periodicidad_pago,
      'tipo_garantia': r.tipo_garantia,
      'REPORTADO': r.REPORTADO || '',
      'FACTURAS_PAGADAS': r.FACTURAS_PAGADAS || '',
      'PARROQUIA': r.PARROQUIA || '',
      'EMAIL': r.EMAIL || '',
      'GENERO': r.GENERO || '',
      'ESTADO_CIVIL': r.ESTADO_CIVIL || '',
      'ESTADO_OPERACION': r.ESTADO_OPERACION || '',
      'FECHA_PAGO_CUOTA': r.FECHA_PAGO_CUOTA || '',
      'VALOR_NDI': 0
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Set explicit string cell type ('s') for identifier columns to preserve leading zeros in Excel!
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    // Column 0 is cod_id_sujeto in main file or Cédula/RUC in error file
    const cellAddress = XLSX.utils.encode_cell({ r: R, c: isErrorFile ? 1 : 0 });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].t = 's'; // Force string type
      worksheet[cellAddress].z = '@'; // Force text format
    }
  }

  // Auto column widths
  const colWidths = Object.keys(exportData[0] || {}).map(key => ({
    wch: Math.max(key.length + 3, 14)
  }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, isErrorFile ? 'Cedulas_Incompletas' : 'Equifax_Cartera');

  // Trigger download
  XLSX.writeFile(workbook, filename);
}

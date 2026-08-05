import { parseISO, format, addYears, isAfter, isValid, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { validateEcuadorianId, Modulo10Result } from './ecuadorModulo10';

export interface BuroRecord {
  // 28 Official Equifax Fields
  cod_tipo_id?: string;
  cod_id_sujeto: string;
  nom_sujeto: string;
  direccion: string;
  ciudad?: string;
  telefono: string;
  fec_corte_saldo: string;
  tipo_deudor?: string;
  num_operacion: string;
  fec_concesion: string;
  val_operacion?: number;
  monto_concedido: number;
  val_xvencer: number;
  val_vencido: number;
  val_dem_judicial: number;
  val_cart_castigada: number;
  num_dias_vencido: number;
  fec_nacimiento: string;
  deuda_refinanciada?: number;
  fec_vencimiento: string;

  num_cuotas_vencidas?: number;
  val_cuota?: number;
  periodicidad_pago?: string;
  tipo_garantia?: string;

  // Injected Equifax Bureau Variables
  REPORTADO?: string | number;
  FACTURAS_PAGADAS?: string | number;
  PARROQUIA?: string;
  EMAIL?: string;
  GENERO?: string;
  ESTADO_CIVIL?: string;
  ESTADO_OPERACION?: string;
  FECHA_PAGO_CUOTA?: string | number;

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
 * Normalizes date to yyyy/MM/dd format, removing time components and invalid values
 */
function parseAndFormatDate(dateStr: any): string {
  if (dateStr === null || dateStr === undefined) return '';
  let clean = String(dateStr).trim();
  if (!clean || clean === '0' || clean === '00/00/0000' || clean === '0000-00-00' || clean === 'null' || clean === 'undefined') return '';

  // Strip time components if present (e.g. "2026-06-30 00:00:00" or "30/06/2026T00:00:00")
  if (clean.includes(' ') || clean.includes('T')) {
    clean = clean.split(/[ T]/)[0].trim();
  }

  // Fast direct matches
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(clean)) return clean; // Already yyyy/MM/dd (10 chars)
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean.replace(/-/g, '/'); // yyyy-MM-dd -> yyyy/MM/dd

  // Convert dd/MM/yyyy or dd-MM-yyyy or d/M/yyyy to yyyy/MM/dd (strictly padded 2 digits for day & month)
  if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}$/.test(clean)) {
    const p = clean.split(/[\/\.-]/);
    const day = p[0].padStart(2, '0');
    const month = p[1].padStart(2, '0');
    const year = p[2];
    return `${year}/${month}/${day}`;
  }

  // Convert yyyy/M/d or yyyy-M-d to yyyy/MM/dd
  if (/^\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}$/.test(clean)) {
    const p = clean.split(/[\/\.-]/);
    const year = p[0];
    const month = p[1].padStart(2, '0');
    const day = p[2].padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  // Try parsing common formats with date-fns
  const formatsToTry = [
    'yyyy/MM/dd',
    'dd/MM/yyyy',
    'yyyy-MM-dd',
    'dd-MM-yyyy',
    'd/M/yyyy',
    'dd.MM.yyyy',
    'yyyyMMdd',
    'ddMMyyyy'
  ];

  for (const fmt of formatsToTry) {
    try {
      const parsed = parse(clean, fmt, new Date());
      if (isValid(parsed)) {
        return format(parsed, 'yyyy/MM/dd');
      }
    } catch {
      // continue
    }
  }

  // Fallback to ISO parse
  try {
    const iso = parseISO(clean);
    if (isValid(iso)) return format(iso, 'yyyy/MM/dd');
  } catch {
    // ignore
  }

  return clean.length > 10 ? clean.substring(0, 10) : clean; // return as-is if unparseable
}

/**
 * Parses date string into JS Date object for comparisons
 */
function parseDateToObj(dateStr: string): Date | null {
  if (!dateStr) return null;
  const normalized = parseAndFormatDate(dateStr);
  if (!normalized) return null;
  try {
    const parsed = parse(normalized, 'yyyy/MM/dd', new Date());
    if (isValid(parsed)) return parsed;
    const parsedAlt = parse(normalized, 'dd/MM/yyyy', new Date());
    if (isValid(parsedAlt)) return parsedAlt;
    return null;
  } catch {
    return null;
  }
}

/**
 * Main 12-Phase Pipeline Processor for Equifax .gjm files
 */
export function processBuroFile(rawText: string): BuroProcessingResult {
  const audits: PhaseAudit[] = [];

  // Stats counters
  let totalRawRows = 0;
  let ghostRowsRemoved = 0;
  let mandatoryFieldsMissingRemoved = 0;
  let morosityAlignedCount = 0;
  let inactiveAccountsRemoved = 0;
  let datesPatchedCount = 0;

  // ----------------------------------------------------
  // FASE 1: IMPORTACIÓN Y DELIMITACIÓN AUTOMÁTICA
  // ----------------------------------------------------
  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  totalRawRows = rawLines.length;

  let records: BuroRecord[] = [];
  const phase1Details: string[] = [];

  // Auto-detect delimiter
  let delimiter = ';';
  const sampleLines = rawLines.slice(0, 15);
  let countSemi = 0, countComma = 0, countTab = 0, countPipe = 0;
  for (const l of sampleLines) {
    countSemi += (l.match(/;/g) || []).length;
    countComma += (l.match(/,/g) || []).length;
    countTab += (l.match(/\t/g) || []).length;
    countPipe += (l.match(/\|/g) || []).length;
  }
  if (countSemi === 0) {
    if (countPipe > countComma && countPipe > countTab) delimiter = '|';
    else if (countTab > countComma) delimiter = '\t';
    else if (countComma > 0) delimiter = ',';
  }

  phase1Details.push(`Delimitador detectado: "${delimiter === '\t' ? '\\t (Tab)' : delimiter}"`);

  // Check header line & column mapping
  let startIndex = 0;
  let colMap: Record<string, number> = {};
  let hasMappedHeader = false;

  if (rawLines.length > 0) {
    const firstLineLower = rawLines[0].toLowerCase();
    const firstParts = rawLines[0].split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, '').toLowerCase());

    const isHeader = firstParts.some(p => 
      p.includes('cod_id_sujeto') || p.includes('cod_tipo_id') || p.includes('cedula') || p.includes('identificacion') || p.includes('ruc') || p.includes('nombre') || p.includes('cliente') || p.includes('num_operacion')
    );

    if (isHeader) {
      startIndex = 1;
      hasMappedHeader = true;
      phase1Details.push('Cabecera detectada y mapeada dinámicamente.');

      // Build field index map
      firstParts.forEach((part, idx) => {
        const clean = part.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (clean === 'cod_tipo_id' || clean === 'tipo_id') colMap['cod_tipo_id'] = idx;
        else if (clean === 'cod_id_sujeto' || (clean.includes('cod_id') && !clean.includes('tipo')) || clean.includes('cedula') || clean.includes('ruc') || clean.includes('identificacion')) colMap['cod_id_sujeto'] = idx;
        else if (clean.includes('nom') || clean.includes('nombre') || clean.includes('cliente') || clean.includes('sujeto') || clean.includes('razon')) colMap['nom_sujeto'] = idx;
        else if (clean.includes('direc') || clean.includes('domic')) colMap['direccion'] = idx;
        else if (clean.includes('ciudad') || clean.includes('canton')) colMap['ciudad'] = idx;
        else if (clean.includes('telef') || clean.includes('celul') || clean.includes('tlf')) colMap['telefono'] = idx;
        else if (clean.includes('corte') || clean.includes('saldo_corte')) colMap['fec_corte_saldo'] = idx;
        else if (clean.includes('tipo_deudor') || clean === 'deudor') colMap['tipo_deudor'] = idx;
        else if (clean.includes('val_operacion') || clean.includes('val_op') || clean.includes('monto_concedido') || clean.includes('conced') || clean.includes('monto') || clean.includes('capital')) colMap['val_operacion'] = idx;
        else if (clean.includes('num_operacion') || clean.includes('num_op') || clean.includes('num_credito') || clean === 'operacion' || clean === 'credito' || (clean.includes('operac') && !clean.includes('val_') && !clean.includes('fec_') && !clean.includes('estado_'))) colMap['num_operacion'] = idx;
        else if (clean.includes('conces') || clean.includes('otorg') || clean.includes('fec_con')) colMap['fec_concesion'] = idx;
        else if (clean.includes('xvencer') || clean.includes('x_vencer') || clean.includes('por_vencer')) colMap['val_xvencer'] = idx;
        else if (clean.includes('vencid') && !clean.includes('dias') && !clean.includes('cuota') && !clean.includes('fec') && !clean.includes('cart')) colMap['val_vencido'] = idx;
        else if (clean.includes('dem_jud') || clean.includes('demanda') || clean.includes('judicial')) colMap['val_dem_judicial'] = idx;
        else if (clean.includes('castig') || clean.includes('cart_cast')) colMap['val_cart_castigada'] = idx;
        else if (clean.includes('dias_venc') || clean.includes('dias_mora') || clean.includes('num_dias') || clean === 'dias') colMap['num_dias_vencido'] = idx;
        else if (clean.includes('nacim')) colMap['fec_nacimiento'] = idx;
        else if (clean.includes('refinanc') || clean.includes('deuda_ref')) colMap['deuda_refinanciada'] = idx;
        else if (clean.includes('vencim') && !clean.includes('dias') && !clean.includes('cuota') && !clean.includes('val_')) colMap['fec_vencimiento'] = idx;
        else if (clean.includes('reportado')) colMap['REPORTADO'] = idx;
        else if (clean.includes('facturas')) colMap['FACTURAS_PAGADAS'] = idx;
        else if (clean.includes('parroquia')) colMap['PARROQUIA'] = idx;
        else if (clean.includes('email') || clean.includes('correo')) colMap['EMAIL'] = idx;
        else if (clean.includes('genero') || clean.includes('sexo')) colMap['GENERO'] = idx;
        else if (clean.includes('estado_civil') || clean.includes('civil')) colMap['ESTADO_CIVIL'] = idx;
        else if (clean.includes('estado_operac')) colMap['ESTADO_OPERACION'] = idx;
        else if (clean.includes('valor_ndi') || clean === 'ndi') colMap['VALOR_NDI'] = idx;
        else if (clean.includes('pago_cuota') || clean.includes('fec_pago')) colMap['FECHA_PAGO_CUOTA'] = idx;
        else if (clean.includes('cuotas_venc') || clean.includes('cuotas_mora')) colMap['num_cuotas_vencidas'] = idx;
        else if (clean.includes('val_cuota') || clean === 'cuota') colMap['val_cuota'] = idx;
        else if (clean.includes('period') || clean.includes('forma_pago')) colMap['periodicidad_pago'] = idx;
        else if (clean.includes('garant')) colMap['tipo_garantia'] = idx;
      });
    }
  }

  // Auto-detect positional format if no header matched
  let is28ColFormat = false;
  if (!hasMappedHeader && rawLines.length > 0) {
    const sampleParts = rawLines[0].split(delimiter).map(p => p.trim());
    if (sampleParts.length >= 20 || (sampleParts[0] && ['c', 'r', 'p'].includes(sampleParts[0].toLowerCase()))) {
      is28ColFormat = true;
      phase1Details.push('Estructura detectada: Matriz oficial Equifax de 28 columnas.');
    } else {
      phase1Details.push('Estructura detectada: Formato nativo .gjm de 19 columnas.');
    }
  }

  const getColVal = (parts: string[], field: string, default28Idx: number, default19Idx: number): string => {
    if (colMap[field] !== undefined) {
      return parts[colMap[field]] || '';
    }
    const idx = is28ColFormat ? default28Idx : default19Idx;
    return idx >= 0 && idx < parts.length ? parts[idx] || '' : '';
  };

  for (let i = startIndex; i < rawLines.length; i++) {
    const line = rawLines[i];
    const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));

    // 28-column format index map:
    // 0: cod_tipo_id, 1: cod_id_sujeto, 2: nom_sujeto, 3: direccion, 4: ciudad, 5: telefono, 6: fec_corte_saldo,
    // 7: tipo_deudor, 8: num_operacion, 9: fec_concesion, 10: val_operacion, 11: val_xvencer, 12: val_vencido,
    // 13: val_dem_judicial, 14: val_cart_castigada, 15: num_dias_vencido, 16: fec_nacimiento, 17: deuda_refinanciada,
    // 18: fec_vencimiento, 19: REPORTADO, 20: FACTURAS_PAGADAS, 21: PARROQUIA, 22: EMAIL, 23: GENERO,
    // 24: ESTADO_CIVIL, 25: ESTADO_OPERACION, 26: VALOR_NDI, 27: FECHA_PAGO_CUOTA

    // 19-column format index map:
    // 0: cod_id_sujeto, 1: nom_sujeto, 2: fec_nacimiento, 3: telefono, 4: direccion, 5: num_operacion,
    // 6: fec_concesion, 7: fec_vencimiento, 8: fec_corte_saldo, 9: monto_concedido, 10: val_xvencer,
    // 11: val_vencido, 12: val_dem_judicial, 13: val_cart_castigada, 14: num_dias_vencido, 15: num_cuotas_vencidas,
    // 16: val_cuota, 17: periodicidad_pago, 18: tipo_garantia

    const rawId = getColVal(parts, 'cod_id_sujeto', 1, 0);
    const rawType = getColVal(parts, 'cod_tipo_id', 0, -1);
    const montoVal = parseNumberSafe(getColVal(parts, 'val_operacion', 10, 9));

    const rec: BuroRecord = {
      cod_tipo_id: rawType || (rawId.length === 13 ? 'R' : 'C'),
      cod_id_sujeto: rawId,
      nom_sujeto: getColVal(parts, 'nom_sujeto', 2, 1),
      direccion: getColVal(parts, 'direccion', 3, 4),
      ciudad: getColVal(parts, 'ciudad', 4, -1),
      telefono: getColVal(parts, 'telefono', 5, 3),
      fec_corte_saldo: getColVal(parts, 'fec_corte_saldo', 6, 8),
      tipo_deudor: getColVal(parts, 'tipo_deudor', 7, -1) || 'TITULAR',
      num_operacion: getColVal(parts, 'num_operacion', 8, 5),
      fec_concesion: getColVal(parts, 'fec_concesion', 9, 6),
      val_operacion: montoVal,
      monto_concedido: montoVal,
      val_xvencer: parseNumberSafe(getColVal(parts, 'val_xvencer', 11, 10)),
      val_vencido: parseNumberSafe(getColVal(parts, 'val_vencido', 12, 11)),
      val_dem_judicial: parseNumberSafe(getColVal(parts, 'val_dem_judicial', 13, 12)),
      val_cart_castigada: parseNumberSafe(getColVal(parts, 'val_cart_castigada', 14, 13)),
      num_dias_vencido: Math.round(parseNumberSafe(getColVal(parts, 'num_dias_vencido', 15, 14))),
      fec_nacimiento: getColVal(parts, 'fec_nacimiento', 16, 2),
      deuda_refinanciada: parseNumberSafe(getColVal(parts, 'deuda_refinanciada', 17, -1)),
      fec_vencimiento: getColVal(parts, 'fec_vencimiento', 18, 7),
      num_cuotas_vencidas: Math.round(parseNumberSafe(getColVal(parts, 'num_cuotas_vencidas', -1, 15))),
      val_cuota: parseNumberSafe(getColVal(parts, 'val_cuota', -1, 16)),
      periodicidad_pago: getColVal(parts, 'periodicidad_pago', -1, 17),
      tipo_garantia: getColVal(parts, 'tipo_garantia', -1, 18),
      REPORTADO: getColVal(parts, 'REPORTADO', 19, -1) || 0,
      FACTURAS_PAGADAS: getColVal(parts, 'FACTURAS_PAGADAS', 20, -1) || 0,
      PARROQUIA: getColVal(parts, 'PARROQUIA', 21, -1),
      EMAIL: getColVal(parts, 'EMAIL', 22, -1),
      GENERO: getColVal(parts, 'GENERO', 23, -1),
      ESTADO_CIVIL: getColVal(parts, 'ESTADO_CIVIL', 24, -1),
      ESTADO_OPERACION: getColVal(parts, 'ESTADO_OPERACION', 25, -1),
      VALOR_NDI: parseNumberSafe(getColVal(parts, 'VALOR_NDI', 26, -1)),
      FECHA_PAGO_CUOTA: getColVal(parts, 'FECHA_PAGO_CUOTA', 27, -1) || 0
    };
    records.push(rec);
  }

  audits.push({
    phase: 1,
    name: 'Importación y Delimitación',
    description: `Carga y separación del archivo con delimitador '${delimiter}'`,
    status: 'COMPLETED',
    inputCount: totalRawRows,
    outputCount: records.length,
    details: [
      `Se procesaron ${totalRawRows} líneas del archivo fuente.`,
      `Se estructuraron ${records.length} registros nativos.`,
      ...phase1Details
    ]
  });

  // ----------------------------------------------------
  // FASE 2: TIPIFICACIÓN Y DEPURACIÓN DE DATOS (EQUIFAX)
  // ----------------------------------------------------
  const phase2Input = records.length;
  let cleanedPhonesCount = 0;
  records = records.map(r => {
    // Preserve strings strictly, pad zeros if truncated
    let idStr = String(r.cod_id_sujeto || '').trim();
    if (/^\d{9}$/.test(idStr)) idStr = '0' + idStr;
    if (/^\d{12}$/.test(idStr)) idStr = '0' + idStr;

    // Equifax Phone Validation (isNotDescPhone_TELEFONO / isRegexMatch_TELEFONO)
    let rawPhone = String(r.telefono || '').trim().replace(/\D/g, '');
    if (/^(\d)\1{6,}$/.test(rawPhone) || rawPhone.length < 7) {
      cleanedPhonesCount++;
      rawPhone = ''; // Clear repetitive/invalid phone according to Equifax rules
    }

    // Equifax Gender Validation (isRegexMatch_GENERO)
    let rawGender = (r.GENERO || '').toString().trim().toUpperCase();
    if (rawGender !== 'M' && rawGender !== 'F') {
      rawGender = '';
    }

    return {
      ...r,
      cod_tipo_id: (r.cod_tipo_id || (idStr.length === 13 ? 'R' : 'C')).toUpperCase(),
      cod_id_sujeto: idStr,
      telefono: rawPhone,
      GENERO: rawGender,
      tipo_deudor: (r.tipo_deudor || 'TITULAR').toUpperCase(),
      num_operacion: String(r.num_operacion || '').trim()
    };
  });

  audits.push({
    phase: 2,
    name: 'Tipificación y Depuración Equifax',
    description: 'Conservación de ceros iniciales en identificadores y depuración de teléfonos repetitivos',
    status: cleanedPhonesCount > 0 ? 'WARNED' : 'COMPLETED',
    inputCount: phase2Input,
    outputCount: records.length,
    details: [
      'Campos cod_id_sujeto, telefono y num_operacion tipificados estrictamente como Texto plano.',
      'Ceros iniciales preservados en cédulas/RUCs de 10 o 13 dígitos.',
      cleanedPhonesCount > 0 ? `Se depuraron ${cleanedPhonesCount} números de teléfono repetitivos (ej. 999999999) según regla Equifax (isNotDescPhone_TELEFONO).` : 'Todos los teléfonos evaluados cumplieron la regla de formato.'
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
    fec_vencimiento: parseAndFormatDate(r.fec_vencimiento),
    FECHA_PAGO_CUOTA: parseAndFormatDate(r.FECHA_PAGO_CUOTA)
  }));

  audits.push({
    phase: 3,
    name: 'Tipificación Cronológica',
    description: 'Estandarización de fechas al formato Año/Mes/Día (yyyy/MM/dd) sin marcas de hora',
    status: 'COMPLETED',
    inputCount: phase3Input,
    outputCount: records.length,
    details: [
      'Normalización aplicada a fec_corte_saldo, fec_concesion, fec_nacimiento, fec_vencimiento y FECHA_PAGO_CUOTA.',
      'Formato estandarizado: yyyy/MM/dd para compatibilidad estricta con macros de Equifax.'
    ]
  });

  // ----------------------------------------------------
  // FASE 4: LIMPIEZA ESTRUCTURAL
  // ----------------------------------------------------
  const phase4Input = records.length;
  const cleanedPhase4 = records.filter(r => {
    const idClean = (r.cod_id_sujeto || '').trim();
    // Must contain numeric digits and at least 3 characters
    return idClean.length >= 3 && /[0-9]/.test(idClean);
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
  const defaultCorteDate = format(new Date(), 'dd/MM/yyyy');
  let autoFilledCutDates = 0;

  const cleanedPhase7 = records.filter(r => {
    const hasId = !!(r.cod_id_sujeto && r.cod_id_sujeto.trim());
    if (!hasId) return false;

    if (!r.fec_corte_saldo || !r.fec_corte_saldo.trim()) {
      r.fec_corte_saldo = defaultCorteDate;
      autoFilledCutDates++;
    }
    return true;
  });
  mandatoryFieldsMissingRemoved = phase7Input - cleanedPhase7.length;
  records = cleanedPhase7;

  audits.push({
    phase: 7,
    name: 'Limpieza de Campos Obligatorios',
    description: 'Depuración de registros sin identificación y normalización de fecha de corte',
    status: (mandatoryFieldsMissingRemoved > 0 || autoFilledCutDates > 0) ? 'WARNED' : 'COMPLETED',
    inputCount: phase7Input,
    outputCount: records.length,
    details: [
      `Se depuraron ${mandatoryFieldsMissingRemoved} registros por falta de cédula/RUC.`,
      autoFilledCutDates > 0 ? `Se asignó la fecha de corte predeterminada (${defaultCorteDate}) a ${autoFilledCutDates} registros que carecían de ella.` : 'Todas las filas contaban con fecha de corte válida.'
    ]
  });

  // Calculate Primary Cut Date for Output Filename: 2968_(FECHA_DE_CORTE)
  let primaryCutDateStr = '';
  for (const r of records) {
    if (r.fec_corte_saldo && r.fec_corte_saldo.trim()) {
      const formatted = parseAndFormatDate(r.fec_corte_saldo.trim());
      if (formatted) {
        primaryCutDateStr = formatted;
        break;
      }
    }
  }
  if (!primaryCutDateStr) {
    primaryCutDateStr = defaultCorteDate;
  }

  // Clean cut date digits for filename, e.g. "30/06/2026" -> "30062026"
  const cleanCutDateDigits = primaryCutDateStr.replace(/\D/g, '') || format(new Date(), 'ddMMyyyy');
  const principalFilename = `2968_${cleanCutDateDigits}.xlsx`;
  const secondaryFilename = `Cedulas_Incompletas_${cleanCutDateDigits}.xlsx`;

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
    const calcDeuda = (r.val_xvencer || 0) + (r.val_vencido || 0) + (r.val_dem_judicial || 0) + (r.val_cart_castigada || 0);
    const finalDeuda = calcDeuda > 0 ? calcDeuda : (r.monto_concedido || 0);
    return {
      ...r,
      deuda_total: parseNumberSafe(finalDeuda.toFixed(2))
    };
  });

  const activeRecords = records.filter(r => (r.deuda_total || 0) > 0 || (r.monto_concedido || 0) > 0);
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
  // FASE 12: CONSOLIDACIÓN Y EXPORTACIÓN FINAL (2968_FECHA_DE_CORTE)
  // ----------------------------------------------------
  const totalDeudaProcessed = principalRecords.reduce((sum, r) => sum + (r.deuda_total || 0), 0);

  audits.push({
    phase: 12,
    name: 'Consolidación y Exportación Final',
    description: 'Generación del archivo final en estricto cumplimiento del formato de nombre 2968_(FECHA_DE_CORTE)',
    status: 'COMPLETED',
    inputCount: principalRecords.length,
    outputCount: principalRecords.length,
    details: [
      `Base limpia consolidada con ${principalRecords.length} filas y monto total por $ ${totalDeudaProcessed.toLocaleString('es-EC', { minimumFractionDigits: 2 })}.`,
      `Nombre oficial del archivo principal generado: ${principalFilename}.`,
      `Nombre del archivo de secundario / incompletos: ${secondaryFilename}.`
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
        'FECHA_CORTE': parseAndFormatDate(r.fec_corte_saldo),
        'MONTO_CONCEDIDO': r.monto_concedido,
        'VALOR_X_VENCER': r.val_xvencer,
        'VALOR_VENCIDO': r.val_vencido,
        'DEUDA_TOTAL': r.deuda_total || 0,
        'DÍAS_VENCIDO': r.num_dias_vencido
      };
    }

    return {
      'cod_tipo_id': r.cod_tipo_id || (String(r.cod_id_sujeto).length === 13 ? 'R' : 'C'),
      'cod_id_sujeto': String(r.cod_id_sujeto || ''),
      'nom_sujeto': r.nom_sujeto || '',
      'direccion': r.direccion || '',
      'ciudad': r.ciudad || '',
      'telefono': String(r.telefono || ''),
      'fec_corte_saldo': parseAndFormatDate(r.fec_corte_saldo),
      'tipo_deudor': r.tipo_deudor || 'TITULAR',
      'num_operacion': String(r.num_operacion || ''),
      'fec_concesion': parseAndFormatDate(r.fec_concesion),
      'val_operacion': r.val_operacion ?? r.monto_concedido ?? 0,
      'val_xvencer': r.val_xvencer ?? 0,
      'val_vencido': r.val_vencido ?? 0,
      'val_dem_judicial': r.val_dem_judicial ?? 0,
      'val_cart_castigada': r.val_cart_castigada ?? 0,
      'num_dias_vencido': r.num_dias_vencido ?? 0,
      'fec_nacimiento': parseAndFormatDate(r.fec_nacimiento),
      'deuda_refinanciada': r.deuda_refinanciada ?? 0,
      'fec_vencimiento': parseAndFormatDate(r.fec_vencimiento),
      'REPORTADO': r.REPORTADO ?? 0,
      'FACTURAS_PAGADAS': r.FACTURAS_PAGADAS ?? 0,
      'PARROQUIA': r.PARROQUIA || '',
      'EMAIL': r.EMAIL || '',
      'GENERO': r.GENERO || '',
      'ESTADO_CIVIL': r.ESTADO_CIVIL || '',
      'ESTADO_OPERACION': r.ESTADO_OPERACION || '',
      'VALOR_NDI': r.VALOR_NDI ?? 0,
      'FECHA_PAGO_CUOTA': parseAndFormatDate(r.FECHA_PAGO_CUOTA)
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Set explicit string cell type ('s') for identifiers AND date columns to ensure 10-character yyyy/MM/dd strings for Excel/VBA!
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const textCols = isErrorFile ? [1, 5, 6] : [1, 5, 8]; // cod_id_sujeto, telefono, num_operacion
  const dateCols = isErrorFile ? [7] : [6, 9, 16, 18, 27]; // fec_corte_saldo, fec_concesion, fec_nacimiento, fec_vencimiento, FECHA_PAGO_CUOTA
  const numCols2Dec = isErrorFile ? [8, 9, 10, 11] : [10, 11, 12, 13, 14, 17, 26]; // val_operacion, val_xvencer, val_vencido, val_dem_judicial, val_cart_castigada, deuda_refinanciada, VALOR_NDI
  const numColsInt = isErrorFile ? [12] : [15, 19, 20]; // num_dias_vencido, REPORTADO, FACTURAS_PAGADAS

  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    // String formatting for IDs and phone numbers
    textCols.forEach(cIdx => {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: cIdx });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].t = 's'; // Force string type
        worksheet[cellAddress].z = '@'; // Force text format
      }
    });

    // Date formatting (Force String 's' type with yyyy/MM/dd format so Len(cad) is 10 and skips VBA formatoFechaa error)
    dateCols.forEach(cIdx => {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: cIdx });
      const cell = worksheet[cellAddress];
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') {
        const strVal = parseAndFormatDate(cell.v);
        cell.v = strVal; // String "yyyy/MM/dd" (10 chars)
        cell.t = 's';    // String cell type in Excel
        cell.z = '@';    // Text format
      }
    });

    // Pure Numeric formatting for Monetary values (Force Number 'n' type with 2 decimals)
    numCols2Dec.forEach(cIdx => {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: cIdx });
      const cell = worksheet[cellAddress];
      if (cell) {
        const rawNum = typeof cell.v === 'number' ? cell.v : parseNumberSafe(cell.v);
        cell.v = Math.round(rawNum * 100) / 100;
        cell.t = 'n';    // Native numeric type in Excel
        cell.z = '0.00'; // Standard 2 decimals format
      }
    });

    // Integer numeric formatting
    numColsInt.forEach(cIdx => {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: cIdx });
      const cell = worksheet[cellAddress];
      if (cell) {
        const rawNum = typeof cell.v === 'number' ? cell.v : parseNumberSafe(cell.v);
        cell.v = Math.round(rawNum);
        cell.t = 'n';    // Native numeric type
        cell.z = '0';    // Integer format
      }
    });
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

/**
 * Generates and downloads a .gjm text file formatted with semicolon delimiter matching Equifax 28-column matrix
 */
export function exportBuroToGjm(records: BuroRecord[], filename: string) {
  if (!records || records.length === 0) return;

  const header = [
    'cod_tipo_id', 'cod_id_sujeto', 'nom_sujeto', 'direccion', 'ciudad',
    'telefono', 'fec_corte_saldo', 'tipo_deudor', 'num_operacion', 'fec_concesion',
    'val_operacion', 'val_xvencer', 'val_vencido', 'val_dem_judicial', 'val_cart_castigada',
    'num_dias_vencido', 'fec_nacimiento', 'deuda_refinanciada', 'fec_vencimiento',
    'REPORTADO', 'FACTURAS_PAGADAS', 'PARROQUIA', 'EMAIL', 'GENERO',
    'ESTADO_CIVIL', 'ESTADO_OPERACION', 'VALOR_NDI', 'FECHA_PAGO_CUOTA'
  ].join(';');

  const lines = records.map(r => {
    const row = [
      r.cod_tipo_id || (String(r.cod_id_sujeto).length === 13 ? 'R' : 'C'),
      String(r.cod_id_sujeto || ''),
      r.nom_sujeto || '',
      r.direccion || '',
      r.ciudad || '',
      String(r.telefono || ''),
      parseAndFormatDate(r.fec_corte_saldo),
      r.tipo_deudor || 'TITULAR',
      String(r.num_operacion || ''),
      parseAndFormatDate(r.fec_concesion),
      r.val_operacion ?? r.monto_concedido ?? 0,
      r.val_xvencer ?? 0,
      r.val_vencido ?? 0,
      r.val_dem_judicial ?? 0,
      r.val_cart_castigada ?? 0,
      r.num_dias_vencido ?? 0,
      parseAndFormatDate(r.fec_nacimiento),
      r.deuda_refinanciada ?? 0,
      parseAndFormatDate(r.fec_vencimiento),
      r.REPORTADO ?? 0,
      r.FACTURAS_PAGADAS ?? 0,
      r.PARROQUIA || '',
      r.EMAIL || '',
      r.GENERO || '',
      r.ESTADO_CIVIL || '',
      r.ESTADO_OPERACION || '',
      r.VALOR_NDI ?? 0,
      parseAndFormatDate(r.FECHA_PAGO_CUOTA)
    ];
    return row.join(';');
  });

  const content = [header, ...lines].join('\r\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const gjmFilename = filename.endsWith('.gjm') ? filename : filename.replace(/\.xlsx$/i, '.gjm');
  a.download = gjmFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Algoritmo oficial de validación de identidad (Módulo 10 del Registro Civil del Ecuador)
 * Valida Cédulas y RUCs ecuatorianos.
 */

export interface Modulo10Result {
  isValid: boolean;
  type: 'CEDULA' | 'RUC_NATURAL' | 'RUC_PRIVADO' | 'RUC_PUBLICO' | 'INVALIDO';
  reason?: string;
  cleanedId: string;
}

export function validateEcuadorianId(idRaw: string | number | undefined | null): Modulo10Result {
  if (!idRaw) {
    return {
      isValid: false,
      type: 'INVALIDO',
      reason: 'Código o número de cédula vacío',
      cleanedId: ''
    };
  }

  // Preserve as string and trim
  let id = String(idRaw).trim();

  // If numeric, pad leading zeros to 10 if length is 9, or 13 if length is 12
  if (/^\d+$/.test(id)) {
    if (id.length === 9) id = '0' + id;
    if (id.length === 12) id = '0' + id;
  }

  // Must contain only numbers
  if (!/^\d+$/.test(id)) {
    return {
      isValid: false,
      type: 'INVALIDO',
      reason: 'Contiene caracteres no numéricos',
      cleanedId: id
    };
  }

  if (id.length !== 10 && id.length !== 13) {
    return {
      isValid: false,
      type: 'INVALIDO',
      reason: `Longitud incorrecta (${id.length} dígitos, se esperaban 10 o 13)`,
      cleanedId: id
    };
  }

  // Validate province code (first 2 digits)
  const province = parseInt(id.substring(0, 2), 10);
  if ((province < 1 || province > 24) && province !== 30) {
    return {
      isValid: false,
      type: 'INVALIDO',
      reason: `Código de provincia inválido (${province})`,
      cleanedId: id
    };
  }

  const thirdDigit = parseInt(id.substring(2, 3), 10);

  // 1. Cédula Natural (10 digits) or RUC Natural (13 digits starting with valid Cédula)
  if (thirdDigit < 6) {
    const isCedulaValid = validateCedulaModulo10(id.substring(0, 10));
    if (!isCedulaValid) {
      return {
        isValid: false,
        type: 'INVALIDO',
        reason: 'Falló el dígito verificador (Módulo 10)',
        cleanedId: id
      };
    }

    if (id.length === 13) {
      const establishment = id.substring(10, 13);
      if (establishment === '000') {
        return {
          isValid: false,
          type: 'INVALIDO',
          reason: 'RUC de Persona Natural termina en 000 (inválido)',
          cleanedId: id
        };
      }
      return { isValid: true, type: 'RUC_NATURAL', cleanedId: id };
    }

    return { isValid: true, type: 'CEDULA', cleanedId: id };
  }

  // 2. RUC Sociedad Privada o Extranjero (3rd digit = 9, 13 digits)
  if (thirdDigit === 9) {
    if (id.length !== 13) {
      return { isValid: false, type: 'INVALIDO', reason: 'RUC Privado debe tener 13 dígitos', cleanedId: id };
    }
    const isRucPrivadoValid = validateRucPrivadoModulo11(id);
    if (!isRucPrivadoValid) {
      return { isValid: false, type: 'INVALIDO', reason: 'Falló el dígito verificador RUC Privado (Módulo 11)', cleanedId: id };
    }
    return { isValid: true, type: 'RUC_PRIVADO', cleanedId: id };
  }

  // 3. RUC Entidad Pública (3rd digit = 6, 13 digits)
  if (thirdDigit === 6) {
    if (id.length !== 13) {
      return { isValid: false, type: 'INVALIDO', reason: 'RUC Público debe tener 13 dígitos', cleanedId: id };
    }
    const isRucPublicoValid = validateRucPublicoModulo11(id);
    if (!isRucPublicoValid) {
      return { isValid: false, type: 'INVALIDO', reason: 'Falló el dígito verificador RUC Público (Módulo 11)', cleanedId: id };
    }
    return { isValid: true, type: 'RUC_PUBLICO', cleanedId: id };
  }

  return {
    isValid: false,
    type: 'INVALIDO',
    reason: 'Tercer dígito de identificación no reconocido',
    cleanedId: id
  };
}

/**
 * Validates 10-digit Cédula using Módulo 10 algorithm
 */
function validateCedulaModulo10(cedula: string): boolean {
  if (cedula.length !== 10) return false;
  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const verifierDigit = parseInt(cedula.substring(9, 10), 10);

  let totalSum = 0;
  for (let i = 0; i < 9; i++) {
    let val = parseInt(cedula.substring(i, i + 1), 10) * coefficients[i];
    if (val >= 10) val -= 9;
    totalSum += val;
  }

  const remainder = totalSum % 10;
  const calculatedDigit = remainder === 0 ? 0 : 10 - remainder;

  return calculatedDigit === verifierDigit;
}

/**
 * Validates RUC Privado (13 digits, 3rd digit = 9) using Módulo 11
 */
function validateRucPrivadoModulo11(ruc: string): boolean {
  const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  const verifierDigit = parseInt(ruc.substring(9, 10), 10);
  const establishment = ruc.substring(10, 13);
  if (establishment === '000') return false;

  let totalSum = 0;
  for (let i = 0; i < 9; i++) {
    totalSum += parseInt(ruc.substring(i, i + 1), 10) * coefficients[i];
  }

  const remainder = totalSum % 11;
  const calculatedDigit = remainder === 0 ? 0 : 11 - remainder;

  return calculatedDigit === verifierDigit;
}

/**
 * Validates RUC Público (13 digits, 3rd digit = 6) using Módulo 11
 */
function validateRucPublicoModulo11(ruc: string): boolean {
  const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
  const verifierDigit = parseInt(ruc.substring(8, 9), 10);
  const establishment = ruc.substring(9, 13);
  if (establishment === '0000') return false;

  let totalSum = 0;
  for (let i = 0; i < 8; i++) {
    totalSum += parseInt(ruc.substring(i, i + 1), 10) * coefficients[i];
  }

  const remainder = totalSum % 11;
  const calculatedDigit = remainder === 0 ? 0 : 11 - remainder;

  return calculatedDigit === verifierDigit;
}

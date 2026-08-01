import { describe, it, expect, vi, beforeAll } from 'vitest';
import { calculateInstallments, formatCurrency, generateCheckNumber, isSuperAdminEmail, roundToTwo, SUPER_ADMIN_EMAILS } from '../utils';

describe('calculateInstallments (Penny Drop Algorithm)', () => {
  it('should return empty list for 0 or negative installments', () => {
    expect(calculateInstallments(100, 0)).toEqual([]);
    expect(calculateInstallments(100, -1)).toEqual([]);
  });

  it('should return the total amount as a single installment if months is 1', () => {
    expect(calculateInstallments(100.55, 1)).toEqual([100.55]);
  });

  it('should distribute installments evenly when divisible', () => {
    expect(calculateInstallments(90, 3)).toEqual([30, 30, 30]);
  });

  it('should apply remainder to the last installment (penny drop)', () => {
    // 100 / 3 is 33.33333... Base installments are 33.33. Sum is 99.99. Remainder of 0.01 is added to the third.
    expect(calculateInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it('should handle negative remainders correctly', () => {
    // 100 / 6 is 16.6666... Base rounded is 16.67. 16.67 * 6 = 100.02. Remainder of -0.02 is applied to the last.
    expect(calculateInstallments(100, 6)).toEqual([16.67, 16.67, 16.67, 16.67, 16.67, 16.65]);
  });
});

describe('formatCurrency', () => {
  it('should format currencies correctly using standard locale', () => {
    const formatted = formatCurrency(1234.56, 'USD');
    // We expect the formatting to contain the currency symbol or code and proper grouping
    expect(formatted).toContain('1.234,56');
    expect(formatted).toContain('$');
  });

  it('should fallback gracefully if an error occurs in Intl.NumberFormat', () => {
    // Mock Intl.NumberFormat to throw to trigger fallback
    const originalIntl = global.Intl;
    vi.stubGlobal('Intl', {
      NumberFormat: vi.fn().mockImplementation(() => {
        throw new Error('Locale not supported');
      })
    });

    const fallback = formatCurrency(100.5, 'USD');
    expect(fallback).toBe('USD 100.50');

    // Restore global
    vi.stubGlobal('Intl', originalIntl);
  });
});

describe('generateCheckNumber', () => {
  it('should return empty string if base number is empty', () => {
    expect(generateCheckNumber('', 0)).toBe('');
  });

  it('should return base string with index suffix if base is not a number', () => {
    expect(generateCheckNumber('ABC', 2)).toBe('ABC-3');
  });

  it('should increment check numbers correctly and preserve leading zeros padding', () => {
    expect(generateCheckNumber('000125', 0)).toBe('000125');
    expect(generateCheckNumber('000125', 1)).toBe('000126');
    expect(generateCheckNumber('000125', 5)).toBe('000130');
    expect(generateCheckNumber('999', 1)).toBe('1000');
  });
});

describe('isSuperAdminEmail', () => {
  it('should return false for empty or null emails', () => {
    expect(isSuperAdminEmail(null)).toBe(false);
    expect(isSuperAdminEmail(undefined)).toBe(false);
    expect(isSuperAdminEmail('')).toBe(false);
  });

  it('should identify a superadmin email when present in SUPER_ADMIN_EMAILS list', () => {
    SUPER_ADMIN_EMAILS.push('admin_test_temp@example.com');
    expect(isSuperAdminEmail('admin_test_temp@example.com')).toBe(true);
    SUPER_ADMIN_EMAILS.pop();
  });

  it('should return false for general non-admin emails', () => {
    expect(isSuperAdminEmail('user@test.com')).toBe(false);
  });
});

describe('roundToTwo', () => {
  it('should round positive floating-point numbers to 2 decimal places', () => {
    expect(roundToTwo(10.234)).toBe(10.23);
    expect(roundToTwo(10.236)).toBe(10.24);
    expect(roundToTwo(10.235)).toBe(10.24);
  });

  it('should handle standard IEEE-754 precision issues gracefully', () => {
    expect(roundToTwo(1.005)).toBe(1.01);
    expect(roundToTwo(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004
  });

  it('should preserve integers and already-rounded decimals', () => {
    expect(roundToTwo(5)).toBe(5);
    expect(roundToTwo(5.5)).toBe(5.5);
    expect(roundToTwo(5.55)).toBe(5.55);
  });
});

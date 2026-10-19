// Numbers as people type them (decimal comma, thousands separators, Arabic-
// Indic and Persian digits, the Arabic decimal mark). IDs: docs/test-cases/budget.md
import fc from 'fast-check';
import { parseNumberInput, parseWholeNumberInput } from '../numberInput';

describe('NUM: reading typed numbers', () => {
  test.each([
    ['12.50', 12.5],
    ['12,50', 12.5],
    ['12,5', 12.5],
    ['1,000', 1000],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['1 234,50', 1234.5],
    ['١٢٠٫٥', 120.5],
    ['١٬٢٣٤٫٥', 1234.5],
    ['۱۲۰', 120],
    [' 45 ', 45],
    ['-5', -5],
    ['0', 0],
  ])('NUM-001 "%s" is %s', (text, value) => {
    expect(parseNumberInput(text)).toBe(value);
  });

  test.each(['', '   ', 'abc', '12a', '1.2.3', '--5', '$5'])('NUM-002 "%s" is not a number', (text) => {
    expect(parseNumberInput(text)).toBeNaN();
  });

  test('NUM-003 any plain number typed with a dot or a decimal comma reads back the same', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: 99 }), (whole, cents) => {
        const c = String(cents).padStart(2, '0');
        expect(parseNumberInput(`${whole}.${c}`)).toBeCloseTo(whole + cents / 100, 6);
        expect(parseNumberInput(`${whole},${c}`)).toBeCloseTo(whole + cents / 100, 6);
      })
    );
  });

  test('NUM-004 whole numbers only, for pages, minutes and days', () => {
    expect(parseWholeNumberInput('142')).toBe(142);
    expect(parseWholeNumberInput('١٤٢')).toBe(142);
    expect(parseWholeNumberInput('14.5')).toBeNaN();
  });
});

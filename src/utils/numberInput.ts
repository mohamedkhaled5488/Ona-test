// Reading a number the way people type it. `Number()` alone rejects a decimal
// comma ("12,50") and Arabic-Indic or Persian digits ("١٢٫٥"), which a phone
// keypad in many regions produces, so an amount or a page number would
// silently become invalid.
//
//   parseNumberInput('12,50')    -> 12.5
//   parseNumberInput('1,234.50') -> 1234.5
//   parseNumberInput('١٢٠٫٥')     -> 120.5
//   parseNumberInput('abc')      -> NaN
const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function parseNumberInput(text: string): number {
  let s = (text ?? '')
    .trim()
    .replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d])
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/[٬\s  ']/g, ''); // Arabic thousands separator, spaces, apostrophes
  if (s === '' || !/^[-+]?[\d.,]+$/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both: whichever comes last is the decimal mark ("1,234.50" / "1.234,50").
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // Only commas: "12,50" is a decimal; "1,000" or "1,000,000" are thousands.
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join('');
  }
  if ((s.match(/\./g) ?? []).length > 1) return NaN;
  return Number(s);
}

// For whole numbers (pages, minutes, days): NaN unless it's a whole number.
export function parseWholeNumberInput(text: string): number {
  const n = parseNumberInput(text);
  return Number.isInteger(n) ? n : NaN;
}

// For a whole-number field as it's typed: keeps digits only, turning
// Arabic-Indic and Persian digits into 0-9 instead of dropping them.
export function onlyDigits(text: string): string {
  return (text ?? '').replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d]).replace(/[^0-9]/g, '');
}

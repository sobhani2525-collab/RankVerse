const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/**
 * Converts any ASCII digits (0-9) inside a value to Persian (Extended
 * Arabic-Indic) digits, leaving everything else untouched -- safe to call
 * on a plain number, a formatted string ("8.3", "+۱۸" before conversion,
 * "۰۱"-style zero-padded ranks), or a string that mixes digits with other
 * text, since only the digit characters themselves are swapped.
 */
export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

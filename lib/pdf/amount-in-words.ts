const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

const CURRENCY_LABELS: Record<string, string> = {
  INR: "Rupees",
  USD: "US Dollars",
  EUR: "Euros",
  GBP: "Pounds Sterling",
};

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const rest = n % 10;
  return rest ? `${TENS[tens]} ${ONES[rest]}` : TENS[tens];
}

function threeDigitWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(" ");
}

/** Indian numbering (crore / lakh / thousand), not thousand / million grouping. */
function numberToWordsIndian(n: number): string {
  if (n === 0) return "Zero";
  let str = String(Math.trunc(n));
  const parts: string[] = [];

  if (str.length > 7) {
    const croreDigits = Number(str.slice(0, str.length - 7));
    parts.push(`${numberToWordsIndian(croreDigits)} Crore`);
    str = str.slice(str.length - 7);
  }
  if (str.length > 5) {
    const lakhDigits = Number(str.slice(0, str.length - 5));
    if (lakhDigits > 0) parts.push(`${twoDigitWords(lakhDigits)} Lakh`);
    str = str.slice(str.length - 5);
  }
  if (str.length > 3) {
    const thousandDigits = Number(str.slice(0, str.length - 3));
    if (thousandDigits > 0) parts.push(`${twoDigitWords(thousandDigits)} Thousand`);
    str = str.slice(str.length - 3);
  }
  const last3 = Number(str);
  if (last3 > 0) parts.push(threeDigitWords(last3));

  return parts.join(" ");
}

/**
 * "Total amount in words" line for the invoice footer, e.g.
 * `amountInWords(67118, "INR")` -> "Rupees Sixty Seven Thousand One Hundred
 * Eighteen Only".
 */
export function amountInWords(amount: number, currency = "INR"): string {
  const label = CURRENCY_LABELS[currency.toUpperCase()] ?? currency.toUpperCase();
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const fraction = Math.round((abs - whole) * 100);

  let out = `${label} ${numberToWordsIndian(whole)}`;
  if (fraction > 0) out += ` and ${twoDigitWords(fraction)} Paise`;
  out += " Only";
  return negative ? `Minus ${out}` : out;
}

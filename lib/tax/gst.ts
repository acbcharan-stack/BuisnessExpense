/** India GST helpers. */

/** State code -> name for the 2-digit prefix of a GSTIN. */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "25": "Daman & Diu", "26": "Dadra & Nagar Haveli",
  "27": "Maharashtra", "28": "Andhra Pradesh (Old)", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory", "99": "Centre",
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Structural validation of a GSTIN, including the checksum digit (15th char).
 * Returns true only for a well-formed, checksum-valid GSTIN.
 */
export function isValidGstin(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) return false;
  if (!(gstin.slice(0, 2) in GST_STATE_CODES)) return false;
  return gstin[14] === gstinChecksumChar(gstin.slice(0, 14));
}

const CODE_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Computes the GSTIN checksum character for the first 14 characters. */
export function gstinChecksumChar(first14: string): string {
  const n = CODE_CHARS.length;
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const codePoint = CODE_CHARS.indexOf(first14[i]);
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / n) + (addend % n);
    sum += addend;
  }
  const remainder = sum % n;
  const checkCodePoint = (n - remainder) % n;
  return CODE_CHARS[checkCodePoint];
}

export function gstStateCode(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.trim().length < 2) return null;
  return gstin.trim().slice(0, 2);
}

/**
 * Given the supplier's GSTIN and the buyer's home state code, decide whether a
 * domestic supply attracts CGST+SGST (intra-state) or IGST (inter-state).
 * Falls back to "igst" when the supplier state is unknown.
 */
export function domesticGstSplit(
  supplierGstin: string | null | undefined,
  homeStateCode: string,
): "cgst_sgst" | "igst" {
  const supplierState = gstStateCode(supplierGstin);
  if (!supplierState) return "igst";
  return supplierState === homeStateCode ? "cgst_sgst" : "igst";
}

/** GST components a registered buyer can claim back as input tax credit. */
export const ITC_TAX_TYPES = ["CGST", "SGST", "IGST", "CESS"] as const;

/** Sum of input-tax-credit-eligible GST for a set of tax lines. */
export function itcEligibleAmount(
  taxLines: { tax_type: string; amount: number }[],
): number {
  const eligible = new Set<string>(ITC_TAX_TYPES);
  return taxLines
    .filter((t) => eligible.has(t.tax_type))
    .reduce((acc, t) => acc + (Number.isFinite(t.amount) ? t.amount : 0), 0);
}

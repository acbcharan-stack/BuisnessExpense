import type { InvoiceDirection } from "@/lib/types";

const DIRECTION_CODE: Record<InvoiceDirection, string> = {
  purchase: "PI",
  sale: "SI",
};

/** Indian financial year (Apr–Mar) label for a date, e.g. "2025-26". */
export function fyLabelFor(date: Date): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${String(endYear).padStart(2, "0")}`;
}

/** Prefix to use when a business hasn't set an explicit `invoice_prefix`. */
function derivePrefix(businessName: string): string {
  const cleaned = businessName.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, 6) || "INV";
}

/**
 * Our own sequential invoice number, e.g. "ACB/PI/2025-26/0007" — separate
 * from whatever invoice/PO number the counterparty put on their document.
 */
export function formatInvoiceNumber(params: {
  invoicePrefix: string | null;
  businessName: string;
  direction: InvoiceDirection;
  fyLabel: string;
  seq: number;
}): string {
  const prefix = params.invoicePrefix?.trim() || derivePrefix(params.businessName);
  const code = DIRECTION_CODE[params.direction];
  const seq = String(params.seq).padStart(4, "0");
  return `${prefix}/${code}/${params.fyLabel}/${seq}`;
}

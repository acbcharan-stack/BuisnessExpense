import { z } from "zod";
import { RECORD_TYPES, TAX_TYPES } from "@/lib/types";

/** public.expenses money columns are numeric(14,2). */
const MONEY_MAX = 999_999_999_999.99;

const money = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  })
  .refine((n) => n === null || Math.abs(n) <= MONEY_MAX, {
    message: "Amount is out of range.",
  });

const trimmedOrNull = z
  .union([z.string(), z.null()])
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const isoDateOrNull = trimmedOrNull.refine(
  (v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v),
  "Dates must be YYYY-MM-DD",
);

export const lineItemSchema = z.object({
  description: trimmedOrNull,
  hsn_sac: trimmedOrNull,
  quantity: money,
  unit_price: money,
  amount: money,
  tax_rate: money,
});

export const taxLineSchema = z.object({
  tax_type: z.enum(TAX_TYPES),
  rate: money,
  amount: money,
  jurisdiction: trimmedOrNull,
});

/** Free-form extra fields the reviewer adds. Blank rows are dropped on save. */
export const customFieldSchema = z.object({
  label: trimmedOrNull,
  value: trimmedOrNull,
});

export const recordFormSchema = z.object({
  record_type: z.enum(RECORD_TYPES),
  vendor_name: trimmedOrNull,
  category_id: z
    .union([z.string(), z.null()])
    .transform((v) => (v == null || v === "" ? null : v)),
  new_category_name: trimmedOrNull,
  invoice_number: trimmedOrNull,
  invoice_date: isoDateOrNull,
  due_date: isoDateOrNull,
  currency: z
    .string()
    .transform((v) => (v.trim() === "" ? "INR" : v.trim().toUpperCase())),
  country: z
    .string()
    .transform((v) => (v.trim() === "" ? "IN" : v.trim().toUpperCase())),
  subtotal: money,
  tax_total: money,
  total: money,
  notes: trimmedOrNull,
  line_items: z.array(lineItemSchema),
  taxes: z.array(taxLineSchema),
  custom_fields: z.array(customFieldSchema).default([]),
});

export type RecordFormValues = z.input<typeof recordFormSchema>;
export type RecordFormParsed = z.output<typeof recordFormSchema>;

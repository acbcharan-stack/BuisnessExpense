import { Type } from "@google/genai";
import { z } from "zod";

/**
 * Schema handed to Gemini (`responseSchema`). Kept deliberately flat and
 * permissive — every optional field is `nullable`.
 */
export const geminiResponseSchema = {
  type: Type.OBJECT,
  properties: {
    suggested_record_type: {
      type: Type.STRING,
      enum: ["invoice", "expense"],
      description: "invoice = supplier bill for goods/services; expense = running cost",
    },
    document_kind: {
      type: Type.STRING,
      enum: ["invoice", "bill", "receipt", "utility", "payroll", "other"],
      nullable: true,
    },
    vendor_name: { type: Type.STRING, nullable: true },
    vendor_tax_id: { type: Type.STRING, nullable: true },
    vendor_tax_id_type: {
      type: Type.STRING,
      enum: ["GSTIN", "VAT", "EIN", "OTHER"],
      nullable: true,
    },
    vendor_country: {
      type: Type.STRING,
      nullable: true,
      description: "ISO 3166-1 alpha-2, e.g. IN",
    },
    invoice_number: { type: Type.STRING, nullable: true },
    invoice_date: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD" },
    due_date: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD" },
    currency: { type: Type.STRING, nullable: true, description: "ISO 4217, default INR" },
    subtotal: { type: Type.NUMBER, nullable: true },
    tax_total: { type: Type.NUMBER, nullable: true },
    total: { type: Type.NUMBER, nullable: true },
    suggested_category: { type: Type.STRING, nullable: true },
    notes: { type: Type.STRING, nullable: true },
    confidence: { type: Type.NUMBER, nullable: true },
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, nullable: true },
          hsn_sac: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER, nullable: true },
          unit_price: { type: Type.NUMBER, nullable: true },
          amount: { type: Type.NUMBER, nullable: true },
          tax_rate: { type: Type.NUMBER, nullable: true },
        },
      },
    },
    taxes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tax_type: {
            type: Type.STRING,
            enum: ["CGST", "SGST", "IGST", "CESS", "VAT", "GST", "SALES_TAX", "OTHER"],
          },
          rate: { type: Type.NUMBER, nullable: true },
          amount: { type: Type.NUMBER, nullable: true },
          jurisdiction: { type: Type.STRING, nullable: true },
        },
      },
    },
  },
  required: ["suggested_record_type"],
} as const;

/* -------------------------------------------------------------------------- */
/* Zod schema — validates & normalises whatever Gemini actually returns.       */
/* -------------------------------------------------------------------------- */

/*
 * Model output is untrusted input. Everything below clamps it to what the
 * database columns can hold, so one odd value can't make the whole insert fail
 * (or, worse, silently store nonsense). Out-of-range values become `null`,
 * which the reviewer then fills in by hand.
 */

// numeric(14,2) holds |x| < 1e12; numeric(14,3) < 1e11; numeric(6,2) < 1e4.
const MONEY_LIMIT = 1e12;
const QUANTITY_LIMIT = 1e11;
const RATE_LIMIT = 1e4;

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function boundedNumber(limit: number, decimals: number) {
  return z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const n = toFiniteNumber(v);
      if (n === null) return null;
      const rounded = Number(n.toFixed(decimals));
      return Math.abs(rounded) < limit ? rounded : null;
    });
}

const money = boundedNumber(MONEY_LIMIT, 2);
const quantity = boundedNumber(QUANTITY_LIMIT, 3);
const rate = boundedNumber(RATE_LIMIT, 2);
const confidenceNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    const n = toFiniteNumber(v);
    return n !== null && n >= 0 && n <= 1 ? n : null;
  });

// Everything below space except tab / LF / CR, plus DEL.
const CONTROL_CHARS = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]", "g");

/** Trims, drops control characters (Postgres rejects NUL), caps the length. */
function cleanText(max: number) {
  return z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return null;
      const t = String(v).replace(CONTROL_CHARS, "").trim();
      return t === "" ? null : t.slice(0, max);
    });
}

const nullableDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
    const d = new Date(`${t}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) return null;
    const year = d.getUTCFullYear();
    return year >= 1990 && year <= 2100 ? t : null;
  });

const currencyCode = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim().toUpperCase();
    return /^[A-Z]{3}$/.test(t) ? t : null;
  });

const countryCode = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(t) ? t : null;
  });

const MAX_LINE_ITEMS = 200;
const MAX_TAX_ROWS = 20;

export const extractionResultSchema = z.object({
  suggested_record_type: z
    .enum(["invoice", "expense"])
    .catch("expense"),
  document_kind: z
    .enum(["invoice", "bill", "receipt", "utility", "payroll", "other"])
    .nullish()
    .transform((v) => v ?? null),
  vendor_name: cleanText(200),
  vendor_tax_id: cleanText(40),
  vendor_tax_id_type: z
    .enum(["GSTIN", "VAT", "EIN", "OTHER"])
    .nullish()
    .transform((v) => v ?? null),
  vendor_country: countryCode,
  invoice_number: cleanText(100),
  invoice_date: nullableDate,
  due_date: nullableDate,
  currency: currencyCode,
  subtotal: money,
  tax_total: money,
  total: money,
  suggested_category: cleanText(120),
  notes: cleanText(2000),
  confidence: confidenceNumber,
  line_items: z
    .array(
      z.object({
        description: cleanText(1000),
        hsn_sac: cleanText(20),
        quantity: quantity,
        unit_price: money,
        amount: money,
        tax_rate: rate,
      }),
    )
    .nullish()
    .transform((v) => (v ?? []).slice(0, MAX_LINE_ITEMS)),
  taxes: z
    .array(
      z.object({
        tax_type: z
          .enum(["CGST", "SGST", "IGST", "CESS", "VAT", "GST", "SALES_TAX", "OTHER"])
          .catch("OTHER"),
        rate: rate,
        amount: money,
        jurisdiction: cleanText(60),
      }),
    )
    .nullish()
    .transform((v) => (v ?? []).slice(0, MAX_TAX_ROWS)),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

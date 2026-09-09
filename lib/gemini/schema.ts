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

const nullableNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  });

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? null : String(v).trim()));

export const extractionResultSchema = z.object({
  suggested_record_type: z
    .enum(["invoice", "expense"])
    .catch("expense"),
  document_kind: z
    .enum(["invoice", "bill", "receipt", "utility", "payroll", "other"])
    .nullish()
    .transform((v) => v ?? null),
  vendor_name: nullableString,
  vendor_tax_id: nullableString,
  vendor_tax_id_type: z
    .enum(["GSTIN", "VAT", "EIN", "OTHER"])
    .nullish()
    .transform((v) => v ?? null),
  vendor_country: nullableString,
  invoice_number: nullableString,
  invoice_date: nullableString,
  due_date: nullableString,
  currency: nullableString,
  subtotal: nullableNumber,
  tax_total: nullableNumber,
  total: nullableNumber,
  suggested_category: nullableString,
  notes: nullableString,
  confidence: nullableNumber,
  line_items: z
    .array(
      z.object({
        description: nullableString,
        hsn_sac: nullableString,
        quantity: nullableNumber,
        unit_price: nullableNumber,
        amount: nullableNumber,
        tax_rate: nullableNumber,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  taxes: z
    .array(
      z.object({
        tax_type: z
          .enum(["CGST", "SGST", "IGST", "CESS", "VAT", "GST", "SALES_TAX", "OTHER"])
          .catch("OTHER"),
        rate: nullableNumber,
        amount: nullableNumber,
        jurisdiction: nullableString,
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

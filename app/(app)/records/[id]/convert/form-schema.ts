import { z } from "zod";
import { TAX_ID_TYPES } from "@/lib/types";
import {
  money,
  trimmedOrNull,
  isoDateOrNull,
  lineItemSchema,
  taxLineSchema,
} from "../form-schema";

export const counterpartySchema = z.object({
  name: z.string().trim().min(1, "Counterparty name is required."),
  tax_id: trimmedOrNull,
  tax_id_type: z.enum(TAX_ID_TYPES).nullable(),
  address: trimmedOrNull,
  country: z
    .string()
    .transform((v) => (v.trim() === "" ? "IN" : v.trim().toUpperCase())),
});

export const ourBusinessOverridesSchema = z.object({
  name: z.string().trim().min(1, "Business name is required."),
  legal_name: trimmedOrNull,
  gstin: trimmedOrNull,
  gst_state_code: trimmedOrNull,
  address: trimmedOrNull,
  bank_account_name: trimmedOrNull,
  bank_account_number: trimmedOrNull,
  bank_ifsc: trimmedOrNull,
  bank_name: trimmedOrNull,
  signature_storage_path: trimmedOrNull,
  logo_storage_path: trimmedOrNull,
  terms_and_conditions: trimmedOrNull,
});

export const generatedInvoiceFormSchema = z.object({
  direction: z.literal("purchase"),
  business_id: z.string().min(1, "Choose which business is issuing this."),
  counterparty: counterpartySchema,
  our_business: ourBusinessOverridesSchema,
  our_invoice_date: isoDateOrNull,
  currency: z
    .string()
    .transform((v) => (v.trim() === "" ? "INR" : v.trim().toUpperCase())),
  subtotal: money,
  tax_total: money,
  total: money,
  notes: trimmedOrNull,
  line_items: z.array(lineItemSchema),
  taxes: z.array(taxLineSchema),
});

export type GeneratedInvoiceFormValues = z.input<typeof generatedInvoiceFormSchema>;
export type GeneratedInvoiceFormParsed = z.output<typeof generatedInvoiceFormSchema>;

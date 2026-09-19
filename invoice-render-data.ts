import type {
  CounterpartySnapshot,
  OurBusinessSnapshot,
} from "@/lib/supabase/database.types";
import { amountInWords } from "./amount-in-words";

export interface RenderLineItem {
  description: string | null;
  hsn_sac: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  tax_rate: number | null;
}

export interface RenderTaxLine {
  tax_type: string;
  rate: number | null;
  amount: number;
  jurisdiction: string | null;
}

export interface PartyRenderData {
  name: string;
  legalName: string | null;
  taxId: string | null;
  taxIdType: string | null;
  address: string | null;
  country: string;
}

export interface BankRenderData {
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
}

export interface InvoiceRenderData {
  ourInvoiceNumber: string | null;
  ourInvoiceDate: string | null;
  currency: string;
  /** Our business — printed as the letterhead. */
  issuer: PartyRenderData;
  /** The supplier from the Purchase Order — printed as "Vendor / Bill To". */
  vendor: PartyRenderData;
  lineItems: RenderLineItem[];
  taxes: RenderTaxLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountInWords: string;
  notes: string | null;
  logoStoragePath: string | null;
  signatureStoragePath: string | null;
  termsAndConditions: string | null;
  bank: BankRenderData | null;
}

/**
 * Shapes the frozen counterparty/our-business snapshots + line items into a
 * flat, template-ready structure, so `invoice-template.tsx` itself stays dumb.
 */
export function buildInvoiceRenderData(params: {
  counterparty: CounterpartySnapshot;
  ourBusiness: OurBusinessSnapshot;
  ourInvoiceNumber: string | null;
  ourInvoiceDate: string | null;
  currency: string;
  lineItems: RenderLineItem[];
  taxes: RenderTaxLine[];
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  notes: string | null;
}): InvoiceRenderData {
  const ourParty: PartyRenderData = {
    name: params.ourBusiness.name,
    legalName: params.ourBusiness.legal_name,
    taxId: params.ourBusiness.gstin,
    taxIdType: params.ourBusiness.gstin ? "GSTIN" : null,
    address: params.ourBusiness.address,
    country: "IN",
  };
  const counterpartyParty: PartyRenderData = {
    name: params.counterparty.name,
    legalName: null,
    taxId: params.counterparty.tax_id,
    taxIdType: params.counterparty.tax_id_type,
    address: params.counterparty.address,
    country: params.counterparty.country,
  };

  const total = params.total ?? 0;

  return {
    ourInvoiceNumber: params.ourInvoiceNumber,
    ourInvoiceDate: params.ourInvoiceDate,
    currency: params.currency,
    issuer: ourParty,
    vendor: counterpartyParty,
    lineItems: params.lineItems,
    taxes: params.taxes,
    subtotal: params.subtotal ?? 0,
    taxTotal: params.taxTotal ?? 0,
    total,
    amountInWords: amountInWords(total, params.currency),
    notes: params.notes,
    logoStoragePath: params.ourBusiness.logo_storage_path,
    signatureStoragePath: params.ourBusiness.signature_storage_path,
    termsAndConditions: params.ourBusiness.terms_and_conditions,
    bank: params.ourBusiness.bank_account_number
      ? {
          accountName: params.ourBusiness.bank_account_name,
          accountNumber: params.ourBusiness.bank_account_number,
          ifsc: params.ourBusiness.bank_ifsc,
          bankName: params.ourBusiness.bank_name,
        }
      : null,
  };
}

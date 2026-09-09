import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ExpenseType,
  RecordType,
  TaxIdType,
} from "@/lib/types";
import { STORAGE_BUCKET } from "@/lib/constants";
import { publicEnv } from "@/lib/env";
import { extractDocument } from "@/lib/gemini/extract";
import type { ExtractionResult } from "@/lib/gemini/schema";
import { findOrCreateVendor, matchCategoryId } from "./match";

type Admin = SupabaseClient<Database>;

export const MAX_ATTEMPTS = 3;

export interface JobRunResult {
  jobId: string;
  status: "done" | "error";
  expenseId?: string;
  error?: string;
}

const KIND_TO_EXPENSE_TYPE: Record<string, ExpenseType> = {
  invoice: "invoice",
  bill: "bill",
  receipt: "receipt",
  utility: "utility",
  payroll: "payroll",
};

function pickExpenseType(r: ExtractionResult): ExpenseType | null {
  if (r.document_kind && KIND_TO_EXPENSE_TYPE[r.document_kind]) {
    return KIND_TO_EXPENSE_TYPE[r.document_kind];
  }
  return r.suggested_record_type === "invoice" ? "invoice" : null;
}

/**
 * Runs a single extraction job end to end: download -> Gemini -> write the
 * `expenses` / line-item / tax rows. Idempotent per document (upserts on
 * `document_id`). Never throws — failures are recorded on the job.
 */
export async function runExtractionJob(
  admin: Admin,
  jobId: string,
): Promise<JobRunResult> {
  const { data: job } = await admin
    .from("extraction_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job) return { jobId, status: "error", error: "job not found" };
  if (job.status === "done") {
    const { data: existing } = await admin
      .from("expenses")
      .select("id")
      .eq("document_id", job.document_id)
      .maybeSingle();
    return { jobId, status: "done", expenseId: existing?.id };
  }

  const attempts = job.attempts + 1;
  await admin
    .from("extraction_jobs")
    .update({ status: "running", attempts, started_at: new Date().toISOString() })
    .eq("id", jobId);
  await admin
    .from("documents")
    .update({ status: "processing", error: null })
    .eq("id", job.document_id);

  try {
    const { data: doc } = await admin
      .from("documents")
      .select("*")
      .eq("id", job.document_id)
      .single();
    if (!doc) throw new Error("document not found");

    const { data: file, error: dlError } = await admin.storage
      .from(STORAGE_BUCKET)
      .download(doc.storage_path);
    if (dlError || !file) {
      throw new Error(`download failed: ${dlError?.message ?? "no file"}`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { parsed, rawText, model } = await extractDocument({
      bytes,
      mimeType: doc.mime_type,
    });

    const vendorId = await findOrCreateVendor(admin, {
      name: parsed.vendor_name,
      taxId: parsed.vendor_tax_id,
      taxIdType: (parsed.vendor_tax_id_type as TaxIdType | null) ?? null,
      country: parsed.vendor_country,
      createdBy: doc.uploaded_by,
    });
    const categoryId = await matchCategoryId(admin, parsed.suggested_category);

    const recordType: RecordType =
      parsed.suggested_record_type === "invoice" ? "invoice" : "expense";
    const currency = (parsed.currency || "INR").toUpperCase();
    const total = parsed.total;
    const amountInr = currency === "INR" ? total : null;

    const expensePayload = {
      document_id: doc.id,
      vendor_id: vendorId,
      category_id: categoryId,
      record_type: recordType,
      expense_type: pickExpenseType(parsed),
      invoice_number: parsed.invoice_number,
      invoice_date: parsed.invoice_date,
      due_date: parsed.due_date,
      currency,
      country: (parsed.vendor_country || publicEnv.homeCountry).toUpperCase(),
      subtotal: parsed.subtotal,
      tax_total: parsed.tax_total,
      total,
      fx_rate: 1,
      amount_inr: amountInr,
      notes: parsed.notes,
      status: "review" as const,
    };

    const { data: existing } = await admin
      .from("expenses")
      .select("id")
      .eq("document_id", doc.id)
      .maybeSingle();

    let expenseId: string;
    if (existing) {
      expenseId = existing.id;
      await admin.from("expenses").update(expensePayload).eq("id", expenseId);
      await admin.from("expense_line_items").delete().eq("expense_id", expenseId);
      await admin.from("expense_taxes").delete().eq("expense_id", expenseId);
    } else {
      const { data: created, error: insErr } = await admin
        .from("expenses")
        .insert(expensePayload)
        .select("id")
        .single();
      if (insErr || !created) {
        throw new Error(`expense insert failed: ${insErr?.message}`);
      }
      expenseId = created.id;
    }

    if (parsed.line_items.length) {
      await admin.from("expense_line_items").insert(
        parsed.line_items.map((li, i) => ({
          expense_id: expenseId,
          line_no: i + 1,
          description: li.description,
          hsn_sac: li.hsn_sac,
          quantity: li.quantity,
          unit_price: li.unit_price,
          amount: li.amount,
          tax_rate: li.tax_rate,
        })),
      );
    }
    if (parsed.taxes.length) {
      await admin.from("expense_taxes").insert(
        parsed.taxes.map((t) => ({
          expense_id: expenseId,
          tax_type: t.tax_type,
          rate: t.rate,
          amount: t.amount ?? 0,
          jurisdiction: t.jurisdiction,
        })),
      );
    }

    await admin
      .from("extraction_jobs")
      .update({
        status: "done",
        last_error: null,
        gemini_model: model,
        raw_response: safeJson(rawText),
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await admin
      .from("documents")
      .update({ status: "extracted", error: null })
      .eq("id", doc.id);

    return { jobId, status: "done", expenseId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = attempts >= MAX_ATTEMPTS;
    await admin
      .from("extraction_jobs")
      .update({
        status: "error",
        last_error: message,
        finished_at: new Date().toISOString(),
        scheduled_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      })
      .eq("id", jobId);
    await admin
      .from("documents")
      .update({
        status: giveUp ? "failed" : "uploaded",
        error: message,
      })
      .eq("id", job.document_id);
    return { jobId, status: "error", error: message };
  }
}

function backoffMs(attempts: number): number {
  return Math.min(1000 * 60 * 10, 1000 * 30 * 2 ** (attempts - 1));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

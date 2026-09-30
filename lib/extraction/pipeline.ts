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
import { classifyExtractionError, ExtractionError } from "@/lib/gemini/errors";
import type { ExtractionResult } from "@/lib/gemini/schema";
import { findOrCreateVendor, matchCategoryId } from "./match";

type Admin = SupabaseClient<Database>;

export const MAX_ATTEMPTS = 3;
/**
 * A job stuck in `running` longer than this belongs to a function that was
 * killed mid-flight (maxDuration hit, deploy, crash) and may be picked up again.
 */
export const STALE_RUNNING_MS = 5 * 60 * 1000;

/** PostgREST filter: any job that isn't actively being worked on right now. */
export function claimableJobsFilter(now = Date.now()): string {
  const staleBefore = new Date(now - STALE_RUNNING_MS).toISOString();
  return `status.neq.running,and(status.eq.running,started_at.lt.${staleBefore})`;
}

export interface JobRunResult {
  jobId: string;
  /** `busy` = another worker already has this job; nothing was changed. */
  status: "done" | "error" | "busy";
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
  options: { resetAttempts?: boolean } = {},
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
    if (existing) return { jobId, status: "done", expenseId: existing.id };
    // Done, but the record was deleted since — extract again.
  }

  // Claim the job atomically. Two workers (double-click on Retry, cron racing an
  // upload) can both read the same row, but only one update matches the
  // `attempts` value we read, so only one of them proceeds.
  const attempts = options.resetAttempts ? 1 : job.attempts + 1;
  const { data: claimed } = await admin
    .from("extraction_jobs")
    .update({
      status: "running",
      attempts,
      started_at: new Date().toISOString(),
      finished_at: null,
    })
    .eq("id", jobId)
    .eq("attempts", job.attempts)
    .or(claimableJobsFilter())
    .select("id")
    .maybeSingle();
  if (!claimed) return { jobId, status: "busy" };

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
    if (!doc) throw new ExtractionError("The uploaded document record is missing.", "permanent");

    const { data: file, error: dlError } = await admin.storage
      .from(STORAGE_BUCKET)
      .download(doc.storage_path);
    if (dlError || !file) {
      console.error("[extraction] storage download failed", dlError);
      throw new ExtractionError(
        "Could not read the stored file. Press Retry; if it keeps failing, upload it again.",
      );
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
      orFail(
        await admin.from("expenses").update(expensePayload).eq("id", expenseId),
        "expense update",
      );
      orFail(
        await admin.from("expense_line_items").delete().eq("expense_id", expenseId),
        "line item cleanup",
      );
      orFail(
        await admin.from("expense_taxes").delete().eq("expense_id", expenseId),
        "tax cleanup",
      );
    } else {
      const { data: created, error: insErr } = await admin
        .from("expenses")
        .insert(expensePayload)
        .select("id")
        .single();
      if (insErr || !created) {
        orFail({ error: insErr ?? { message: "no row returned" } }, "expense insert");
        throw new ExtractionError("Could not save the extracted record.");
      }
      expenseId = created.id;
    }

    if (parsed.line_items.length) {
      orFail(
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
        ),
        "line item insert",
      );
    }
    if (parsed.taxes.length) {
      orFail(
        await admin.from("expense_taxes").insert(
          parsed.taxes.map((t) => ({
            expense_id: expenseId,
            tax_type: t.tax_type,
            rate: t.rate,
            amount: t.amount ?? 0,
            jurisdiction: t.jurisdiction,
          })),
        ),
        "tax insert",
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
    const failure = classifyExtractionError(err);
    console.error(`[extraction] job ${jobId} attempt ${attempts} failed:`, err);
    const giveUp = failure.kind === "permanent" || attempts >= MAX_ATTEMPTS;
    await admin
      .from("extraction_jobs")
      .update({
        status: "error",
        // Permanent failures must not be picked up again by the cron sweep.
        attempts: giveUp ? Math.max(attempts, MAX_ATTEMPTS) : attempts,
        last_error: failure.detail,
        finished_at: new Date().toISOString(),
        scheduled_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      })
      .eq("id", jobId);
    await admin
      .from("documents")
      .update({
        status: giveUp ? "failed" : "uploaded",
        error: failure.message,
      })
      .eq("id", job.document_id);
    return { jobId, status: "error", error: failure.message };
  }
}

/** Throws a user-safe error if a Supabase write failed; logs the real reason. */
function orFail(result: { error: { message: string } | null }, step: string): void {
  if (!result.error) return;
  console.error(`[extraction] ${step} failed:`, result.error.message);
  throw new ExtractionError(
    "Could not save the extracted details. Press Retry; if it keeps failing, enter it manually.",
  );
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

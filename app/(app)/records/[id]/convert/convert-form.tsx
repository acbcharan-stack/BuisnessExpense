"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pdf } from "@react-pdf/renderer";
import { TAX_ID_TYPES, TAX_TYPES } from "@/lib/types";
import type { TaxIdType, TaxType } from "@/lib/types";
import { Badge, Button, Card, Icon } from "@/components/ui";
import { GeneratedInvoiceDocument } from "@/lib/pdf/invoice-template";
import { buildInvoiceRenderData } from "@/lib/pdf/invoice-render-data";
import type { GeneratedInvoiceFormValues } from "./form-schema";
import {
  saveGeneratedInvoiceDraft,
  confirmGeneratedInvoice,
  deleteGeneratedInvoiceDraft,
} from "./actions";

type Scalarish = string | number;
const s = (v: Scalarish): string => (v === "" || v == null ? "" : String(v));
const num = (v: string): number => Number(String(v).replace(/[, ]/g, "")) || 0;

export interface ConvertFormData {
  sourceExpenseId: string;
  generatedInvoiceId: string | null;
  status: "draft" | "confirmed" | null;
  canConfirm: boolean;
  ourInvoiceNumber: string | null;
  pdfUrl: string | null;
  businesses: {
    id: string;
    name: string;
    legal_name: string | null;
    gstin: string | null;
    gst_state_code: string | null;
    address: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_name: string | null;
    signature_storage_path: string | null;
    logo_storage_path: string | null;
    terms_and_conditions: string | null;
    logoUrl: string | null;
    signatureUrl: string | null;
  }[];
  initial: {
    business_id: string;
    counterparty: {
      name: string;
      tax_id: string;
      tax_id_type: TaxIdType;
      address: string;
      country: string;
    };
    our_business: {
      name: string;
      legal_name: string;
      gstin: string;
      gst_state_code: string;
      address: string;
      bank_account_name: string;
      bank_account_number: string;
      bank_ifsc: string;
      bank_name: string;
      signature_storage_path: string;
      logo_storage_path: string;
      terms_and_conditions: string;
    };
    our_invoice_date: string;
    currency: string;
    subtotal: Scalarish;
    tax_total: Scalarish;
    total: Scalarish;
    notes: string;
    line_items: {
      description: string;
      hsn_sac: string;
      quantity: Scalarish;
      unit_price: Scalarish;
      amount: Scalarish;
      tax_rate: Scalarish;
    }[];
    taxes: {
      tax_type: TaxType;
      rate: Scalarish;
      amount: Scalarish;
      jurisdiction: string;
    }[];
  };
}

interface LineItemState {
  description: string;
  hsn_sac: string;
  quantity: string;
  unit_price: string;
  amount: string;
  tax_rate: string;
}
interface TaxState {
  tax_type: TaxType;
  rate: string;
  amount: string;
  jurisdiction: string;
}
interface FormState {
  business_id: string;
  counterparty: ConvertFormData["initial"]["counterparty"];
  our_business: ConvertFormData["initial"]["our_business"];
  our_invoice_date: string;
  currency: string;
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string;
  line_items: LineItemState[];
  taxes: TaxState[];
}

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-900";
const cellCls =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:bg-white disabled:text-zinc-500 dark:focus:bg-zinc-950";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

const emptyLine: LineItemState = {
  description: "",
  hsn_sac: "",
  quantity: "",
  unit_price: "",
  amount: "",
  tax_rate: "",
};
const emptyTax: TaxState = { tax_type: "GST", rate: "", amount: "", jurisdiction: "" };

function buildInitial(d: ConvertFormData["initial"]): FormState {
  return {
    business_id: d.business_id,
    counterparty: { ...d.counterparty },
    our_business: { ...d.our_business },
    our_invoice_date: d.our_invoice_date,
    currency: d.currency,
    subtotal: s(d.subtotal),
    tax_total: s(d.tax_total),
    total: s(d.total),
    notes: d.notes,
    line_items: d.line_items.map((li) => ({
      description: li.description,
      hsn_sac: li.hsn_sac,
      quantity: s(li.quantity),
      unit_price: s(li.unit_price),
      amount: s(li.amount),
      tax_rate: s(li.tax_rate),
    })),
    taxes: d.taxes.map((t) => ({
      tax_type: t.tax_type,
      rate: s(t.rate),
      amount: s(t.amount),
      jurisdiction: t.jurisdiction,
    })),
  };
}

export function ConvertForm({ data }: { data: ConvertFormData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState<FormState>(() => buildInitial(data.initial));
  const [previewUrl, setPreviewUrl] = useState<string | null>(data.pdfUrl);

  const confirmed = data.status === "confirmed";
  const readOnly = confirmed;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setLine = (i: number, patch: Partial<LineItemState>) =>
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)),
    }));
  const setTax = (i: number, patch: Partial<TaxState>) =>
    setForm((f) => ({
      ...f,
      taxes: f.taxes.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    }));

  function applyBusiness(businessId: string) {
    const biz = data.businesses.find((b) => b.id === businessId);
    if (!biz) {
      set("business_id", businessId);
      return;
    }
    setForm((f) => ({
      ...f,
      business_id: businessId,
      our_business: {
        name: biz.name,
        legal_name: biz.legal_name ?? "",
        gstin: biz.gstin ?? "",
        gst_state_code: biz.gst_state_code ?? "",
        address: biz.address ?? "",
        bank_account_name: biz.bank_account_name ?? "",
        bank_account_number: biz.bank_account_number ?? "",
        bank_ifsc: biz.bank_ifsc ?? "",
        bank_name: biz.bank_name ?? "",
        signature_storage_path: biz.signature_storage_path ?? "",
        logo_storage_path: biz.logo_storage_path ?? "",
        terms_and_conditions: biz.terms_and_conditions ?? "",
      },
    }));
  }

  const values: GeneratedInvoiceFormValues = useMemo(
    () => ({
      direction: "purchase",
      business_id: form.business_id,
      counterparty: form.counterparty,
      our_business: form.our_business,
      our_invoice_date: form.our_invoice_date,
      currency: form.currency,
      subtotal: form.subtotal,
      tax_total: form.tax_total,
      total: form.total,
      notes: form.notes,
      line_items: form.line_items,
      taxes: form.taxes,
    }),
    [form],
  );

  const lineSum = form.line_items.reduce((a, li) => a + num(li.amount), 0);
  const taxSum = form.taxes.reduce((a, t) => a + num(t.amount), 0);

  // Live preview: re-render the PDF client-side whenever the form changes,
  // debounced so we don't re-render on every keystroke.
  useEffect(() => {
    const currentBiz = data.businesses.find((b) => b.id === form.business_id);
    const handle = setTimeout(() => {
      const renderData = buildInvoiceRenderData({
        counterparty: {
          name: form.counterparty.name || "—",
          tax_id: form.counterparty.tax_id || null,
          tax_id_type: form.counterparty.tax_id_type,
          address: form.counterparty.address || null,
          country: form.counterparty.country || "IN",
        },
        ourBusiness: {
          name: form.our_business.name || "—",
          legal_name: form.our_business.legal_name || null,
          gstin: form.our_business.gstin || null,
          gst_state_code: form.our_business.gst_state_code || null,
          address: form.our_business.address || null,
          bank_account_name: form.our_business.bank_account_name || null,
          bank_account_number: form.our_business.bank_account_number || null,
          bank_ifsc: form.our_business.bank_ifsc || null,
          bank_name: form.our_business.bank_name || null,
          signature_storage_path: form.our_business.signature_storage_path || null,
          logo_storage_path: form.our_business.logo_storage_path || null,
          terms_and_conditions: form.our_business.terms_and_conditions || null,
        },
        ourInvoiceNumber: data.ourInvoiceNumber,
        ourInvoiceDate: form.our_invoice_date || null,
        currency: form.currency,
        lineItems: form.line_items.map((li) => ({
          description: li.description || null,
          hsn_sac: li.hsn_sac || null,
          quantity: li.quantity === "" ? null : num(li.quantity),
          unit_price: li.unit_price === "" ? null : num(li.unit_price),
          amount: li.amount === "" ? null : num(li.amount),
          tax_rate: li.tax_rate === "" ? null : num(li.tax_rate),
        })),
        taxes: form.taxes.map((t) => ({
          tax_type: t.tax_type,
          rate: t.rate === "" ? null : num(t.rate),
          amount: num(t.amount),
          jurisdiction: t.jurisdiction || null,
        })),
        subtotal: form.subtotal === "" ? null : num(form.subtotal),
        taxTotal: form.tax_total === "" ? null : num(form.tax_total),
        total: form.total === "" ? null : num(form.total),
        notes: form.notes || null,
      });

      pdf(
        GeneratedInvoiceDocument({
          data: renderData,
          logoUrl: currentBiz?.logoUrl,
          signatureUrl: currentBiz?.signatureUrl,
        }),
      )
        .toBlob()
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setPreviewUrl((prev) => {
            if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
            return url;
          });
        })
        .catch(() => {
          /* preview is best-effort; the confirmed/stored PDF is authoritative */
        });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, data.ourInvoiceNumber]);

  function runSaveDraft() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveGeneratedInvoiceDraft(data.sourceExpenseId, values);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error ?? "Could not save the draft." });
        return;
      }
      setFeedback({ kind: "ok", text: "Draft saved." });
      router.refresh();
    });
  }

  function runConfirm() {
    setFeedback(null);
    startTransition(async () => {
      const saveRes = await saveGeneratedInvoiceDraft(data.sourceExpenseId, values);
      if (!saveRes.ok || !saveRes.id) {
        setFeedback({ kind: "err", text: saveRes.error ?? "Could not save the draft." });
        return;
      }
      const res = await confirmGeneratedInvoice(saveRes.id);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error ?? "Could not confirm the invoice." });
        return;
      }
      setFeedback({ kind: "ok", text: "Invoice confirmed." });
      router.refresh();
    });
  }

  function runDiscard() {
    if (!data.generatedInvoiceId) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteGeneratedInvoiceDraft(data.generatedInvoiceId!);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error ?? "Could not discard the draft." });
        return;
      }
      router.push(`/records/${data.sourceExpenseId}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-2 lg:pb-6">
      {/* Left: live PDF preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
            <span className="flex items-center gap-1.5">
              <Icon name="file" className="size-4 shrink-0" />
              Invoice preview
            </span>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Open ↗
              </a>
            )}
          </div>
          <div className="bg-zinc-50 p-3 dark:bg-zinc-950/40">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title="Invoice preview"
                className="h-[76vh] w-full rounded-lg bg-white"
              />
            ) : (
              <p className="p-10 text-center text-sm text-zinc-500">
                Rendering preview…
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Right: fields */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{confirmed ? "confirmed" : data.status === "draft" ? "draft" : "new"}</Badge>
          {data.ourInvoiceNumber && <Badge>{data.ourInvoiceNumber}</Badge>}
          {!data.canConfirm && !confirmed && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Confirm the source record before finalizing this invoice.
            </span>
          )}
          {confirmed && (
            <span className="text-xs text-zinc-500">
              · confirmed — this invoice is locked
            </span>
          )}
        </div>

        {/* Our business */}
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">Our business</h3>
          <div className="mb-3">
            <Field label="Issuing business">
              <select
                className={inputCls}
                value={form.business_id}
                disabled={readOnly}
                onChange={(e) => applyBusiness(e.target.value)}
              >
                {data.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                className={inputCls}
                value={form.our_business.name}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", { ...form.our_business, name: e.target.value })
                }
              />
            </Field>
            <Field label="Legal name">
              <input
                className={inputCls}
                value={form.our_business.legal_name}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", { ...form.our_business, legal_name: e.target.value })
                }
              />
            </Field>
            <Field label="GSTIN">
              <input
                className={inputCls}
                value={form.our_business.gstin}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", { ...form.our_business, gstin: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Address">
              <input
                className={inputCls}
                value={form.our_business.address}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", { ...form.our_business, address: e.target.value })
                }
              />
            </Field>
            <Field label="Bank account name">
              <input
                className={inputCls}
                value={form.our_business.bank_account_name}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", { ...form.our_business, bank_account_name: e.target.value })
                }
              />
            </Field>
            <Field label="Bank account number">
              <input
                className={inputCls}
                value={form.our_business.bank_account_number}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", {
                    ...form.our_business,
                    bank_account_number: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Bank name">
              <input
                className={inputCls}
                value={form.our_business.bank_name}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", { ...form.our_business, bank_name: e.target.value })
                }
              />
            </Field>
            <Field label="IFSC">
              <input
                className={inputCls}
                value={form.our_business.bank_ifsc}
                disabled={readOnly}
                onChange={(e) =>
                  set("our_business", {
                    ...form.our_business,
                    bank_ifsc: e.target.value.toUpperCase(),
                  })
                }
              />
            </Field>
          </div>
        </Card>

        {/* Counterparty */}
        <Card className="p-3">
          <h3 className="mb-2 text-sm font-semibold">
            Vendor / Bill to (from the purchase order)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                className={inputCls}
                value={form.counterparty.name}
                disabled={readOnly}
                onChange={(e) =>
                  set("counterparty", { ...form.counterparty, name: e.target.value })
                }
              />
            </Field>
            <Field label="Tax ID">
              <input
                className={inputCls}
                value={form.counterparty.tax_id}
                disabled={readOnly}
                onChange={(e) =>
                  set("counterparty", {
                    ...form.counterparty,
                    tax_id: e.target.value.toUpperCase(),
                  })
                }
              />
            </Field>
            <Field label="Tax ID type">
              <select
                className={inputCls}
                value={form.counterparty.tax_id_type}
                disabled={readOnly}
                onChange={(e) =>
                  set("counterparty", {
                    ...form.counterparty,
                    tax_id_type: e.target.value as TaxIdType,
                  })
                }
              >
                {TAX_ID_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Country">
              <input
                className={inputCls}
                value={form.counterparty.country}
                disabled={readOnly}
                onChange={(e) =>
                  set("counterparty", {
                    ...form.counterparty,
                    country: e.target.value.toUpperCase(),
                  })
                }
              />
            </Field>
            <Field label="Address">
              <input
                className={inputCls}
                value={form.counterparty.address}
                disabled={readOnly}
                onChange={(e) =>
                  set("counterparty", { ...form.counterparty, address: e.target.value })
                }
              />
            </Field>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Our invoice date">
            <input
              type="date"
              className={inputCls}
              value={form.our_invoice_date}
              disabled={readOnly}
              onChange={(e) => set("our_invoice_date", e.target.value)}
            />
          </Field>
          <Field label="Currency">
            <input
              className={inputCls}
              value={form.currency}
              disabled={readOnly}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Total">
            <input
              inputMode="decimal"
              className={inputCls}
              value={form.total}
              disabled={readOnly}
              onChange={(e) => set("total", e.target.value)}
            />
          </Field>
          <Field label="Subtotal">
            <input
              inputMode="decimal"
              className={inputCls}
              value={form.subtotal}
              disabled={readOnly}
              onChange={(e) => set("subtotal", e.target.value)}
            />
          </Field>
          <Field label="Tax total">
            <input
              inputMode="decimal"
              className={inputCls}
              value={form.tax_total}
              disabled={readOnly}
              onChange={(e) => set("tax_total", e.target.value)}
            />
          </Field>
        </div>

        {/* Line items */}
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Line items <span className="font-normal text-zinc-400">({form.line_items.length})</span>
            </h3>
            {!readOnly && (
              <Button
                size="sm"
                variant="ghost"
                icon="plus"
                onClick={() => set("line_items", [...form.line_items, { ...emptyLine }])}
              >
                Add line
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Description</th>
                  <th className="px-2 py-1.5 font-medium">HSN/SAC</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Unit</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tax %</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {form.line_items.map((li, i) => (
                  <tr key={i}>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} description`}
                        className={cellCls}
                        value={li.description}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} HSN/SAC`}
                        className={cellCls}
                        value={li.hsn_sac}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { hsn_sac: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} quantity`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.quantity}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} unit price`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.unit_price}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} amount`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.amount}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { amount: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} tax percent`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.tax_rate}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { tax_rate: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center">
                      {!readOnly && (
                        <button
                          type="button"
                          aria-label={`Remove line ${i + 1}`}
                          className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 active:scale-90 dark:hover:bg-red-950/40"
                          onClick={() =>
                            set(
                              "line_items",
                              form.line_items.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          <Icon name="x" className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {form.line_items.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                    <td className="px-2 py-1.5" colSpan={4}>
                      Sum of lines
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {lineSum.toLocaleString("en-IN")}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        {/* Taxes */}
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Taxes <span className="font-normal text-zinc-400">({form.taxes.length})</span>
            </h3>
            {!readOnly && (
              <Button
                size="sm"
                variant="ghost"
                icon="plus"
                onClick={() => set("taxes", [...form.taxes, { ...emptyTax }])}
              >
                Add tax
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 text-right font-medium">Rate %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 font-medium">Jurisdiction</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {form.taxes.map((t, i) => (
                  <tr key={i}>
                    <td className="px-1 py-0.5">
                      <select
                        aria-label={`Tax ${i + 1} type`}
                        className={cellCls}
                        value={t.tax_type}
                        disabled={readOnly}
                        onChange={(e) => setTax(i, { tax_type: e.target.value as TaxType })}
                      >
                        {TAX_TYPES.map((tt) => (
                          <option key={tt} value={tt}>
                            {tt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Tax ${i + 1} rate percent`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={t.rate}
                        disabled={readOnly}
                        onChange={(e) => setTax(i, { rate: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Tax ${i + 1} amount`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={t.amount}
                        disabled={readOnly}
                        onChange={(e) => setTax(i, { amount: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Tax ${i + 1} jurisdiction`}
                        className={cellCls}
                        value={t.jurisdiction}
                        disabled={readOnly}
                        onChange={(e) => setTax(i, { jurisdiction: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center">
                      {!readOnly && (
                        <button
                          type="button"
                          aria-label={`Remove tax ${i + 1}`}
                          className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 active:scale-90 dark:hover:bg-red-950/40"
                          onClick={() =>
                            set(
                              "taxes",
                              form.taxes.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          <Icon name="x" className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {form.taxes.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                    <td className="px-2 py-1.5" colSpan={2}>
                      Sum of taxes
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {taxSum.toLocaleString("en-IN")}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        <Field label="Notes">
          <textarea
            className={`${inputCls} min-h-16`}
            value={form.notes}
            disabled={readOnly}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>

        {feedback && (
          <p
            className={`text-sm ${feedback.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}
            role={feedback.kind === "err" ? "alert" : undefined}
          >
            {feedback.text}
          </p>
        )}

        {!readOnly && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:static lg:mt-2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-6xl items-center gap-3 lg:max-w-none">
              <Button type="button" variant="secondary" loading={pending} onClick={runSaveDraft}>
                Save draft
              </Button>
              <Button
                type="button"
                variant="primary"
                icon="check"
                loading={pending}
                disabled={!data.canConfirm}
                onClick={runConfirm}
              >
                Confirm &amp; finalize
              </Button>
              {data.generatedInvoiceId && (
                <Button type="button" variant="ghost" disabled={pending} onClick={runDiscard}>
                  Discard draft
                </Button>
              )}
            </div>
          </div>
        )}

        {confirmed && data.pdfUrl && (
          <a
            href={data.pdfUrl}
            download
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <Icon name="upload" className="size-4 rotate-180" />
            Download the confirmed invoice PDF
          </a>
        )}
      </div>
    </div>
  );
}

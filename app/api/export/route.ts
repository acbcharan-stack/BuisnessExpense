import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecordsWorkbook } from "@/lib/export/records-workbook";
import { buildRecordsCsv } from "@/lib/export/records-csv";
import { APP_SLUG } from "@/lib/constants";
import { UUID_RE } from "@/lib/uuid";
import {
  applyRecordFilters,
  parseRecordFilters,
  resolveTextVendorIds,
} from "@/lib/records-filter";
import type {
  ExpenseLineItemRow,
  ExpenseTaxRow,
} from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Admin = ReturnType<typeof createAdminClient>;
type ExportFormat = "xlsx" | "csv";

/** Chunked `.in()` — PostgREST caps URL length, so batch large id lists. */
async function fetchChildren<T>(
  admin: Admin,
  table: "expense_line_items" | "expense_taxes",
  ids: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from(table)
      .select("*")
      .in("expense_id", ids.slice(i, i + 200));
    if (data) out.push(...(data as T[]));
  }
  return out;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;

  const idParam = params.get("id");
  const singleId = idParam && UUID_RE.test(idParam) ? idParam : null;
  if (idParam && !singleId) {
    return NextResponse.json({ error: "Invalid record id." }, { status: 400 });
  }
  const typeParam = params.get("type");
  const recordType =
    typeParam === "invoice" || typeParam === "expense" ? typeParam : null;
  const businessParam = params.get("business") ?? "";
  const format: ExportFormat = params.get("format") === "csv" ? "csv" : "xlsx";
  // Same validated list filters the tables use — so "export" means "export what
  // I'm looking at". Ignored for a single-record export.
  const filters = parseRecordFilters(Object.fromEntries(params));

  // Bulk export is manager-only; a single record can be exported by anyone
  // who can already open it.
  if (!singleId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (
      !profile ||
      (profile.role !== "owner" && profile.role !== "accountant")
    ) {
      return NextResponse.json(
        { error: "Only an owner or accountant can export all records." },
        { status: 403 },
      );
    }
  }

  const admin = createAdminClient();

  let query = admin
    .from("expenses")
    .select("*")
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (singleId) {
    query = query.eq("id", singleId);
  } else {
    if (recordType) query = query.eq("record_type", recordType);
    const textVendorIds = await resolveTextVendorIds(admin, filters.q);
    query = applyRecordFilters(query, filters, textVendorIds, businessParam);
  }

  const { data: expenses, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = expenses ?? [];
  if (singleId && rows.length === 0) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const ids = rows.map((e) => e.id);
  const vendorIds = [
    ...new Set(rows.map((e) => e.vendor_id).filter(Boolean)),
  ] as string[];
  const categoryIds = [
    ...new Set(rows.map((e) => e.category_id).filter(Boolean)),
  ] as string[];
  const profileIds = [
    ...new Set(
      rows.flatMap((e) => [e.confirmed_by, e.category_set_by]).filter(Boolean),
    ),
  ] as string[];

  const needChildren = format !== "csv";

  const [lineItems, taxes, vendors, categories, businesses, profiles] =
    await Promise.all([
      needChildren && ids.length
        ? fetchChildren<ExpenseLineItemRow>(admin, "expense_line_items", ids)
        : Promise.resolve([]),
      needChildren && ids.length
        ? fetchChildren<ExpenseTaxRow>(admin, "expense_taxes", ids)
        : Promise.resolve([]),
      vendorIds.length
        ? admin
            .from("vendors")
            .select("id, name, tax_id, tax_id_type, country")
            .in("id", vendorIds)
        : Promise.resolve({ data: [] }),
      categoryIds.length
        ? admin
            .from("categories")
            .select("id, name, zoho_account_name")
            .in("id", categoryIds)
        : Promise.resolve({ data: [] }),
      admin.from("businesses").select("id, name, gstin"),
      profileIds.length
        ? admin.from("profiles").select("id, full_name").in("id", profileIds)
        : Promise.resolve({ data: [] }),
    ]);

  const label = singleId
    ? (rows[0]?.invoice_number ?? "record")
        .replace(/[^\w.-]+/g, "-")
        .slice(0, 40)
    : recordType
      ? recordType === "invoice"
        ? "purchase-orders"
        : "expenses"
      : "all-records";
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${APP_SLUG}-${label}-${today}.${format}`;

  if (format === "csv") {
    const csv = buildRecordsCsv({
      expenses: rows,
      vendors: vendors.data ?? [],
      categories: categories.data ?? [],
      businesses: businesses.data ?? [],
      profiles: profiles.data ?? [],
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildRecordsWorkbook({
    expenses: rows,
    lineItems,
    taxes,
    vendors: vendors.data ?? [],
    categories: categories.data ?? [],
    businesses: businesses.data ?? [],
    profiles: profiles.data ?? [],
  });

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

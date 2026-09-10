"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { APP_SLUG } from "@/lib/constants";

type Format = "xlsx" | "csv";

/** List filters copied from the current URL so the export matches the view. */
const FORWARDED_PARAMS = [
  "business",
  "q",
  "from",
  "to",
  "category",
  "vendor",
  "status",
  "country",
] as const;

/**
 * Downloads a records export from /api/export as Excel or CSV. Uses `fetch`
 * (not a plain link) so we can show a spinner while the file is built and
 * surface a 403 for non-managers. For a bulk export the current list filters
 * in the page URL are forwarded, so you get exactly the rows you can see.
 */
export function ExportButton({
  type,
  recordId,
  label = "Export",
}: {
  type: "invoice" | "expense" | "all";
  recordId?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: Format) {
    setBusy(format);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (recordId) {
        params.set("id", recordId);
      } else {
        if (type !== "all") params.set("type", type);
        const current = new URLSearchParams(window.location.search);
        for (const key of FORWARDED_PARAMS) {
          const value = current.get(key);
          if (value) params.set(key, value);
        }
      }
      if (format === "csv") params.set("format", "csv");

      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const name =
        /filename="?([^"]+)"?/.exec(cd)?.[1] ??
        `${APP_SLUG}-export.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        <span className="mr-0.5 hidden text-xs text-zinc-500 sm:inline">
          {label}:
        </span>
        <Button
          size="sm"
          variant="secondary"
          icon="upload"
          loading={busy === "xlsx"}
          disabled={busy !== null}
          onClick={() => run("xlsx")}
        >
          Excel
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "csv"}
          disabled={busy !== null}
          onClick={() => run("csv")}
        >
          CSV
        </Button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { APP_SLUG } from "@/lib/constants";

/**
 * Downloads the .xlsx export from /api/export. Uses fetch (not a plain
 * link) so we can show a spinner while the workbook is built and surface
 * a 403 for non-managers.
 */
export function ExportButton({
  type,
  recordId,
  label = "Export to Excel",
}: {
  type: "invoice" | "expense" | "all";
  recordId?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (recordId) params.set("id", recordId);
      else if (type !== "all") params.set("type", type);
      const qs = params.toString();
      const res = await fetch(`/api/export${qs ? `?${qs}` : ""}`);
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
        /filename="?([^"]+)"?/.exec(cd)?.[1] ?? `${APP_SLUG}-${type}.xlsx`;
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
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        icon="upload"
        loading={busy}
        onClick={run}
      >
        {label}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

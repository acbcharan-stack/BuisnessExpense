import { Card } from "@/components/ui";

/**
 * Dashboard charts — plain inline SVG / CSS, rendered on the server. No charting
 * library and no client JavaScript: the dashboard is already fully
 * server-rendered and these stay that way.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Slice colours for the donut + legend. Readable on light and dark cards. */
const PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

export interface Slice {
  label: string;
  value: number;
}

/* ------------------------------------------------------------------ */
/*  Monthly trend line                                                */
/* ------------------------------------------------------------------ */

export function MonthlyTrend({
  points,
  caption,
}: {
  points: { label: string; value: number }[];
  caption: string;
}) {
  const w = 320;
  const h = 96;
  const pad = 6;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => {
    const x = pad + i * step;
    const y = h - pad - (p.value / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${pad + (points.length - 1) * step},${h - pad}`;
  const total = points.reduce((s, p) => s + p.value, 0);

  return (
    <Card className="p-4 lg:col-span-2">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Monthly spend</h3>
        <span className="text-xs tabular-nums text-zinc-400">
          {inr(total)} over {points.length} months
        </span>
      </div>
      {total > 0 ? (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="mt-2 h-24 w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Monthly spend trend. ${caption}`}
        >
          <polygon points={area} fill="#3b82f6" fillOpacity="0.12" />
          <polyline
            points={line}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {xy.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill="#3b82f6" />
          ))}
        </svg>
      ) : (
        <p className="py-6 text-center text-xs text-zinc-400">
          No confirmed spend in this period yet.
        </p>
      )}
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        {points.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Category donut                                                    */
/* ------------------------------------------------------------------ */

export function CategoryDonut({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 42;
  const c = 2 * Math.PI * r;

  // Pre-compute each arc's dash + start offset so the JSX below stays pure.
  const arcs: { color: string; dash: string; offset: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < slices.length; i++) {
    const frac = total > 0 ? slices[i].value / total : 0;
    arcs.push({
      color: PALETTE[i % PALETTE.length],
      dash: `${frac * c} ${c - frac * c}`,
      offset: -cursor * c,
    });
    cursor += frac;
  }

  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">Spend by category</h3>
      {total > 0 ? (
        <div className="flex items-center gap-4">
          <svg
            viewBox="0 0 100 100"
            className="size-28 shrink-0 -rotate-90"
            role="img"
            aria-label="Spend by category"
          >
            {arcs.map((a, i) => (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth="14"
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
              />
            ))}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1 text-xs">
            {slices.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">
                  {s.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-zinc-400">
          No categorised spend yet.
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Top vendors bar                                                   */
/* ------------------------------------------------------------------ */

export function TopVendorsBar({ rows }: { rows: Slice[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">Top vendors</h3>
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="text-xs">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                  {r.label}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {inr(r.value)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.round((r.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-xs text-zinc-400">
          No vendor spend yet.
        </p>
      )}
    </Card>
  );
}

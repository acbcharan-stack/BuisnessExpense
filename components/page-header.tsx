import { Icon } from "@/components/ui";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  children,
  icon = "file",
}: {
  children: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        <Icon name={icon} className="size-5" />
      </div>
      <p className="text-sm text-zinc-500">{children}</p>
    </div>
  );
}

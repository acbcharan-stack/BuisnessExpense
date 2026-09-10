"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { Icon, SubmitButton } from "@/components/ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/invoices", label: "Invoices", icon: "invoice" },
  { href: "/expenses", label: "Expenses", icon: "expense" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function AppNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:gap-5 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2"
          aria-label="Invoice Scanner home"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-blue-600 text-white dark:bg-blue-500">
            <Icon name="invoice" className="size-4" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Invoice&nbsp;Scanner
          </span>
        </Link>

        <nav className="no-scrollbar -mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition active:scale-[.97] ${
                  active
                    ? "bg-blue-600 text-white dark:bg-blue-500"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                <Icon name={link.icon} className="size-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden text-right text-xs leading-tight text-zinc-500 md:block">
            <span className="block font-medium text-zinc-700 dark:text-zinc-300">
              {name}
            </span>
            <span className="capitalize">{role}</span>
          </span>
          <form action={signOut}>
            <SubmitButton size="sm" variant="secondary" idleIcon="logout">
              <span className="hidden sm:inline">Sign out</span>
            </SubmitButton>
          </form>
        </div>
      </div>
    </header>
  );
}

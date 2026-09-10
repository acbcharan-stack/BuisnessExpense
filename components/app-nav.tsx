"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import { Icon, SubmitButton } from "@/components/ui";
import { APP_NAME } from "@/lib/constants";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/invoices", label: "Purchase Orders", icon: "invoice" },
  { href: "/expenses", label: "Expenses", icon: "expense" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2"
      aria-label={`${APP_NAME} home`}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white dark:bg-blue-500">
        <Icon name="invoice" className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[.98] ${
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
  );
}

function UserFooter({ name, role }: { name: string; role: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 text-xs leading-tight">
        <span className="block truncate font-medium text-zinc-700 dark:text-zinc-300">
          {name}
        </span>
        <span className="capitalize text-zinc-500">{role}</span>
      </span>
      <form action={signOut}>
        <SubmitButton size="sm" variant="secondary" idleIcon="logout">
          <span className="sr-only">Sign out</span>
        </SubmitButton>
      </form>
    </div>
  );
}

export function AppNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // Lock the page behind the drawer while it's open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Desktop: fixed vertical sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-zinc-200 bg-white px-3 py-4 dark:border-zinc-800 dark:bg-zinc-950 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavLinks pathname={pathname} />
        </div>
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <UserFooter name={name} role={role} />
        </div>
      </aside>

      {/* Mobile: top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/85 px-4 py-2.5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Icon name={open ? "x" : "menu"} className="size-5" />
        </button>
      </header>

      {/* Mobile: left slide-in drawer (always mounted, animated) */}
      <div className="lg:hidden" aria-hidden={!open}>
        <div
          onClick={close}
          className={`fixed inset-0 z-40 bg-black/35 transition-opacity duration-200 ${
            open ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[82vw] flex-col border-r border-zinc-200 bg-white p-4 shadow-xl transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
            open ? "translate-x-0" : "pointer-events-none -translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <Brand />
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 active:scale-95 dark:hover:bg-zinc-800"
            >
              <Icon name="x" className="size-5" />
            </button>
          </div>
          <div className="mt-6 flex-1 overflow-y-auto">
            <NavLinks pathname={pathname} onNavigate={close} />
          </div>
          <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <UserFooter name={name} role={role} />
          </div>
        </aside>
      </div>
    </>
  );
}

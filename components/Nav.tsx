"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, CloseIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { TenantPicker } from "@/components/TenantPicker";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/nurture", label: "Nurture" },
  { href: "/note", label: "Note" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export function Nav({
  email,
  superAdmin = false,
  tenants = [],
  activeTenantId = "",
}: {
  email: string;
  superAdmin?: boolean;
  tenants?: { id: string; name: string }[];
  activeTenantId?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const deskLink = (href: string) =>
    `whitespace-nowrap rounded-[10px] border-2 px-3 py-1.5 text-sm font-semibold transition ${
      isActive(href)
        ? "border-ink bg-ink text-card"
        : "border-transparent text-muted hover:border-line hover:bg-temail hover:text-ink"
    }`;

  const mobileLink = (href: string) =>
    `rounded-[10px] border-2 px-3 py-2 text-sm font-semibold transition ${
      isActive(href)
        ? "border-ink bg-ink text-card"
        : "border-line bg-card text-ink"
    }`;

  return (
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-card shadow-[0_3px_0_rgba(97,94,140,0.10)]">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-2 rounded-[11px] border-2 border-ink bg-barv px-2.5 py-1 text-sm font-bold text-ink"
        >
          <Logo className="h-5 w-5" />
          MyCRM
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={deskLink(l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
        {superAdmin && tenants.length > 0 && (
          <div className="hidden sm:block">
            <TenantPicker tenants={tenants} activeId={activeTenantId} />
          </div>
        )}
        <span className="hidden text-xs text-muted sm:inline">{email}</span>
        <form className="hidden sm:block" action="/auth/signout" method="post">
          <button
            type="submit"
            className="ml-2 rounded-[10px] px-2.5 py-1.5 text-sm font-semibold text-ink transition hover:bg-temail"
          >
            Sign out
          </button>
        </form>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-[10px] border-2 border-ink bg-barv text-ink transition hover:-translate-y-px sm:hidden"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="border-t-2 border-ink bg-card px-4 py-3 sm:hidden">
          <nav className="flex flex-col gap-1.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={mobileLink(l.href)}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {superAdmin && tenants.length > 0 && (
            <div className="mt-3 border-t-2 border-line pt-3">
              <TenantPicker tenants={tenants} activeId={activeTenantId} />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between border-t-2 border-line pt-3">
            <span className="truncate text-xs text-muted">{email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-sm font-semibold text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}

"use client";

import { useTransition } from "react";
import { switchTenant } from "@/app/(app)/actions";

/**
 * Super-admin-only tenancy switcher. Changing it sets the admin's active tenant
 * (via a DB function that blocks non-admins) and reloads into that tenant's data.
 */
export function TenantPicker({
  tenants,
  activeId,
}: {
  tenants: { id: string; name: string }[];
  activeId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Switch tenant"
      value={activeId}
      disabled={pending}
      onChange={(e) => start(() => switchTenant(e.target.value))}
      className="cursor-pointer rounded-[10px] border-2 border-ink bg-bary px-2.5 py-1.5 text-xs font-bold text-ink outline-none disabled:opacity-60"
      title="Admin: switch tenant"
    >
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {pending ? "Switching…" : t.name}
        </option>
      ))}
    </select>
  );
}

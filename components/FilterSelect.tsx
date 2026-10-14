"use client";

import { useRouter, useSearchParams } from "next/navigation";

/** A URL-param filter dropdown for the contacts list. Empty value clears it. */
export function FilterSelect({
  param,
  value,
  label,
  options,
}: {
  param: string;
  value: string;
  label: string;
  options: { v: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        if (e.target.value) p.set(param, e.target.value);
        else p.delete(param);
        router.push(`/contacts?${p.toString()}`);
      }}
      className="w-full cursor-pointer rounded-[11px] border-2 border-ink bg-card px-3 py-2 text-sm font-bold text-ink outline-none sm:w-auto"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

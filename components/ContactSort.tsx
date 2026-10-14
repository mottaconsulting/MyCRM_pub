"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { v: "recent", label: "Last contacted" },
  { v: "meeting", label: "Last meeting" },
  { v: "name", label: "First name (A–Z)" },
  { v: "surname", label: "Surname (A–Z)" },
  { v: "temperature", label: "Temperature" },
  { v: "company", label: "Company" },
];

export function ContactSort({ value }: { value: string }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <select
      aria-label="Sort contacts"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params.toString());
        p.set("sort", e.target.value);
        router.push(`/contacts?${p.toString()}`);
      }}
      className="w-full cursor-pointer rounded-[11px] border-2 border-ink bg-card px-3 py-2 text-sm font-bold text-ink outline-none sm:w-auto"
    >
      {OPTIONS.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchContacts, type ContactHit } from "@/app/(app)/contacts/actions";

/**
 * Search input with an as-you-type suggestions dropdown. Typing debounces a
 * lookup (multi-word, matches name or company) and shows matching contacts;
 * clicking one jumps straight to them. Pressing Enter still submits the parent
 * <form> for the full filtered list, so both behaviours coexist.
 */
export function ContactSearch({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [, start] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChange = (v: string) => {
    setValue(v);
    setActive(-1);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await searchContacts(v);
        setHits(res);
        setOpen(res.length > 0);
      });
    }, 200);
  };

  const go = (id: string) => {
    setOpen(false);
    router.push(`/contacts/${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // pick the highlighted suggestion instead of submitting
      go(hits[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <input
        type="search"
        name="q"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search name or company…"
        autoComplete="off"
        className="field w-full"
      />
      {open && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-auto rounded-[12px] border-2 border-ink bg-card py-1 shadow-[4px_5px_0_rgba(97,94,140,0.14)]">
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                // mousedown (not click) fires before the input's blur closes us
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(h.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                  i === active ? "bg-temail" : "hover:bg-temail"
                }`}
              >
                <span className="font-bold text-ink">{h.name}</span>
                {(h.role || h.company) && (
                  <span className="truncate text-xs text-muted">
                    {[h.role, h.company].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

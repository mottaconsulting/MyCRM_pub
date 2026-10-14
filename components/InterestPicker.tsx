"use client";

import { useState } from "react";

/**
 * Toggle-pill selector for a contact's interest tags, chosen from the master
 * list (managed in Settings). Any interests already on the contact that are not
 * in the master list are still shown, so nothing is silently dropped. Submits
 * the selected tags through a hidden comma-joined input.
 */
export function InterestPicker({
  name,
  options,
  initial,
}: {
  name: string;
  options: string[];
  initial: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initial.filter(Boolean));
  const all = [...new Set([...options, ...initial])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const toggle = (t: string) =>
    setSelected((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );

  return (
    <div>
      <input type="hidden" name={name} value={selected.join(", ")} />
      {all.length === 0 ? (
        <p className="text-xs text-faint">
          No interest tags yet — add some in Settings → Interest tags.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {all.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                aria-pressed={on}
                className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold transition ${
                  on
                    ? "border-ink bg-accent text-accent-fg"
                    : "border-line bg-card text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

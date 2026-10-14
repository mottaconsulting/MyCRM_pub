"use client";

import { useState } from "react";

const PRESETS = ["Timewaster", "Banned", "Do not contact", "Low priority"];

/**
 * Warning picker for the contact form: choose a preset or "Other…" for custom
 * text. Emits a hidden `warning` field the form submits (empty = no warning).
 */
export function WarningPicker({ initial }: { initial: string | null }) {
  const isPreset = !!initial && PRESETS.includes(initial);
  const [choice, setChoice] = useState(initial ? (isPreset ? initial : "Other") : "");
  const [other, setOther] = useState(initial && !isPreset ? initial : "");
  const value = choice === "Other" ? other : choice;

  return (
    <div className="space-y-2">
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="field"
      >
        <option value="">No warning</option>
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="Other">Other…</option>
      </select>
      {choice === "Other" && (
        <input
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Custom warning reason"
          className="field"
        />
      )}
      <input type="hidden" name="warning" value={value} />
    </div>
  );
}

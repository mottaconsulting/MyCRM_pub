"use client";

import { useState, useTransition } from "react";
import {
  setContactTemperature,
  setContactStage,
} from "@/app/(app)/contacts/actions";
import { STAGE_LABELS } from "@/components/ui";
import type { PipelineStage, Temperature } from "@/lib/types";

const TEMPS: Temperature[] = ["hot", "warm", "cold"];
const DOT: Record<Temperature, string> = {
  hot: "bg-hot",
  warm: "bg-warm",
  cold: "bg-cold",
};
const TEMP_BG: Record<Temperature, string> = {
  hot: "bg-hot/15",
  warm: "bg-warm/20",
  cold: "bg-cold/20",
};
const STAGES: PipelineStage[] = [
  "none",
  "lead",
  "in_discussion",
  "proposal",
  "won",
  "project_work",
  "dormant",
];

/**
 * Combined inline stage + heat pills. Both are client-side optimistic, and the
 * heat pill appears/disappears the moment you change the stage (no round-trip
 * lag) — heat is only shown once a contact has a pipeline stage.
 */
export function ContactPipeline({
  id,
  stage,
  temperature,
}: {
  id: string;
  stage: PipelineStage;
  temperature: Temperature;
}) {
  const [stageVal, setStageVal] = useState<PipelineStage>(stage);
  const [tempVal, setTempVal] = useState<Temperature>(temperature);
  const [pending, start] = useTransition();

  return (
    <span className="flex items-center gap-1.5">
      {stageVal !== "none" && (
        <span
          className={`relative inline-flex items-center rounded-full transition ${TEMP_BG[tempVal]} ${pending ? "opacity-60" : ""}`}
        >
          <span
            className={`pointer-events-none absolute left-2.5 h-2 w-2 rounded-full border border-ink/50 ${DOT[tempVal]}`}
          />
          <select
            aria-label="Temperature"
            value={tempVal}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value as Temperature;
              setTempVal(v);
              start(() => setContactTemperature(id, v));
            }}
            className="cursor-pointer appearance-none rounded-full bg-transparent py-0.5 pl-5 pr-2 text-[11px] font-bold text-ink outline-none sm:pl-6 sm:pr-3 sm:text-xs"
          >
            {TEMPS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </span>
      )}
      <select
        aria-label="Pipeline stage"
        value={stageVal}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as PipelineStage;
          setStageVal(v);
          // Removing the stage clears the heat (server resets it to the
          // default); mirror that here so the pill doesn't flash stale.
          if (v === "none") setTempVal("warm");
          start(() => setContactStage(id, v));
        }}
        className={`cursor-pointer appearance-none rounded-full text-[11px] font-bold outline-none transition sm:text-xs ${
          stageVal === "none"
            ? "border-2 border-transparent bg-transparent px-1 text-faint hover:text-muted"
            : "border-2 border-line bg-temail px-2 py-0.5 text-ink sm:px-2.5"
        } ${pending ? "opacity-60" : ""}`}
      >
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s === "none" ? "+ stage" : STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      {pending && (
        <span className="crm-spinner text-muted" aria-label="Saving" />
      )}
    </span>
  );
}

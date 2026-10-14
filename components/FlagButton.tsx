"use client";

import { useTransition } from "react";
import { flagFollowup } from "@/app/(app)/contacts/actions";
import { BellIcon } from "@/components/icons";

/** One-click "flag for follow-up" — schedules a follow-up for today. */
export function FlagButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => flagFollowup(id))}
      disabled={pending}
      title="Flag for follow-up"
      aria-label="Flag for follow-up"
      className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border-2 border-ink bg-bary text-ink transition hover:-translate-y-px disabled:opacity-50"
    >
      <BellIcon />
    </button>
  );
}

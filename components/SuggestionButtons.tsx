import { acceptSuggestion, rejectSuggestion } from "@/app/(app)/actions";
import { SubmitButton } from "@/components/SubmitButton";

/** Inline accept / reject controls for a pending suggestion. */
export function SuggestionButtons({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <form action={acceptSuggestion}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton className="rounded-[10px] border-2 border-ink bg-ink px-3 py-1 text-xs font-bold text-card transition hover:-translate-y-px">
          Accept
        </SubmitButton>
      </form>
      <form action={rejectSuggestion}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton className="rounded-[10px] border-2 border-ink bg-card px-3 py-1 text-xs font-bold text-ink transition hover:-translate-y-px">
          Reject
        </SubmitButton>
      </form>
    </div>
  );
}

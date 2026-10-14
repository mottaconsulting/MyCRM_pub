import { SectionCard } from "@/components/ui";
import { MicIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default function NotePage() {
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <MicIcon className="h-6 w-6 text-accent" />
        Voice note
      </h1>
      <SectionCard
        title="Record"
        icon={<MicIcon className="h-[18px] w-[18px] text-hot" />}
        tone="mint"
        pad
      >
        <div className="rounded-[12px] border-2 border-dashed border-line p-8 text-center">
          <p className="text-sm text-muted">
            Record a note after a meeting — transcribed and summarised, then
            attached to the attendees.
          </p>
          <p className="mt-2 text-xs text-faint">
            Voice notes arrive in Phase 4 (Whisper + Claude Haiku pipeline).
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

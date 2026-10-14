import { createClient } from "@/lib/supabase/server";
import { EmptyState, SectionCard } from "@/components/ui";
import { SparkleIcon, InboxIcon } from "@/components/icons";
import { ReviewList } from "@/components/ReviewList";
import type { Suggestion } from "@/lib/types";

export const dynamic = "force-dynamic";
// Accepting a suggestion runs the Gemini enrichment — allow time beyond the
// default serverless limit.
export const maxDuration = 60;

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suggestions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<Suggestion[]>();

  const suggestions = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <SparkleIcon className="h-6 w-6 text-accent" />
        Review suggestions
      </h1>
      <p className="text-sm text-muted">
        People found in your mailbox. Tick rows for bulk accept/reject, or{" "}
        <span className="font-bold">Edit</span> a row to fix the name, company or
        tags before accepting. Catch-up finds are tagged{" "}
        <span className="font-bold">catch-up</span>.
      </p>

      <SectionCard
        title={`Pending (${suggestions.length})`}
        icon={<InboxIcon className="h-[18px] w-[18px] text-good" />}
        tone="mint"
      >
        {suggestions.length === 0 ? (
          <EmptyState>
            No pending suggestions. Run a catch-up crawl from Settings, or wait
            for the ongoing sync.
          </EmptyState>
        ) : (
          <ReviewList suggestions={suggestions} />
        )}
      </SectionCard>
    </div>
  );
}

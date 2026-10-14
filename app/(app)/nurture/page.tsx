import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import { timeAgo } from "@/lib/date";
import { SectionCard, EmptyState } from "@/components/ui";
import { SproutIcon } from "@/components/icons";
import { NurtureCard, type NurtureContact } from "@/components/NurtureCard";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
// AI drafting runs in a server action from this route.
export const maxDuration = 60;

const NURTURE_COOLDOWN_DAYS = 14;
const FEED_SIZE = 8;

export default async function NurturePage() {
  const supabase = await createClient();
  const cutoff = new Date(
    Date.now() - NURTURE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // People the owner actually has a relationship with (some AI context), least
  // recently in touch first. Cadence filtering is done in JS so it works even
  // before the last_nurtured_at column exists.
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("archived", false)
    .is("warning", null)
    .not("ai_summary", "is", null)
    .order("last_contact_at", { ascending: true, nullsFirst: true })
    .limit(60)
    .returns<Contact[]>();

  const candidates = (data ?? [])
    .filter((c) => c.emails.length > 0)
    .filter((c) => !c.last_nurtured_at || c.last_nurtured_at < cutoff)
    .slice(0, FEED_SIZE);

  const toCard = (c: Contact): NurtureContact => ({
    id: c.id,
    name: contactName(c),
    email: c.emails[0] ?? null,
    company: c.company,
    lastContact: c.last_contact_at ? timeAgo(c.last_contact_at) : null,
    linkedinUrl: c.linkedin_url,
  });

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <SproutIcon className="h-6 w-6 text-good" />
        Nurture
      </h1>
      <p className="text-sm text-muted">
        A rotating feed of people worth a personal check-in — least-recently in
        touch first. Draft a warm, specific note with AI, tweak it, send it from
        your own email, then mark it sent so they drop off for a couple of weeks.
      </p>

      {candidates.length === 0 ? (
        <SectionCard title="All caught up" tone="mint">
          <EmptyState>
            Nobody&apos;s due for a nurture note right now. Check back in a few
            days.
          </EmptyState>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {candidates.map((c) => (
            <NurtureCard key={c.id} c={toCard(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

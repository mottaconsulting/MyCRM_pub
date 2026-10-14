import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import { SectionCard, EmptyState } from "@/components/ui";
import { MailIcon, SparkleIcon } from "@/components/icons";
import { CampaignRunner, type CampaignContact } from "@/components/CampaignRunner";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";
// Drafting loops Gemini per contact from the client, but keep headroom.
export const maxDuration = 60;

const STAGE_OPTIONS = [
  { v: "", label: "Any stage" },
  { v: "lead", label: "Lead" },
  { v: "in_discussion", label: "In discussion" },
  { v: "proposal", label: "Proposal" },
  { v: "won", label: "Won" },
  { v: "project_work", label: "Project work" },
  { v: "dormant", label: "Dormant" },
];
const TEMP_OPTIONS = [
  { v: "", label: "Any heat" },
  { v: "hot", label: "Hot" },
  { v: "warm", label: "Warm" },
  { v: "cold", label: "Cold" },
];
const selectCls =
  "w-full cursor-pointer rounded-[11px] border-2 border-ink bg-card px-3 py-2 text-sm font-bold text-ink outline-none sm:w-auto";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    interest?: string;
    stage?: string;
    temp?: string;
    q?: string;
    go?: string;
  }>;
}) {
  const { interest, stage, temp, q, go } = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("interest_options, owner_first_name")
    .single();
  const interestOptions = (settings?.interest_options as string[] | null) ?? [];
  const ownerFirst = (settings?.owner_first_name as string | null) ?? "";

  // Load once the form is submitted (go) or any param is present. No filters =
  // everyone. The keyword `q` matches name / company / role.
  const loaded = Boolean(go || interest || stage || temp || (q && q.trim()));
  let contacts: Contact[] = [];
  if (loaded) {
    let query = supabase
      .from("contacts")
      .select("*")
      .eq("archived", false)
      .is("warning", null)
      .order("first_name")
      .limit(1000);
    if (interest) query = query.contains("interests", [interest]);
    if (stage) query = query.eq("pipeline_stage", stage);
    if (temp) query = query.eq("temperature", temp);
    if (q && q.trim()) {
      const esc = q.trim().replace(/[%,()]/g, " ").trim();
      if (esc) {
        query = query.or(
          `first_name.ilike.%${esc}%,last_name.ilike.%${esc}%,company.ilike.%${esc}%,role.ilike.%${esc}%`,
        );
      }
    }
    const { data } = await query.returns<Contact[]>();
    contacts = data ?? [];
  }
  const runnerContacts: CampaignContact[] = contacts.map((c) => ({
    id: c.id,
    name: contactName(c),
    firstName: c.first_name,
    email: c.emails[0] ?? null,
    company: c.company,
    role: c.role,
  }));
  const withEmail = runnerContacts.filter((c) => c.email).length;

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <MailIcon className="h-6 w-6 text-accent" />
        Campaigns
      </h1>
      <p className="text-sm text-muted">
        Target your contacts — by interest, stage, heat, a keyword, or everyone —
        write one brief, and let AI personalise the email for each person from
        their own history and interests. You review and send them yourself.
      </p>

      <SectionCard title="Audience" tone="violet" pad>
        {interestOptions.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Tip: add some{" "}
            <a href="/settings" className="font-bold text-ink underline">
              interest tags
            </a>{" "}
            and assign them to contacts to target campaigns by interest.
          </p>
        )}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div>
            <label className="field-label">Interest</label>
            <select name="interest" defaultValue={interest ?? ""} className={selectCls}>
              <option value="">Any interest</option>
              {interestOptions.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Stage</label>
            <select name="stage" defaultValue={stage ?? ""} className={selectCls}>
              {STAGE_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Heat</label>
            <select name="temp" defaultValue={temp ?? ""} className={selectCls}>
              {TEMP_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 flex-1">
            <label className="field-label">Search (name / company)</label>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Optional keyword…"
              className="field"
            />
          </div>
          {/* Marks the form as submitted so leaving every filter on "Any" loads
              EVERYONE rather than nobody. */}
          <input type="hidden" name="go" value="1" />
          <button className="inline-flex items-center gap-2 rounded-[11px] border-2 border-ink bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition hover:-translate-y-px">
            Load audience
          </button>
        </form>
        <p className="mt-2 text-xs text-faint">
          Leave everything on “Any” and hit Load audience to send to{" "}
          <span className="font-semibold">everyone</span>.
        </p>
        {loaded && (
          <p className="mt-3 text-sm font-semibold text-ink">
            {contacts.length} contact{contacts.length === 1 ? "" : "s"} matched
            {contacts.length > 0 && withEmail < contacts.length
              ? ` (${withEmail} with an email address)`
              : ""}
            .
          </p>
        )}
      </SectionCard>

      {loaded && contacts.length > 0 && (
        <SectionCard
          title="Personalise & send"
          icon={<SparkleIcon className="h-[18px] w-[18px] text-warm" />}
          tone="mint"
          pad
        >
          <CampaignRunner contacts={runnerContacts} ownerFirst={ownerFirst} />
        </SectionCard>
      )}
      {loaded && contacts.length === 0 && (
        <SectionCard title="No matches" tone="mint">
          <EmptyState>
            No active contacts match that. Try a different filter or keyword.
          </EmptyState>
        </SectionCard>
      )}
    </div>
  );
}

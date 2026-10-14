import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contactName } from "@/lib/contacts";
import { SectionCard, EmptyState } from "@/components/ui";
import { UsersIcon } from "@/components/icons";
import { MergeGroup, type DupContact } from "@/components/MergeGroup";
import type { Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

function normName(first: string, last: string | null): string {
  return `${first} ${last ?? ""}`
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function DuplicatesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("archived", false)
    .returns<Contact[]>();
  const contacts = data ?? [];

  // Union contacts that share a normalized email OR a normalized full name, so
  // same-email-different-name pairs (e.g. "Jane Smith" / "Jsmith") group
  // together too — not just exact same-name.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const c of contacts) parent.set(c.id, c.id);

  const linkBy = (keyOf: (c: Contact) => string[]) => {
    const firstFor = new Map<string, string>();
    for (const c of contacts) {
      for (const k of keyOf(c)) {
        if (!k) continue;
        const first = firstFor.get(k);
        if (first) union(first, c.id);
        else firstFor.set(k, c.id);
      }
    }
  };
  linkBy((c) => (c.emails ?? []).map((e) => e.trim().toLowerCase()));
  linkBy((c) => [normName(c.first_name, c.last_name)]);

  const grouped = new Map<string, Contact[]>();
  for (const c of contacts) {
    const r = find(c.id);
    if (!grouped.has(r)) grouped.set(r, []);
    grouped.get(r)!.push(c);
  }
  const dupes = [...grouped.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => contactName(a[0]).localeCompare(contactName(b[0])));

  // A group linked by a shared email is a high-confidence duplicate.
  const sharesEmail = (g: Contact[]) => {
    const seen = new Set<string>();
    for (const c of g)
      for (const e of c.emails ?? []) {
        const k = e.trim().toLowerCase();
        if (seen.has(k)) return true;
        seen.add(k);
      }
    return false;
  };

  const toDup = (c: Contact): DupContact => ({
    id: c.id,
    name: contactName(c),
    emails: c.emails,
    company: c.company,
    role: c.role,
    last_contact_at: c.last_contact_at,
    hasLinkedin: Boolean(c.linkedin_url),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <UsersIcon className="h-6 w-6 text-accent" />
          Possible duplicates
        </h1>
        <Link
          href="/contacts"
          className="text-xs font-bold text-muted hover:text-ink hover:underline"
        >
          ← Contacts
        </Link>
      </div>

      <p className="text-sm text-muted">
        Contacts that share a <span className="font-semibold">name</span> or an{" "}
        <span className="font-semibold">email</span>. Pick the record to keep and
        merge the rest into it — emails and history move over. A{" "}
        <span className="font-semibold text-hot">same email</span> tag means it&apos;s
        almost certainly the same person. Genuinely different people who share a
        name can be left as they are.
      </p>

      {dupes.length === 0 ? (
        <SectionCard title="All clear" tone="mint">
          <EmptyState>No likely duplicates right now. 🎉</EmptyState>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {dupes.map((g) => (
            <MergeGroup
              key={g[0].id}
              contacts={g.map(toDup)}
              sameEmail={sharesEmail(g)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

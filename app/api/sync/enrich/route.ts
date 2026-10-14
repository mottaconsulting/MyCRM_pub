import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/graph";
import { enrichContactFromEmail } from "@/lib/enrich";
import { tenantsToSync } from "@/lib/tenant";
import { siteBaseUrl } from "@/lib/site";

// Server-side enrichment drain. Processes contacts missing an enrichment
// attempt for ~45s, then re-triggers ITSELF so the whole backlog clears without
// a browser tab open. CRON_SECRET-protected; safe to re-run (idempotent).
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;

function selfUrl(): string | null {
  const site = siteBaseUrl();
  return site ? `${site}/api/sync/enrich` : null;
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tenants = await tenantsToSync();

  const started = Date.now();
  let synced = 0;
  for (const t of tenants) {
    let token: string;
    try {
      token = await getAccessToken(t.tenantId);
    } catch {
      continue; // this tenant's Microsoft isn't connected/valid — skip
    }
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data } = await supabase
        .from("contacts")
        .select("id, emails, first_name, last_name, company, role, phone")
        .eq("tenant_id", t.tenantId)
        .eq("archived", false)
        .is("ai_summary_at", null)
        .order("created_at")
        .limit(1);
      const c = data?.[0];
      if (!c) break;

      const email = (c.emails as string[] | null)?.[0];
      if (!email) {
        await supabase
          .from("contacts")
          .update({ ai_summary_at: new Date().toISOString() })
          .eq("id", c.id);
      } else {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
        await enrichContactFromEmail(
          supabase,
          c.id,
          email,
          name,
          { company: c.company ?? null, role: c.role ?? null, phone: c.phone ?? null },
          {
            tenantId: t.tenantId,
            ownerEmail: t.ownerEmail,
            ownerName: t.ownerName,
            accessToken: token,
          },
        );
      }
      synced++;
    }
    if (Date.now() - started >= TIME_BUDGET_MS) break;
  }

  const tenantIds = tenants.map((t) => t.tenantId);
  let remaining = 0;
  if (tenantIds.length) {
    const { count } = await supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .in("tenant_id", tenantIds)
      .eq("archived", false)
      .is("ai_summary_at", null);
    remaining = count ?? 0;
  }

  // Chain the next slice server-side. Dispatch then abort the wait — Vercel
  // keeps the triggered function running independently of this connection.
  let chained = false;
  const url = selfUrl();
  if (remaining > 0 && synced > 0 && url) {
    chained = true;
    try {
      await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      /* expected: we abort once the request is dispatched */
    }
  }

  return NextResponse.json({ ok: true, synced, remaining, chained });
}

export const GET = handle;
export const POST = handle;

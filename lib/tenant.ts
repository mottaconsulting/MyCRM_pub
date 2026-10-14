import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The calling user's effective tenant id (respects a super admin's picked
 * tenant). For RLS-scoped (user) clients only — service-role jobs have no auth
 * context and must pass tenant ids explicitly.
 */
export async function authTenantId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.rpc("auth_tenant_id");
  return (data as string | null) ?? null;
}

export type OwnerCtx = {
  tenantId: string;
  ownerEmail: string;
  ownerName: string;
  ownerFirstName: string;
};

/**
 * The calling user's tenant + owner identity, for user-initiated syncs and AI.
 * Reads settings under RLS (returns the caller's single tenant row).
 */
export async function ownerContext(
  supabase: SupabaseClient,
): Promise<OwnerCtx | null> {
  const tenantId = await authTenantId(supabase);
  if (!tenantId) return null;
  const { data } = await supabase
    .from("settings")
    .select("owner_email, owner_name, owner_first_name")
    .single();
  return {
    tenantId,
    ownerEmail: (data?.owner_email as string | null) ?? "",
    ownerName: (data?.owner_name as string | null) ?? "",
    ownerFirstName: (data?.owner_first_name as string | null) ?? "",
  };
}

export type TenantSync = {
  tenantId: string;
  ownerEmail: string;
  ownerName: string;
};

/**
 * Every tenant with a Microsoft connection, plus its owner identity — the set
 * the scheduled sync loops over. Service-role (bypasses RLS by design).
 */
export async function tenantsToSync(): Promise<TenantSync[]> {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("sync_state")
    .select("tenant_id")
    .not("ms_refresh_token", "is", null);
  const ids = (rows ?? []).map((r) => r.tenant_id as string);
  if (!ids.length) return [];
  const { data: s } = await supabase
    .from("settings")
    .select("tenant_id, owner_email, owner_name")
    .in("tenant_id", ids);
  const byId = new Map((s ?? []).map((r) => [r.tenant_id as string, r]));
  return ids.map((id) => ({
    tenantId: id,
    ownerEmail: (byId.get(id)?.owner_email as string | null) ?? "",
    ownerName: (byId.get(id)?.owner_name as string | null) ?? "",
  }));
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/Nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Super admins get a tenancy picker in the nav.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin, active_tenant_id, tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  let tenants: { id: string; name: string }[] = [];
  let activeTenantId = "";
  if (profile?.is_super_admin) {
    const { data } = await supabase.from("tenants").select("id, name").order("name");
    tenants = data ?? [];
    activeTenantId = (profile.active_tenant_id ?? profile.tenant_id) as string;
  }

  return (
    <div className="min-h-screen">
      <Nav
        email={user.email ?? ""}
        superAdmin={Boolean(profile?.is_super_admin)}
        tenants={tenants}
        activeTenantId={activeTenantId}
      />
      <main className="mx-auto max-w-6xl overflow-x-clip px-4 py-6">{children}</main>
    </div>
  );
}

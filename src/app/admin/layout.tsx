import Link from "next/link";
import { redirect } from "next/navigation";
import { staffAccess } from "@/lib/data";
import { MFA } from "@/components/mfa";
import { AdminNav } from "@/components/admin-nav";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const a = await staffAccess();
  if (!a.user) redirect("/auth/login");
  if (!a.allowed)
    return (
      <section className="section empty">
        <h1>Staff access required.</h1>
        <p>
          Your account has no assigned staff role. A designated RIWAY
          administrator must provision access.
        </p>
        <Link className="button" href="/account">
          Your account
        </Link>
      </section>
    );
  if (!a.mfa)
    return (
      <section className="section" style={{ maxWidth: 700 }}>
        <h1>Verify your identity.</h1>
        <MFA />
      </section>
    );
  return (
    <section className="section page-section">
      <span className="eyebrow">RIWAY · OPERATIONS WORKSPACE</span>
      <div className="admin-layout">
        <AdminNav />
        <div>{children}</div>
      </div>
    </section>
  );
}

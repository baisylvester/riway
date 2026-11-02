import Link from "next/link";
import { redirect } from "next/navigation";
import { session } from "@/lib/data";
import { SignOut } from "@/components/auth-form";
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await session();
  if (!user) redirect("/auth/login");
  return (
    <section className="section page-section">
      <div className="admin-actions">
        <div>
          <span className="eyebrow">YOUR RIWAY WORLD</span>
          <h1>Your account.</h1>
        </div>
        <SignOut />
      </div>
      <p className="small muted">{user.email}</p>
      <nav className="tab-links" aria-label="Account navigation">
        <Link href="/account">Overview</Link>
        <Link href="/account/orders">Orders</Link>
        <Link href="/account/addresses">Addresses</Link>
        <Link href="/account/security">Security</Link>
        <Link href="/distributor">Distributor</Link>
      </nav>
      {children}
    </section>
  );
}

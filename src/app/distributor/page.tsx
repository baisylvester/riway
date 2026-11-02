import Link from "next/link";
import { redirect } from "next/navigation";
import { session } from "@/lib/data";
import QRCode from "qrcode";
export default async function Distributor() {
  const { client, user } = await session();
  if (!user) redirect("/auth/login");
  const { data: d } = await client
    .from("distributor_profiles")
    .select("code,display_name,active,verified_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const url = d
    ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4173"}/d/${encodeURIComponent(d.code)}`
    : "";
  const qr =
    d?.active && d.verified_at
      ? await QRCode.toDataURL(url, { width: 220, margin: 2 })
      : "";
  return (
    <section className="section page-section">
      <span className="eyebrow">RIWAY DISTRIBUTOR AREA</span>
      <h1>
        Your connections.
        <br />
        Your community.
      </h1>
      {d?.active && d.verified_at ? (
        <div className="panel">
          <h2>{d.display_name}</h2>
          <p>Verified distributor code: {d.code}</p>
          <p>
            <Link className="return-link" href={`/d/${d.code}`}>
              {url}
            </Link>
          </p>
          <img
            width={220}
            height={220}
            src={qr}
            alt="Your verified distributor introduction QR code"
          />
          <div className="notice">
            Attributed order data and compensation records are awaiting approved
            RIWAY integration and disclosure rules. Online sales remain closed.
          </div>
        </div>
      ) : (
        <div className="panel">
          <h2>Distributor verification required.</h2>
          <p className="muted">
            This account is not linked to an active, verified RIWAY distributor.
            Roles and sponsor relationships cannot be self-assigned.
          </p>
          <Link className="button" href="/support">
            Contact RIWAY support
          </Link>
        </div>
      )}
    </section>
  );
}

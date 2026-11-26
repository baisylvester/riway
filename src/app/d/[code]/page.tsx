import Link from "@/components/localized-link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { Referral } from "@/components/referral";
export default async function DistributorStore({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (
    !z
      .string()
      .regex(/^[A-Za-z0-9-]{3,40}$/)
      .safeParse(code).success
  )
    notFound();
  const client = await db();
  // Prefer the store lookup with the approved photo; fall back to the
  // original lookup if that function is not deployed yet.
  let { data, error } = await client.rpc("lookup_distributor_store", {
    c: code,
  });
  if (error)
    ({ data, error } = await client.rpc("lookup_distributor", { c: code }));
  if (error || !data?.length) notFound();
  const d = data[0] as {
    display_name: string;
    photo_url?: string | null;
  };
  return (
    <section className="section page-section">
      <span className="eyebrow">A PERSONAL INTRODUCTION</span>
      <h1>
        Welcome to RIWAY,
        <br />
        with {d.display_name}.
      </h1>
      {d.photo_url && (
        <img
          className="distributor-photo"
          src={d.photo_url}
          alt={`${d.display_name}, verified RIWAY distributor`}
          width={160}
          height={160}
          style={{ borderRadius: "50%", objectFit: "cover" }}
        />
      )}
      <p className="lead">
        Your introduction from a verified RIWAY distributor.
      </p>
      <div className="notice">
        Online purchasing remains unavailable. Linking a referring distributor
        does not create membership, placement or commission entitlements.
      </div>
      <Referral code={code} />
      <Link className="text-link" href="/shop">
        Explore the collections →
      </Link>
    </section>
  );
}

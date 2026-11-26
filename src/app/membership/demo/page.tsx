import Link from "@/components/localized-link";
import { MembershipDemo } from "@/components/membership-demo";

export const metadata = { title: "Sample membership journey" };
export default function MembershipDemoPage() {
  return (
    <section className="section page-section stack">
      <span className="eyebrow">MEMBERSHIP · DEMONSTRATION</span>
      <h1>Try the sample membership journey.</h1>
      <p className="notice">
        Sample packages, tiers and documents for review only. These are not
        approved RIWAY membership rules. No real payment or membership is
        created.
      </p>
      <MembershipDemo />
      <Link href="/membership">Return to membership information →</Link>
    </section>
  );
}

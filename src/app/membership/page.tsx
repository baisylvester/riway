import { currentLocale } from "@/lib/locale-server";
import Link from "@/components/localized-link";
import { currentMarket } from "@/lib/data";
import { cmsSections, pageKeys } from "@/lib/cms-pages";
import { CmsSections } from "@/components/cms-sections";
export const metadata = { title: "Membership & opportunity" };
export default async function Membership() {
  // Approved package and compensation overview sections, when published.
  const sections = await cmsSections(
    pageKeys.membership,
    await currentMarket(),
    await currentLocale(),
  );
  return (
    <>
      <section className="section page-section">
        <span className="eyebrow">TOGETHER, WE GO FURTHER</span>
        <h1>
          A community.
          <br />A shared possibility.
        </h1>
        <p className="lead">
          Explore RIWAY membership and the people who make our community.
        </p>
        <div className="notice">
          Real enrolment requires approved package rules, verified payment and
          confirmation against RIWAY’s member records. A website account does
          not confer RIWAY membership or a distributor role.
        </div>
        <div className="hero-buttons">
          <Link className="button" href="/membership/demo">
            Try the sample journey
          </Link>
          <Link className="text-link" href="/account/membership">
            Your membership →
          </Link>
        </div>
        <div className="cards">
          {[
            [
              "Discover",
              "Explore the collections and speak with RIWAY about membership.",
            ],
            [
              "Connect",
              "Membership follows a verified qualifying purchase under RIWAY’s approved rules.",
            ],
            [
              "Continue",
              "Existing member records, tiers and sponsor relationships remain managed by RIWAY.",
            ],
          ].map(([t, p]) => (
            <div className="card" key={t}>
              <h2>{t}</h2>
              <p>{p}</p>
            </div>
          ))}
        </div>
        <div className="page-prose">
          <h2>A considered decision.</h2>
          <p>
            Approved qualifying packages identify their proposed tier and
            display the enrolment Terms and Code of Conduct during checkout.
            Your account records the qualifying purchase and document versions.
            Real package rules and terms still require RIWAY approval; the
            sample journey uses demonstration data. Commission calculations and
            payouts remain in RIWAY’s existing compensation system.
          </p>
          <p>
            Income is not guaranteed. Individual outcomes vary and depend on
            many factors. Membership and opportunity information must be
            reviewed alongside the applicable Code of Conduct and approved
            income disclosures.
          </p>
          <Link className="button" href="/support">
            Speak with RIWAY →
          </Link>
        </div>
      </section>
      <CmsSections sections={sections} />
    </>
  );
}

import Link from "next/link";
export const metadata = { title: "Membership & opportunity" };
export default function Membership() {
  return (
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
        Online enrolment is not yet available. A website account does not confer
        RIWAY membership or a distributor role.
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
          Package qualification rules, tier assignments and membership terms
          will be published once confirmed by RIWAY. Commission calculations and
          payouts remain in RIWAY’s existing compensation system.
        </p>
        <p>
          Income is not guaranteed. Individual outcomes vary and depend on many
          factors. Membership and opportunity information must be reviewed
          alongside the applicable Code of Conduct and approved income
          disclosures.
        </p>
        <Link className="button" href="/support">
          Speak with RIWAY →
        </Link>
      </div>
    </section>
  );
}

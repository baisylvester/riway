import Link from "next/link";
export default function Legal() {
  return (
    <section className="section page-section">
      <span className="eyebrow">CLEAR INFORMATION. CONSIDERED CHOICES.</span>
      <h1>Policies & conduct.</h1>
      <div className="notice">
        These development notices are pending RIWAY legal approval and are not
        launch-ready legal terms.
      </div>
      <div className="cards">
        {[
          ["privacy", "Privacy"],
          ["terms", "Terms of use & sale"],
          ["cookies", "Cookies"],
          ["conduct", "Code of Conduct"],
          ["disclaimers", "Product & income disclosures"],
        ].map(([s, t]) => (
          <Link className="card" href={`/legal/${s}`} key={s}>
            <h2>{t}</h2>
            <span className="text-link">Read notice →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

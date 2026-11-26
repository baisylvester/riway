import { currentLocale } from "@/lib/locale-server";
import Link from "@/components/localized-link";
import { currentMarket } from "@/lib/data";
import { SupportForm } from "@/components/forms";
import { cmsSections, pageKeys } from "@/lib/cms-pages";
import { CmsSections } from "@/components/cms-sections";
export const metadata = { title: "Support" };
export default async function Support() {
  const market = await currentMarket();
  // Approved regional contacts and shipping/returns/refund policies, when published.
  const sections = await cmsSections(
    pageKeys.support,
    market,
    await currentLocale(),
  );
  return (
    <>
      <section className="section page-section">
        <span className="eyebrow">WE’RE HERE FOR YOU</span>
        <h1>Let’s find your next step.</h1>
        <p className="lead">
          Support for your account, our collections and your RIWAY journey.
        </p>
        <div className="two-column">
          <div>
            <h2>Frequently asked questions</h2>
            {[
              [
                "Can I purchase products online?",
                "Online sales are not currently enabled on this development platform. RIWAY policy approval and market-specific regulatory registration must be verified before launch.",
              ],
              [
                "How do I link an existing membership?",
                "RIWAY remains the authoritative source for membership, sponsor and tier information. Linking will become available once the approved member-system integration is connected.",
              ],
              [
                "Where can I find delivery and refund terms?",
                "Market-specific shipping and return policies will be published before sales open. No orders or payments are accepted now.",
              ],
              [
                "How is my information protected?",
                "Account data is protected using authenticated access and database row-level security. Review the privacy notice for the current development status.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
            <p style={{ marginTop: 25 }}>
              <Link
                className="text-link"
                href="https://www.riway.com/contact-asia"
              >
                Official regional contacts ↗
              </Link>
            </p>
          </div>
          <SupportForm market={market} />
        </div>
      </section>
      <CmsSections sections={sections} />
    </>
  );
}

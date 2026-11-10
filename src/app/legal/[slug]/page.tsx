import { notFound } from "next/navigation";
const notices: Record<string, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: "Privacy notice",
    paragraphs: [
      "This is a development platform. Use test information until RIWAY approves production data handling, retention, hosting locations and processor agreements.",
      "Account authentication is handled by Supabase Auth. Profile details, addresses, support requests and saved bags are stored in the designated RIWAY Supabase project. The current project region is Ireland (eu-west-1). No payment card details are collected.",
      "Marketing preferences are optional and may be changed in your account. Analytics and advertising trackers have not been enabled. Contact RIWAY through its official channels for privacy requests. Retention schedules, deletion workflows and the designated privacy contact must be approved before launch.",
      "When you open a verified distributor introduction, this browser can remember that introduction for up to 30 days and link it when you sign in. A saved introduction does not replace an existing sponsor or establish membership, placement or commission rights. You can clear a saved introduction on the introduction page; a sponsor already linked to an account remains governed by RIWAY’s records.",
    ],
  },
  terms: {
    title: "Terms of use & sale",
    paragraphs: [
      "Development notice: no online purchases, payments or binding membership enrolments are available. Product prices, shipping rates, taxes and refund terms require RIWAY approval.",
      "A website account is separate from RIWAY membership. The member and compensation systems remain authoritative for sponsor relationships, membership status and commission calculations.",
      "Final market-specific Terms of Sale, consumer rights, dispute procedures and RIWAY policy changes are awaiting legal approval before commerce is enabled.",
    ],
  },
  cookies: {
    title: "Cookie notice",
    paragraphs: [
      "The platform uses necessary authentication cookies to maintain your signed-in session and a country-preference cookie to remember your selected market.",
      "Opening a verified distributor introduction uses a first-party functional cookie to remember the first valid saved introduction for up to 30 days. The server rechecks the distributor before linking it to your signed-in account. The cookie is removed after completion or when you choose Clear saved introduction. It is not an advertising cookie and does not replace an existing account sponsor.",
      "Your bag is stored in local browser storage and can be explicitly saved to your account. No analytics or advertising cookies are enabled.",
      "You may remove cookies and browser storage in your browser settings. Doing so may sign you out, reset your selected market, clear a pending introduction or remove an unsaved bag.",
    ],
  },
  conduct: {
    title: "Code of Conduct",
    paragraphs: [
      "RIWAY’s approved Code of Conduct remains authoritative. The existing official website prohibits distributor sales through online channels. This development platform does not supersede that policy.",
      "The revised policy and enrolment acceptance workflow must be approved by RIWAY before launch. Visit the current official RIWAY website for its published Code of Conduct.",
    ],
  },
  disclaimers: {
    title: "Product & income disclosures",
    paragraphs: [
      "No approved therapeutic claims. Read the label and consult a healthcare professional. Products are not offered for sale through this development platform.",
      "The project proposal records that Philippine FDA approval is pending. Product sales remain blocked until market-specific registration and approved labels are documented. This is a project restriction, not a newly verified regulatory determination.",
      "Income is not guaranteed. Individual results vary. No earnings forecast or compensation calculation is provided by this platform. Product claims and testimonials require RIWAY compliance approval before publication.",
    ],
  },
};
export default async function Notice({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const n = notices[(await params).slug];
  if (!n) notFound();
  return (
    <section className="section page-prose page-section">
      <span className="eyebrow">DEVELOPMENT NOTICE · PENDING APPROVAL</span>
      <h1>{n.title}</h1>
      {n.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </section>
  );
}

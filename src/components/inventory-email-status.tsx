import "server-only";
import { notificationConfiguration } from "@/lib/notification-config";

// Render only after the caller verifies RIWAY platform-admin access and MFA.
export function InventoryEmailStatus() {
  const config = notificationConfiguration(process.env);
  return (
    <section className="panel stack" aria-labelledby="inventory-email-heading">
      <h2 id="inventory-email-heading">Inventory email reports</h2>
      <p role="status">
        {config.status === "disabled"
          ? "Email delivery is disabled. Store-owner welcomes and low-stock reports are not being sent."
          : config.status === "incomplete"
            ? "Email delivery is blocked by incomplete configuration."
            : config.status === "test"
              ? "Email is configured in test mode. Only allowlisted recipients can receive messages."
              : "Email is configured for live delivery."}
      </p>
      {config.schedule && <p>Daily low-stock reports: {config.schedule}.</p>}
      {!!config.issues.length && (
        <>
          <h3>Setup still needed</h3>
          <ul>
            {config.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </>
      )}
      <p className="small">
        Sender-domain verification and a successful test delivery must be
        confirmed in Resend before rollout.
      </p>
    </section>
  );
}

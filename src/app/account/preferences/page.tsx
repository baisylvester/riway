import { z } from "zod";
import { requireSession } from "@/lib/data";
import { StaffActionForm } from "@/components/staff-action-form";
import { saveReorderPreference } from "./actions";
export const metadata = { title: "Communication preferences" };
export default async function Preferences() {
  const { client } = await requireSession();
  const { data, error } = await client.rpc("my_reorder_preference");
  const result = z
    .object({
      emailEnabled: z.boolean(),
      revision: z.number().int(),
      consentVersion: z.literal("reorder-email-v1"),
    })
    .safeParse(data);
  return (
    <div className="stack">
      <h2>Communication preferences</h2>
      <p>
        Reorder reminders are optional. Transactional order, account and booking
        messages are separate. A reminder opens your previous order for review;
        it never places an order or authorizes a payment.
      </p>
      {error || !result.success ? (
        <p>Preferences are unavailable. Please try later or contact support.</p>
      ) : (
        <StaffActionForm
          action={saveReorderPreference}
          submit="Save preferences"
        >
          <input type="hidden" name="revision" value={result.data.revision} />
          <input type="hidden" name="version" value="reorder-email-v1" />
          <label className="check">
            <input
              type="checkbox"
              name="email"
              defaultChecked={result.data.emailEnabled}
            />
            Email me a reorder reminder based on my purchases and RIWAY-approved
            product timing. I can stop these emails at any time here or through
            the unsubscribe link in an email.
          </label>
        </StaffActionForm>
      )}
      <p className="small muted">
        SMS and messaging reminders are not available until those delivery
        channels and their consent wording are approved.
      </p>
    </div>
  );
}

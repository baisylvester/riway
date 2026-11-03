"use client";
import { useActionState } from "react";
import {
  saveProfile,
  saveAddress,
  sendSupport,
  registerEvent,
} from "@/app/actions";
import { markets, type Market } from "@/lib/domain";
export function ProfileForm({
  profile,
}: {
  profile: {
    full_name?: string;
    phone?: string;
    marketing_consent?: boolean;
  } | null;
}) {
  const [s, a, p] = useActionState(saveProfile, { message: "" });
  return (
    <form action={a} className="panel stack">
      <h2>Your profile</h2>
      <label>
        Full name
        <input
          name="full_name"
          defaultValue={profile?.full_name}
          required
          minLength={2}
          maxLength={100}
        />
      </label>
      <label>
        Phone number
        <input name="phone" defaultValue={profile?.phone} maxLength={25} />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          name="marketing_consent"
          defaultChecked={profile?.marketing_consent}
        />
        <span>I would like to receive approved RIWAY communications.</span>
      </label>
      <button className="button" disabled={p}>
        Save profile
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
export function AddressForm() {
  const [s, a, p] = useActionState(saveAddress, { message: "" });
  return (
    <form action={a} className="panel stack">
      <h2>Add an address</h2>
      <div className="form-grid">
        {[
          ["full_name", "Full name"],
          ["phone", "Phone"],
          ["line1", "Street address"],
          ["city", "City"],
          ["postal_code", "Postal code"],
        ].map(([n, l]) => (
          <label key={n}>
            {l}
            <input name={n} required maxLength={n === "line1" ? 200 : 100} />
          </label>
        ))}
        <label>
          Country
          <select name="country">
            {Object.entries(markets).map(([c, v]) => (
              <option value={c} key={c}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="button" disabled={p}>
        Save address
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
export function SupportForm({ market }: { market: Market }) {
  const [s, a, p] = useActionState(sendSupport, { message: "" });
  return (
    <form action={a} className="panel stack">
      <h2>How can we help?</h2>
      <p className="small muted">Sign in to send and track a request.</p>
      <input type="hidden" name="market" value={market} />
      <label>
        Subject
        <input name="subject" required minLength={5} maxLength={160} />
      </label>
      <label>
        Your message
        <textarea name="message" required minLength={20} maxLength={4000} />
      </label>
      <button className="button" disabled={p}>
        Send support request
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}
export function EventRegistration({ id }: { id: string }) {
  const [s, a, p] = useActionState(registerEvent, { message: "" });
  return (
    <form action={a}>
      <input type="hidden" name="event_id" value={id} />
      <button className="button" disabled={p}>
        Register for event
      </button>
      <p role="status">{s.message}</p>
    </form>
  );
}

import Link from "@/components/localized-link";
import { StaffActionForm } from "@/components/staff-action-form";
import { CheckoutQuote } from "@/components/checkout-quote";
import { requireSession } from "@/lib/data";
import {
  replenishmentMessage,
  replenishmentOption,
  replenishmentQuote,
  replenishmentSchedules,
} from "@/lib/replenishment";
import { z } from "zod";
import { changeSchedule, orderRenewal, startSchedule } from "./actions";

export const metadata = { title: "Replenishment schedules" };
const date = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export default async function Replenishment({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; review?: string }>;
}) {
  const { start, review } = await searchParams;
  const { client } = await requireSession();
  const [schedules, eligible] = await Promise.all([
    client.rpc("my_replenishment_schedules"),
    z.uuid().safeParse(start).success
      ? client.rpc("replenishment_options", { p_order: start })
      : Promise.resolve({ data: null }),
  ]);
  const entries = replenishmentSchedules.safeParse(schedules.data);
  const option = replenishmentOption.safeParse(eligible.data);
  const selected = entries.data?.find((item) => item.id === review);
  const response =
    selected?.due && selected.state === "active" && !selected.withdrawn
      ? await client.rpc("quote_replenishment", {
          p_id: selected.id,
          p_revision: selected.revision,
        })
      : null;
  const currentQuote = replenishmentQuote.safeParse(response?.data);
  return (
    <div className="stack">
      <h2>Replenishment schedules</h2>
      <p>
        Choose when to reorder an eligible product. Review the price and pay for
        each order when it is due.
      </p>
      {option.success ? (
        <article className="panel stack">
          <h3>Schedule {option.data.product}</h3>
          <p>
            {option.data.quantity} per order, every {option.data.intervalDays}{" "}
            days.
          </p>
          <p className="small muted">Schedule terms {option.data.version}</p>
          <p className="content-body">{option.data.terms}</p>
          <StaffActionForm action={startSchedule} submit="Start schedule">
            <input type="hidden" name="order" value={option.data.orderId} />
            <input type="hidden" name="rule" value={option.data.ruleId} />
            <input type="hidden" name="version" value={option.data.version} />
            <label className="checkbox">
              <input required type="checkbox" name="consent" /> I accept these
              schedule terms.
            </label>
          </StaffActionForm>
        </article>
      ) : (
        start && (
          <p className="notice">
            This order is unavailable for a new replenishment schedule.
          </p>
        )
      )}
      {!entries.success && (
        <p className="notice">Replenishment schedules could not be loaded.</p>
      )}
      {entries.success && entries.data.length === 0 && (
        <p>
          Start from an eligible single-product delivery order in{" "}
          <Link href="/account/orders">your orders</Link>.
        </p>
      )}
      {entries.data?.map((item) => {
        const pending = item.orderStatus === "awaiting_payment";
        const needsReview =
          item.orderStatus === "cancelled" && item.paymentStatus === "paid";
        return (
          <article key={item.id} className="panel stack">
            <h3>{item.product}</h3>
            <p>
              {item.market} · {item.quantity} every {item.intervalDays} days ·{" "}
              {item.state}
            </p>
            {item.state !== "cancelled" && (
              <p>
                Next renewal {date.format(new Date(item.nextDueAt))} (UTC)
                {item.due && item.state === "active" ? " · Due" : ""}
              </p>
            )}
            {item.withdrawn && (
              <p className="notice">
                This schedule’s terms were withdrawn. Renewals are closed.
              </p>
            )}
            {item.orderId && (
              <p>
                <Link href={`/account/orders/${item.orderId}`}>
                  {pending
                    ? "Open pending renewal order"
                    : "View renewal order"}
                </Link>
                {needsReview && " · Payment requires staff review."}
              </p>
            )}
            {item.state === "active" &&
              item.due &&
              !item.withdrawn &&
              !pending &&
              !needsReview && (
                <Link href={`/account/replenishment?review=${item.id}`}>
                  {item.orderId ? "Review renewal again" : "Review renewal"}
                </Link>
              )}
            {item.id === selected?.id && currentQuote.success && (
              <>
                <CheckoutQuote quote={currentQuote.data.quote} />
                <p>
                  Delivery to {currentQuote.data.address.full_name},{" "}
                  {currentQuote.data.address.line1},{" "}
                  {currentQuote.data.address.city}{" "}
                  {currentQuote.data.address.postal_code}.
                </p>
                <StaffActionForm
                  action={orderRenewal}
                  submit="Create order for payment"
                >
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="revision" value={item.revision} />
                  <input
                    type="hidden"
                    name="quote"
                    value={currentQuote.data.quote.quoteHash}
                  />
                  <input
                    type="hidden"
                    name="terms"
                    value={currentQuote.data.terms}
                  />
                  <label className="checkbox">
                    <input required type="checkbox" name="consent" /> I confirm
                    this address and accept the{" "}
                    <Link href="/legal/terms">Terms of Sale</Link>.
                  </label>
                </StaffActionForm>
              </>
            )}
            {item.id === selected?.id && response && !currentQuote.success && (
              <p className="notice">
                {response?.error
                  ? replenishmentMessage(response.error)
                  : "This renewal could not be quoted."}
              </p>
            )}
            {item.state !== "cancelled" && (
              <StaffActionForm action={changeSchedule} submit="Update schedule">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="revision" value={item.revision} />
                <label>
                  Schedule action
                  <select name="change" defaultValue="" required>
                    <option value="" disabled>
                      Choose an action
                    </option>
                    {item.state === "active" && (
                      <option value="pause">Pause</option>
                    )}
                    {item.state === "active" && !pending && !needsReview && (
                      <option value="skip">Skip next renewal</option>
                    )}
                    {item.state === "paused" && !item.withdrawn && (
                      <option value="resume">Resume</option>
                    )}
                    <option value="cancel">Cancel schedule</option>
                  </select>
                </label>
                {pending && (
                  <p className="small muted">
                    Manage or cancel the existing order from its order page.
                  </p>
                )}
              </StaffActionForm>
            )}
          </article>
        );
      })}
    </div>
  );
}

import {
  fulfilmentStepLabels,
  orderStatusLabels,
  type OrderFulfilment,
} from "@/lib/fulfilment";

function when(value: string) {
  return new Date(value).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export function FulfilmentTimeline({
  fulfilment,
}: {
  fulfilment: OrderFulfilment;
}) {
  return (
    <section className="stack" aria-label="Delivery progress">
      <h3>Delivery progress</h3>
      <p>
        <span className="status">
          {orderStatusLabels[fulfilment.status] ?? fulfilment.status}
        </span>
      </p>
      {fulfilment.events.length ? (
        <ol className="stack">
          {fulfilment.events.map((event) => (
            <li key={event.toStatus}>
              <strong>{fulfilmentStepLabels[event.toStatus]}</strong>{" "}
              <small>{when(event.createdAt)} UTC</small>
              {event.method === "courier" && (
                <p>
                  {event.carrier} · Tracking {event.trackingNumber}
                  {event.trackingUrl && (
                    <>
                      {" "}
                      <a
                        href={event.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                      >
                        Track parcel
                      </a>
                    </>
                  )}
                </p>
              )}
              {event.method === "collection" && (
                <p>Ready for collection from a RIWAY service centre.</p>
              )}
              {event.note && (
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {event.note}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No delivery updates yet.</p>
      )}
    </section>
  );
}

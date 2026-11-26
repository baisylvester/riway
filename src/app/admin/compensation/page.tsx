import { session } from "@/lib/data";
import {
  compensationEventLabels,
  compensationHoldLabels,
  compensationSyncSchema,
} from "@/lib/compensation-sync";
import { CompensationRetryForm } from "@/components/compensation-retry-form";
import { compensationAdapter } from "@/services/compensation";

export const metadata = { title: "RIWAY volume sync" };

export default async function CompensationSync() {
  const { client } = await session();
  const { data, error } = await client.rpc("staff_compensation_sync");
  const sync = compensationSyncSchema.safeParse(data);
  let enabled = false;
  try {
    enabled = compensationAdapter() !== null;
  } catch {
    // An unsupported setting cannot dispatch queued events.
  }
  return (
    <>
      <h1>RIWAY volume sync</h1>
      <p className="muted">
        Each paid order queues its order facts for RIWAY&apos;s compensation
        system. A fully refunded order or supported paid-order cancellation
        queues a full reversal. Partial refunds require separate RIWAY
        adjustment and reconciliation; automatic partial adjustments are
        unavailable. RIWAY calculates and pays all bonuses; this site does not.
      </p>
      {!enabled && (
        <p className="notice">
          Delivery to RIWAY is switched off until RIWAY supplies its API
          contract and credentials. Queued events stay available for review.
        </p>
      )}
      {error || !sync.success ? (
        <p className="notice">
          {error?.code === "42501"
            ? "Market administrator or operations access with verified MFA is required."
            : "Sync status is unavailable. The sync setup may be pending."}
        </p>
      ) : (
        <>
          <div className="stats">
            <div className="stat">
              <span>Waiting</span>
              <strong>{sync.data.counts.pending - sync.data.held}</strong>
            </div>
            <div className="stat">
              <span>On hold</span>
              <strong>{sync.data.held}</strong>
            </div>
            <div className="stat">
              <span>Sending</span>
              <strong>{sync.data.counts.processing}</strong>
            </div>
            <div className="stat">
              <span>Acknowledged</span>
              <strong>{sync.data.counts.acknowledged}</strong>
            </div>
            <div className="stat">
              <span>Failed</span>
              <strong>{sync.data.counts.failed}</strong>
            </div>
          </div>
          {sync.data.stalePending > 0 && enabled && (
            <p className="notice">
              {sync.data.stalePending} event(s) have waited over an hour. Check
              the worker schedule and RIWAY availability.
            </p>
          )}
          <h2>Needs attention</h2>
          {sync.data.attention.length === 0 ? (
            <p className="muted">No failed or delayed events.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Market</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Hold or last error</th>
                  <th>Queued</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sync.data.attention.map((e) => (
                  <tr key={e.id}>
                    <td>{e.orderId.slice(0, 8).toUpperCase()}</td>
                    <td>{e.market}</td>
                    <td>{compensationEventLabels[e.eventType]}</td>
                    <td>{e.holdReason ? "On hold" : e.status}</td>
                    <td>{e.attempts}</td>
                    <td>
                      {e.holdReason
                        ? compensationHoldLabels[e.holdReason]
                        : (e.lastErrorCode ?? "—")}
                    </td>
                    <td>{new Date(e.createdAt).toISOString().slice(0, 16)}</td>
                    <td>
                      {e.status === "failed" && (
                        <CompensationRetryForm id={e.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

import { session } from "@/lib/data";
import {
  compensationEventLabels,
  compensationSyncSchema,
} from "@/lib/compensation-sync";
import { CompensationRetryForm } from "@/components/compensation-retry-form";

export const metadata = { title: "RIWAY volume sync" };

export default async function CompensationSync() {
  const { client } = await session();
  const { data, error } = await client.rpc("staff_compensation_sync");
  const sync = compensationSyncSchema.safeParse(data);
  const enabled =
    !!process.env.COMPENSATION_PROVIDER &&
    process.env.COMPENSATION_PROVIDER !== "disabled";
  return (
    <>
      <h1>RIWAY volume sync</h1>
      <p className="muted">
        Each paid order queues its order facts for RIWAY&apos;s compensation
        system, and a refund or paid-order cancellation queues a reversal. RIWAY
        calculates and pays all bonuses; this site does not.
      </p>
      {!enabled && (
        <p className="notice">
          Delivery to RIWAY is switched off until RIWAY supplies its API
          contract and credentials. Events are kept and will be sent, once each,
          after activation.
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
              <strong>{sync.data.counts.pending}</strong>
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
                  <th>Last error</th>
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
                    <td>{e.status}</td>
                    <td>{e.attempts}</td>
                    <td>{e.lastErrorCode ?? "—"}</td>
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

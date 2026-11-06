import Link from "next/link";
import { requireSession } from "@/lib/data";
import { SecurityPanel } from "@/components/auth-panel";
import {
  InventorySetupForm,
  StockMovementForm,
  StockThresholdForm,
} from "@/components/inventory-forms";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { authProvider, secondFactorVerified } from "@/lib/auth-config";
import { InventoryEmailStatus } from "@/components/inventory-email-status";

export default async function Operations({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; page?: string }>;
}) {
  const { client, user } = await requireSession();
  const verified =
    authProvider() === "clerk"
      ? secondFactorVerified((await auth()).sessionClaims)
      : (await client.auth.mfa.getAuthenticatorAssuranceLevel()).data
          ?.currentLevel === "aal2";
  if (!verified)
    return (
      <section className="section page-section stack">
        <span className="eyebrow">RIWAY · ACCOUNT SECURITY</span>
        <h1>Verify your authenticator</h1>
        <p>
          You are signed in. Store management requires an authenticator code
          before administrator or store access is available.
        </p>
        <p>
          Set up or verify your authenticator below. After verification, this
          page will load your stores and administrator controls.
        </p>
        <SecurityPanel />
        <Link href="/account/security">Account security</Link>
        <Link href="/account">Return to your account</Link>
      </section>
    );
  const [{ data: tenants, error }, { data: platformAdmin }] = await Promise.all(
    [
      client.from("tenants").select("id,name,active").order("name"),
      client.rpc("is_platform_admin"),
    ],
  );
  if (error)
    return (
      <section className="section page-section">
        <h1>Store management</h1>
        <p>
          Store management setup is pending. Contact your RIWAY administrator.
        </p>
      </section>
    );
  const params = await searchParams;
  const parsedPage = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .safeParse(params.page ?? 1);
  const page = parsedPage.success ? parsedPage.data : 1;
  const pageSize = 50;
  const requested = z.uuid().safeParse(params.store);
  const selected =
    tenants.find(
      (t) => t.id === (requested.success ? requested.data : undefined),
    ) || tenants[0];
  if (!selected)
    return (
      <section className="section page-section stack">
        <span className="eyebrow">
          {platformAdmin === true
            ? "RIWAY · SUPER ADMIN"
            : "RIWAY · STORE OPERATIONS"}
        </span>
        <h1>Store management</h1>
        <p>
          Your RIWAY account ID: <code>{user.id}</code>
        </p>
        <p>
          {platformAdmin === true
            ? "Your administrator account is ready. Create your first store below."
            : "No stores are assigned to your account yet. Ask your RIWAY administrator to assign a store."}
        </p>
        {platformAdmin === true && <InventorySetupForm kind="tenant" />}
        {platformAdmin === true && <InventoryEmailStatus />}
        <Link href="/account/security">Account security</Link>
      </section>
    );
  const [locations, products, balances, ledger, members, catalogue] =
    await Promise.all([
      client
        .from("tenant_locations")
        .select("id,name,market")
        .eq("tenant_id", selected.id),
      client
        .from("tenant_products")
        .select("id,sku,product_id")
        .eq("tenant_id", selected.id),
      client.from("tenant_stock").select("*").eq("tenant_id", selected.id),
      client
        .from("tenant_stock_ledger")
        .select(
          "id,operation,quantity,reason,created_at,actor_id,location_id,tenant_product_id",
        )
        .eq("tenant_id", selected.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize),
      client
        .from("tenant_memberships")
        .select("user_id,role")
        .eq("tenant_id", selected.id),
      client.from("products").select("id,name").eq("status", "published"),
    ]);
  if (
    [locations, products, balances, ledger, members, catalogue].some(
      (r) => r.error,
    )
  )
    throw new Error("Store inventory is unavailable.");
  const owner =
    platformAdmin === true ||
    members.data?.some((m) => m.user_id === user.id && m.role === "owner");
  const canWrite =
    owner ||
    members.data?.some((m) => m.user_id === user.id && m.role === "inventory");
  const productOptions = (products.data || []).map((p) => ({
    id: p.id,
    name: `${p.sku} · ${catalogue.data?.find((c) => c.id === p.product_id)?.name || "Product"}`,
  }));
  const stock = balances.data || [];
  const availableUnits = stock.reduce(
    (total, b) => total + b.on_hand - b.reserved - b.allocated - b.damaged,
    0,
  );
  const lowStock = stock.filter(
    (b) =>
      b.on_hand - b.reserved - b.allocated - b.damaged <= b.low_stock_threshold,
  ).length;
  return (
    <section className="section page-section stack">
      <span className="eyebrow">
        {platformAdmin === true
          ? "RIWAY · SUPER ADMIN"
          : "RIWAY · STORE OPERATIONS"}
      </span>
      <h1>{selected.name}</h1>
      {platformAdmin === true && <InventoryEmailStatus />}
      <nav className="tab-links" aria-label="Stores">
        {tenants.map((t) => (
          <Link
            key={t.id}
            href={`/operations?store=${t.id}`}
            aria-current={selected.id === t.id ? "page" : undefined}
          >
            {t.name}
          </Link>
        ))}
      </nav>
      <p className="small">
        Your RIWAY account ID: <code>{user.id}</code>
      </p>
      <h2>Inventory</h2>
      <div className="stats">
        <div className="stat">
          <span>Available units</span>
          <strong>{availableUnits}</strong>
        </div>
        <div className="stat">
          <span>Low-stock SKU/location balances</span>
          <strong>{lowStock}</strong>
        </div>
        <div className="stat">
          <span>Store SKUs</span>
          <strong>{products.data?.length || 0}</strong>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Location</th>
              <th>SKU</th>
              <th>On hand</th>
              <th>Reserved</th>
              <th>Allocated</th>
              <th>Damaged</th>
              <th>Available</th>
              <th>Status</th>
              <th>Alert threshold</th>
            </tr>
          </thead>
          <tbody>
            {balances.data?.map((b) => {
              const available =
                b.on_hand - b.reserved - b.allocated - b.damaged;
              return (
                <tr key={`${b.location_id}/${b.tenant_product_id}`}>
                  <td>
                    {locations.data?.find((l) => l.id === b.location_id)?.name}
                  </td>
                  <td>
                    {
                      products.data?.find((p) => p.id === b.tenant_product_id)
                        ?.sku
                    }
                  </td>
                  <td>{b.on_hand}</td>
                  <td>{b.reserved}</td>
                  <td>{b.allocated}</td>
                  <td>{b.damaged}</td>
                  <td>{available}</td>
                  <td>
                    {available <= b.low_stock_threshold
                      ? "Low stock"
                      : "Available"}
                  </td>
                  <td>{b.low_stock_threshold}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!balances.data?.length && <p>No stock movements recorded yet.</p>}
      {canWrite && (!locations.data?.length || !products.data?.length) && (
        <p role="status">
          Add a location and store SKU before recording stock. Ask your store
          owner if you do not have setup access.
        </p>
      )}
      {canWrite && (
        <StockMovementForm
          key={selected.id}
          tenant={selected.id}
          locations={locations.data || []}
          products={productOptions}
        />
      )}
      {owner && (
        <div className="cards">
          <InventorySetupForm kind="location" tenant={selected.id} />
          <InventorySetupForm
            kind="product"
            tenant={selected.id}
            products={catalogue.data || []}
          />
          <InventorySetupForm kind="member" tenant={selected.id} />
        </div>
      )}
      {owner && (
        <>
          <StockThresholdForm
            key={selected.id}
            tenant={selected.id}
            locations={locations.data || []}
            products={productOptions}
            balances={stock}
          />
          <h2>Store members</h2>
          {members.data?.map((m) => (
            <p key={m.user_id}>
              {m.user_id} · {m.role}
            </p>
          ))}
          <InventorySetupForm kind="access" tenant={selected.id} />
        </>
      )}
      {platformAdmin === true && (
        <>
          <p>Store status: {selected.active ? "Active" : "Suspended"}</p>
          <InventorySetupForm kind="status" tenant={selected.id} />
          <InventorySetupForm kind="tenant" />
        </>
      )}
      <h2>Recent movements</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Movement</th>
              <th>Location</th>
              <th>SKU</th>
              <th>Recorded by</th>
              <th>Quantity</th>
              <th>Reason/reference</th>
            </tr>
          </thead>
          <tbody>
            {ledger.data?.slice(0, pageSize).map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toISOString()}</td>
                <td>{e.operation}</td>
                <td>
                  {locations.data?.find((l) => l.id === e.location_id)?.name ||
                    e.location_id}
                </td>
                <td>
                  {products.data?.find((p) => p.id === e.tenant_product_id)
                    ?.sku || e.tenant_product_id}
                </td>
                <td>
                  <code style={{ overflowWrap: "anywhere" }}>{e.actor_id}</code>
                </td>
                <td>{e.quantity}</td>
                <td>{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ledger.data?.length && <p>No movements on this page.</p>}
      <nav className="tab-links" aria-label="Movement history pages">
        {page > 1 && (
          <Link href={`/operations?store=${selected.id}&page=${page - 1}`}>
            Newer movements
          </Link>
        )}
        <span>Page {page}</span>
        {(ledger.data?.length || 0) > pageSize && (
          <Link href={`/operations?store=${selected.id}&page=${page + 1}`}>
            Older movements
          </Link>
        )}
      </nav>
    </section>
  );
}

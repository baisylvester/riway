"use client";
import { useActionState, useEffect, useState } from "react";
import { moveStock, setupInventory } from "@/app/operations/actions";
type Option = { id: string; name: string };
export function StockMovementForm({
  tenant,
  locations,
  products,
}: {
  tenant: string;
  locations: Option[];
  products: Option[];
}) {
  const [state, action, pending] = useActionState(moveStock, {
    message: "",
    ok: false,
  });
  const [key, setKey] = useState("");
  useEffect(() => {
    setKey(crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (state.ok) setKey(crypto.randomUUID());
  }, [state]);
  return (
    <form action={action} className="panel stack">
      <h2>Record stock movement</h2>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="key" value={key} />
      <label>
        Location
        <select name="location" required>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Store product
        <select name="product" required>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Movement
        <select name="operation">
          {[
            "receive",
            "adjust",
            "reserve",
            "release",
            "allocate",
            "fulfill",
            "damage",
            "restore",
          ].map((op) => (
            <option key={op}>{op}</option>
          ))}
        </select>
      </label>
      <label>
        Quantity
        <input
          name="quantity"
          type="number"
          step="1"
          min="-1000000"
          max="1000000"
          required
        />
      </label>
      <p className="small">
        Use a negative quantity only for an adjustment. Available stock excludes
        reservations, allocations and damaged items.
      </p>
      <label>
        Reason or reference
        <input name="reason" minLength={5} maxLength={500} required />
      </label>
      <button
        className="button"
        disabled={pending || !key || !locations.length || !products.length}
      >
        Record movement
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}

export function InventorySetupForm({
  kind,
  tenant,
  products = [],
}: {
  kind: "tenant" | "location" | "product" | "member" | "access" | "status";
  tenant?: string;
  products?: Option[];
}) {
  const [state, action, pending] = useActionState(setupInventory, {
    message: "",
    ok: false,
  });
  return (
    <form action={action} className="panel stack">
      <h2>
        {
          {
            tenant: "Create store",
            location: "Add location",
            product: "Add store SKU",
            member: "Add store member",
            access: "Change store access",
            status: "Store status",
          }[kind]
        }
      </h2>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="tenant" value={tenant || ""} />
      {(kind === "tenant" || kind === "location") && (
        <label>
          Name
          <input
            name="name"
            minLength={2}
            maxLength={kind === "tenant" ? 120 : 100}
            required
          />
        </label>
      )}
      {kind === "tenant" && (
        <label>
          Owner's RIWAY account ID
          <input name="owner" required />
        </label>
      )}
      {kind === "location" && (
        <label>
          Market
          <select name="market">
            <option>PH</option>
            <option>SG</option>
            <option>MY</option>
          </select>
        </label>
      )}
      {kind === "product" && (
        <>
          <label>
            Product
            <select name="product_id">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <input
              name="sku"
              pattern="[A-Za-z0-9._-]{1,64}"
              maxLength={64}
              required
            />
          </label>
        </>
      )}
      {(kind === "member" || kind === "access") && (
        <>
          <label>
            RIWAY account ID
            <input name="user_id" required />
          </label>
          <label>
            Role
            <select name="role">
              <option>viewer</option>
              <option>inventory</option>
              <option>owner</option>
              {kind === "access" && <option>revoke</option>}
            </select>
          </label>
        </>
      )}
      {kind === "status" && (
        <label>
          Status
          <select name="active">
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>
        </label>
      )}
      <button className="button" disabled={pending}>
        Save
      </button>
      <p role="status">{state.message}</p>
    </form>
  );
}

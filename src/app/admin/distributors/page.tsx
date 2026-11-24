import { z } from "zod";
import { session } from "@/lib/data";
import { StaffActionForm } from "@/components/staff-action-form";
import {
  saveDistributorMaterial,
  saveDistributorPhoto,
  saveProductCycle,
} from "./actions";

export const metadata = { title: "Distributor tools" };

const materialsSchema = z.array(
  z.object({
    id: z.uuid(),
    market: z.enum(["PH", "SG", "MY"]).nullable(),
    title: z.string(),
    description: z.string(),
    url: z.string(),
    approvalReference: z.string(),
    published: z.boolean(),
    updatedAt: z.string(),
  }),
);

export default async function DistributorTools() {
  const { client } = await session();
  const [products, materialsResult] = await Promise.all([
    client
      .from("products")
      .select("id,name,replenishment_days,replenishment_reference")
      .neq("status", "archived")
      .order("name"),
    client.rpc("staff_distributor_materials"),
  ]);
  const materials = materialsSchema.safeParse(materialsResult.data);
  return (
    <>
      <h1>Distributor tools</h1>
      <p className="muted">
        Approved settings behind the distributor dashboard and personal store
        pages. Every change needs a RIWAY approval reference and is recorded in
        the audit trail.
      </p>

      <section className="panel stack">
        <h2>Product reorder cycles</h2>
        <p className="muted">
          Days one unit is expected to last. Distributors see expected reorder
          dates only for products with an approved cycle. Admin or compliance
          role required.
        </p>
        {products.error ? (
          <p className="notice">Products are unavailable.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Approved cycle</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {(products.data ?? []).map(
                (p: {
                  id: string;
                  name: string;
                  replenishment_days: number | null;
                  replenishment_reference: string | null;
                }) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {p.replenishment_days
                        ? `${p.replenishment_days} days (${p.replenishment_reference})`
                        : "—"}
                    </td>
                    <td>
                      <StaffActionForm action={saveProductCycle} submit="Save">
                        <input type="hidden" name="productId" value={p.id} />
                        <label>
                          Days
                          <input
                            name="days"
                            type="number"
                            min={7}
                            max={365}
                            defaultValue={p.replenishment_days ?? ""}
                          />
                        </label>
                        <label>
                          Approval reference
                          <input
                            name="reference"
                            maxLength={120}
                            defaultValue={p.replenishment_reference ?? ""}
                          />
                        </label>
                      </StaffActionForm>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h2>Store photo</h2>
        <p className="muted">
          Publish a RIWAY-approved photo on a distributor&apos;s personal store
          page. Use an image already in this site&apos;s /images folder or on
          RIWAY&apos;s official image host. Leave the location blank to remove
          it. Admin or compliance role in the distributor&apos;s market
          required.
        </p>
        <StaffActionForm action={saveDistributorPhoto} submit="Save photo">
          <label>
            Distributor code
            <input name="code" required pattern="[A-Za-z0-9-]{3,40}" />
          </label>
          <label>
            Image location
            <input name="url" maxLength={500} placeholder="/images/…" />
          </label>
          <label>
            Approval reference
            <input name="reference" maxLength={120} />
          </label>
        </StaffActionForm>
      </section>

      <section className="panel stack">
        <h2>Marketing materials</h2>
        <p className="muted">
          Approved materials shown to verified distributors in the selected
          market (or all markets).
        </p>
        <StaffActionForm action={saveDistributorMaterial} submit="Add material">
          <label>
            Market
            <select name="market" defaultValue="PH">
              <option value="PH">Philippines</option>
              <option value="SG">Singapore</option>
              <option value="MY">Malaysia</option>
              <option value="ALL">All markets</option>
            </select>
          </label>
          <label>
            Title
            <input name="title" required minLength={3} maxLength={120} />
          </label>
          <label>
            Description
            <input name="description" maxLength={500} />
          </label>
          <label>
            Link
            <input name="url" required maxLength={500} />
          </label>
          <label>
            Approval reference
            <input name="reference" required minLength={3} maxLength={120} />
          </label>
          <label className="checkbox">
            <input type="checkbox" name="published" defaultChecked />
            <span>Published</span>
          </label>
        </StaffActionForm>
        {materials.success && materials.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Market</th>
                <th>Reference</th>
                <th>Published</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {materials.data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <a href={m.url} rel="noopener noreferrer">
                      {m.title}
                    </a>
                  </td>
                  <td>{m.market ?? "All"}</td>
                  <td>{m.approvalReference}</td>
                  <td>{m.published ? "Yes" : "No"}</td>
                  <td>{m.updatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

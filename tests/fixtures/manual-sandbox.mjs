import { randomInt, randomUUID } from "node:crypto";

const path = "/fixture/manual";
const products = {
  standard: "84000000-0000-4000-8000-000000000001",
  membership: "84000000-0000-4000-8000-000000000005",
};
const address = {
  full_name: "Synthetic buyer",
  phone: "0000000000",
  line1: "Disposable sandbox address",
  city: "Manila",
  postal_code: "1000",
  country: "PH",
};

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

function syntheticSession(user, name, aal) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: user,
    role: "authenticated",
    aud: "authenticated",
    aal,
    iat: now,
    exp: now + 3600,
  };
  const encode = (data) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const access = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.synthetic-fixture-signature`;
  return {
    access_token: access,
    refresh_token: "synthetic-refresh",
    expires_at: claims.exp,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: user,
      email: `${name}@example.invalid`,
      aud: "authenticated",
      role: "authenticated",
      created_at: "2026-11-25T00:00:00Z",
      email_confirmed_at: "2026-11-25T00:00:00Z",
      app_metadata: { provider: "email" },
      user_metadata: {},
    },
  };
}

function activeIdentity(req, identities, cookie) {
  try {
    const value = req.headers.cookie
      ?.split(/;\s*/)
      .find((part) => part.startsWith(cookie + "=base64-"));
    const session = JSON.parse(
      Buffer.from(
        value?.slice(cookie.length + 8) ?? "",
        "base64url",
      ).toString(),
    );
    const claims = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64url").toString(),
    );
    if (claims.exp <= Date.now() / 1000) return null;
    return (
      Object.values(identities).find(
        ({ id, aal }) => id === claims.sub && aal === claims.aal,
      ) ?? null
    );
  } catch {
    return null;
  }
}

export async function createManualSandbox(pg, users, onlineOrigin) {
  const app = onlineOrigin || "http://127.0.0.1:4174";
  const fixture = onlineOrigin || "http://127.0.0.1:4682";
  const cookie = `sb-${new URL(fixture).hostname.split(".")[0]}-auth-token`;
  const secure = onlineOrigin ? "; Secure" : "";
  const links = (entries) =>
    entries
      .map(([label, route]) => `<a href="${app}${route}">${label}</a>`)
      .join(" ");
  const guest = {
    id: users.guest,
    name: "guest",
    label: "Verified guest",
    aal: "aal1",
  };
  let guestCode;
  const identities = {
    buyer: {
      id: users.manualBuyer,
      name: "manualBuyer",
      label: "First-time buyer",
      aal: "aal1",
      page: "/d/QAFIXTURE",
    },
    customer: {
      id: users.customer,
      name: "customer",
      label: "Existing customer",
      aal: "aal1",
      page: "/account",
    },
    distributor: {
      id: users.distributor,
      name: "distributor",
      label: "Verified distributor",
      aal: "aal1",
      page: "/distributor",
    },
    editor: {
      id: users.editor,
      name: "editor",
      label: "Content editor",
      aal: "aal2",
      page: "/admin/library",
    },
    reviewer: {
      id: users.reviewer,
      name: "reviewer",
      label: "PH reviewer with MFA",
      aal: "aal2",
      page: "/admin",
    },
    reviewerBasic: {
      id: users.reviewer,
      name: "reviewer",
      label: "PH reviewer without MFA",
      aal: "aal1",
      page: "/admin",
    },
    otherMarket: {
      id: users.manualSgStaff,
      name: "manualSgStaff",
      label: "SG staff with MFA",
      aal: "aal2",
      page: "/admin",
    },
  };
  const {
    rows: [setup],
  } = await pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: users.reviewer,
        role: "authenticated",
        aal: "aal2",
      }),
    ]);
    return tx.query(
      `select public.save_service_centre(null,0,'PH',$1::jsonb,true,'SYNTHETIC-MANUAL') as centre,
      public.approve_refund_policy('PH','synthetic-manual','Synthetic manual sandbox return policy for test purposes only.',true,'SYNTHETIC-MANUAL') as policy`,
      [
        JSON.stringify({
          name: "Synthetic Manila collection centre",
          line1: address.line1,
          city: address.city,
          postalCode: address.postal_code,
          instructions: "Synthetic instructions: show the order reference.",
          noFeeApproved: true,
        }),
      ],
    );
  });
  const buyerIds = [users.manualBuyer, users.customer, users.guest];

  async function makeRenewalDue(form, identity) {
    const id = form.get("schedule");
    if (
      !identity ||
      !buyerIds.includes(identity.id) ||
      !/^[a-f0-9-]{36}$/.test(id ?? "")
    )
      throw new Error("Choose one of your active sandbox schedules.");
    const result = await pg.query(
      "update private.replenishment_schedules set next_due_at=clock_timestamp(),revision=revision+1 where id=$1 and user_id=$2 and state='active' returning id",
      [id, identity.id],
    );
    if (!result.rows.length)
      throw new Error("Active sandbox schedule unavailable.");
    return "The sandbox renewal is due. Review it from Replenishment.";
  }

  async function guestAuth(req, res, pathname) {
    if (req.headers.origin !== app) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", app);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "apikey, authorization, content-type, x-client-info, x-supabase-api-version",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    if (pathname === "/auth/v1/logout") {
      res.writeHead(204).end();
      return;
    }
    let raw = "";
    for await (const chunk of req) {
      raw += chunk.toString();
      if (Buffer.byteLength(raw) > 4096) {
        res.writeHead(413).end();
        return;
      }
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res
        .writeHead(400)
        .end(JSON.stringify({ message: "Invalid fixture request" }));
      return;
    }
    if (body?.email !== "guest@example.invalid") {
      res.writeHead(400).end(
        JSON.stringify({
          message: "Use guest@example.invalid in this sandbox.",
        }),
      );
      return;
    }
    if (pathname === "/auth/v1/otp") {
      if (guestCode && guestCode.expires > Date.now() + 290_000) {
        res.writeHead(429).end(
          JSON.stringify({
            message: "Wait ten seconds before requesting another sandbox code.",
          }),
        );
        return;
      }
      guestCode = {
        code: String(randomInt(0, 1_000_000)).padStart(6, "0"),
        expires: Date.now() + 300_000,
        attempts: 0,
      };
      res.end("{}");
      return;
    }
    if (guestCode && guestCode.expires > Date.now() && guestCode.attempts < 5) {
      guestCode.attempts++;
      if (body.type === "email" && body.token === guestCode.code) {
        guestCode = undefined;
        res.end(
          JSON.stringify(syntheticSession(guest.id, guest.name, guest.aal)),
        );
        return;
      }
    }
    res
      .writeHead(400)
      .end(JSON.stringify({ message: "Invalid or expired sandbox code" }));
  }

  async function createOrder(form, identity) {
    const product = form.get("product");
    const productId = Object.hasOwn(products, product)
      ? products[product]
      : null;
    const requestKey = form.get("requestKey");
    const quantity = Number(form.get("quantity"));
    const mode = form.get("fulfilment");
    if (
      !productId ||
      !/^[0-9a-f-]{36}$/.test(requestKey ?? "") ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 5 ||
      !["delivery", "collection"].includes(mode)
    )
      throw new Error(
        "Choose an available product, fulfilment method and quantity between 1 and 5.",
      );
    if (!identity || !buyerIds.includes(identity.id))
      throw new Error("Switch to a buyer identity before creating an order.");
    if (form.get("terms") !== "on")
      throw new Error("Accept the synthetic Terms of Sale.");
    const items = JSON.stringify([{ productId, quantity }]);
    const selection = JSON.stringify(
      mode === "collection"
        ? { method: mode, centreId: setup.centre }
        : { method: mode },
    );
    const code = form.get("voucher")?.trim().slice(0, 40) || null;
    const {
      rows: [{ checkout_terms_version: terms }],
    } = await pg.query(
      "select checkout_terms_version from public.markets where code='PH'",
    );
    return pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: identity.id,
          role: "authenticated",
          aal: "aal1",
        }),
      ]);
      await tx.exec("set local role authenticated");
      const {
        rows: [{ quote }],
      } = await tx.query(
        "select public.quote_fulfilment_checkout('PH',$1::jsonb,$2,$3::jsonb) as quote",
        [items, code, selection],
      );
      const membership = quote.membership;
      const consent =
        membership && form.get("membershipConsent") === "on"
          ? JSON.stringify({
              ruleId: membership.ruleId,
              termsVersion: membership.termsVersion,
              codeVersion: membership.codeVersion,
              accepted: true,
            })
          : null;
      const {
        rows: [{ id }],
      } = await tx.query(
        "select public.create_fulfilment_order('PH',$1::jsonb,$2::jsonb,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as id",
        [
          items,
          JSON.stringify(address),
          requestKey,
          terms,
          code,
          quote.quoteHash,
          consent,
          selection,
        ],
      );
      return `Created pending order ${id}. Open the order, cancel it as the buyer, or simulate settlement below.`;
    });
  }

  async function payment(form, action) {
    const id = form.get("order");
    if (!/^[a-f0-9-]{36}$/.test(id ?? ""))
      throw new Error("Select a fixture order.");
    return pg.transaction(async (tx) => {
      const {
        rows: [order],
      } = await tx.query(
        "select user_id from public.orders where id=$1 and user_id=any($2::uuid[])",
        [id, buyerIds],
      );
      if (!order) throw new Error("Order is unavailable in this sandbox.");
      const {
        rows: [{ attempt }],
      } = await tx.query(
        "select public.prepare_stripe_checkout($1,$2,false,'https://example.invalid') as attempt",
        [id, order.user_id],
      );
      const expired = action === "expire";
      const key = id.replaceAll("-", "");
      const {
        rows: [{ result }],
      } = await tx.query(
        "select public.apply_stripe_checkout_event($1,$2,$3,$4,false,$5,$6,$7,$8,$9) as result",
        [
          `evt_manual_${action}_${key}`,
          attempt.id,
          id,
          attempt.sessionId ?? `cs_test_manual_${key}`,
          attempt.amount,
          attempt.currency,
          expired ? "expired" : "complete",
          expired ? "unpaid" : "paid",
          expired ? null : `pi_manual${key}`,
        ],
      );
      return `Simulated payment outcome for ${id}: ${result}.`;
    });
  }

  async function compensation(action) {
    return pg.transaction(async (tx) => {
      const {
        rows: [{ claimed }],
      } = await tx.query(
        "select public.claim_compensation_events(1) as claimed",
      );
      const event = claimed[0];
      if (!event)
        return "No eligible compensation event. Check the membership and reversal holds.";
      const {
        rows: [{ accepted }],
      } = await tx.query(
        "select public.finish_compensation_event($1,$2,$3,$4,$5) as accepted",
        [
          event.id,
          event.lease,
          action,
          action === "acknowledged" ? `synthetic-ack-${event.id}` : null,
          action === "retry" ? "synthetic_timeout" : "synthetic_rejection",
        ],
      );
      if (!accepted)
        throw new Error("The compensation lease could not be completed.");
      return `Simulated ${action} for ${event.eventType} ${event.id}. Check the outbox and staff dashboard.`;
    });
  }

  async function refund(phase) {
    return pg.transaction(async (tx) => {
      const {
        rows: [{ jobs }],
      } = await tx.query(
        "select public.claim_order_refunds('stripe',false,1) as jobs",
      );
      const job = jobs[0];
      if (!job)
        return "No eligible refund. First request one as a buyer, then approve it as PH staff.";
      const {
        rows: [{ result }],
      } = await tx.query(
        "select public.apply_order_refund($1,$2,$3,$4,$5,$6) as result",
        [
          job.id,
          job.providerRefundId ?? `re_synthetic_${job.id.replaceAll("-", "")}`,
          job.paymentId,
          job.amountMinor,
          job.currency,
          phase,
        ],
      );
      return `Simulated refund ${job.id}: ${result}.`;
    });
  }

  async function render(res, identity, message) {
    const { rows: schedules } = await pg.query(
      "select s.id,p.name from private.replenishment_schedules s join public.products p on p.id=s.product_id where s.user_id=$1 and s.state='active' order by p.name",
      [identity?.id ?? null],
    );
    const { rows: orders } = await pg.query(
      `select id, user_id, status, payment_status, total_minor, currency, refunded_minor
      from public.orders where user_id=any($1::uuid[]) order by created_at desc limit 15`,
      [buyerIds],
    );
    const { rows: outbox } = await pg.query(
      `select order_id, event_type, status, attempts, last_error_code, ack_reference
      from private.compensation_volume_events order by created_at desc limit 15`,
    );
    const { rows: mail } = await pg.query(
      `select kind, status, count(*) as total from private.notification_jobs group by kind,status order by kind,status`,
    );
    const table = (
      headings,
      rows,
    ) => `<table><thead><tr>${headings.map((heading) => `<th scope="col">${heading}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map(
          (row) =>
            `<tr>${Object.values(row)
              .map((value) => `<td>${escape(value)}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
    const form = (controls) =>
      `<form method="post" action="${path}">${controls}</form>`;
    const button = (action, label) =>
      `<button name="action" value="${action}">${label}</button>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${app}; frame-ancestors 'none'; base-uri 'none'`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
      <title>RIWAY manual sandbox</title><style>
      body{font:1rem/1.55 system-ui,sans-serif;max-width:72rem;margin:2rem auto;padding:0 1.25rem;color:#18251f;background:#f7faf8}
      main{display:grid;gap:1rem}section{background:white;border:1px solid #cbd8d1;border-radius:.6rem;padding:1rem 1.25rem;overflow-x:auto}
      h1,h2,p{margin:.35rem 0 .7rem}button,select,input{font:inherit;margin:.2rem;padding:.35rem .5rem}
      button{color:white;background:#1d533c;border:0;border-radius:.3rem;cursor:pointer}a{color:#124b35;text-underline-offset:.2em;margin-right:.75rem}
      table{border-collapse:collapse;text-align:left}th,td{padding:.35rem .6rem;border-bottom:1px solid #dce5df}
      .status{background:#e3f2e7;padding:.75rem;overflow-wrap:anywhere}label{display:inline-block;margin-right:.5rem}
      </style><main><header><h1>RIWAY manual sandbox</h1><p>Disposable local data and synthetic identities. Provider outcome controls call the app’s database routines without sending money, mail, or data to a vendor.</p>
      <p><strong>Signed in as</strong> ${escape(identity?.label ?? "Signed out")}</p>${message ? `<p class="status" role="status">${escape(message)}</p>` : ""}</header>
      <section><h2>Switch identity</h2>${form(
        Object.entries(identities)
          .map(([k, v]) => button(`sign-in:${k}`, v.label))
          .join("") + button("sign-out", "Sign out"),
      )}
      <p>Use a private window for a second identity. To keep this console nearby, bookmark this address before signing in.</p>
      <p>${links([
        ["Home", "/"],
        ["Shop", "/shop"],
        ["Checkout review", "/checkout"],
        ["Account", "/account"],
        ["Membership", "/account/membership"],
        ["Orders", "/account/orders"],
        ["Staff", "/admin"],
      ])}</p></section>
      <section><h2>Guest verification inbox</h2><p>Sign out, then request a code at <a href="${app}/checkout">checkout</a> with <code>guest@example.invalid</code>. Return here in another tab to read the code. It expires in five minutes.</p>
      <p id="guest-code">${guestCode && guestCode.expires > Date.now() && guestCode.attempts < 5 ? `Code: <strong>${guestCode.code}</strong>` : "No active code."}</p></section>
      <section><h2>Place a synthetic order</h2><p>First link the first-time buyer at <a href="${app}/d/QAFIXTURE">QAFIXTURE</a>. The app's checkout page can review the quote. Use this form to create the order without opening a gateway.</p>
      ${form(`<input type="hidden" name="requestKey" value="${randomUUID()}">
      <label>Product <select name="product"><option value="membership">Synthetic membership package</option><option value="standard">Synthetic qualifying goods</option></select></label>
      <label>Quantity <input type="number" name="quantity" min="1" max="5" value="1" required></label>
      <label>Fulfilment <select name="fulfilment"><option value="delivery">Delivery</option><option value="collection">Synthetic Manila centre</option></select></label>
      <label>Voucher <input name="voucher" maxlength="40"></label><br>
      <label><input type="checkbox" name="terms">Accept synthetic Terms of Sale</label>
      <label><input type="checkbox" name="membershipConsent">Accept synthetic membership terms and Code of Conduct</label><br>
      ${button("create", "Create pending order")}`)}
      ${table(["Order", "Buyer", "Status", "Payment", "Total minor", "Currency", "Refunded minor"], orders)}</section>
      <section><h2>Payment outcome</h2>
      ${form(`<label>Order <select name="order">${orders.map((o) => `<option value="${o.id}">${o.id.slice(0, 8)} · ${escape(o.payment_status)} · ${escape(o.status)}</option>`).join("")}</select></label>
      ${button("pay", "Simulate payment")} ${button("expire", "Simulate expiry")}`)}
      <p>Repeat a payment event for the same order to check duplicate handling.</p></section>
      <section><h2>Replenishment</h2><p>${links([
        ["Your schedules", "/account/replenishment"],
        ["Staff schedule rules", "/admin/replenishment"],
      ])}</p>
      ${
        schedules.length
          ? form(`<label>Active schedule <select name="schedule">${schedules.map((s) => `<option value="${s.id}">${escape(s.name)}</option>`).join("")}</select></label>
      ${button("renewal-due", "Make next renewal due")}`)
          : "<p>Start a schedule from an eligible paid delivery order first.</p>"
      }</section>
      <section><h2>Provider outcomes</h2><p>${links([
        ["Membership review", "/admin/memberships"],
        ["Compensation", "/admin/compensation"],
        ["Returns", "/admin/returns"],
        ["Sales reports", "/admin/reports"],
      ])}</p>
      <p>Each control processes the next eligible event. A reversal waits for the original volume acknowledgement.</p>
      ${form(button("comp:acknowledged", "Acknowledge compensation") + button("comp:retry", "Simulate compensation timeout") + button("comp:rejected", "Reject compensation"))}
      ${table(["Order", "Event", "Status", "Attempts", "Error", "Acknowledgement"], outbox)}
      ${form(button("refund:succeeded", "Settle approved refund") + button("refund:failed", "Fail approved refund"))}</section>
      <section><h2>Notification queue</h2><p>Check that the application queues a notice once. Delivery is disabled.</p>
      ${table(["Kind", "Status", "Count"], mail)}</section>
      <section><h2>More workflows</h2><p>${links([
        ["Distributor", "/distributor"],
        ["Library", "/distributor/library"],
        ["Events", "/events"],
        ["Consultations", "/account/consultations"],
        ["Preferences", "/account/preferences"],
        ["Privacy", "/account/privacy"],
        ["Assistant", "/account/assistant"],
      ])}
      <a href="/fixture/assistant-voice">Voice consent component</a></p></section></main></html>`);
  }

  return async (req, res, url) => {
    if (
      ["/auth/v1/otp", "/auth/v1/verify", "/auth/v1/logout"].includes(
        url.pathname,
      )
    ) {
      await guestAuth(req, res, url.pathname);
      return true;
    }
    if (url.pathname !== path) return false;
    const identity = activeIdentity(req, { ...identities, guest }, cookie);
    if (req.method === "GET") {
      await render(
        res,
        identity,
        url.searchParams.get("result")?.slice(0, 800),
      );
      return true;
    }
    if (
      req.method !== "POST" ||
      req.headers.origin !== fixture ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      req.headers["content-type"] !== "application/x-www-form-urlencoded"
    ) {
      res.writeHead(403).end("Use the loopback sandbox form.");
      return true;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 4096) {
        res.writeHead(413).end("Fixture form is too large.");
        return true;
      }
    }
    const form = new URLSearchParams(body);
    const action = form.get("action") ?? "";
    const [kind, option] = action.split(":");
    if (kind === "sign-in" && Object.hasOwn(identities, option)) {
      const { id, name, aal, page } = identities[option];
      const encoded = Buffer.from(
        JSON.stringify(syntheticSession(id, name, aal)),
      ).toString("base64url");
      res.setHeader(
        "Set-Cookie",
        `${cookie}=base64-${encoded}; Path=/; SameSite=Lax; Max-Age=3600${secure}`,
      );
      res.writeHead(303, { Location: app + page }).end();
      return true;
    }
    if (action === "sign-out") {
      res.setHeader(
        "Set-Cookie",
        `${cookie}=; Path=/; SameSite=Lax; Max-Age=0${secure}`,
      );
      res.writeHead(303, { Location: path }).end();
      return true;
    }
    let message;
    try {
      if (action === "create") message = await createOrder(form, identity);
      else if (action === "renewal-due")
        message = await makeRenewalDue(form, identity);
      else if (action === "pay" || action === "expire")
        message = await payment(form, action);
      else if (
        kind === "comp" &&
        ["acknowledged", "retry", "rejected"].includes(option)
      )
        message = await compensation(option);
      else if (kind === "refund" && ["succeeded", "failed"].includes(option))
        message = await refund(option);
      else throw new Error("Choose a sandbox action.");
    } catch (error) {
      message = error.message;
    }
    res
      .writeHead(303, {
        Location: path + "?result=" + encodeURIComponent(message.slice(0, 800)),
      })
      .end();
    return true;
  };
}

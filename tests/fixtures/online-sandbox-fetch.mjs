// Loaded only by the online fixture's Next subprocess. The SDK keeps its
// public origin and cookie name, while SSR traffic stays inside the loopback.
const origin = process.env.RIWAY_SANDBOX_ORIGIN;
const base = origin + "/fixture-service/";
const fixturePort = Number(process.env.RIWAY_SANDBOX_FIXTURE_PORT ?? "4682");
const originalFetch = globalThis.fetch;
if (
  /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin ?? "") &&
  Number.isInteger(fixturePort) &&
  fixturePort >= 1024 &&
  fixturePort <= 65535
) {
  globalThis.fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith(base)) return originalFetch(input, init);
    const internal =
      `http://127.0.0.1:${fixturePort}/` + url.slice(base.length);
    return originalFetch(
      input instanceof Request ? new Request(internal, input) : internal,
      init,
    );
  };
}

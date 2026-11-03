// RIWAY's public Pages address forwards only to its own application Worker.
// The service binding is configured on the RIWAY Pages project, not via a public upstream URL.
export default {
  async fetch(request, env) {
    if (!env.RIWAY_APP) {
      return new Response('RIWAY is temporarily unavailable.', { status: 503 });
    }
    return env.RIWAY_APP.fetch(request);
  },
};

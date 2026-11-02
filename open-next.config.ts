import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// All customer-facing pages are request-rendered; no shared customer cache or R2 is required.
export default defineCloudflareConfig();

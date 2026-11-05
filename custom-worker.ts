// @ts-ignore OpenNext generates this module during the Cloudflare build.
import handler from "./.open-next/worker.js";
import { runNotificationSchedule } from "./deployment/scheduled-notifications";
export default {
  ...handler,
  scheduled(
    _controller: unknown,
    env: Parameters<typeof runNotificationSchedule>[0],
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    ctx.waitUntil(runNotificationSchedule(env));
  },
};

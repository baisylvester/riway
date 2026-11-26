import { revalidatePath as invalidate } from "next/cache";
import { localizablePath } from "./locales";
// Existing mutations invalidate their original route plus the shared localized
// page entrypoint, including withdrawals and private account state changes.
export function revalidatePath(...args: Parameters<typeof invalidate>) {
  invalidate(...args);
  if (localizablePath(args[0])) invalidate("/[locale]/[[...segments]]", "page");
}

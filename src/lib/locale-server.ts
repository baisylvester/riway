import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { isLocale, type Locale } from "./locales";
export const currentLocale = cache(async (): Promise<Locale> => {
  try {
    const value = (await headers()).get("x-riway-locale");
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
});

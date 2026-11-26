"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  localeNames,
  localizedHref,
  localizablePath,
  splitLocalePath,
  type Locale,
} from "@/lib/locales";
import { useLocale, useUi } from "./locale-provider";
export function LanguagePicker() {
  const { locale, available } = useLocale(),
    t = useUi(),
    path = usePathname();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (available.length < 2 || !localizablePath(splitLocalePath(path).path))
    return null;
  return (
    <label className="language-picker">
      <span>{t("language")}</span>
      <select
        aria-label={t("language")}
        value={locale}
        disabled={!ready}
        onChange={(event) => {
          const next = event.target.value as Locale;
          if (!available.includes(next)) return;
          window.location.assign(
            localizedHref(
              path + window.location.search + window.location.hash,
              next,
            ),
          );
        }}
      >
        {available.map((value) => (
          <option key={value} value={value} lang={value}>
            {localeNames[value]}
          </option>
        ))}
      </select>
    </label>
  );
}

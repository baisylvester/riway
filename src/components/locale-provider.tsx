"use client";
import { createContext, useContext, type ReactNode } from "react";
import { type Locale } from "@/lib/locales";
import { ui, type UiKey } from "@/lib/ui-dictionaries";
const Context = createContext<{ locale: Locale; available: Locale[] }>({
  locale: "en",
  available: ["en"],
});
export function LocaleProvider({
  locale,
  available,
  children,
}: {
  locale: Locale;
  available: Locale[];
  children: ReactNode;
}) {
  return (
    <Context.Provider value={{ locale, available }}>
      {children}
    </Context.Provider>
  );
}
export function useLocale() {
  return useContext(Context);
}
export function useUi() {
  const { locale } = useLocale();
  return (key: UiKey, values?: Record<string, string | number>) =>
    ui(locale, key, values);
}
export function Ui({
  id,
  values,
}: {
  id: UiKey;
  values?: Record<string, string | number>;
}) {
  const t = useUi(),
    { locale } = useLocale();
  return <span lang={locale}>{t(id, values)}</span>;
}

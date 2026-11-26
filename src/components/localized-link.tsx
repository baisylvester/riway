"use client";
import NextLink from "next/link";
import type { ComponentProps, AnchorHTMLAttributes } from "react";
import { localizedHref, splitLocalePath } from "@/lib/locales";
import { useLocale } from "./locale-provider";
export default function Link({
  href,
  onClick,
  ...props
}: ComponentProps<typeof NextLink>) {
  const { locale } = useLocale();
  const target =
    typeof href === "string"
      ? localizedHref(href, locale)
      : href.pathname
        ? { ...href, pathname: localizedHref(href.pathname, locale) }
        : href;
  const path = typeof target === "string" ? target : (target.pathname ?? "");
  const languageBoundary =
    path.startsWith("/") && splitLocalePath(path).locale !== locale;
  return (
    <NextLink
      {...props}
      href={target}
      prefetch={languageBoundary ? false : props.prefetch}
      onClick={(event) => {
        onClick?.(event);
        // Root layouts persist during client navigation. Crossing a language boundary
        // reloads it so HTML lang, server content and the client dictionary agree.
        if (
          languageBoundary &&
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          (!event.currentTarget.target ||
            event.currentTarget.target === "_self") &&
          !event.currentTarget.hasAttribute("download")
        ) {
          event.preventDefault();
          window.location.assign(event.currentTarget.href);
        }
      }}
    />
  );
}
export function LocalizedAnchor({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { locale } = useLocale();
  return <a {...props} href={href ? localizedHref(href, locale) : href} />;
}

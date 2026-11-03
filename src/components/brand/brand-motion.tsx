"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Content is visible in server HTML; entry motion is progressive enhancement. */
export function BrandMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("rw-arrived");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12 },
    );
    root.current
      .querySelectorAll(
        ".rw-house, .rw-section-heading, .rw-manifesto > div, .rw-recognition > div, .rw-editorial-pair > div",
      )
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className="rw-brand">
      {children}
    </div>
  );
}

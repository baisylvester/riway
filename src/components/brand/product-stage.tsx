"use client";
import { useEffect, useRef, useState } from "react";

export type StageKind = "jar" | "purtier" | "conscientious";
export function ProductStage({
  kind,
  dark = false,
}: {
  kind: StageKind;
  dark?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false,
      started = false;
    let generation = 0;
    let destroy: (() => void) | undefined;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const start = async () => {
      if (started || disposed || motion.matches) return;
      started = true;
      const current = ++generation;
      try {
        const { mountStage } = await import("./stage-runtime.js");
        if (disposed || motion.matches || current !== generation) return;
        destroy = mountStage(
          el,
          kind,
          () => {
            if (!disposed) setReady(true);
          },
          () => {
            if (!disposed) {
              setReady(false);
              setFallback(true);
            }
          },
        );
      } catch {
        if (!disposed) {
          setReady(false);
          setFallback(true);
        }
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void start();
      },
      { rootMargin: "150px" },
    );
    observer.observe(el);
    const changed = () => {
      generation++;
      destroy?.();
      destroy = undefined;
      started = false;
      setReady(false);
      setFallback(false);
      if (!motion.matches) void start();
    };
    motion.addEventListener("change", changed);
    return () => {
      disposed = true;
      generation++;
      observer.disconnect();
      motion.removeEventListener("change", changed);
      destroy?.();
    };
  }, [kind]);
  const image =
    kind === "jar"
      ? "/design/purtier-7th.png"
      : kind === "purtier"
        ? "/design/purtier/jar-carton-dark.jpg"
        : "/design/conscientious/collection.jpg";
  return (
    <div
      ref={host}
      className={`rw-stage ${kind} ${dark ? "rw-stage-dark" : ""} ${ready ? "is-ready" : ""}`}
      data-rendering={ready ? "webgl" : fallback ? "fallback" : "static"}
    >
      {/* Static photography remains present until the first successful WebGL frame. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="rw-stage-fallback"
        src={image}
        alt={
          kind === "conscientious"
            ? "CONSCIENTIOUS collection with black and blush packaging"
            : "PURTIER PLACENTA seventh edition packaging"
        }
        loading={kind === "jar" ? "eager" : "lazy"}
      />
    </div>
  );
}

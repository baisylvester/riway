"use client";
import { useEffect, useRef, useState } from "react";

export type ReferenceStageKind =
  "jar" | "purtier" | "conscientious" | "him" | "her";
export type ReferenceStageProps = {
  kind: ReferenceStageKind;
  entrance?: "load" | "scroll";
  className?: string;
  debug?: boolean;
};
const images = {
  jar: "/design/purtier-7th.png",
  purtier: "/design/purtier/jar-carton-dark.jpg",
  conscientious: "/design/conscientious/collection.jpg",
  him: "/design/conscientious/him-her-sets.jpg",
  her: "/design/conscientious/her-spray-box.jpg",
};

/** Preserve the source .hero/.unbox > .stage and sibling .ucopy markup. */
export function ReferenceStage({
  kind,
  entrance,
  className = "",
  debug = false,
}: ReferenceStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("static");
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const layout = matchMedia("(max-width: 760px)");
    let dead = false,
      generation = 0;
    let destroy: (() => void) | undefined;
    const copy = element.closest("section")?.querySelector<HTMLElement>(".u0");
    const originalStyle = copy?.getAttribute("style");
    const restore = () => {
      if (!copy) return;
      if (originalStyle == null) copy.removeAttribute("style");
      else copy.setAttribute("style", originalStyle);
    };
    const fallback = () => {
      if (copy) {
        copy.style.opacity = "1";
        copy.style.visibility = "visible";
      }
    };
    const start = async () => {
      const current = ++generation;
      destroy?.();
      destroy = undefined;
      restore();
      setState("static");
      // The reference reduced-motion CSS presents .u3 as the static end state.
      // Leave copy selection to that CSS; showing .u0 here would overlap it.
      if (motion.matches) return;
      try {
        const [{ mountReferenceStage }] = await Promise.all([
          import("./reference-stage-runtime.js"),
          document.fonts?.ready,
        ]);
        if (dead || current !== generation) return;
        destroy = mountReferenceStage(element, kind, {
          entrance,
          debug,
          onReady: () => {
            if (!dead && current === generation) setState("webgl");
          },
          onError: () => {
            if (!dead && current === generation) {
              setState("fallback");
              fallback();
            }
          },
        });
      } catch {
        if (!dead && current === generation) {
          setState("fallback");
          fallback();
        }
      }
    };
    void start();
    motion.addEventListener("change", start);
    layout.addEventListener("change", start);
    return () => {
      dead = true;
      generation++;
      motion.removeEventListener("change", start);
      layout.removeEventListener("change", start);
      destroy?.();
      restore();
    };
  }, [kind, entrance, debug]);
  return (
    <div
      ref={host}
      className={`reference-stage-host reference-stage ${className}`}
      data-kind={kind}
      data-rendering={state}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[kind]}
        alt={
          kind === "jar" || kind === "purtier"
            ? "PURTIER Placenta seventh edition"
            : `CONSCIENTIOUS ${kind}`
        }
        loading={kind === "jar" ? "eager" : "lazy"}
        className="reference-stage-fallback"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          height: "60%",
          maxWidth: "90%",
          objectFit: "contain",
          transform: "translate(-50%, -50%)",
          opacity: state === "webgl" ? 0 : 1,
        }}
      />
      <canvas
        id={kind === "jar" ? "heroJar" : undefined}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          opacity: state === "webgl" ? 1 : 0,
        }}
      />
    </div>
  );
}
export default ReferenceStage;

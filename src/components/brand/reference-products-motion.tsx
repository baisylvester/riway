"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Object3D, PerspectiveCamera } from "three";
import { ReferenceStage } from "./reference-stage";

type JarHandle = {
  jar: { group: Object3D; rig: Object3D; setLift: (value: number) => void };
  camera: PerspectiveCamera;
  ready: Promise<unknown>;
};

// The edition copy is the complete EDITIONS array from purtier.html, expressed
// as text and an emphasis range so changing editions never injects HTML.
const editions = [
  {
    label: "I",
    small: "Edition",
    k: "Edition I — The beginning",
    before: "Where ",
    em: "optimal care",
    after: " began.",
    p: "The first formula, and the first promise: ingredients chosen for their effect, nothing else.",
  },
  {
    label: "II",
    small: "Edition",
    k: "Edition II",
    before: "Refined, ",
    em: "not replaced.",
    after: "",
    p: "Each edition keeps what works and improves what can be improved.",
  },
  {
    label: "III",
    small: "Edition",
    k: "Edition III",
    before: "A ",
    em: "union",
    after: " of ingredients.",
    p: "The formula as a whole, where every element supports another.",
  },
  {
    label: "IV",
    small: "Edition",
    k: "Edition IV",
    before: "Trusted ",
    em: "around the world.",
    after: "",
    p: "Users across Asia and Europe, with peace of mind as the measure.",
  },
  {
    label: "V",
    small: "Edition",
    k: "Edition V",
    before: "The ",
    em: "technology",
    after: " matures.",
    p: "Nutrients processed and preserved in their most optimal condition.",
  },
  {
    label: "VI",
    small: "Edition",
    k: "Edition VI",
    before: "Closer to ",
    em: "cutting edge.",
    after: "",
    p: "The edition that set the stage for the seventh.",
  },
  {
    label: "VII",
    small: "Now",
    k: "Edition VII — Now",
    before: "",
    em: "Revolutionary.",
    after: " Cutting edge.",
    p: "The seventh edition. Every ingredient carried forward, carefully re-selected.",
  },
];

export function ReferenceProductsWheel() {
  const section = useRef<HTMLElement>(null);
  const angle = useRef({ value: (-6 * 360) / 7 });
  const selected = useRef(6);
  const [active, setActive] = useState(6);
  const snapTween = useRef<gsap.core.Tween | null>(null);
  const reduced = useRef(false);

  function applyAngle() {
    const el = section.current;
    if (!el) return;
    const ring = el.querySelector<HTMLElement>("#ring");
    if (ring) ring.style.transform = `rotate(${angle.current.value}deg)`;
    let best = 0,
      distance = Infinity;
    el.querySelectorAll<HTMLElement>(".ring .item").forEach((item, i) => {
      item.style.transform = `translate(-50%,10px) rotate(${-(angle.current.value + (i * 360) / 7)}deg)`;
      const a =
        ((((angle.current.value + (i * 360) / 7) % 360) + 540) % 360) - 180;
      if (Math.abs(a) < distance) {
        distance = Math.abs(a);
        best = i;
      }
    });
    if (best !== selected.current) {
      selected.current = best;
      setActive(best);
      el.dispatchEvent(
        new CustomEvent("reference:edition", {
          bubbles: true,
          detail: { index: best },
        }),
      );
    }
  }

  function snapTo(index: number) {
    snapTween.current?.kill();
    const current = angle.current.value;
    const target =
      current + (((((-index * 360) / 7 - current) % 360) + 540) % 360) - 180;
    if (reduced.current) {
      angle.current.value = target;
      applyAngle();
      return;
    }
    snapTween.current = gsap.to(angle.current, {
      value: target,
      duration: 0.9,
      ease: "power3.out",
      onUpdate: applyAngle,
    });
  }

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    gsap.registerPlugin(ScrollTrigger);
    reduced.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    applyAngle();
    const controller = new AbortController();
    const { signal } = controller;
    let jarHandle: JarHandle | undefined;
    const stageReady = (event: Event) => {
      const handle = (event as CustomEvent<JarHandle>).detail;
      if (handle?.jar) jarHandle = handle;
    };
    el.addEventListener("reference-stage-ready", stageReady, { signal });
    el.addEventListener(
      "reference:edition",
      () => {
        if (!jarHandle || reduced.current) return;
        gsap.to(jarHandle.jar.group.rotation, {
          y: `+=${Math.PI * 0.5}`,
          duration: 1.2,
          ease: "power3.inOut",
          overwrite: "auto",
        });
        gsap.to(jarHandle.jar.rig.position, {
          y: -0.08,
          duration: 0.3,
          yoyo: true,
          repeat: 1,
          ease: "power2.inOut",
          overwrite: "auto",
        });
      },
      { signal },
    );
    let drag = false,
      lastX = 0,
      moved = 0;
    const pointerdown = (event: PointerEvent) => {
      if (
        matchMedia("(max-width: 760px)").matches ||
        event.button !== 0 ||
        (event.target as HTMLElement).closest("a,button")
      )
        return;
      event.preventDefault();
      drag = true;
      lastX = event.clientX;
      moved = 0;
      snapTween.current?.kill();
      el.setPointerCapture(event.pointerId);
    };
    const pointermove = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      moved += Math.abs(dx);
      angle.current.value += dx * 0.25;
      if (jarHandle) jarHandle.jar.group.rotation.y += dx * 0.004;
      applyAngle();
    };
    const pointerup = () => {
      if (drag) {
        drag = false;
        snapTo(selected.current);
      }
    };
    el.addEventListener("pointerdown", pointerdown, { signal });
    el.addEventListener("pointermove", pointermove, { signal, passive: true });
    el.addEventListener("pointerup", pointerup, { signal });
    el.addEventListener("pointercancel", pointerup, { signal });
    el.addEventListener(
      "click",
      (event) => {
        if (moved > 5) {
          event.preventDefault();
          event.stopPropagation();
          moved = 0;
        }
      },
      { signal, capture: true },
    );
    const ctx = gsap.context(() => {
      if (reduced.current) return;
      gsap.from(".wheel .tick", {
        opacity: 0,
        stagger: 0.06,
        duration: 1,
        scrollTrigger: { trigger: el, start: "top 70%", once: true },
      });
      gsap.from(".ghost", {
        opacity: 0,
        letterSpacing: ".3em",
        duration: 1.6,
        ease: "power4.out",
        scrollTrigger: { trigger: el, start: "top 70%", once: true },
      });
    }, el);
    return () => {
      controller.abort();
      snapTween.current?.kill();
      ctx.revert();
      if (jarHandle) {
        gsap.killTweensOf(jarHandle.jar.group.rotation);
        gsap.killTweensOf(jarHandle.jar.rig.position);
      }
    };
    // The handlers share stable mutable angle/selection refs within this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduced.current || !section.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".caption > *",
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: 0.6, stagger: 0.06, ease: "power3.out" },
      );
    }, section.current);
    return () => ctx.revert();
  }, [active]);

  const edition = editions[active];
  return (
    <section
      ref={section}
      className="hero wheel-sec hairline"
      id="wheelsec"
      data-cursor="Drag"
      aria-label="Explore the seven PURTIER editions"
    >
      <div className="ghost" aria-hidden="true">
        EDITIONS
      </div>
      <div className="top-k">
        <span>Seven editions</span>
        <span className="hide-mobile">Drag the wheel or tap an edition</span>
      </div>
      <ReferenceStage kind="jar" />
      <div className="wheel">
        <div className="ring" id="ring">
          {editions.map((item, index) => (
            <div
              className="tick"
              key={item.label}
              style={{ transform: `rotate(${(index * 360) / 7}deg)` }}
            >
              <button
                type="button"
                className={`item${active === index ? " is-active" : ""}`}
                data-i={index}
                style={{
                  transform: `translate(-50%,10px) rotate(${-(angle.current.value + (index * 360) / 7)}deg)`,
                }}
                onClick={() => snapTo(index)}
                aria-pressed={active === index}
                aria-label={`Edition ${item.label}`}
              >
                {item.label}
                <small>{item.small}</small>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="caption" aria-live="polite" aria-atomic="true">
        <div className="k" id="capK">
          {edition.k}
        </div>
        <h2 className="display h-m" id="capH">
          {edition.before}
          <em>{edition.em}</em>
          {edition.after}
        </h2>
        <p id="capP">{edition.p}</p>
      </div>
      <div className="hint hide-mobile">
        <b id="hintN">{String(active + 1).padStart(2, "0")}</b>Drag the wheel
        <br />
        or tap an edition
      </div>
      <div className="strip" id="strip" aria-label="Choose an edition">
        {editions.map((item, index) => (
          <button
            type="button"
            key={item.label}
            data-i={index}
            className={active === index ? "is-active" : ""}
            aria-pressed={active === index}
            aria-label={`Edition ${item.label}`}
            onClick={(event) => {
              snapTo(index);
              event.currentTarget.scrollIntoView({
                inline: "center",
                behavior: reduced.current ? "instant" : "smooth",
                block: "nearest",
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Page-specific motion only; ReferenceShell owns Lenis and common reveals. */
export function ReferenceProductsMotion({
  kind,
}: {
  kind: "purtier" | "conscientious";
}) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest<HTMLElement>(".reference-design");
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const abort = new AbortController();
    const { signal } = abort;
    const media = gsap.matchMedia();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      if (kind === "purtier") {
        const sec = root.querySelector<HTMLElement>("#cinema");
        if (sec) {
          if (reduced) {
            // Preserve every frame's copy as ordinary readable content.
            gsap.set(sec, { height: "auto" });
            gsap.set(sec.querySelector(".stage"), {
              height: "auto",
              position: "relative",
              padding: "100px var(--gutter)",
            });
            gsap.set(sec.querySelectorAll(".copy"), {
              opacity: 1,
              position: "relative",
              top: "auto",
              left: "auto",
              right: "auto",
              transform: "none",
              marginBottom: 60,
            });
          } else {
            gsap
              .timeline({
                scrollTrigger: {
                  trigger: sec,
                  start: "top top",
                  end: "bottom bottom",
                  scrub: 1.1,
                },
                defaults: { ease: "none" },
              })
              .fromTo(
                sec.querySelector(".c0"),
                { opacity: 0, scale: 0.94 },
                { opacity: 1, scale: 1, duration: 0.1 },
                0.02,
              )
              .to(
                sec.querySelector(".c0"),
                { opacity: 0, scale: 0.92, yPercent: -10, duration: 0.1 },
                0.2,
              )
              .to(sec.querySelector(".c1"), { opacity: 1, duration: 0.1 }, 0.3)
              .to(
                sec.querySelector(".c1"),
                { opacity: 0, duration: 0.08 },
                0.56,
              )
              .to(sec.querySelector(".c2"), { opacity: 1, duration: 0.1 }, 0.66)
              .to({}, { duration: 0.34 }, 0.66);
            let cinemaTimeline: gsap.core.Timeline | undefined;
            const attachCinema = (event: Event) => {
              const handle = (event as CustomEvent<JarHandle>).detail;
              if (!handle?.jar) return;
              void Promise.resolve(handle.ready).then(() => {
                if (signal.aborted) return;
                ctx.add(() => {
                  const { jar, camera } = handle;
                  const mobile = matchMedia("(max-width: 760px)").matches;
                  // ReferenceStage owns allocation and RAF; this page owns the
                  // exact site.js cinema choreography and camera framing.
                  camera.fov = 30;
                  camera.position.set(0, 0.25, 7.4);
                  camera.updateProjectionMatrix();
                  jar.group.position.set(0, 0, 0);
                  const lift = { value: 0 };
                  cinemaTimeline?.scrollTrigger?.kill();
                  cinemaTimeline?.kill();
                  cinemaTimeline = gsap.timeline({
                      scrollTrigger: {
                        trigger: sec,
                        start: "top top",
                        end: "bottom bottom",
                        scrub: 1.1,
                      },
                      defaults: { ease: "none" },
                    })
                    .fromTo(
                      jar.group.scale,
                      { x: 0.001, y: 0.001, z: 0.001 },
                      { x: 1, y: 1, z: 1, duration: 0.14, ease: "power2.out" },
                      0,
                    )
                    .to(
                      jar.group.rotation,
                      { y: Math.PI * 1.1, duration: 0.5 },
                      0.1,
                    )
                    .to(
                      jar.group.scale,
                      {
                        x: mobile ? 0.92 : 1.12,
                        y: mobile ? 0.92 : 1.12,
                        z: mobile ? 0.92 : 1.12,
                        duration: 0.3,
                      },
                      0.15,
                    )
                    .to(
                      jar.group.position,
                      mobile
                        ? { y: 0.75, duration: 0.25 }
                        : { y: 0, duration: 0.01 },
                      0.12,
                    )
                    .to(
                      lift,
                      {
                        value: 1,
                        duration: 0.22,
                        onUpdate: () => jar.setLift(lift.value),
                      },
                      0.28,
                    )
                    .to(
                      jar.group.position,
                      mobile
                        ? { y: 1, duration: 0.3 }
                        : { x: -1.55, duration: 0.3 },
                      0.55,
                    )
                    .to(
                      jar.group.rotation,
                      { y: Math.PI * 2.05, duration: 0.45 },
                      0.55,
                    )
                    .to(
                      lift,
                      {
                        value: 0.35,
                        duration: 0.25,
                        onUpdate: () => jar.setLift(lift.value),
                      },
                      0.62,
                    )
                    .to(camera.position, { z: 6.6, duration: 0.4 }, 0.6);
                });
              });
            };
            sec.addEventListener("reference-stage-ready", attachCinema, {
              signal,
            });
            const spot = sec.querySelector<HTMLElement>(".spot");
            if (spot && matchMedia("(hover: hover)").matches) {
              sec.addEventListener(
                "pointermove",
                (event) => {
                  gsap.to(spot, {
                    "--sx": `${(event.clientX / innerWidth) * 100}%`,
                    "--sy": `${(event.clientY / innerHeight) * 100}%`,
                    duration: 0.6,
                    ease: "power3",
                    overwrite: "auto",
                  });
                },
                { signal, passive: true },
              );
            }
          }
        }
        // Source uses a sticky .pin and grows the section by the track distance.
        media.add(
          "(min-width: 761px) and (prefers-reduced-motion: no-preference)",
          () => {
            const sec = root.querySelector<HTMLElement>("#editions");
            const track = sec?.querySelector<HTMLElement>(".track");
            if (!sec || !track) return;
            const previousHeight = sec.style.height;
            const distance = () => Math.max(0, track.scrollWidth - innerWidth);
            const setup = () => {
              sec.style.height = `${innerHeight + distance()}px`;
            };
            setup();
            ScrollTrigger.addEventListener("refreshInit", setup);
            gsap.to(track, {
              x: () => -distance(),
              ease: "none",
              scrollTrigger: {
                trigger: sec,
                start: "top top",
                end: () => `+=${distance()}`,
                scrub: 0.6,
                invalidateOnRefresh: true,
                onUpdate: (st) => {
                  const progress = sec.querySelector<HTMLElement>(".prog i");
                  if (progress) progress.style.width = `${st.progress * 100}%`;
                },
              },
            });
            return () => {
              ScrollTrigger.removeEventListener("refreshInit", setup);
              sec.style.height = previousHeight;
            };
          },
        );
      } else {
        const toggle = root.querySelector<HTMLElement>("#toggle");
        const split = root.querySelector<HTMLElement>("#split");
        const choose = (side: string, scroll = false) => {
          if (side !== "him" && side !== "her") return;
          root.classList.toggle("theme-him", side === "him");
          root.classList.toggle("theme-her", side === "her");
          root.classList.toggle("is-dark-nav", side === "him");
          root.dataset.darkNav = side === "him" ? "1" : "";
          toggle
            ?.querySelectorAll<HTMLButtonElement>("button")
            .forEach((button) => {
              const active = button.dataset.side === side;
              button.classList.toggle("is-active", active);
              button.setAttribute("aria-pressed", String(active));
            });
          if (scroll)
            root
              .querySelector(`#${side}`)
              ?.scrollIntoView({
                behavior: reduced ? "instant" : "smooth",
                block: "start",
              });
        };
        for (const side of ["him", "her"]) {
          const panel = root.querySelector<HTMLElement>(
            side === "him" ? "#sideHim" : "#sideHer",
          );
          panel?.addEventListener("click", () => choose(side, true), {
            signal,
          });
          panel?.addEventListener(
            "keydown",
            (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                choose(side, true);
              }
            },
            { signal },
          );
          toggle
            ?.querySelector(`[data-side="${side}"]`)
            ?.addEventListener("click", () => choose(side, true), { signal });
          const target = root.querySelector(`#${side}`);
          if (target)
            ScrollTrigger.create({
              trigger: target,
              start: "top 60%",
              end: "bottom 60%",
              onToggle: (st) => {
                if (st.isActive) choose(side);
              },
            });
        }
        if (split) {
          ScrollTrigger.create({
            trigger: split,
            start: "bottom 70%",
            onEnter: () => toggle?.classList.add("is-on"),
            onLeaveBack: () => {
              toggle?.classList.remove("is-on");
              root.classList.remove("theme-him", "theme-her", "is-dark-nav");
              root.dataset.darkNav = "";
            },
          });
          if (!reduced)
            gsap.from(split.querySelectorAll(".side .t > *"), {
              opacity: 0,
              y: 20,
              duration: 1,
              stagger: 0.08,
              ease: "power3.out",
              scrollTrigger: { trigger: split, start: "top 70%", once: true },
            });
        }
      }
    }, root);
    const refresh = () => ScrollTrigger.refresh();
    document.fonts.ready.then(() => {
      if (!signal.aborted) refresh();
    });
    return () => {
      abort.abort();
      media.revert();
      ctx.revert();
      if (kind === "conscientious") {
        root.classList.remove("theme-him", "theme-her", "is-dark-nav");
        delete root.dataset.darkNav;
      }
    };
  }, [kind]);
  return <span hidden ref={marker} data-reference-product={kind} />;
}

export function ReferenceProductsBottles() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = canvas.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        started = true;
        void import("./reference-products-bottles.js")
          .then(({ mountReferenceBottles }) => {
            if (disposed) return;
            destroy = mountReferenceBottles(
              el,
              () => {
                if (!disposed) setReady(true);
              },
              () => {
                if (!disposed) setReady(false);
              },
            );
          })
          .catch(() => {
            if (!disposed) setReady(false);
          });
      },
      { rootMargin: "150px" },
    );
    observer.observe(el);
    return () => {
      disposed = true;
      observer.disconnect();
      destroy?.();
    };
  }, []);
  return (
    <>
      {!ready && (
        <img
          src="/design/conscientious/him-her-sets.jpg"
          alt="CONSCIENTIOUS essence sprays for him and for her"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            zIndex: 1,
            pointerEvents: "none",
          }}
        />
      )}
      <canvas
        ref={canvas}
        id="bottles"
        aria-label="CONSCIENTIOUS essence sprays for him and for her, 3D"
      />
    </>
  );
}

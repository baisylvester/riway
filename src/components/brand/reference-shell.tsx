"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createReferenceBehaviors } from "./reference-behaviors";
import { ReferenceFooter } from "./reference-footer";
export function ReferenceShell({
  children,
  brand = "RIWAY",
}: {
  children: ReactNode;
  brand?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    let disposed = false;
    let cleanup = () => {};
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {}, el);
    void document.fonts.ready.then(() => {
      if (disposed) return;
      ctx.add(() => {
        const RW = createReferenceBehaviors(el);
        RW.initLenis();
        RW.cursor();
        RW.grain();
        RW.menu();
        RW.wipe();
        RW.magnetic(".magnetic");
        RW.darkNav();
        document.documentElement.classList.add("reference-cursor");
        const heroSizing = new ResizeObserver(() => {
          el.querySelectorAll<HTMLElement>(".hero").forEach((hero) => {
            const caption = hero.querySelector<HTMLElement>(".caption");
            const strip = hero.querySelector<HTMLElement>(".strip");
            hero.style.setProperty(
              "--hero-copy-height",
              `${(caption?.offsetHeight || 0) + (strip?.offsetHeight || 0) + 24}px`,
            );
          });
        });
        el.querySelectorAll(".hero .caption,.hero .strip").forEach((node) =>
          heroSizing.observe(node),
        );
        RW.scrubWords(".scrub");
        RW.counters();
        RW.splitReveal(".split, .split-t", {
          types: "lines,words",
          target: "words",
        });
        RW.clipReveal();
        RW.rise(".houses", { children: ".house", stagger: 0.1 });
        RW.rise(".goals .list", { children: ".goal", stagger: 0.06, y: 10 });
        RW.rise("#roll", { children: "div", stagger: 0.04, y: 6 });
        RW.rise(".gda .faces", { children: "img", stagger: 0.08 });
        RW.rise("#evrow", { children: ".ev", stagger: 0.1 });
        RW.rise(".claims", { children: ".claim", stagger: 0.08 });
        RW.rise(".glist", { children: ".gitem", stagger: 0.04 });
        RW.clipReveal(".gal figure");
        const track = el.querySelector("#rightway");
        if (track && !RW.reduced) RW.track(track);
        gsap.to(".manifesto .photo", {
          clipPath: "inset(0 0 0% 0)",
          duration: 1.4,
          ease: "power4.inOut",
          scrollTrigger: {
            trigger: ".manifesto",
            start: "top 60%",
            once: true,
          },
        });
        const goals = [
          {
            label: "Financial",
            h: "Freedom you can <em>measure.</em>",
            p: "A platform to achieve financial freedom and master the abilities to meet market demands.",
          },
          {
            label: "Health",
            h: "A body that <em>carries</em> the dream.",
            p: "A healthy body, for a better quality of life and the ability to realise our dream.",
          },
          {
            label: "Social",
            h: "A circle that <em>lifts</em> everyone.",
            p: "Expand the social circle, and exert a positive influence on everyone in it.",
          },
          {
            label: "Family",
            h: "A warm and <em>loving</em> home.",
            p: "Help more families seek the concept of happiness in creating a warm and loving family.",
          },
          {
            label: "Mental",
            h: "Thinking, raised <em>higher.</em>",
            p: "The right thoughts, constantly enriching ourselves to raise our thinking to a higher level.",
          },
          {
            label: "Spiritual",
            h: "Integrity, righteousness, <em>positivity.</em>",
            p: "Spiritual wealth, and becoming a trustworthy person.",
          },
        ].map((g, i) => ({
          ...g,
          small: "Goal",
          k: `0${i + 1} — ${g.label} goal`,
        }));
        const ring = el.querySelector("#ring");
        const hero = el.querySelector<HTMLElement>("#hero");
        const idle = { rotation: { y: 0 }, position: { y: 0 } };
        const jar = {
          get group() {
            return (
              (
                hero as HTMLElement & {
                  __referenceStage?: { jar?: { group: typeof idle } };
                }
              )?.__referenceStage?.jar?.group || idle
            );
          },
          get rig() {
            return (
              (
                hero as HTMLElement & {
                  __referenceStage?: { jar?: { rig: typeof idle } };
                }
              )?.__referenceStage?.jar?.rig || idle
            );
          },
        };
        if (brand === "RIWAY" && ring)
          RW.wheel({
            ring,
            hero,
            strip: el.querySelector("#strip"),
            items: goals,
            start: 0,
            jar,
            hint: el.querySelector("#hintN"),
            capK: el.querySelector("#capK"),
            capH: el.querySelector("#capH"),
            capP: el.querySelector("#capP"),
          });
        el.querySelectorAll<HTMLElement>(".goal").forEach((g) => {
          g.tabIndex = 0;
          g.setAttribute("role", "button");
          g.onclick = () => {
            g.classList.toggle("is-open");
            g.setAttribute(
              "aria-expanded",
              String(g.classList.contains("is-open")),
            );
          };
          g.onkeydown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              g.click();
            }
          };
        });
        if (!RW.reduced) {
          gsap.set(".hero .ghost", { opacity: 0, letterSpacing: ".3em" });
          gsap.set(".hero .caption > *, .hero .hint, .hero .top-k", {
            opacity: 0,
            y: 16,
          });
        }
        void RW.loader(brand === "RIWAY" ? 1500 : 1600).then(() => {
          if (disposed) return;
          ctx.add(() => {
            if (!RW.reduced)
              gsap
                .timeline()
                .to(
                  ".hero .ghost",
                  {
                    opacity: 1,
                    letterSpacing: ".08em",
                    duration: 1.8,
                    ease: "power4.out",
                  },
                  0,
                )
                .from(
                  ".wheel .tick",
                  { opacity: 0, duration: 1.2, stagger: 0.08 },
                  0.2,
                )
                .to(
                  ".hero .caption > *, .hero .hint, .hero .top-k",
                  {
                    opacity: 1,
                    y: 0,
                    duration: 1,
                    stagger: 0.08,
                    ease: "power3.out",
                  },
                  0.5,
                );
            ScrollTrigger.refresh();
          });
        });
        if (!RW.reduced)
          gsap.to(".hero .reference-stage-host, .hero .ghost, .hero .wheel", {
            yPercent: -14,
            ease: "none",
            scrollTrigger: {
              trigger: ".hero",
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
        cleanup = () => {
          heroSizing.disconnect();
          RW.dispose();
          document.documentElement.classList.remove("reference-cursor");
          el.querySelectorAll<HTMLElement>(".goal").forEach((g) => {
            g.onclick = null;
            g.onkeydown = null;
          });
        };
      });
    });
    return () => {
      disposed = true;
      cleanup();
      ctx.revert();
    };
  }, [brand]);
  return (
    <div ref={root} className="reference-design" data-brand={brand}>
      <div className="loader" aria-hidden="true">
        <div className="word">{brand}</div>
        <div className="count" data-count>
          000
        </div>
        <div className="bar">
          <i />
        </div>
      </div>
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="/">
          RIWAY
        </a>
        <ul>
          <li>
            <a href="/purtier">Purtier</a>
          </li>
          <li>
            <a href="/conscientious">Conscientious</a>
          </li>
          <li>
            <a href={brand === "RIWAY" ? "#story" : "/#story"}>The company</a>
          </li>
          <li>
            <a href={brand === "RIWAY" ? "#events" : "/events"}>Events</a>
          </li>
          <li>
            <a href="/support">Contact</a>
          </li>
        </ul>
        <button className="menu-btn" type="button" aria-label="Open menu">
          <span>Menu</span>
          <i />
        </button>
      </nav>
      <div className="menu">
        <button className="close" type="button">
          Close
        </button>
        <div className="m-links">
          <a href="/">
            <small>01</small>
            <em>RIWAY</em>
          </a>
          <a href="/purtier">
            <small>02</small>PURTIER <em>Placenta</em>
          </a>
          <a href="/conscientious">
            <small>03</small>
            <em>CONSCIENTIOUS</em>
          </a>
          <a href="/about">
            <small>04</small>The <em>company</em>
          </a>
          <a href="/events">
            <small>05</small>
            <em>Events</em>
          </a>
          <a href="/support">
            <small>06</small>Find a <em>distributor</em>
          </a>
          <div className="commerce-links">
            <a href="/shop">Catalogue</a>
            <a href="/cart">Review bag</a>
            <a href="/account">Account</a>
            <a href="/distributor">Distributor area</a>
          </div>
        </div>
        <div className="m-side">
          <div>
            <b>International headquarters</b>RIWAY (Singapore) Pte Ltd
            <br />
            101 Bedok North Avenue 3<br />
            Singapore 469715
            <br />
            (65) 6531 0188
          </div>
          <div>
            <b>Languages</b>
            <div className="langs">
              <span>English</span>
              <span>简体中文</span>
              <span>繁體中文</span>
              <span>日本語</span>
              <span>ไทย</span>
              <span>Bahasa</span>
            </div>
          </div>
        </div>
      </div>
      {children}
      <ReferenceFooter brand={brand} />
    </div>
  );
}

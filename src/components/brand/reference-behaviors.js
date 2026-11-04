import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import SplitType from "split-type";
export function createReferenceBehaviors(root) {
  const cleanups = [];
  const splits = [];
  const abort = new AbortController();
  const document = {
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    createElement: (t) => window.document.createElement(t),
    body: root,
    documentElement: window.document.documentElement,
  };
  function listen(target, event, callback, options) {
    target = target === document ? root : target;
    target.addEventListener(event, callback, {
      ...(typeof options === "object" ? options : {}),
      signal: abort.signal,
    });
  }
  const RW = {};
  Object.defineProperties(RW, {
    isTouch: {
      get: () => matchMedia("(hover: none), (max-width: 760px)").matches,
    },
    isMobile: { get: () => matchMedia("(max-width: 760px)").matches },
  });
  RW.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // normalised pointer, -1..1, with easing
  RW.pointer = { x: 0, y: 0, tx: 0, ty: 0, px: 0, py: 0 };
  listen(
    window,
    "pointermove",
    (e) => {
      RW.pointer.px = e.clientX;
      RW.pointer.py = e.clientY;
      RW.pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      RW.pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    },
    { passive: true },
  );
  RW.tickPointer = (dt) => {
    const k = Math.min(1, dt * 4);
    RW.pointer.x += (RW.pointer.tx - RW.pointer.x) * k;
    RW.pointer.y += (RW.pointer.ty - RW.pointer.y) * k;
  };

  // Smooth scroll bound to GSAP's ticker
  RW.initLenis = function () {
    if (RW.reduced || typeof Lenis === "undefined") return null;
    const lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.95,
      smoothWheel: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    const ticker = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(ticker);
    cleanups.push(() => {
      gsap.ticker.remove(ticker);
      lenis.destroy();
    });
    gsap.ticker.lagSmoothing(0);
    RW.lenis = lenis;
    return lenis;
  };

  // Custom cursor: dot + ring; [data-cursor="label"] shows a text pill
  RW.cursor = function () {
    if (RW.isTouch) return;
    const c = document.createElement("div");
    c.className = "cursor";
    c.setAttribute("aria-hidden", "true");
    c.style.opacity = "0";
    c.innerHTML =
      '<div class="ring"></div><div class="dot"></div><div class="label"></div>';
    document.body.appendChild(c);
    cleanups.push(() => c.remove());
    const label = c.querySelector(".label");
    const xTo = gsap.quickTo(c, "x", { duration: 0.18, ease: "power3" });
    const yTo = gsap.quickTo(c, "y", { duration: 0.18, ease: "power3" });
    listen(
      window,
      "pointermove",
      (e) => {
        c.style.opacity = e.pointerType === "touch" ? "0" : "1";
        xTo(e.clientX);
        yTo(e.clientY);
      },
      { passive: true },
    );
    listen(document, "pointerover", (e) => {
      const t = e.target.closest("a,button,[data-cursor]");
      c.classList.toggle("is-hover", !!t);
      const l = t && t.dataset.cursor;
      c.classList.toggle("is-label", !!l);
      if (l) label.textContent = l;
    });
    const reset = () => {
      c.style.opacity = "0";
      c.classList.remove("is-pressed", "is-dragging", "is-hover", "is-label");
    };
    listen(root, "pointerleave", reset);
    listen(window, "blur", reset);
    listen(window, "pointerdown", (e) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      c.classList.add("is-pressed");
      c.classList.toggle("is-dragging", !!e.target.closest('[data-cursor="Drag"], .wheel'));
    });
    const release = () => c.classList.remove("is-pressed", "is-dragging");
    listen(window, "pointerup", release);
    listen(window, "pointercancel", reset);
  };

  // Magnetic elements
  RW.magnetic = function (sel, strength) {
    strength = strength || 0.35;
    document.querySelectorAll(sel || ".magnetic").forEach((el) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3" });
      listen(el, "pointermove", (e) => {
        if (RW.isTouch) return;
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      });
      listen(el, "pointerleave", () => {
        xTo(0);
        yTo(0);
      });
    });
  };

  RW.grain = function (opacity) {
    const g = document.createElement("div");
    g.className = "grain";
    if (opacity != null) g.style.setProperty("--grain", opacity);
    document.body.appendChild(g);
    cleanups.push(() => g.remove());
  };

  // Split text into lines/words/chars (SplitType) and animate on scroll
  RW.splitReveal = function (sel, opts) {
    opts = opts || {};
    document.querySelectorAll(sel).forEach((el) => {
      el.classList.add("reveal");
      const split = new SplitType(el, { types: opts.types || "lines,words" });
      splits.push(split);
      let tween;
      const animate = () => {
        const targets = split[opts.target || "words"];
        if (RW.reduced) return;
        gsap.set(targets, { yPercent: 110, opacity: opts.fade ? 0 : 1 });
        tween = gsap.to(targets, {
          yPercent: 0,
          opacity: 1,
          duration: 1.1,
          ease: "power4.out",
          stagger: opts.stagger != null ? opts.stagger : 0.035,
          scrollTrigger: {
            trigger: el,
            start: opts.start || "top 85%",
            once: true,
          },
        });
      };
      animate();
      let previousWidth = el.clientWidth;
      const observer = new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - previousWidth) < 1) return;
        previousWidth = el.clientWidth;
        const arrived = RW.reduced || tween?.progress() === 1;
        tween?.scrollTrigger?.kill();
        tween?.kill();
        split.split({ types: opts.types || "lines,words" });
        if (arrived)
          gsap.set(split[opts.target || "words"], { yPercent: 0, opacity: 1 });
        else animate();
      });
      observer.observe(el);
      cleanups.push(() => {
        observer.disconnect();
        tween?.scrollTrigger?.kill();
        tween?.kill();
      });
    });
  };

  // Lines that scroll from 15% to 100% opacity word by word (manifesto style)
  RW.scrubWords = function (sel) {
    if (RW.reduced) return;
    document.querySelectorAll(sel).forEach((el) => {
      const split = new SplitType(el, { types: "words" });
      splits.push(split);
      gsap.fromTo(
        split.words,
        { opacity: 0.14 },
        {
          opacity: 1,
          stagger: 0.06,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top 80%",
            end: "bottom 45%",
            scrub: true,
          },
        },
      );
    });
  };

  // Preloader: counts to 100 then resolves
  RW.preload = function (el, ms) {
    return new Promise((res) => {
      if (!el || RW.reduced) {
        if (el) el.remove();
        return res();
      }
      const num = el.querySelector("[data-count]");
      const o = { v: 0 };
      gsap.to(o, {
        v: 100,
        duration: (ms || 1400) / 1000,
        ease: "power2.inOut",
        onUpdate: () => {
          if (num) num.textContent = String(Math.round(o.v)).padStart(3, "0");
        },
        onComplete: () => {
          gsap.to(el, {
            yPercent: -100,
            duration: 0.9,
            ease: "power4.inOut",
            onComplete: () => {
              el.remove();
              res();
            },
          });
        },
      });
    });
  };

  // ---------- nav + overlay menu ----------
  RW.menu = function () {
    const nav = document.querySelector(".nav");
    const btn = nav && nav.querySelector(".menu-btn");
    const menu = document.querySelector(".menu");
    if (!btn || !menu) return;
    const links = menu.querySelectorAll(".m-links a");
    const close = menu.querySelector(".close");
    let open = false;
    btn.setAttribute("aria-expanded", "false");
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "RIWAY menu");
    menu.inert = true;
    const tl = gsap
      .timeline({ paused: true })
      .to(menu, {
        clipPath: "inset(0 0 0% 0)",
        duration: 0.9,
        ease: "power4.inOut",
      })
      .to(
        links,
        { opacity: 1, y: 0, duration: 0.9, stagger: 0.07, ease: "power4.out" },
        "-=0.35",
      );
    function toggle(v) {
      open = v;
      btn.setAttribute("aria-expanded", String(open));
      menu.inert = !open;
      document.querySelectorAll("section,footer").forEach((el) => {
        el.inert = open;
      });
      if (open) close?.focus({ preventScroll: true });
      else btn.focus({ preventScroll: true });
      menu.classList.toggle("is-open", open);
      document.body.classList.toggle(
        "is-dark-nav",
        open || document.body.dataset.darkNav === "1",
      );
      if (open) {
        tl.play();
        RW.lenis && RW.lenis.stop();
      } else {
        tl.reverse();
        RW.lenis && RW.lenis.start();
      }
    }
    listen(btn, "click", () => toggle(!open));
    close && listen(close, "click", () => toggle(false));
    listen(
      window,
      "keydown",
      (e) => e.key === "Escape" && open && toggle(false),
    );
    listen(menu, "keydown", (e) => {
      if (e.key !== "Tab" || !open) return;
      const nodes = [...menu.querySelectorAll("a,button")];
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && window.document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && window.document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    links.forEach((link) => listen(link, "click", () => toggle(false)));
    // current page marker
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a[href], .menu a[href]").forEach((a) => {
      if (a.getAttribute("href") === here) a.classList.add("is-current");
    });
  };

  // ---------- page wipe ----------
  RW.wipe = function () {
    let w = document.querySelector(".wipe");
    if (!w) {
      w = document.createElement("div");
      w.className = "wipe";
      w.innerHTML = '<div class="w-brand">RIWAY</div>';
      document.body.appendChild(w);
      cleanups.push(() => w.remove());
    }
    // reveal on load (unless a preloader handles it)
    if (!document.querySelector(".loader")) {
      gsap.to(w, {
        clipPath: "inset(0 0 100% 0)",
        duration: 1,
        ease: "power4.inOut",
        delay: 0.1,
        onComplete: () => {
          w.classList.add("is-idle");
          w.style.clipPath = "";
        },
      });
    } else {
      w.classList.add("is-idle");
    }
    listen(document, "click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("http") ||
        a.target === "_blank" ||
        href.endsWith(".png")
      )
        return;
      if (!href.startsWith("/") || href.startsWith("//")) return;
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0 ||
        a.hasAttribute("download")
      )
        return;
      e.preventDefault();
      w.classList.remove("is-idle");
      gsap.fromTo(
        w,
        { clipPath: "inset(100% 0 0 0)" },
        {
          clipPath: "inset(0 0 0 0)",
          duration: 0.8,
          ease: "power4.inOut",
          onComplete: () => {
            location.href = href;
          },
        },
      );
      gsap.fromTo(
        w.querySelector(".w-brand"),
        { opacity: 0, letterSpacing: ".8em" },
        { opacity: 1, letterSpacing: ".5em", duration: 0.8, delay: 0.3 },
      );
    });
    listen(window, "pageshow", (e) => {
      if (e.persisted) {
        w.classList.add("is-idle");
      }
    });
  };

  // ---------- preloader (letters + counter + bar) ----------
  RW.loader = function (ms) {
    const el = document.querySelector(".loader");
    return new Promise((res) => {
      if (!el) return res();
      if (RW.reduced) {
        el.remove();
        return res();
      }
      const word = el.querySelector(".word");
      if (word && !word.children.length)
        word.innerHTML = word.textContent
          .trim()
          .split("")
          .map((c) => `<span>${c}</span>`)
          .join("");
      const letters = el.querySelectorAll(".word span");
      const num = el.querySelector("[data-count]");
      const bar = el.querySelector(".bar i");
      const o = { v: 0 };
      gsap
        .timeline()
        .to(
          letters,
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.06,
            ease: "power3.out",
          },
          0,
        )
        .to(
          o,
          {
            v: 100,
            duration: (ms || 1600) / 1000,
            ease: "power2.inOut",
            onUpdate: () => {
              if (num)
                num.textContent = String(Math.round(o.v)).padStart(3, "0");
              if (bar) bar.style.width = o.v + "%";
            },
          },
          0,
        )
        .to(
          letters,
          {
            opacity: 0,
            y: -10,
            duration: 0.5,
            stagger: 0.03,
            ease: "power2.in",
          },
          "-=0.2",
        )
        .to(
          el,
          {
            clipPath: "inset(0 0 100% 0)",
            duration: 1,
            ease: "power4.inOut",
            onComplete: () => {
              el.remove();
              res();
            },
          },
          "-=0.2",
        );
    });
  };

  // ---------- counters ----------
  RW.counters = function (sel) {
    document.querySelectorAll(sel || "[data-to]").forEach((el) => {
      const to = parseFloat(el.dataset.to),
        dec = el.dataset.dec ? +el.dataset.dec : 0,
        prefix = el.dataset.prefix || "",
        suffix = el.dataset.suffix || "";
      const fmt = (v) =>
        prefix +
        v.toLocaleString("en-US", {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        }) +
        suffix;
      if (RW.reduced) {
        el.textContent = fmt(to);
        return;
      }
      el.textContent = fmt(0);
      const o = { v: 0 };
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () =>
          gsap.to(o, {
            v: to,
            duration: 1.8,
            ease: "power3.out",
            onUpdate: () => (el.textContent = fmt(o.v)),
          }),
      });
    });
  };

  // ---------- horizontal pinned track ----------
  RW.track = function (sec) {
    const track = sec.querySelector(".track"),
      prog = sec.querySelector(".prog i");
    function setup() {
      const dist = track.scrollWidth - innerWidth;
      sec.style.height = innerHeight + dist + "px";
      return dist;
    }
    const media = gsap.matchMedia();
    media.add("(min-width: 761px)", () => {
      let dist = setup();
      gsap.to(track, {
        x: () => -dist,
        ease: "none",
        scrollTrigger: {
          trigger: sec,
          start: "top top",
          end: () => "+=" + dist,
          scrub: 0.6,
          invalidateOnRefresh: true,
          onUpdate: (s) => {
            if (prog) prog.style.width = s.progress * 100 + "%";
          },
        },
      });
      const resized = () => {
        dist = setup();
        ScrollTrigger.refresh();
      };
      window.addEventListener("resize", resized);
      return () => {
        window.removeEventListener("resize", resized);
        sec.style.height = "";
      };
    });
    cleanups.push(() => media.revert());
  };

  // ---------- the wheel (generalised from concept B) ----------
  // opts: { ring, hero, strip, items:[{label, small, k, h, p}], onChange(i), jar(Object3D), hint(el), start }
  RW.wheel = function (opts) {
    const N = opts.items.length,
      step = 360 / N;
    const ring = opts.ring;
    opts.items.forEach((e, i) => {
      const t = document.createElement("div");
      t.className = "tick";
      t.style.transform = `rotate(${i * step}deg)`;
      t.innerHTML = `<button type="button" class="item" data-i="${i}" aria-pressed="false">${e.label}<small>${e.small || ""}</small></button>`;
      ring.appendChild(t);
    });
    const items = [...ring.querySelectorAll(".item")];
    const chips = [];
    if (opts.strip)
      opts.items.forEach((e, i) => {
        const b = document.createElement("button");
        b.textContent = e.label;
        b.dataset.i = i;
        opts.strip.appendChild(b);
        chips.push(b);
      });
    const start = opts.start != null ? opts.start : N - 1;
    const state = { angle: -start * step, active: -1 };
    const capK = opts.capK,
      capH = opts.capH,
      capP = opts.capP;

    function setActive(i, animate) {
      if (i === state.active) return;
      const first = state.active === -1;
      state.active = i;
      items.forEach((el, j) => {
        el.classList.toggle("is-active", j === i);
        el.setAttribute("aria-pressed", String(j === i));
      });
      chips.forEach((el, j) => {
        el.classList.toggle("is-active", j === i);
        el.setAttribute("aria-pressed", String(j === i));
      });
      const e = opts.items[i];
      if (opts.hint) opts.hint.textContent = String(i + 1).padStart(2, "0");
      const targets = [capK, capH, capP].filter(Boolean);
      if (first || RW.reduced) {
        if (capK) capK.textContent = e.k;
        if (capH) capH.innerHTML = e.h;
        if (capP) capP.textContent = e.p;
      } else
        gsap
          .timeline()
          .to(targets, {
            opacity: 0,
            y: -8,
            duration: 0.25,
            stagger: 0.04,
            ease: "power2.in",
            onComplete: () => {
              if (capK) capK.textContent = e.k;
              if (capH) capH.innerHTML = e.h;
              if (capP) capP.textContent = e.p;
            },
          })
          .to(targets, {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.06,
            ease: "power3.out",
          });
      if (opts.jar && animate !== false && !first) {
        gsap.to(opts.jar.group.rotation, {
          y: "+=" + Math.PI * 0.5,
          duration: 1.2,
          ease: "power3.inOut",
        });
        gsap.to(opts.jar.rig.position, {
          y: -0.08,
          duration: 0.3,
          yoyo: true,
          repeat: 1,
          ease: "power2.inOut",
        });
      }
      opts.onChange && opts.onChange(i, e);
    }
    function applyAngle() {
      ring.style.transform = `rotate(${state.angle}deg)`;
      items.forEach(
        (el, j) =>
          (el.style.transform = `translate(-50%,10px) rotate(${-(state.angle + j * step)}deg)`),
      );
      let best = 0,
        bd = 1e9;
      for (let j = 0; j < N; j++) {
        const a = ((((state.angle + j * step) % 360) + 540) % 360) - 180;
        if (Math.abs(a) < bd) {
          bd = Math.abs(a);
          best = j;
        }
      }
      if (best !== state.active) setActive(best);
    }
    let snapTween;
    function snapTo(i) {
      const cur = state.angle;
      const target = cur + (((((-i * step - cur) % 360) + 540) % 360) - 180);
      snapTween && snapTween.kill();
      snapTween = gsap.to(state, {
        angle: target,
        duration: 0.9,
        ease: "power3.out",
        onUpdate: applyAngle,
      });
    }
    applyAngle();
    setActive(start, false);
    cleanups.push(() => {
      ring.replaceChildren();
      opts.strip?.replaceChildren();
    });
    listen(ring, "keydown", (e) => {
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? N - 1
              : (state.active + (e.key === "ArrowRight" ? 1 : N - 1)) % N;
        snapTo(next);
        items[next].focus({ preventScroll: true });
      }
    });
    items.forEach((el) => listen(el, "click", () => snapTo(+el.dataset.i)));
    chips.forEach((el) =>
      listen(el, "click", () => {
        setActive(+el.dataset.i);
        el.scrollIntoView({
          inline: "center",
          behavior: "smooth",
          block: "nearest",
        });
      }),
    );

    // drag
    const hero = opts.hero;
    let drag = false,
      lx = 0,
      moved = 0;
    listen(hero, "pointerdown", (e) => {
      if (RW.isMobile || e.button !== 0) return;
      if (!e.target.closest("a,button")) e.preventDefault();
      drag = true;
      lx = e.clientX;
      moved = 0;
      snapTween && snapTween.kill();
    });
    listen(window, "pointerup", () => {
      if (drag) {
        drag = false;
        snapTo(state.active);
      }
    });
    listen(
      window,
      "pointermove",
      (e) => {
        if (!drag) return;
        const dx = e.clientX - lx;
        lx = e.clientX;
        moved += Math.abs(dx);
        state.angle += dx * 0.25;
        applyAngle();
        if (opts.jar) opts.jar.group.rotation.y += dx * 0.004;
      },
      { passive: true },
    );

    // mouse wheel steps through items while at the top; releases at the first item
    if (opts.wheelSteps !== false) {
      let acc = 0,
        released = false,
        lastStep = 0;
      listen(
        hero,
        "wheel",
        (e) => {
          if (RW.isTouch || released) return;
          if (state.active === 0 && e.deltaY > 0) {
            released = true;
            setTimeout(() => (released = false), 2500);
            return;
          }
          if (state.active === N - 1 && e.deltaY < 0) return;
          e.preventDefault();
          e.stopPropagation();
          acc += e.deltaY;
          const now = performance.now();
          if (Math.abs(acc) > 110 && now - lastStep > 420) {
            snapTo(Math.max(0, Math.min(N - 1, state.active - Math.sign(acc))));
            acc = 0;
            lastStep = now;
          }
        },
        { passive: false, capture: true },
      );
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        onEnterBack: () => (released = false),
      });
    }
    return { state, setActive, snapTo, items };
  };

  // ---------- pause a stage when its canvas leaves the viewport ----------
  RW.autoPause = function (stage, canvas) {
    if (!("IntersectionObserver" in window) || !stage.renderer) return;
    const observer = new IntersectionObserver(
      (en) =>
        en.forEach((x) => (x.isIntersecting ? stage.play() : stage.pause())),
      { threshold: 0 },
    );
    observer.observe(canvas);
    cleanups.push(() => observer.disconnect());
  };

  // ---------- clip reveals for .two .media ----------
  RW.clipReveal = function (sel) {
    if (RW.reduced) {
      document
        .querySelectorAll(sel || ".two .media")
        .forEach((el) => (el.style.clipPath = "none"));
      return;
    }
    document.querySelectorAll(sel || ".two .media").forEach((el) => {
      gsap.to(el, {
        clipPath: "inset(0 0 0% 0)",
        duration: 1.4,
        ease: "power4.inOut",
        scrollTrigger: { trigger: el, start: "top 80%", once: true },
      });
      const inner = el.firstElementChild;
      if (inner)
        gsap.fromTo(
          inner,
          { scale: 1.15 },
          {
            scale: 1,
            duration: 1.6,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 80%", once: true },
          },
        );
    });
  };

  // ---------- stagger-in for grids/cards ----------
  RW.rise = function (sel, opts) {
    if (RW.reduced) return;
    opts = opts || {};
    document.querySelectorAll(sel).forEach((group) => {
      const kids = opts.children
        ? group.querySelectorAll(opts.children)
        : [group];
      gsap.from(kids, {
        yPercent: opts.y || 14,
        opacity: 0,
        duration: 1.1,
        ease: "power4.out",
        stagger: opts.stagger || 0.08,
        scrollTrigger: { trigger: group, start: "top 85%", once: true },
      });
    });
  };

  // ---------- dark-nav toggling for dark sections ----------
  RW.darkNav = function (sel) {
    const nav = document.querySelector(".nav");
    const onScroll = () =>
      nav &&
      nav.classList.toggle(
        "is-scrolled",
        (window.scrollY || document.documentElement.scrollTop) > 24,
      );
    listen(window, "scroll", onScroll, { passive: true });
    if (RW.lenis) RW.lenis.on("scroll", onScroll);
    onScroll();
    document
      .querySelectorAll(sel || ".cinema, .foot, .events, [data-dark]")
      .forEach((sec) => {
        ScrollTrigger.create({
          trigger: sec,
          start: "top 60px",
          end: "bottom 60px",
          onToggle: (s) =>
            document.body.classList.toggle("is-dark-nav", s.isActive),
        });
      });
  };

  // ---------- cinema sequence (A) ----------
  // Pinned dark band: jar turns, opens, parks. opts: { sec, stage, mobile, copy0, copy1, copy2 }
  RW.cinema = function (opts) {
    const { sec, stage } = opts;
    const jar = stage.jar,
      camera = stage.camera;
    const lift = { v: 0 };
    const mobile = RW.isMobile;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sec,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.1,
      },
      defaults: { ease: "none" },
    });
    tl.fromTo(
      jar.group.scale,
      { x: 0.001, y: 0.001, z: 0.001 },
      { x: 1, y: 1, z: 1, duration: 0.14, ease: "power2.out" },
      0,
    )
      .fromTo(
        opts.copy0,
        { opacity: 0, scale: 0.94 },
        { opacity: 1, scale: 1, duration: 0.1 },
        0.02,
      )
      .to(
        opts.copy0,
        { opacity: 0, scale: 0.92, yPercent: -10, duration: 0.1 },
        0.2,
      )
      .to(jar.group.rotation, { y: Math.PI * 1.1, duration: 0.5 }, 0.1)
      .to(
        jar.group.scale,
        mobile
          ? { x: 0.92, y: 0.92, z: 0.92, duration: 0.3 }
          : { x: 1.12, y: 1.12, z: 1.12, duration: 0.3 },
        0.15,
      )
      .to(
        jar.group.position,
        mobile ? { y: 0.75, duration: 0.25 } : { y: 0, duration: 0.01 },
        0.12,
      )
      .to(
        lift,
        { v: 1, duration: 0.22, onUpdate: () => jar.setLift(lift.v) },
        0.28,
      )
      .to(opts.copy1, { opacity: 1, duration: 0.1 }, 0.3)
      .to(opts.copy1, { opacity: 0, duration: 0.08 }, 0.56)
      .to(
        jar.group.position,
        mobile ? { y: 1.0, duration: 0.3 } : { x: -1.55, duration: 0.3 },
        0.55,
      )
      .to(jar.group.rotation, { y: Math.PI * 2.05, duration: 0.45 }, 0.55)
      .to(
        lift,
        { v: 0.35, duration: 0.25, onUpdate: () => jar.setLift(lift.v) },
        0.62,
      )
      .to(opts.copy2, { opacity: 1, duration: 0.1 }, 0.66)
      .to(
        camera.position,
        { z: (camera.position.z || 7.4) - 0.8, duration: 0.4 },
        0.6,
      );
    const spot = sec.querySelector(".spot");
    if (spot && !RW.isTouch) {
      const sx = gsap.quickTo(spot, "--sx", { duration: 0.6, ease: "power3" });
      const sy = gsap.quickTo(spot, "--sy", { duration: 0.6, ease: "power3" });
      listen(
        window,
        "pointermove",
        (e) => {
          sx((e.clientX / innerWidth) * 100 + "%");
          sy((e.clientY / innerHeight) * 100 + "%");
        },
        { passive: true },
      );
    }
    stage.onFrame(() => {
      const l = stage.scene && stage.scene.children.find((o) => o.isSpotLight);
      if (l) {
        l.position.x = 3 + RW.pointer.x * 2.2;
        l.position.y = 5 - RW.pointer.y * 1.5;
      }
    });
    return tl;
  };

  RW.dispose = () => {
    abort.abort();
    cleanups.forEach((fn) => fn());
    splits.forEach((s) => s.revert());
  };
  return RW;
}

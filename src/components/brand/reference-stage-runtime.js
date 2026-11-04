// Client-only port of assets/js/{shared,unbox}.js and the page module scenes.
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import Studio from "./models/studio.js";
import PurtierJar from "./models/purtier-jar.js";
import PurtierBox from "./models/purtier-box.js";
import SprayBottle from "./models/spray-bottle.js";
import ConscPack from "./models/conscientious-pack.js";

const ADDONS = {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  OutputPass,
  RectAreaLightUniformsLib,
};
// The ESM kit changed only PMREM sigma and DPR. Restore the reference locally,
// without mutating shared model functions or THREE's module namespace.
class ReferencePMREMGenerator extends THREE.PMREMGenerator {
  fromScene(scene) {
    return super.fromScene(scene, 0.06);
  }
}
const environmentThree = { ...THREE, PMREMGenerator: ReferencePMREMGenerator };

function disposePost(post) {
  post?.composer?.passes.forEach((pass) => pass.dispose?.());
  post?.composer?.dispose();
}

function disposeScene(scene) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) {
        if (uniform.value?.isTexture) textures.add(uniform.value);
      }
    }
    object.shadow?.map?.dispose();
    object.shadow?.mapPass?.dispose();
  });
  if (scene.environment) {
    const target = scene.environment.userData.riwayRenderTarget;
    if (target) target.dispose();
    else textures.add(scene.environment);
  }
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  scene.clear();
}

/**
 * Returns an idempotent disposer. The first rendered frame publishes the handle
 * on section.__referenceStage and dispatches reference-stage-ready (detail=handle).
 * @param {HTMLElement} host
 * @param {"jar"|"purtier"|"conscientious"|"him"|"her"} kind
 * @param {{entrance?: "load"|"scroll", debug?: boolean, onReady?: () => void, onError?: (error: unknown) => void}} options
 */
export function mountReferenceStage(host, kind, options = {}) {
  gsap.registerPlugin(ScrollTrigger);
  const canvas = host.querySelector("canvas");
  if (!canvas) throw new Error("ReferenceStage requires its canvas");
  const section =
    host.closest(".unbox, .hero, .side-sec, section") || host.parentElement;
  const root = host.closest(".reference-design") || section;
  const entrance =
    options.entrance || (section.matches(".hero, #hero") ? "load" : "scroll");
  const cleanups = [];
  let dead = false,
    handle,
    stage,
    loaderObserver;
  let loaderResolve;
  const context = gsap.context(() => {}, section);
  const previousHandle = section.__referenceStage;
  const safe =
    (fn) =>
    (...args) => {
      if (dead) return;
      let result;
      context.add(() => {
        result = fn(...args);
      });
      return result;
    };
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  function destroy() {
    if (dead) return;
    dead = true;
    loaderObserver?.disconnect();
    loaderResolve?.();
    context.revert();
    cleanups.reverse().forEach((cleanup) => cleanup());
    stage?.dispose();
    if (section.__referenceStage === handle) {
      if (previousHandle === undefined) delete section.__referenceStage;
      else section.__referenceStage = previousHandle;
    }
    if (host.__referenceStage === handle) delete host.__referenceStage;
    const registry = window.__referenceStages;
    registry?.delete(host);
    if (registry?.size === 0) delete window.__referenceStages;
  }
  function fail(error) {
    if (dead) return;
    destroy();
    options.onError?.(error);
    host.dispatchEvent(
      new CustomEvent("reference-stage-error", {
        bubbles: true,
        detail: { kind, error },
      }),
    );
  }
  function publish() {
    if (dead) return;
    section.__referenceStage = host.__referenceStage = handle;
    if (options.debug) {
      window.__referenceStages ||= new Map();
      window.__referenceStages.set(host, handle);
    }
    options.onReady?.();
    section.dispatchEvent(
      new CustomEvent("reference-stage-ready", {
        bubbles: true,
        detail: handle,
      }),
    );
  }

  // Separate pointer smoothing per stage matches shared.js without installing a
  // second Lenis instance or depending on another component's boot timing.
  const RW = {
    isMobile: matchMedia("(max-width: 760px)").matches,
    isTouch: matchMedia("(hover: none)").matches,
    pointer: { x: 0, y: 0, tx: 0, ty: 0 },
    safe,
    tickPointer(dt) {
      const k = Math.min(1, dt * 4),
        p = this.pointer;
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
    },
    // The shell owns its source loader. Wait for removal rather than animating
    // that DOM twice. Context-bind the asynchronous entrance continuation.
    loader() {
      const loader = root.querySelector(".loader");
      const promise = !loader
        ? Promise.resolve()
        : new Promise((resolve) => {
            loaderResolve = resolve;
            loaderObserver = new MutationObserver(() => {
              if (!loader.isConnected) {
                loaderObserver.disconnect();
                resolve();
              }
            });
            loaderObserver.observe(root, { childList: true, subtree: true });
          });
      return { then: (callback) => promise.then(safe(callback)) };
    },
    autoPause() {}, // Built into the cancellable scene RAF below.
    scene3d(_three, _addons, _canvas, opts) {
      stage = createScene(opts);
      return stage;
    },
  };
  listen(
    window,
    "pointermove",
    (event) => {
      RW.pointer.tx = (event.clientX / innerWidth) * 2 - 1;
      RW.pointer.ty = (event.clientY / innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  function createScene(opts) {
    const low = RW.isMobile;
    const scene = new THREE.Scene();
    let renderer, post, resizeObserver, visibilityObserver;
    let frame = 0,
      last = performance.now(),
      visible = true,
      paused = false;
    let stopped = false,
      first = true,
      degraded = low,
      frames = 0,
      slow = 0;
    const hooks = [];
    // Three r170 keeps VSM blur resources outside the scene graph.
    const shadowGeometries = new Set(),
      shadowMaterials = new Set();
    const fov = opts.fov || 30;
    const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, opts.far || 200);
    const target = new THREE.Vector3();
    const direct = () => ({
      render: () => renderer.render(scene, camera),
      setSize() {},
    });
    function resize() {
      if (stopped) return;
      const w = canvas.clientWidth || host.clientWidth || innerWidth;
      const h = canvas.clientHeight || host.clientHeight || innerHeight;
      renderer.setSize(w, h, false);
      post.setSize(w, h);
      camera.aspect = w / h;
      camera.fov =
        fov * (opts.responsiveFov !== false && camera.aspect < 0.8 ? 1.12 : 1);
      camera.updateProjectionMatrix();
    }
    function degrade() {
      if (degraded) return;
      degraded = true;
      disposePost(post);
      post = direct();
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(1);
      if (opts.hero) stage?.jar?.lowQuality?.();
      scene.traverse((object) => {
        const materials = Array.isArray(object.material)
          ? object.material
          : object.material
            ? [object.material]
            : [];
        materials.forEach((material) => {
          if (!opts.hero && !opts.bottle) {
            if ("anisotropy" in material) material.anisotropy = 0;
            if ("transmission" in material) material.transmission = 0;
          }
          if (!opts.bottle) material.needsUpdate = true;
        });
      });
      resize();
    }
    function renderFrame(now) {
      if (stopped || dead || paused || !visible || document.hidden) return;
      try {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        RW.tickPointer(dt);
        if (!degraded && frames < 90) {
          frames++;
          if (dt > 0.045) slow++;
          if (frames === 90 && slow > 45) degrade();
        }
        for (const hook of hooks) hook(dt, now / 1000);
        if (opts.lookAt !== false) camera.lookAt(target);
        if (scene.environmentRotation) scene.environmentRotation.y += dt * 0.04;
        post.render();
        if (first) {
          first = false;
          publish();
        }
      } catch (error) {
        fail(error);
        return;
      }
      if (!stopped && !dead) frame = requestAnimationFrame(renderFrame);
    }
    function sync() {
      cancelAnimationFrame(frame);
      if (!stopped && !dead && !paused && visible && !document.hidden) {
        last = performance.now();
        frame = requestAnimationFrame(renderFrame);
      }
    }
    function dispose() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      disposePost(post);
      disposeScene(scene);
      shadowGeometries.forEach((geometry) => geometry.dispose());
      shadowMaterials.forEach((material) => material.dispose());
      renderer?.renderLists.dispose();
      renderer?.dispose();
      // Strict Mode and motion preference changes remount on the same canvas.
      // Keep that context reusable; lose it only after the host leaves the DOM.
      if (!host.isConnected) renderer?.forceContextLoss();
    }
    try {
      renderer = Studio.renderer(THREE, canvas, low, opts);
      const renderBufferDirect = renderer.renderBufferDirect;
      renderer.renderBufferDirect = function (
        camera,
        renderScene,
        geometry,
        material,
        object,
        group,
      ) {
        if (material.uniforms?.shadow_pass) {
          shadowGeometries.add(geometry);
          shadowMaterials.add(material);
        }
        return renderBufferDirect.call(
          this,
          camera,
          renderScene,
          geometry,
          material,
          object,
          group,
        );
      };
      renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
      scene.environment = Studio.environment(environmentThree, renderer);
      scene.environmentRotation?.set(0, -0.6, 0);
      Studio.lights(THREE, scene, ADDONS, low);
      post = Studio.post(THREE, ADDONS, renderer, scene, camera, low);
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      visibilityObserver = new IntersectionObserver(
        (entries) => {
          visible = entries[0].isIntersecting;
          sync();
        },
        { threshold: 0 },
      );
      visibilityObserver.observe(canvas);
      listen(window, "resize", resize);
      listen(document, "visibilitychange", sync);
      listen(canvas, "webglcontextlost", (event) => {
        event.preventDefault();
        fail(new Error("ReferenceStage WebGL context lost"));
      });
      frame = requestAnimationFrame(renderFrame);
      return {
        renderer,
        scene,
        camera,
        target,
        low,
        get post() {
          return post;
        },
        onFrame: (fn) => {
          hooks.push(fn);
          return () => {
            const i = hooks.indexOf(fn);
            if (i >= 0) hooks.splice(i, 1);
          };
        },
        resize,
        degrade,
        dispose,
        pause: () => {
          paused = true;
          sync();
        },
        play: () => {
          paused = false;
          sync();
        },
      };
    } catch (error) {
      dispose();
      throw error;
    }
  }

  try {
    context.add(() => {
      if (kind === "purtier" || kind === "conscientious") {
        createUnboxSequences(RW);
        // The real section remains the ScrollTrigger trigger; opts.canvas keeps
        // canvas selection local when there are multiple stages in a section.
        handle = (kind === "purtier" ? RW.unboxPurtier : RW.unboxConscientious)(
          THREE,
          ADDONS,
          section,
          { RB: RoundedBoxGeometry, entrance, canvas },
        );
      } else if (kind === "jar") {
        stage = createScene({
          fov: section.matches('.cinema') ? 30 : 26,
          exposure: 1.08,
          far: 100,
          lookAt: false,
          hero: true,
        });
        const jar = PurtierJar.create(THREE, {
          quality: RW.isMobile ? "low" : "high",
        });
        stage.scene.add(jar.group);
        stage.jar = jar;
        stage.camera.position.set(0, 0.1, RW.isMobile ? 6.8 : 10);
        Studio.ground(THREE, jar.group, -jar.height / 2 - 0.01, RW.isMobile);
        jar.group.scale.setScalar(RW.isMobile ? 0.9 : 1);
        if (RW.isMobile) jar.group.position.y = 0;
        jar.group.rotation.y = -0.3;
        stage.onFrame((dt) => {
          jar.update(dt, RW.isTouch ? null : RW.pointer);
          jar.group.rotation.y += dt * 0.1;
        });
        // ReferenceShell owns the source hero copy/ticks and host parallax.
        // This context owns only the jar entrance; duplicating the canvas
        // parallax beneath the moving host would double its displacement.
        gsap.set(jar.group.scale, { x: 0.001, y: 0.001, z: 0.001 });
        const s = RW.isMobile ? 0.9 : 1;
        const timeline = gsap
          .timeline({ paused: true })
          .to(
            jar.group.scale,
            { x: s, y: s, z: s, duration: 1.8, ease: "expo.out" },
            0,
          );
        const ready = RW.loader(1500).then(() => {
          timeline.play();
        });
        let wheelIndex = 0;
        const wheelChange = safe((index, animate = true) => {
          if (index === wheelIndex) return;
          wheelIndex = index;
          if (!animate) return;
          gsap.to(jar.group.rotation, {
            y: "+=" + Math.PI * 0.5,
            duration: 1.2,
            ease: "power3.inOut",
          });
          gsap.to(jar.rig.position, {
            y: -0.08,
            duration: 0.3,
            yoyo: true,
            repeat: 1,
            ease: "power2.inOut",
          });
        });
        listen(section, "reference-wheel-change", (event) => {
          const index =
            typeof event.detail === "number"
              ? event.detail
              : event.detail?.index;
          if (Number.isFinite(index))
            wheelChange(index, event.detail?.animate !== false);
        });
        handle = { stage, jar, timeline, ready, wheelChange };
      } else {
        // conscientious.html: bottleStage(), preserving its fixed camera/FOV.
        stage = createScene({
          fov: 26,
          exposure: 1.05,
          far: 100,
          lookAt: false,
          responsiveFov: false,
          bottle: true,
        });
        stage.camera.position.set(0, 0.1, 8.2);
        const bottle = SprayBottle.create(THREE, {
          variant: kind,
          quality: RW.isMobile ? "low" : "high",
        });
        stage.scene.add(bottle.group);
        Studio.ground(
          THREE,
          bottle.group,
          -bottle.height / 2 - 0.01,
          RW.isMobile,
        );
        stage.onFrame((dt) =>
          bottle.update(dt, RW.isTouch ? null : RW.pointer),
        );
        const timeline = gsap.to(bottle.group.rotation, {
          y: Math.PI * 2,
          ease: "none",
          scrollTrigger: {
            trigger: canvas,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
        handle = {
          stage,
          bottle,
          bottles: [bottle],
          timeline,
          ready: Promise.resolve(),
        };
      }
      Object.assign(handle, {
        kind,
        host,
        section,
        canvas,
        scene: stage.scene,
        camera: stage.camera,
        renderer: stage.renderer,
        dispose: destroy,
      });
      handle.ready?.catch(fail);
      stage.resize();
    });
  } catch (error) {
    fail(error);
  }
  return destroy;
}

function createUnboxSequences(RW) {
  const show = (el) => ({ autoAlpha: 1, y: 0, duration: 0.08 });

  function entrance(section, intro, opts) {
    const ghost = section.querySelector(".ghost"),
      u0 = section.querySelector(".u0"),
      topk = section.querySelector(".top-k");
    const bits = [...u0.children, topk].filter(Boolean);
    if (opts.entrance === "scroll") {
      gsap.set(u0, { autoAlpha: 1 });
      const st = { trigger: section, start: "top 65%", once: true };
      gsap.from(bits, {
        opacity: 0,
        y: 16,
        stagger: 0.08,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: st,
      });
      gsap.from(intro.scale, {
        x: 0.75,
        y: 0.75,
        z: 0.75,
        duration: 1.6,
        ease: "expo.out",
        scrollTrigger: st,
      });
      if (ghost)
        gsap.from(ghost, {
          opacity: 0,
          letterSpacing: ".3em",
          duration: 1.6,
          ease: "power4.out",
          scrollTrigger: st,
        });
      return Promise.resolve();
    }
    intro.scale.setScalar(0.001);
    if (ghost) gsap.set(ghost, { opacity: 0, letterSpacing: ".3em" });
    gsap.set(bits, { opacity: 0, y: 16 });
    return RW.loader(1500).then(() => {
      gsap.set(u0, { autoAlpha: 1 });
      const t = gsap
        .timeline()
        .to(
          intro.scale,
          { x: 1, y: 1, z: 1, duration: 1.8, ease: "expo.out" },
          0,
        );
      if (ghost)
        t.to(
          ghost,
          {
            opacity: 1,
            letterSpacing: ".08em",
            duration: 1.8,
            ease: "power4.out",
          },
          0,
        );
      t.to(
        bits,
        { opacity: 1, y: 0, duration: 1, stagger: 0.08, ease: "power3.out" },
        0.5,
      );
    });
  }

  function pointerTilt(stage, intro, kx, ky) {
    const pt = new intro.position.constructor();
    stage.onFrame((dt) => {
      const p = RW.isTouch ? { x: 0, y: 0 } : RW.pointer;
      pt.x += (p.y * kx - pt.x) * Math.min(1, dt * 3);
      pt.y += (p.x * ky - pt.y) * Math.min(1, dt * 3);
      intro.rotation.x = -pt.x;
      intro.rotation.y = pt.y;
    });
  }

  // =================== PURTIER: carton → lid → jar → cap → capsules ===================
  RW.unboxPurtier = function (THREE, ADDONS, section, opts) {
    opts = opts || {};
    const mob = RW.isMobile,
      q = mob ? "low" : "high";
    const $ = (s) => section.querySelector(s);
    const canvas = opts.canvas || $("canvas");
    const U = RW.scene3d(THREE, ADDONS, canvas, { fov: 26, exposure: 0.98 });
    RW.autoPause(U, canvas);
    const { scene, camera, target } = U;
    camera.position.set(0, -0.1, mob ? 11.6 : 12);
    target.set(0, -0.1, 0);

    const jar = PurtierJar.create(THREE, { quality: q });
    const box = PurtierBox.create(THREE, {
      quality: q,
      RoundedBoxGeometry: opts.RB,
    });
    // scene > intro (entrance + pointer tilt) > product (framing) > { carton, jar }
    // carton and jar share one parent, so the jar can never poke through the lid
    const intro = new THREE.Group(),
      product = new THREE.Group();
    scene.add(intro);
    intro.add(product);
    product.add(box.group, jar.group);
    box.group.position.y = -box.height / 2;
    Studio.ground(THREE, box.group, 0, mob);
    jar.group.position.set(0, box.jarY - box.height / 2, 0);
    jar.group.visible = false; // hidden until the lid starts to lift
    jar.motion = 0; // no float or tilt of its own while boxed
    jar.liftHeight = mob ? 0.9 : 1.35;
    const F = mob
      ? {
          a: { s: 0.9, y: 0.835 },
          c: { s: 1, y: 0.835 },
          d: { s: 0.88, y: 0.44 },
          jarC: { x: 0, y: 0 },
          jarD: { x: 0, y: 0 },
          camB: 11.6,
          camC: 11.6,
          camD: 11.6,
          turn: 0.35,
        }
      : {
          a: { s: 1, y: 0 },
          c: { s: 1, y: 0 },
          d: { s: 1, y: 0 },
          jarC: { x: 0, y: 0.05 },
          jarD: { x: -1.7, y: -0.75 },
          camB: 11.2,
          camC: 8.8,
          camD: 11.6,
          turn: 0.5,
        };
    product.scale.setScalar(F.a.s);
    product.position.y = F.a.y;
    U.onFrame((dt) => jar.update(dt, RW.isTouch ? null : RW.pointer));
    pointerTilt(U, intro, 0.06, 0.18);

    const lid = { v: 0 },
      lift = { v: 0 },
      mo = { v: 0 };
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.1,
      },
      defaults: { ease: "none" },
    });
    tl
      // A: the carton turns to show its depth
      .to(product.rotation, { y: F.turn, duration: 0.14 }, 0)
      .to($(".u0"), { autoAlpha: 0, y: -20, duration: 0.08 }, 0.08)
      // B: the lid lifts away and the jar appears in its tray
      .to(
        lid,
        {
          v: 1,
          duration: 0.22,
          ease: "power1.inOut",
          onUpdate: () => {
            box.setLid(lid.v);
            jar.group.visible = lid.v > 0.02;
          },
        },
        0.14,
      )
      .to(camera.position, { z: F.camB, duration: 0.22 }, 0.14)
      .fromTo($(".u1"), { autoAlpha: 0, y: 20 }, show(), 0.18)
      .to($(".u1"), { autoAlpha: 0, y: -20, duration: 0.08 }, 0.36)
      // C: the jar rises out, the carton falls away, the camera moves in
      .to(
        jar.group.position,
        { x: F.jarC.x, y: F.jarC.y, duration: 0.2, ease: "power2.out" },
        0.38,
      )
      .to(
        mo,
        { v: 1, duration: 0.18, onUpdate: () => (jar.motion = mo.v) },
        0.42,
      )
      .to(
        box.group.position,
        { y: -box.height / 2 - 6, duration: 0.22, ease: "power2.in" },
        0.4,
      )
      .to(
        box.group.rotation,
        { x: 0.3, duration: 0.22, ease: "power2.in" },
        0.4,
      )
      .to(product.rotation, { y: 0, duration: 0.2 }, 0.4)
      .to(
        jar.group.rotation,
        { y: Math.PI * 2, duration: 0.22, ease: "power2.out" },
        0.38,
      )
      .to(product.scale, { x: F.c.s, y: F.c.s, z: F.c.s, duration: 0.2 }, 0.4)
      .to(product.position, { y: F.c.y, duration: 0.2 }, 0.4)
      .to(camera.position, { z: F.camC, duration: 0.2 }, 0.4)
      .fromTo($(".u2"), { autoAlpha: 0, y: 20 }, show(), 0.48)
      .to($(".u2"), { autoAlpha: 0, y: -20, duration: 0.08 }, 0.64)
      // D: the jar parks, the cap lifts, the capsules rise
      .to(jar.group.position, { x: F.jarD.x, y: F.jarD.y, duration: 0.2 }, 0.62)
      .to(product.scale, { x: F.d.s, y: F.d.s, z: F.d.s, duration: 0.2 }, 0.62)
      .to(product.position, { y: F.d.y, duration: 0.2 }, 0.62)
      .to(camera.position, { z: F.camD, duration: 0.2 }, 0.62)
      .to(jar.group.rotation, { y: Math.PI * 2 + 0.35, duration: 0.18 }, 0.62)
      .to(
        lift,
        { v: 1, duration: 0.2, onUpdate: () => jar.setLift(lift.v) },
        0.7,
      )
      .fromTo($(".u3"), { autoAlpha: 0, y: 20 }, show(), 0.78)
      .to(jar.group.rotation, { y: Math.PI * 2 + 0.2, duration: 0.18 }, 0.82);

    return {
      stage: U,
      jar,
      box,
      product,
      intro,
      timeline: tl,
      ready: entrance(section, intro, opts),
    };
  };

  // =================== CONSCIENTIOUS: gift boxes → lids → sprays stand → caps + mist → sachets ===================
  RW.unboxConscientious = function (THREE, ADDONS, section, opts) {
    opts = opts || {};
    const mob = RW.isMobile,
      q = mob ? "low" : "high";
    const $ = (s) => section.querySelector(s);
    const canvas = opts.canvas || $("canvas");
    const U = RW.scene3d(THREE, ADDONS, canvas, { fov: 28, exposure: 1.0 });
    RW.autoPause(U, canvas);
    const { scene, camera, target } = U;
    const intro = new THREE.Group(),
      product = new THREE.Group();
    scene.add(intro);
    intro.add(product);
    Studio.ground(THREE, product, 0, mob);

    const gHim = ConscPack.giftBox(THREE, {
      variant: "him",
      RB: opts.RB,
      quality: q,
    });
    const gHer = ConscPack.giftBox(THREE, {
      variant: "her",
      RB: opts.RB,
      quality: q,
    });
    gHim.group.position.set(-0.95, 0, 0);
    gHim.group.rotation.y = 0.06;
    gHer.group.position.set(0.95, 0, 0.12);
    gHer.group.rotation.y = -0.06;
    product.add(gHim.group, gHer.group);
    const bHim = SprayBottle.create(THREE, { variant: "him", quality: q });
    const bHer = SprayBottle.create(THREE, { variant: "her", quality: q });
    const pHim = new THREE.Group(),
      pHer = new THREE.Group();
    pHim.rotation.order = pHer.rotation.order = "YXZ";
    pHim.add(bHim.group);
    pHer.add(bHer.group);
    product.add(pHim, pHer);
    // lying in the cradle: cap away from the camera, label facing up
    const seat = (p, g) => {
      p.position.set(g.group.position.x, g.slotY, g.group.position.z);
      p.rotation.set(-Math.PI / 2, g.group.rotation.y, 0);
    };
    seat(pHim, gHim);
    seat(pHer, gHer);
    [bHim, bHer].forEach((b) => {
      b.motion = 0;
      b.group.visible = false;
    });
    const sHim = ConscPack.sachet(THREE, { variant: "him", RB: opts.RB });
    const sHer = ConscPack.sachet(THREE, { variant: "her", RB: opts.RB });
    product.add(sHim.group, sHer.group);

    const F = mob
      ? {
          camA: [0, 8.2, 8.4],
          tgtA: [0, -1.2, 0.6],
          camB: [0, 7.9, 8.1],
          tgtB: [0, -1.1, 0.5],
          camC: [0, 1.5, 10.6],
          tgtC: [0, 0.35, 0],
          camD: [0, 1.6, 11.6],
          tgtD: [0, 0.75, 0],
          bx: [-0.48, 0.48],
          by: 1.35,
          pxC: 0,
          pxD: 0,
          sachet: { x: 0.95, y: 2.0, z: -1.0, s: 0.78 },
          scaleA: 0.74,
          scaleC: 0.8,
        }
      : {
          camA: [0, 6.4, 6.9],
          tgtA: [0, 0.25, 0.1],
          camB: [0, 5.8, 6.3],
          tgtB: [0, 0.35, 0],
          camC: [0, 1.5, 8.6],
          tgtC: [0, 1.35, 0],
          camD: [0, 1.8, 9.8],
          tgtD: [0, 1.75, 0],
          bx: [-0.62, 0.62],
          by: 1.35,
          pxC: 1.0,
          pxD: -1.0,
          sachet: { x: 1.42, y: 1.6, z: -0.9, s: 1 },
          scaleA: 1,
          scaleC: 1,
        };
    camera.position.set(...F.camA);
    target.set(...F.tgtA);
    product.scale.setScalar(F.scaleA);
    sHim.group.rotation.set(0, 0.3, 0.05);
    sHer.group.rotation.set(0, -0.3, -0.05);
    sHim.group.scale.setScalar(F.sachet.s);
    sHer.group.scale.setScalar(F.sachet.s);
    const sa = { v: 0 };
    const placeSachets = () => {
      const e = sa.v,
        y = -3.5 + (F.sachet.y + 3.5) * e;
      sHim.group.visible = sHer.group.visible = e > 0.01;
      sHim.group.position.set(-F.sachet.x, y, F.sachet.z);
      sHer.group.position.set(F.sachet.x, y, F.sachet.z);
    };
    placeSachets();
    U.onFrame((dt) => {
      const pt = RW.isTouch ? null : RW.pointer;
      bHim.update(dt, pt);
      bHer.update(dt, pt);
      sHim.update(dt);
      sHer.update(dt);
    });
    pointerTilt(U, intro, 0.05, 0.14);

    const lid = { v: 0 },
      mo = { v: 0 },
      op = { v: 0 },
      mi = { v: 0 };
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.1,
      },
      defaults: { ease: "none" },
    });
    tl.to($(".u0"), { autoAlpha: 0, y: -20, duration: 0.08 }, 0.08)
      // B: lids lift, the essences appear in their cradles
      .to(
        lid,
        {
          v: 1,
          duration: 0.24,
          ease: "power1.inOut",
          onUpdate: () => {
            gHim.setLid(lid.v);
            gHer.setLid(Math.max(0, Math.min(1, lid.v * 1.2 - 0.2)));
            bHim.group.visible = bHer.group.visible = lid.v > 0.02;
          },
        },
        0.1,
      )
      .to(
        camera.position,
        { x: F.camB[0], y: F.camB[1], z: F.camB[2], duration: 0.24 },
        0.1,
      )
      .to(
        target,
        { x: F.tgtB[0], y: F.tgtB[1], z: F.tgtB[2], duration: 0.24 },
        0.1,
      )
      .fromTo($(".u1"), { autoAlpha: 0, y: 20 }, show(), 0.18)
      .to($(".u1"), { autoAlpha: 0, y: -20, duration: 0.08 }, 0.36)
      // C: the bottles rise and stand, the boxes fall away, the camera comes down to eye level
      .to(
        pHim.position,
        { x: F.bx[0], y: F.by, z: 0, duration: 0.2, ease: "power2.inOut" },
        0.38,
      )
      .to(
        pHer.position,
        { x: F.bx[1], y: F.by, z: 0, duration: 0.2, ease: "power2.inOut" },
        0.4,
      )
      .to(
        pHim.rotation,
        { x: 0, y: 0.15, duration: 0.2, ease: "power2.inOut" },
        0.38,
      )
      .to(
        pHer.rotation,
        { x: 0, y: -0.15, duration: 0.2, ease: "power2.inOut" },
        0.4,
      )
      .to(
        mo,
        {
          v: 1,
          duration: 0.14,
          onUpdate: () => {
            bHim.motion = bHer.motion = mo.v;
          },
        },
        0.46,
      )
      .to(
        [gHim.group.position, gHer.group.position],
        { y: -8, z: -1.5, duration: 0.16, ease: "power2.in" },
        0.4,
      )
      .to(
        camera.position,
        {
          x: F.camC[0],
          y: F.camC[1],
          z: F.camC[2],
          duration: 0.22,
          ease: "power1.inOut",
        },
        0.38,
      )
      .to(
        target,
        {
          x: F.tgtC[0],
          y: F.tgtC[1],
          z: F.tgtC[2],
          duration: 0.22,
          ease: "power1.inOut",
        },
        0.38,
      )
      .to(product.position, { x: F.pxC, duration: 0.2 }, 0.4)
      .to(
        product.scale,
        { x: F.scaleC, y: F.scaleC, z: F.scaleC, duration: 0.2 },
        0.4,
      )
      .fromTo($(".u2"), { autoAlpha: 0, y: 20 }, show(), 0.5)
      .to($(".u2"), { autoAlpha: 0, y: -20, duration: 0.08 }, 0.64)
      // D: caps lift and the essence mists
      .to(product.position, { x: F.pxD, duration: 0.18 }, 0.62)
      .to(
        camera.position,
        { x: F.camD[0], y: F.camD[1], z: F.camD[2], duration: 0.18 },
        0.62,
      )
      .to(
        target,
        { x: F.tgtD[0], y: F.tgtD[1], z: F.tgtD[2], duration: 0.18 },
        0.62,
      )
      .to(
        op,
        {
          v: 1,
          duration: 0.12,
          onUpdate: () => {
            bHim.setOpen(op.v);
            bHer.setOpen(op.v);
          },
        },
        0.64,
      )
      .to(
        mi,
        {
          v: 1,
          duration: 0.08,
          onUpdate: () => {
            bHim.setMist(mi.v);
            bHer.setMist(mi.v);
          },
        },
        0.72,
      )
      .fromTo($(".u3"), { autoAlpha: 0, y: 20 }, show(), 0.74)
      // E: the mask sachets glide in behind
      .to(
        sa,
        { v: 1, duration: 0.16, ease: "power2.out", onUpdate: placeSachets },
        0.8,
      );

    return {
      stage: U,
      product,
      intro,
      timeline: tl,
      bottles: [bHim, bHer],
      boxes: [gHim, gHer],
      sachets: [sHim, sHer],
      ready: entrance(section, intro, opts),
    };
  };
}

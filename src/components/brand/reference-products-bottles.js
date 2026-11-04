// conscientious.html's single-scene split chooser, using the existing models.
import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import Studio from "./models/studio.js";
import PurtierJar from "./models/purtier-jar.js";
import SprayBottle from "./models/spray-bottle.js";

const ADDONS = {
  EffectComposer,
  RenderPass,
  UnrealBloomPass,
  OutputPass,
  RectAreaLightUniformsLib,
};

/** @param {HTMLCanvasElement} canvas @param {() => void} ready @param {() => void} failed */
export function mountReferenceBottles(canvas, ready, failed) {
  gsap.registerPlugin(ScrollTrigger);
  const section = canvas.closest(".split-hero");
  const low = matchMedia("(max-width: 760px)").matches;
  const touch = matchMedia("(hover: none)").matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.2, 8.6);
  const abort = new AbortController();
  let renderer, post, resize, visibility, context;
  let frame = 0,
    last = 0,
    dead = false,
    visible = true,
    first = true;
  let frames = 0,
    slow = 0,
    degraded = low;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let him, her;
  let previousMobile;
  const disposePost = () => {
    post?.composer?.passes.forEach((pass) => pass.dispose?.());
    post?.composer?.dispose();
  };
  const direct = () => ({
    render: () => renderer.render(scene, camera),
    setSize() {},
  });
  function dispose() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    abort.abort();
    resize?.disconnect();
    visibility?.disconnect();
    context?.revert();
    if (him) gsap.killTweensOf(him.group.scale);
    if (her) gsap.killTweensOf(her.group.scale);
    disposePost();
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
        Object.values(material).forEach((value) => {
          if (value?.isTexture) textures.add(value);
        });
        Object.values(material.uniforms || {}).forEach((uniform) => {
          if (uniform.value?.isTexture) textures.add(uniform.value);
        });
      }
      object.shadow?.map?.dispose();
      object.shadow?.mapPass?.dispose();
    });
    scene.environment?.userData.riwayRenderTarget?.dispose();
    scene.environment?.dispose();
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    scene.clear();
    renderer?.renderLists.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  function fail() {
    failed();
    dispose();
  }
  function layout() {
    if (dead) return;
    const w = canvas.clientWidth || innerWidth,
      h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    post.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const vw =
      2 *
      camera.position.z *
      Math.tan((camera.fov * Math.PI) / 360) *
      camera.aspect;
    const mobile = matchMedia("(max-width: 760px)").matches;
    if (mobile) {
      him.group.position.set(vw * 0.3, 1.35, 0);
      her.group.position.set(vw * 0.3, -0.8, 0);
    } else {
      him.group.position.set(-vw / 4 + vw * 0.15, 0.2, 0);
      her.group.position.set(vw / 4 + vw * 0.15, 0.2, 0);
    }
    // ResizeObserver's initial delivery must not cancel the entrance tween.
    if (previousMobile !== mobile) {
      him.group.scale.setScalar(mobile ? 0.55 : 0.86);
      her.group.scale.setScalar(mobile ? 0.55 : 0.86);
      previousMobile = mobile;
    }
  }
  function tick(now) {
    if (dead || !visible || document.hidden) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    try {
      pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
      pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
      if (!degraded && frames < 90) {
        frames++;
        if (dt > 0.045) slow++;
        if (frames === 90 && slow > 45) {
          degraded = true;
          disposePost();
          post = direct();
          renderer.shadowMap.enabled = false;
          renderer.setPixelRatio(1);
          layout();
        }
      }
      him.update(dt, touch ? null : pointer);
      her.update(dt, touch ? null : pointer);
      him.group.rotation.y += dt * 0.15;
      her.group.rotation.y -= dt * 0.15;
      if (scene.environmentRotation) scene.environmentRotation.y += dt * 0.04;
      post.render();
      if (first) {
        first = false;
        ready();
      }
      frame = requestAnimationFrame(tick);
    } catch {
      fail();
    }
  }
  function resume() {
    cancelAnimationFrame(frame);
    last = 0;
    if (visible && !document.hidden && !dead)
      frame = requestAnimationFrame(tick);
  }
  try {
    renderer = Studio.renderer(THREE, canvas, low, { exposure: 1.05 });
    renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
    PurtierJar.studio(THREE, scene, renderer, ADDONS, low);
    him = SprayBottle.create(THREE, {
      variant: "him",
      quality: low ? "low" : "high",
    });
    her = SprayBottle.create(THREE, {
      variant: "her",
      quality: low ? "low" : "high",
    });
    scene.add(him.group, her.group);
    post = Studio.post(THREE, ADDONS, renderer, scene, camera, low);
    layout();
    resize = new ResizeObserver(layout);
    resize.observe(canvas);
    visibility = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      resume();
    });
    visibility.observe(canvas);
    document.addEventListener("visibilitychange", resume, {
      signal: abort.signal,
    });
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        fail();
      },
      { signal: abort.signal },
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        pointer.tx = (event.clientX / innerWidth) * 2 - 1;
        pointer.ty = (event.clientY / innerHeight) * 2 - 1;
      },
      { signal: abort.signal, passive: true },
    );
    function lean(which) {
      const s = matchMedia("(max-width: 760px)").matches ? 0.55 : 0.86;
      gsap.to(him.group.scale, {
        x: s * (which === "him" ? 1.12 : which === "her" ? 0.9 : 1),
        y: s * (which === "him" ? 1.12 : which === "her" ? 0.9 : 1),
        z: s,
        duration: 1,
        ease: "power3.out",
        overwrite: "auto",
      });
      gsap.to(her.group.scale, {
        x: s * (which === "her" ? 1.12 : which === "him" ? 0.9 : 1),
        y: s * (which === "her" ? 1.12 : which === "him" ? 0.9 : 1),
        z: s,
        duration: 1,
        ease: "power3.out",
        overwrite: "auto",
      });
    }
    for (const side of ["him", "her"]) {
      const panel = section?.querySelector(
        side === "him" ? "#sideHim" : "#sideHer",
      );
      panel?.addEventListener("pointerenter", () => lean(side), {
        signal: abort.signal,
      });
      panel?.addEventListener("pointerleave", () => lean(null), {
        signal: abort.signal,
      });
      panel?.addEventListener("focus", () => lean(side), {
        signal: abort.signal,
      });
      panel?.addEventListener("blur", () => lean(null), {
        signal: abort.signal,
      });
    }
    context = gsap.context(() => {
      const s = low ? 0.55 : 0.86;
      gsap.fromTo(
        [him.group.scale, her.group.scale],
        { x: 0.001, y: 0.001, z: 0.001 },
        {
          x: s,
          y: s,
          z: s,
          duration: 1.6,
          ease: "expo.out",
          stagger: 0.15,
          scrollTrigger: { trigger: section, start: "top 70%", once: true },
        },
      );
    }, section);
    resume();
  } catch {
    fail();
  }
  return dispose;
}

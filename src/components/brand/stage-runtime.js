// Client-only rendering adapter. Model geometry/artwork is adapted from the supplied RIWAY kit.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import Studio from "./models/studio.js";
import PurtierJar from "./models/purtier-jar.js";
import PurtierBox from "./models/purtier-box.js";
import SprayBottle from "./models/spray-bottle.js";
import ConscPack from "./models/conscientious-pack.js";

export function mountStage(host, kind, ready, failed) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  const low = matchMedia("(max-width: 760px)").matches;
  let renderer,
    environment,
    frame = 0,
    visible = true,
    dead = false,
    last = 0,
    first = true;
  let observer, resize;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);
  const target = new THREE.Vector3(0, 0, 0);
  const group = new THREE.Group();
  scene.add(group);
  const clamp = THREE.MathUtils.clamp;
  const phase = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  const mix = THREE.MathUtils.lerp;
  let update = () => {};
  const pointer = { x: 0, y: 0 };
  const surface = host.parentElement;
  const pointermove = (event) => {
    const rect = host.getBoundingClientRect();
    pointer.x = clamp(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -1,
      1,
    );
    pointer.y = clamp(
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
      -1,
      1,
    );
  };
  const leave = () => {
    pointer.x = pointer.y = 0;
  };
  function dispose() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    resize?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("webglcontextlost", lost);
    surface?.removeEventListener("pointermove", pointermove);
    surface?.removeEventListener("pointerleave", leave);
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of Array.isArray(o.material)
        ? o.material
        : o.material
          ? [o.material]
          : []) {
        materials.add(m);
        Object.values(m).forEach((v) => {
          if (v?.isTexture) textures.add(v);
        });
        Object.values(m.uniforms || {}).forEach((v) => {
          if (v.value?.isTexture) textures.add(v.value);
        });
      }
      o.shadow?.map?.dispose();
    });
    textures.forEach((t) => t.dispose());
    materials.forEach((m) => m.dispose());
    geometries.forEach((g) => g.dispose());
    environment?.userData.riwayRenderTarget?.dispose();
    environment?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    canvas.remove();
  }
  function lost(event) {
    event.preventDefault();
    failed();
    dispose();
  }
  function visibility() {
    cancelAnimationFrame(frame);
    last = 0;
    if (!document.hidden && visible && !dead)
      frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (dead || !visible || document.hidden) return;
    const dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    const section = host.closest("[data-unboxing]");
    const r = (section || host).getBoundingClientRect();
    const progress = section
      ? clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1)
      : 0;
    try {
      update(progress, dt);
      camera.lookAt(target);
      renderer.render(scene, camera);
      if (first) {
        first = false;
        ready();
      }
      frame = requestAnimationFrame(tick);
    } catch {
      failed();
      dispose();
    }
  }
  try {
    renderer = Studio.renderer(THREE, canvas, low, { exposure: 1 });
    environment = Studio.environment(THREE, renderer);
    scene.environment = environment;
    Studio.lights(THREE, scene, {}, low);
    const quality = low ? "low" : "high";
    if (kind === "jar") {
      const jar = PurtierJar.create(THREE, { quality });
      group.add(jar.group);
      camera.position.set(0, 0, low ? 7.4 : 9.5);
      group.position.y = low ? 0.15 : 0.3;
      Studio.ground(THREE, scene, low ? -1.16 : -1.01, low);
      update = (_, dt) => jar.update(dt, low ? null : pointer);
    } else if (kind === "purtier") {
      const box = PurtierBox.create(THREE, { quality, RoundedBoxGeometry });
      const jar = PurtierJar.create(THREE, { quality });
      group.add(box.group, jar.group);
      jar.motion = 0;
      jar.liftHeight = 1.15;
      camera.position.set(0, 0.5, 12);
      group.position.y = 0;
      update = (p, dt) => {
        const open = phase(p, 0.1, 0.35),
          rise = phase(p, 0.36, 0.62);
        box.setLid(open);
        box.group.position.y = -box.height / 2 - rise * 6;
        box.group.rotation.x = rise * 0.3;
        jar.group.visible = open > 0.02;
        jar.group.position.y = mix(box.jarY - box.height / 2, 0, rise);
        jar.group.rotation.y = rise * Math.PI * 2;
        jar.setLift(phase(p, 0.7, 0.95));
        jar.update(dt, null);
        group.rotation.y = 0.35 * (1 - rise);
        camera.position.z = mix(12, 11.2, rise);
        target.y = 0.45 * phase(p, 0.65, 0.9);
      };
    } else {
      const boxes = [],
        bottles = [],
        pivots = [],
        sachets = [];
      for (const [i, variant] of ["him", "her"].entries()) {
        const x = i === 0 ? -0.95 : 0.95;
        const box = ConscPack.giftBox(THREE, {
          variant,
          quality,
          RB: RoundedBoxGeometry,
        });
        box.group.position.x = x;
        boxes.push(box);
        group.add(box.group);
        const bottle = SprayBottle.create(THREE, { variant, quality });
        bottle.motion = 0;
        const pivot = new THREE.Group();
        pivot.add(bottle.group);
        group.add(pivot);
        bottles.push(bottle);
        pivots.push(pivot);
        const sachet = ConscPack.sachet(THREE, {
          variant,
          RB: RoundedBoxGeometry,
        });
        sachets.push(sachet);
        group.add(sachet.group);
      }
      update = (p, dt) => {
        const open = phase(p, 0.08, 0.34),
          rise = phase(p, 0.36, 0.62),
          end = phase(p, 0.76, 0.98);
        boxes.forEach((box, i) => {
          const x = i === 0 ? -0.95 : 0.95,
            b = bottles[i],
            pivot = pivots[i],
            s = sachets[i];
          box.setLid(open);
          box.group.position.y = -rise * 8;
          b.group.visible = open > 0.02;
          b.setOpen(phase(p, 0.65, 0.82));
          b.setMist(phase(p, 0.82, 0.95));
          b.update(dt, null);
          pivot.position.set(
            mix(x, x * 0.7, rise),
            mix(box.slotY, 1.15, rise),
            0,
          );
          pivot.rotation.set(
            (-Math.PI / 2) * (1 - rise),
            i === 0 ? 0.15 : -0.15,
            0,
          );
          s.group.visible = end > 0;
          s.group.position.set(x * 1.5, mix(-3, 1.5, end), -1);
          s.update(dt);
        });
        camera.position.set(0, mix(6.4, 1.8, rise), mix(9, 11.6, rise));
        target.y = mix(0.2, 1, rise);
      };
    }
    resize = new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      if (kind === "jar") {
        // Keep the jar inside the goal ring on tall tablet viewports too.
        const diameter = clamp(
          Math.min(innerWidth, innerHeight) * 0.62,
          430,
          690,
        );
        const desiredHeight = low ? height * 0.7 : diameter * 0.78;
        camera.position.z =
          (2.6 * height) /
          (2 *
            Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
            desiredHeight);
        group.position.y = low ? 0.15 : (0.07 * height * 2.6) / desiredHeight;
      }
      camera.updateProjectionMatrix();
    });
    resize.observe(host);
    observer = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      visibility();
    });
    observer.observe(host);
    document.addEventListener("visibilitychange", visibility);
    canvas.addEventListener("webglcontextlost", lost);
    if (!low) {
      surface?.addEventListener("pointermove", pointermove, { passive: true });
      surface?.addEventListener("pointerleave", leave);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}

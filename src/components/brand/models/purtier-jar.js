import Studio from "./studio.js";
/* ------------------------------------------------------------------
   PURTIER jar — procedural three.js model with photographic materials
   Proportions traced from the 7th Edition product photo:
     cap        ~37% of height, brushed gunmetal, rounded top edge.
                Hollow: inner wall, thread ridges and a cream seal liner,
                so the underside reads correctly when it lifts.
     body       ~56%, clearcoated porcelain-white with 24 wide flutes,
                recessed label panel, embossed red serif wordmark
     neck       open mouth with a rounded lip and thread ridges
     base ring  ~7%, dark metal, "7TH EDITION"
     capsules   deep red translucent softgels that rise out of the mouth
   Classic script (not a module) so it also works from file://.
   Usage:
     const jar = PurtierJar.create(THREE, { quality: 'high' | 'low' });
     scene.add(jar.group);
     jar.setLift(t)          // 0..1 lifts the cap, reveals capsules
     jar.update(dt, pointer) // idle float + tilt toward the pointer
   ------------------------------------------------------------------ */

const H = 2.6,
  R = 0.62;
const CAP_H = H * 0.37,
  BASE_H = H * 0.07,
  BODY_H = H - CAP_H - BASE_H;
const CAP_WALL = 0.045;

function makeLabelTexture(THREE, text, red) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(0,0,0,0.05)";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(0,0,0,0.12)";
  g.lineWidth = 6;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate(Math.PI / 2);
  g.fillStyle = red;
  g.font = '700 196px "Cinzel", "Cormorant Garamond", Georgia, serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "26px";
  g.fillText(text, 13, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const b = document.createElement("canvas");
  b.width = 256;
  b.height = 1024;
  const bg = b.getContext("2d");
  bg.fillStyle = "#6a6a6a";
  bg.fillRect(0, 0, 256, 1024);
  bg.fillStyle = "#5a5a5a";
  bg.fillRect(12, 12, 232, 1000);
  bg.save();
  bg.translate(128, 512);
  bg.rotate(Math.PI / 2);
  bg.fillStyle = "#ffffff";
  bg.font = '700 196px "Cinzel", "Cormorant Garamond", Georgia, serif';
  bg.textAlign = "center";
  bg.textBaseline = "middle";
  bg.letterSpacing = "26px";
  bg.fillText(text, 13, 0);
  bg.restore();
  const bump = new THREE.CanvasTexture(b);
  return { tex, bump };
}

function makeEditionTexture(THREE, text) {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "#2a2b2f");
  gr.addColorStop(0.5, "#17181b");
  gr.addColorStop(1, "#0f1012");
  g.fillStyle = gr;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#e9e6df";
  g.font =
    '500 54px "Inter Tight", "Inter", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = "14px";
  g.fillText(text, c.width * 0.5, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// dark-to-light vertical gradient for the inside of the mouth (fake ambient occlusion)
function shadowGradient(THREE, top, bottom) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBodyGeometry(THREE, radial, heightSeg, flutes) {
  const pos = [],
    uv = [],
    idx = [];
  const labelHalf = 0.42;
  for (let j = 0; j <= heightSeg; j++) {
    const v = j / heightSeg,
      y = -BODY_H / 2 + v * BODY_H;
    for (let i = 0; i <= radial; i++) {
      const u = i / radial,
        th = u * Math.PI * 2;
      const f = Math.max(0, Math.cos(flutes * th));
      let r = R * (0.955 + 0.045 * Math.pow(f, 0.35));
      const a = Math.atan2(Math.sin(th), Math.cos(th)),
        d = Math.abs(a - Math.PI / 2);
      if (d < labelHalf && v > 0.17 && v < 0.86)
        r = Math.min(r, (R * 0.935) / Math.cos(d));
      const edge = Math.min(1, Math.min(v, 1 - v) / 0.035);
      r *= 0.985 + 0.015 * Math.sqrt(edge);
      pos.push(r * Math.cos(th), y, r * Math.sin(th));
      uv.push(u * 6, v * 2);
    }
  }
  for (let j = 0; j < heightSeg; j++)
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i,
        b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// outer shell of the cap: starts at the inner lip so the bottom is an open ring, not a disc
function makeCapGeometry(THREE, radial) {
  const pts = [],
    r = R,
    h = CAP_H,
    edge = 0.1;
  pts.push(
    new THREE.Vector2(r - CAP_WALL, -h / 2),
    new THREE.Vector2(r * 0.99, -h / 2),
    new THREE.Vector2(r, -h / 2 + 0.02),
    new THREE.Vector2(r, h / 2 - edge),
  );
  for (let i = 1; i <= 10; i++) {
    const t = ((i / 10) * Math.PI) / 2;
    pts.push(
      new THREE.Vector2(
        r - edge + edge * Math.cos(t),
        h / 2 - edge + edge * Math.sin(t),
      ),
    );
  }
  pts.push(new THREE.Vector2(0, h / 2));
  return new THREE.LatheGeometry(pts, radial);
}
// inside of the cap: ceiling then wall, traced so the faces look inward
function makeCapInnerGeometry(THREE, radial) {
  const r = R - CAP_WALL,
    h = CAP_H,
    ceil = h / 2 - 0.07;
  const pts = [
    new THREE.Vector2(0, ceil),
    new THREE.Vector2(r - 0.03, ceil),
    new THREE.Vector2(r, ceil - 0.03),
    new THREE.Vector2(r, -h / 2),
  ];
  return new THREE.LatheGeometry(pts, radial);
}

function create(THREE, opts) {
  opts = opts || {};
  const hi = opts.quality !== "low";
  const radial = hi ? 192 : 96,
    flutes = 24;
  const red = opts.red || "#9e1225";
  const S = Studio;

  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.add(rig);

  // --- materials
  const roughNoise = S ? S.noiseTexture(THREE, 128, 0.9, 0.18, 1) : null;
  if (roughNoise) roughNoise.repeat.set(4, 4);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5f3ef,
    roughness: 0.3,
    metalness: 0,
    roughnessMap: roughNoise,
    clearcoat: 1,
    clearcoatRoughness: 0.14,
    sheen: 0.4,
    sheenRoughness: 0.55,
    sheenColor: 0xfff5e8,
    ior: 1.5,
    specularIntensity: 1,
    envMapIntensity: 1.0,
  });
  const brushed = S ? S.brushedTexture(THREE, 512) : null;
  const capMat = new THREE.MeshPhysicalMaterial({
    color: 0x4a4d53,
    metalness: 1,
    roughness: 0.34,
    roughnessMap: brushed,
    anisotropy: hi ? 0.75 : 0,
    anisotropyRotation: Math.PI / 2,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.35,
  });
  const capInnerMat = new THREE.MeshStandardMaterial({
    color: 0x26272a,
    metalness: 0.55,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0xe6e1d7,
    roughness: 0.92,
  });
  const baseMat = new THREE.MeshPhysicalMaterial({
    map: makeEditionTexture(THREE, opts.edition || "7TH EDITION"),
    roughness: 0.42,
    metalness: 0.7,
    roughnessMap: brushed,
    anisotropy: hi ? 0.4 : 0,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: 1.1,
  });

  // --- body
  const body = new THREE.Mesh(
    makeBodyGeometry(THREE, radial, hi ? 32 : 10, flutes),
    bodyMat,
  );
  body.position.y = -H / 2 + BASE_H + BODY_H / 2;
  body.castShadow = true;
  rig.add(body);
  const shoulderY = body.position.y + BODY_H / 2;
  // shoulder: a ring around the neck rather than a full disc
  const NECK_R = R * 0.86;
  const shoulder = new THREE.Mesh(
    new THREE.RingGeometry(NECK_R - 0.01, R * 0.985, radial, 1),
    bodyMat,
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.y = shoulderY;
  rig.add(shoulder);

  // label (embossed)
  const lab = makeLabelTexture(THREE, opts.text || "PURTIER", red);
  const labelMat = new THREE.MeshPhysicalMaterial({
    map: lab.tex,
    bumpMap: lab.bump,
    bumpScale: 0.6,
    transparent: true,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 0.58, BODY_H * 0.62),
    labelMat,
  );
  label.position.set(0, body.position.y - BODY_H * 0.01, R * 0.936 + 0.004);
  rig.add(label);

  // --- base ring
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.985, R * 0.975, BASE_H, radial, 1),
    baseMat,
  );
  base.position.y = -H / 2 + BASE_H / 2;
  base.rotation.y = Math.PI;
  base.castShadow = true;
  rig.add(base);

  // --- neck: open mouth with a rounded lip, thread ridges, shadowed interior
  const NECK_H = CAP_H * 0.5,
    rimY = shoulderY + NECK_H;
  const neckMat = new THREE.MeshPhysicalMaterial({
    color: 0xefece5,
    roughness: 0.45,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  });
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(NECK_R, NECK_R, NECK_H, 96, 1, true),
    neckMat,
  );
  neck.position.y = shoulderY + NECK_H / 2;
  rig.add(neck);
  const lip = new THREE.Mesh(
    new THREE.TorusGeometry(NECK_R - 0.02, 0.022, 12, 96),
    neckMat,
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = rimY;
  rig.add(lip);
  [0.3, 0.62].forEach((f) => {
    const th = new THREE.Mesh(
      new THREE.TorusGeometry(NECK_R + 0.004, 0.011, 8, 96),
      neckMat,
    );
    th.rotation.x = Math.PI / 2;
    th.position.y = shoulderY + NECK_H * f;
    rig.add(th);
  });
  const MOUTH_R = NECK_R - 0.04,
    MOUTH_D = 0.6;
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(MOUTH_R, MOUTH_R, MOUTH_D, 96, 1, true),
    new THREE.MeshStandardMaterial({
      map: shadowGradient(THREE, "#cfc9be", "#3a3532"),
      roughness: 0.85,
      side: THREE.BackSide,
    }),
  );
  inner.position.y = rimY - MOUTH_D / 2;
  rig.add(inner);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(MOUTH_R, 64),
    new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = rimY - MOUTH_D;
  rig.add(floor);

  // --- cap (lifts): hollow shell, inner wall, thread ridges, seal liner
  const capPivot = new THREE.Group();
  const cap = new THREE.Mesh(makeCapGeometry(THREE, radial), capMat);
  cap.castShadow = true;
  capPivot.add(cap);
  const capInner = new THREE.Mesh(
    makeCapInnerGeometry(THREE, hi ? 96 : 48),
    capInnerMat,
  );
  capPivot.add(capInner);
  const ceilY = CAP_H / 2 - 0.07;
  const liner = new THREE.Mesh(
    new THREE.CircleGeometry(R - CAP_WALL - 0.03, 64),
    linerMat,
  );
  liner.rotation.x = Math.PI / 2;
  liner.position.y = ceilY - 0.004;
  capPivot.add(liner);
  const linerRing = new THREE.Mesh(
    new THREE.RingGeometry((R - CAP_WALL) * 0.62, (R - CAP_WALL) * 0.66, 64),
    new THREE.MeshStandardMaterial({ color: 0xcfc9bd, roughness: 0.9 }),
  );
  linerRing.rotation.x = Math.PI / 2;
  linerRing.position.y = ceilY - 0.006;
  capPivot.add(linerRing);
  [-0.2, -0.05, 0.1].forEach((y) => {
    const rr = new THREE.Mesh(
      new THREE.TorusGeometry(R - CAP_WALL - 0.004, 0.009, 6, 96),
      capInnerMat,
    );
    rr.rotation.x = Math.PI / 2;
    rr.position.y = y;
    capPivot.add(rr);
  });
  capPivot.position.y = H / 2 - CAP_H / 2;
  rig.add(capPivot);

  // --- capsules: deep red translucent softgels, start inside the mouth
  const capsules = new THREE.Group();
  const capMatRed = new THREE.MeshPhysicalMaterial(
    hi
      ? {
          color: 0x9a1324,
          roughness: 0.1,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          ior: 1.42,
          transmission: 0.28,
          thickness: 0.22,
          attenuationColor: new THREE.Color(0x5c0812),
          attenuationDistance: 0.25,
          specularIntensity: 1,
          envMapIntensity: 1.3,
        }
      : {
          color: 0x8e1220,
          roughness: 0.15,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          emissive: 0x2a0407,
          emissiveIntensity: 0.3,
        },
  );
  const capsuleGeo = new THREE.CapsuleGeometry(0.052, 0.13, 8, 16);
  const N = hi ? 22 : 12,
    seeds = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(capsuleGeo, capMatRed);
    m.castShadow = true;
    const ang = (i / N) * Math.PI * 2 + (i % 3) * 0.7,
      rad = 0.08 + (((i * 37) % 100) / 100) * MOUTH_R * 0.7;
    m.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    m.rotation.set(
      Math.sin(i) * 1.2,
      Math.cos(i * 2.1) * 1.4,
      Math.sin(i * 0.7) * 1.1,
    );
    m.userData.seed = {
      ang,
      rad,
      phase: i * 1.37,
      h: 0.25 + (((i * 53) % 100) / 100) * 0.9,
    };
    capsules.add(m);
    seeds.push(m);
  }
  capsules.position.y = rimY;
  capsules.visible = false;
  rig.add(capsules);

  // --- state
  let lift = 0,
    t = 0;
  const tilt = new THREE.Vector2();
  const api = {
    group,
    rig,
    body,
    cap: capPivot,
    base,
    label,
    capsules,
    height: H,
    radius: R,
    motion: 1, // 0..1 scales the idle float and pointer tilt (0 while boxed)
    liftHeight: 1.35, // how far the cap rises when fully open
    setLift(v) {
      lift = Math.max(0, Math.min(1, v));
      const e = lift * lift * (3 - 2 * lift);
      capPivot.position.y = H / 2 - CAP_H / 2 + e * api.liftHeight;
      capPivot.rotation.z = e * 0.18;
      capPivot.rotation.x = e * -0.12;
      capsules.visible = lift > 0.02;
    },
    getLift() {
      return lift;
    },
    lowQuality() {
      capMatRed.transmission = 0;
      capMatRed.thickness = 0;
      capMatRed.emissive = new THREE.Color(0x2a0407);
      capMatRed.emissiveIntensity = 0.3;
      capMatRed.needsUpdate = true;
      capMat.anisotropy = 0;
      capMat.needsUpdate = true;
    },
    update(dt, pointer) {
      t += dt;
      rig.position.y = Math.sin(t * 0.9) * 0.05 * api.motion;
      if (pointer) {
        tilt.x += (pointer.y * 0.18 - tilt.x) * Math.min(1, dt * 3);
        tilt.y += (pointer.x * 0.35 - tilt.y) * Math.min(1, dt * 3);
      }
      rig.rotation.x = -tilt.x * api.motion;
      rig.rotation.z = tilt.y * 0.25 * api.motion;
      if (capsules.visible) {
        for (const m of seeds) {
          const s = m.userData.seed,
            rise = lift * s.h * (0.6 + 0.4 * Math.sin(t * 0.8 + s.phase));
          m.position.y = -0.22 + rise + lift * 0.3;
          m.position.x = Math.cos(s.ang + t * 0.15) * s.rad * (1 + lift * 0.6);
          m.position.z = Math.sin(s.ang + t * 0.15) * s.rad * (1 + lift * 0.6);
          m.rotation.y += dt * 0.6;
          m.rotation.x += dt * 0.3;
        }
      }
    },
  };
  api.setLift(0);
  return api;
}

// Studio lighting + environment. `env` may be RoomEnvironment (legacy) or an addons object.
function studio(THREE, scene, renderer, env, low) {
  const S = Studio;
  const addons =
    typeof env === "function" ? { RoomEnvironment: env } : env || {};
  if (S) scene.environment = S.environment(THREE, renderer);
  else if (addons.RoomEnvironment) {
    const p = new THREE.PMREMGenerator(renderer);
    scene.environment = p.fromScene(new addons.RoomEnvironment(), 0.04).texture;
    p.dispose();
  }
  if (scene.environmentRotation) scene.environmentRotation.set(0, -0.6, 0);
  const lights = S
    ? S.lights(THREE, scene, addons, low)
    : (function () {
        const key = new THREE.SpotLight(
          0xffffff,
          60,
          20,
          Math.PI / 5,
          0.6,
          1.4,
        );
        key.position.set(3, 5, 4);
        const rim = new THREE.DirectionalLight(0xd8e4ff, 1.6);
        rim.position.set(-4, 2, -3);
        scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));
        return { key, rim };
      })();
  return lights;
}

const PurtierJar = { create, studio, H, R };

export default PurtierJar;

import Studio from "./studio.js";
/* CONSCIENTIOUS Essence Spray — procedural three.js bottle (classic script)
   Matched to the campaign photography:
     HIM  smoky black glass fading to charcoal, gloss-black cap, thin gold ring, silver wordmark
     HER  frosted blush glass, metallic pink cap, silver ring, pale wordmark
   The cap is a hollow shell with a seal liner; under it sits a pump
   (stem + actuator with an orifice). When opened, a fine essence mist
   leaves the orifice (GPU points, gold for HIM, rose for HER).
   Usage:
     const b = SprayBottle.create(THREE, { variant:'him' | 'her', quality });
     scene.add(b.group);
     b.setOpen(t)   // 0..1 lifts the cap
     b.setMist(t)   // 0..1 mist intensity
     b.update(dt, pointer)
     b.motion = 0..1 // scales idle float and pointer tilt */

const H = 2.7,
  R = 0.33;
const CAP_H = H * 0.3,
  BODY_H = H * 0.7;
const TOP = -H / 2 + BODY_H; // body top
const CAP_BASE = TOP + 0.05; // cap sits on the collar
const WALL = 0.03;

function gradientTexture(THREE, stops) {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function labelTexture(THREE, color, sub) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 256, 1024);
  g.save();
  g.translate(128, 430);
  g.rotate(Math.PI / 2);
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '400 64px "Inter Tight", "Inter", Arial, sans-serif';
  g.letterSpacing = "16px";
  g.fillText("CONSCIENTIOUS", 8, 0);
  g.restore();
  g.fillStyle = color;
  g.textAlign = "center";
  g.globalAlpha = 0.85;
  g.font = '400 22px "Inter Tight", "Inter", Arial, sans-serif';
  g.letterSpacing = "6px";
  g.fillText("2ND EDITION", 131, 930);
  g.fillText(sub, 131, 962);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function mistPoints(THREE, n, color, side) {
  const pos = new Float32Array(n * 3),
    dir = new Float32Array(n * 3),
    seed = new Float32Array(n);
  const main = new THREE.Vector3(side, 0.32, 0.22).normalize(),
    d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    d.copy(main)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.6,
        ),
      )
      .normalize()
      .multiplyScalar(0.7 + Math.random() * 0.6);
    dir[i * 3] = d.x;
    dir[i * 3 + 1] = d.y;
    dir[i * 3 + 2] = d.z;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("dir", new THREE.BufferAttribute(dir, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uT: { value: 0 },
      uAmt: { value: 0 },
      uPx: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
        attribute vec3 dir; attribute float seed;
        uniform float uT, uAmt, uPx; varying float vA;
        void main(){
          float life = fract(uT * 0.42 + seed);
          vec3 p = dir * life * 2.0 + vec3(0.0, life * life * 0.4, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (4.0 + seed * 7.0) * uPx * (0.5 + life * 2.6) * (6.0 / -mv.z);
          vA = uAmt * smoothstep(0.0, 0.05, life) * pow(1.0 - life, 1.4);
        }`,
    fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 11.0) * vA * 0.55;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function create(THREE, opts) {
  opts = opts || {};
  const him = opts.variant !== "her";
  const hi = opts.quality !== "low";
  const radial = hi ? 96 : 48;
  const side = him ? -1 : 1; // HIM sprays to the left, HER to the right
  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.add(rig);

  const S = Studio;
  const brushed = S ? S.brushedTexture(THREE, 512) : null;
  const grain = S ? S.noiseTexture(THREE, 128, 0.9, 0.16, 1) : null;
  if (grain) grain.repeat.set(3, 6);
  const bodyMat = him
    ? new THREE.MeshPhysicalMaterial({
        map: gradientTexture(THREE, [
          [0, "#121214"],
          [0.55, "#25262a"],
          [1, "#4a4b50"],
        ]),
        roughness: 0.4,
        roughnessMap: grain,
        metalness: 0.15,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
        envMapIntensity: 1.1,
      })
    : new THREE.MeshPhysicalMaterial({
        map: gradientTexture(THREE, [
          [0, "#f6d2da"],
          [1, "#e8b4c2"],
        ]),
        roughness: 0.5,
        roughnessMap: grain,
        metalness: 0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.4,
        sheen: 0.15,
        sheenRoughness: 0.6,
        sheenColor: 0xfff0f3,
        ior: 1.45,
        envMapIntensity: 0.65,
      });
  const capMat = him
    ? new THREE.MeshPhysicalMaterial({
        color: 0x0b0b0d,
        roughness: 0.18,
        metalness: 0.6,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.2,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xe3a2b6,
        roughness: 0.26,
        roughnessMap: brushed,
        metalness: 1,
        anisotropy: hi ? 0.7 : 0,
        anisotropyRotation: Math.PI / 2,
        envMapIntensity: 1.3,
      });
  const capInnerMat = new THREE.MeshStandardMaterial({
    color: him ? 0x18181a : 0xb98593,
    roughness: 0.6,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0xece8e2,
    roughness: 0.9,
  });
  const collarMat = new THREE.MeshPhysicalMaterial({
    color: him ? 0xc9a24c : 0xd9d9dc,
    roughness: 0.22,
    metalness: 1,
    envMapIntensity: 1.4,
  });
  const pumpMat = new THREE.MeshPhysicalMaterial({
    color: him ? 0x111113 : 0xf4f1ee,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  });

  // body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, BODY_H, radial, 1),
    bodyMat,
  );
  body.position.y = -H / 2 + BODY_H / 2;
  body.castShadow = true;
  rig.add(body);
  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 0.96, 0.06, radial, 1),
    bodyMat,
  );
  bottom.position.y = -H / 2 + 0.03;
  rig.add(bottom);
  const shoulder = new THREE.Mesh(new THREE.CircleGeometry(R, radial), bodyMat);
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.y = TOP;
  rig.add(shoulder);
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.05, radial, 1),
    collarMat,
  );
  collar.position.y = TOP + 0.025;
  rig.add(collar);

  // pump: stem, actuator and orifice (hidden under the cap until it lifts)
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.16, R * 0.18, 0.16, 32),
    collarMat,
  );
  stem.position.y = CAP_BASE + 0.08;
  rig.add(stem);
  const actuator = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.42, R * 0.44, 0.24, 48),
    pumpMat,
  );
  actuator.position.y = CAP_BASE + 0.16 + 0.12;
  actuator.castShadow = true;
  rig.add(actuator);
  const actTop = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.42, 48),
    pumpMat,
  );
  actTop.rotation.x = -Math.PI / 2;
  actTop.position.y = CAP_BASE + 0.4;
  rig.add(actTop);
  const orifice = new THREE.Mesh(
    new THREE.CircleGeometry(0.026, 16),
    new THREE.MeshBasicMaterial({ color: 0x050505 }),
  );
  orifice.rotation.y = (side * Math.PI) / 2;
  orifice.position.set(
    side * (R * 0.43 + 0.002),
    actuator.position.y + 0.02,
    0,
  );
  rig.add(orifice);

  // cap: hollow shell + inner wall + liner
  const pts = [
    new THREE.Vector2(R - WALL, 0),
    new THREE.Vector2(R, 0),
    new THREE.Vector2(R, CAP_H - 0.07),
  ];
  for (let i = 1; i <= 6; i++) {
    const t = ((i / 6) * Math.PI) / 2;
    pts.push(
      new THREE.Vector2(
        R - 0.07 + 0.07 * Math.cos(t),
        CAP_H - 0.07 + 0.07 * Math.sin(t),
      ),
    );
  }
  pts.push(new THREE.Vector2(0, CAP_H));
  const capPivot = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.LatheGeometry(pts, radial), capMat);
  cap.castShadow = true;
  capPivot.add(cap);
  const ceil = CAP_H - 0.06;
  const inner = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, ceil),
        new THREE.Vector2(R - WALL - 0.02, ceil),
        new THREE.Vector2(R - WALL, ceil - 0.02),
        new THREE.Vector2(R - WALL, 0),
      ],
      hi ? 64 : 32,
    ),
    capInnerMat,
  );
  capPivot.add(inner);
  const liner = new THREE.Mesh(
    new THREE.CircleGeometry(R - WALL - 0.02, 48),
    linerMat,
  );
  liner.rotation.x = Math.PI / 2;
  liner.position.y = ceil - 0.004;
  capPivot.add(liner);
  capPivot.position.y = CAP_BASE;
  rig.add(capPivot);
  const capRest = CAP_BASE;

  // label
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(R * 0.9, BODY_H * 0.92),
    new THREE.MeshStandardMaterial({
      map: labelTexture(
        THREE,
        him ? "#cfcbc4" : "#fff6f8",
        him ? "FOR HIM" : "FOR HER",
      ),
      transparent: true,
      roughness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  label.position.set(0, body.position.y, R + 0.003);
  rig.add(label);

  // mist from the orifice
  const mist = mistPoints(
    THREE,
    hi ? 900 : 360,
    him ? "#cfa95a" : "#d9879d",
    side,
  );
  mist.position.copy(orifice.position);
  rig.add(mist);

  let t = 0,
    open = 0;
  const tilt = new THREE.Vector2();
  const api = {
    group,
    rig,
    body,
    cap: capPivot,
    height: H,
    radius: R,
    motion: 1,
    setOpen(v) {
      open = Math.max(0, Math.min(1, v));
      const e = open * open * (3 - 2 * open);
      capPivot.position.y = capRest + e * 0.75;
      capPivot.position.x = -side * e * 0.14;
      capPivot.rotation.z = side * e * 0.28;
    },
    setMist(v) {
      mist.material.uniforms.uAmt.value = Math.max(0, Math.min(1, v));
    },
    update(dt, pointer) {
      t += dt;
      mist.material.uniforms.uT.value = t;
      const m = api.motion;
      rig.position.y = Math.sin(t * 0.8 + (him ? 0 : 1.6)) * 0.045 * m;
      if (pointer) {
        tilt.x += (pointer.y * 0.16 - tilt.x) * Math.min(1, dt * 3);
        tilt.y += (pointer.x * 0.3 - tilt.y) * Math.min(1, dt * 3);
      }
      rig.rotation.x = -tilt.x * m;
      rig.rotation.z = tilt.y * 0.22 * m;
    },
  };
  api.setOpen(0);
  return api;
}
const SprayBottle = { create, H, R };

export default SprayBottle;

import Studio from "./studio.js";
/* ------------------------------------------------------------------
   PURTIER carton — procedural three.js packaging (classic script)
   From the product photos: a tall burgundy carton with a brushed
   wood-grain satin finish and a silver serif "PURTIER" running
   vertically on the lid. The base tray carries "7TH EDITION", a
   bevelled silver frame, and a grey foam insert with a round well the
   jar sits down into (its dark base band hidden, as in the photos).
   Usage:
     const box = PurtierBox.create(THREE, { quality, RoundedBoxGeometry });
     parent.add(box.group);            // origin = bottom centre of the carton
     jar.group.position.y = box.jarY;  // jar centre when nested in the tray
     box.setLid(t)                     // 0 closed .. 1 lifted clear
   ------------------------------------------------------------------ */

const W = 1.9,
  D = 1.7,
  H = 3.4,
  BASE_H = 0.42,
  SEAM = 0.004;
const LID_H = H - BASE_H - SEAM;
const FRAME = 0.14; // width of the silver frame on the tray
const SINK = 0.17; // jar bottom sits this far below the tray top
const HOLE_R = 0.64; // foam well radius (jar radius is 0.62)

function grainTexture(THREE, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#561a26";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * 2.4; i++) {
    const x = Math.random() * w,
      len = h * (0.3 + Math.random() * 0.9),
      y = Math.random() * h - len / 2;
    const light = Math.random() > 0.5;
    g.strokeStyle = light
      ? `rgba(122,52,68,${0.03 + Math.random() * 0.1})`
      : `rgba(38,8,15,${0.03 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 2, y + len);
    g.stroke();
  }
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    img.data[i] += n;
    img.data[i + 1] += n * 0.6;
    img.data[i + 2] += n * 0.7;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function textTexture(THREE, text, font, w, h, vertical, color, spacing) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2);
  if (vertical) g.rotate(Math.PI / 2);
  g.fillStyle = color;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.letterSpacing = spacing + "px";
  g.fillText(text, spacing / 2, 0);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function rectShape(THREE, w, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -d / 2);
  s.lineTo(w / 2, -d / 2);
  s.lineTo(w / 2, d / 2);
  s.lineTo(-w / 2, d / 2);
  s.lineTo(-w / 2, -d / 2);
  return s;
}
// flat silver frame: outer rect with a rect hole, bevelled, lying in XZ
function frameGeometry(THREE, w, d, inset, depth) {
  const s = rectShape(THREE, w, d);
  const iw = w - inset * 2,
    id = d - inset * 2,
    hole = new THREE.Path();
  hole.moveTo(-iw / 2, -id / 2);
  hole.lineTo(-iw / 2, id / 2);
  hole.lineTo(iw / 2, id / 2);
  hole.lineTo(iw / 2, -id / 2);
  hole.lineTo(-iw / 2, -id / 2);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.018,
    bevelSegments: 3,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}
// foam slab with a round well
function foamGeometry(THREE, w, d, r, depth) {
  const s = rectShape(THREE, w, d),
    hole = new THREE.Path();
  hole.absarc(0, 0, r, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: false,
    curveSegments: 64,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}

function create(THREE, opts) {
  opts = opts || {};
  const hi = opts.quality !== "low";
  const RB = opts.RoundedBoxGeometry;
  const S = Studio;
  const box = (w, h, d) =>
    RB ? new RB(w, h, d, 3, 0.018) : new THREE.BoxGeometry(w, h, d);
  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.add(rig);

  const grain = grainTexture(THREE, hi ? 1024 : 512, hi ? 1024 : 512);
  const rough = S ? S.noiseTexture(THREE, 128, 0.88, 0.2, 1) : null;
  if (rough) rough.repeat.set(3, 3);
  const brushed = S ? S.brushedTexture(THREE, 256) : null;
  const wood = new THREE.MeshPhysicalMaterial({
    map: grain,
    roughness: 0.52,
    roughnessMap: rough,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.38,
    sheen: 0.12,
    sheenColor: 0xffd7df,
    envMapIntensity: 0.8,
  });
  const inside = new THREE.MeshStandardMaterial({
    color: 0x1e0a0f,
    roughness: 0.9,
  });
  const silver = new THREE.MeshPhysicalMaterial({
    color: 0xcfcbc5,
    metalness: 1,
    roughness: 0.34,
    roughnessMap: brushed,
    envMapIntensity: 1.1,
  });
  const foam = new THREE.MeshStandardMaterial({
    color: 0x6f6f72,
    roughness: 1,
  });
  const well = new THREE.MeshStandardMaterial({
    color: 0x252527,
    roughness: 1,
  });

  // ---------- base tray ----------
  const base = new THREE.Group();
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z. The top reads as the dark bottom of the well.
  const body = new THREE.Mesh(box(W, BASE_H, D), [
    wood,
    wood,
    well,
    wood,
    wood,
    wood,
  ]);
  body.position.y = BASE_H / 2;
  body.castShadow = true;
  base.add(body);
  const frame = new THREE.Mesh(
    frameGeometry(THREE, W - 0.04, D - 0.04, FRAME, 0.02),
    silver,
  );
  frame.position.y = BASE_H - 0.008;
  frame.castShadow = true;
  base.add(frame);
  const foamMesh = new THREE.Mesh(
    foamGeometry(
      THREE,
      W - 2 * FRAME + 0.02,
      D - 2 * FRAME + 0.02,
      HOLE_R,
      0.05,
    ),
    foam,
  );
  foamMesh.position.y = BASE_H - 0.035;
  base.add(foamMesh);
  const ed = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.14),
    new THREE.MeshPhysicalMaterial({
      map: textTexture(
        THREE,
        "7TH EDITION",
        '500 54px "Inter Tight","Inter",Arial,sans-serif',
        1024,
        150,
        false,
        "#e2ddd6",
        16,
      ),
      transparent: true,
      metalness: 0.6,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  ed.position.set(0, BASE_H * 0.5, D / 2 + 0.002);
  base.add(ed);
  rig.add(base);

  // ---------- lid: same footprint, sits on the tray with a hairline seam ----------
  const lid = new THREE.Group();
  const lidBody = new THREE.Mesh(box(W, LID_H, D), [
    wood,
    wood,
    wood,
    inside,
    wood,
    wood,
  ]);
  lidBody.castShadow = true;
  lid.add(lidBody);
  const wm = new THREE.Mesh(
    new THREE.PlaneGeometry(0.265, 1.45),
    new THREE.MeshPhysicalMaterial({
      map: textTexture(
        THREE,
        "PURTIER",
        '400 150px "Cinzel","Cormorant Garamond",Georgia,serif',
        256,
        1400,
        true,
        "#ded9d2",
        40,
      ),
      transparent: true,
      metalness: 0.75,
      roughness: 0.32,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      envMapIntensity: 1.2,
    }),
  );
  wm.position.set(W * 0.25, LID_H / 2 - 1.045, D / 2 + 0.003);
  lid.add(wm);
  lid.position.y = BASE_H + SEAM + LID_H / 2;
  rig.add(lid);
  const lidRest = lid.position.y;

  const api = {
    group,
    rig,
    lid,
    base,
    width: W,
    depth: D,
    height: H,
    jarY: BASE_H - SINK + 1.3, // jar centre (jar height 2.6) when nested in the tray
    setLid(v) {
      v = Math.max(0, Math.min(1, v));
      const e = v * v * (3 - 2 * v);
      lid.position.y = lidRest + e * 4.8;
      lid.rotation.z = e * 0.12;
      lid.rotation.x = -e * 0.08;
      lid.visible = v < 0.999;
    },
    update() {},
  };
  api.setLid(0);
  return api;
}
const PurtierBox = { create, W, D, H, BASE_H };

export default PurtierBox;

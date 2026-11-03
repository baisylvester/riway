/* ------------------------------------------------------------------
   CONSCIENTIOUS packaging — procedural three.js (classic script)
   Built from the campaign photography:
     giftBox  the essence-spray presentation box: a shallow box with a
              lift-off lid (HER blush pink with pale lettering, HIM black
              with gold), a white insert with a cradle for the bottle
     maskBox  the mask box: black (HIM) or pink (HER) face with a
              diamond lattice, inset border and the logo plate
     sachet   the single mask sachet: foil, lattice, logo plate
   All printed faces are separate decal planes so the artwork is never
   distorted by box UVs.
   Usage:
     const g = ConscPack.giftBox(THREE, { variant:'him'|'her', RB, quality });
     g.group (origin bottom-centre, long side along z); g.slotY; g.setLid(t)
     const m = ConscPack.maskBox(THREE, { variant, RB });  // stands up, face +z
     const s = ConscPack.sachet(THREE, { variant, RB });   // centred, face +z
   ------------------------------------------------------------------ */

const T = {
  him: {
    a: "#202024",
    b: "#0b0b0d",
    side: 0x111114,
    line: "rgba(255,255,255,0.07)",
    foilLine: "rgba(205,170,100,0.38)",
    acc: "#c7a35e",
    ink: "#d9bf86",
    irid: 0.45,
    inside: 0x0c0c0e,
  },
  her: {
    a: "#f4b4c3",
    b: "#e48aa1",
    side: 0xe79db0,
    line: "rgba(255,255,255,0.45)",
    foilLine: "rgba(255,255,255,0.55)",
    acc: "rgba(255,255,255,0.95)",
    ink: "#ffffff",
    irid: 0,
    inside: 0xd9a5b1,
  },
};
const FONT = '"Inter Tight", "Inter", "Helvetica Neue", Arial, sans-serif';

function cv(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(THREE, c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function bg(g, w, h, t) {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, t.a);
  gr.addColorStop(1, t.b);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  const sh = g.createRadialGradient(
    w * 0.25,
    h * 0.2,
    0,
    w * 0.25,
    h * 0.2,
    Math.max(w, h) * 0.8,
  );
  sh.addColorStop(0, "rgba(255,255,255,0.12)");
  sh.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sh;
  g.fillRect(0, 0, w, h);
}
function lattice(g, w, h, step, color, lw) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.beginPath();
  const k = 1.25; // slope: tall diamonds, as on the boxes
  for (let x = -h / k; x < w + h / k; x += step) {
    g.moveTo(x, 0);
    g.lineTo(x + h / k, h);
    g.moveTo(x + h / k, 0);
    g.lineTo(x, h);
  }
  g.stroke();
}
function border(g, w, h, inset, color, lw) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
}
function txt(g, s, x, y, px, color, weight, spacing, align) {
  g.fillStyle = color;
  g.font = `${weight} ${px}px ${FONT}`;
  g.textAlign = align || "center";
  g.textBaseline = "middle";
  g.letterSpacing = (spacing || 0) + "px";
  g.fillText(s, x + (align === "right" ? 0 : (spacing || 0) / 2), y);
}
function plate(g, cx, cy, pw, ph, color) {
  g.strokeStyle = color;
  g.lineWidth = Math.max(2, ph * 0.045);
  g.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);
  g.lineWidth = Math.max(1, ph * 0.018);
  g.strokeRect(
    cx - pw / 2 + ph * 0.09,
    cy - ph / 2 + ph * 0.09,
    pw - ph * 0.18,
    ph - ph * 0.18,
  );
  txt(g, "CONSCIENTIOUS", cx, cy + 1, ph * 0.34, color, 500, ph * 0.05);
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
function frameGeometry(THREE, w, d, inset, depth) {
  const s = rectShape(THREE, w, d),
    iw = w - inset * 2,
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
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}
// insert slab with a stadium-shaped cradle along z
function cradleGeometry(THREE, w, d, holeW, holeL, depth) {
  const s = rectShape(THREE, w, d),
    r = holeW / 2,
    l = holeL - holeW,
    p = new THREE.Path();
  p.moveTo(r, -l / 2);
  p.lineTo(r, l / 2);
  p.absarc(0, l / 2, r, 0, Math.PI, false);
  p.lineTo(-r, -l / 2);
  p.absarc(0, -l / 2, r, Math.PI, Math.PI * 2, false);
  s.holes.push(p);
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: false,
    curveSegments: 32,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}
function decal(THREE, w, h, map, extra) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshPhysicalMaterial(
      Object.assign(
        {
          map,
          roughness: 0.42,
          clearcoat: 0.35,
          clearcoatRoughness: 0.3,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        },
        extra || {},
      ),
    ),
  );
}
function boxGeo(THREE, RB, w, h, d, r) {
  return RB ? new RB(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
}

// ---------------- gift box (essence spray) ----------------
function giftBox(THREE, o) {
  o = o || {};
  const v = o.variant === "her" ? "her" : "him",
    t = T[v];
  const W = 1.4,
    L = 3.2,
    BH = 0.6,
    LH = 0.5,
    RIM = 0.06;
  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.add(rig);
  const side = new THREE.MeshPhysicalMaterial({
    color: t.side,
    roughness: v === "him" ? 0.36 : 0.55,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    sheen: v === "her" ? 0.15 : 0,
    sheenColor: 0xffffff,
    iridescence: t.irid * 0.6,
    iridescenceIOR: 1.3,
    envMapIntensity: v === "her" ? 0.7 : 0.9,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xe9e6e1,
    roughness: 0.9,
  });
  const under = new THREE.MeshStandardMaterial({
    color: t.inside,
    roughness: 0.9,
  });

  // base: the top face reads as white lining
  const base = new THREE.Mesh(boxGeo(THREE, o.RB, W, BH, L, 0.02), [
    side,
    side,
    white,
    side,
    side,
    side,
  ]);
  base.position.y = BH / 2;
  base.castShadow = true;
  rig.add(base);
  const rim = new THREE.Mesh(
    frameGeometry(THREE, W - 0.02, L - 0.02, RIM, 0.03),
    side,
  );
  rim.position.y = BH - 0.012;
  rig.add(rim);
  const cradle = new THREE.Mesh(
    cradleGeometry(
      THREE,
      W - RIM * 2 + 0.01,
      L - RIM * 2 + 0.01,
      0.74,
      2.86,
      0.03,
    ),
    white,
  );
  cradle.position.y = BH - 0.012;
  rig.add(cradle);

  // lid: artwork on the top as a decal (long side along z)
  const lid = new THREE.Group();
  const lidBody = new THREE.Mesh(
    boxGeo(THREE, o.RB, W + 0.03, LH, L + 0.03, 0.02),
    [side, side, side, under, side, side],
  );
  lidBody.castShadow = true;
  lid.add(lidBody);
  const [c, g] = cv(512, Math.round((512 * L) / W));
  bg(g, c.width, c.height, t);
  border(g, c.width, c.height, 22, t.acc, 2);
  g.save();
  g.translate(c.width * 0.36, c.height * 0.5);
  g.rotate(Math.PI / 2);
  txt(g, "CONSCIENTIOUS", 0, 0, 84, t.ink, 300, 22);
  g.restore();
  g.save();
  g.translate(c.width * 0.7, c.height * 0.78);
  g.rotate(Math.PI / 2);
  txt(g, "2ND EDITION", 0, -20, 22, t.ink, 400, 6);
  txt(g, v === "him" ? "FOR HIM" : "FOR HER", 0, 18, 30, t.ink, 400, 8);
  g.restore();
  const top = decal(THREE, W + 0.02, L + 0.02, tex(THREE, c), {
    roughness: v === "him" ? 0.32 : 0.5,
    iridescence: t.irid,
    iridescenceIOR: 1.3,
    sheen: v === "her" ? 0.12 : 0,
    sheenColor: 0xffffff,
    envMapIntensity: v === "her" ? 0.7 : 1,
  });
  top.rotation.x = -Math.PI / 2;
  top.position.y = LH / 2 + 0.002;
  lid.add(top);
  lid.position.y = BH + 0.04 + LH / 2;
  rig.add(lid);
  const lidRest = lid.position.y;

  return {
    group,
    rig,
    lid,
    width: W,
    length: L,
    height: BH + LH,
    slotY: BH + 0.018 + 0.33 - 0.2, // bottle centre (radius 0.33) lying in the cradle
    setLid(x) {
      x = Math.max(0, Math.min(1, x));
      const e = x * x * (3 - 2 * x);
      lid.position.y = lidRest + e * 3.4;
      lid.position.z = -e * 0.8;
      lid.rotation.x = -e * 0.42;
      lid.visible = x < 0.999;
    },
  };
}

// ---------------- mask box ----------------
function maskBox(THREE, o) {
  o = o || {};
  const v = o.variant === "her" ? "her" : "him",
    t = T[v];
  const W = 3.0,
    Hh = 2.15,
    D = 0.3;
  const group = new THREE.Group();
  const side = new THREE.MeshPhysicalMaterial({
    color: t.side,
    roughness: 0.4,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
    iridescence: t.irid * 0.5,
    iridescenceIOR: 1.3,
    envMapIntensity: 0.9,
  });
  const body = new THREE.Mesh(boxGeo(THREE, o.RB, W, Hh, D, 0.02), side);
  body.position.y = Hh / 2;
  body.castShadow = true;
  group.add(body);
  const [c, g] = cv(1024, Math.round((1024 * Hh) / W));
  const w = c.width,
    h = c.height;
  bg(g, w, h, t);
  lattice(g, w, h, 70, t.line, 1.4);
  border(g, w, h, 26, t.acc, 2.4);
  plate(g, w * 0.5, h * 0.42, w * 0.38, h * 0.12, t.acc);
  txt(
    g,
    v === "him" ? "FOR HIM" : "FOR HER",
    w * 0.5,
    h * 0.56,
    h * 0.04,
    t.ink,
    400,
    6,
  );
  txt(
    g,
    v === "him" ? "CLEANSING REPAIRING MASK" : "BRIGHTENING FIRMING MASK",
    w * 0.92,
    h * 0.85,
    h * 0.028,
    t.ink,
    500,
    3,
    "right",
  );
  txt(g, "20 SHEETS", w * 0.92, h * 0.895, h * 0.026, t.ink, 400, 3, "right");
  const face = decal(THREE, W - 0.01, Hh - 0.01, tex(THREE, c), {
    roughness: v === "him" ? 0.3 : 0.45,
    iridescence: t.irid,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
  });
  face.position.set(0, Hh / 2, D / 2 + 0.002);
  group.add(face);
  return { group, width: W, height: Hh, depth: D };
}

// ---------------- sachet ----------------
function sachet(THREE, o) {
  o = o || {};
  const v = o.variant === "her" ? "her" : "him",
    t = T[v];
  const W = 1.25,
    Hh = 1.7,
    D = 0.04;
  const group = new THREE.Group(),
    rig = new THREE.Group();
  group.add(rig);
  const foil = new THREE.MeshPhysicalMaterial({
    color: t.side,
    metalness: 0.3,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: t.irid * 0.6,
    iridescenceIOR: 1.3,
    envMapIntensity: 1.1,
  });
  const body = new THREE.Mesh(boxGeo(THREE, o.RB, W, Hh, D, 0.015), foil);
  body.castShadow = true;
  rig.add(body);
  const [c, g] = cv(600, Math.round((600 * Hh) / W));
  const w = c.width,
    h = c.height;
  bg(g, w, h, t);
  lattice(g, w, h, 64, t.foilLine, 1.6);
  // crimped seals top and bottom
  g.fillStyle =
    v === "him" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.18)";
  g.fillRect(0, 0, w, h * 0.045);
  g.fillRect(0, h * 0.955, w, h * 0.045);
  plate(g, w * 0.5, h * 0.3, w * 0.62, h * 0.085, t.acc);
  txt(
    g,
    v === "him" ? "FOR HIM" : "FOR HER",
    w * 0.5,
    h * 0.38,
    h * 0.026,
    t.ink,
    400,
    5,
  );
  txt(
    g,
    v === "him" ? "CLEANSING REPAIRING MASK" : "BRIGHTENING FIRMING MASK",
    w * 0.5,
    h * 0.9,
    h * 0.02,
    t.ink,
    500,
    3,
  );
  const face = decal(THREE, W - 0.01, Hh - 0.01, tex(THREE, c), {
    metalness: 0.3,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    iridescence: t.irid * 0.6,
    iridescenceIOR: 1.3,
  });
  face.position.z = D / 2 + 0.002;
  rig.add(face);
  let time = Math.random() * 10;
  return {
    group,
    rig,
    width: W,
    height: Hh,
    motion: 1,
    update(dt) {
      time += dt;
      rig.position.y = Math.sin(time * 0.7) * 0.04 * this.motion;
      rig.rotation.z = Math.sin(time * 0.5) * 0.02 * this.motion;
    },
  };
}

const ConscPack = { giftBox, maskBox, sachet };

export default ConscPack;

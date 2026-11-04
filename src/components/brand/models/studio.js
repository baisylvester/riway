/* RIWAY studio — photographic rendering kit (classic script)
   Procedural HDR studio environment, area + rim lighting, soft shadows,
   bloom + AgX tone mapping. Pages pass THREE and the addons they import.
   addons: { RoomEnvironment?, EffectComposer?, RenderPass?, UnrealBloomPass?, OutputPass?, RectAreaLightUniformsLib? } */

const Studio = {};

// ---------- small procedural textures ----------
Studio.noiseTexture = function (THREE, size, base, amp, blur) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(
      0,
      Math.min(255, Math.round((base + (Math.random() - 0.5) * amp) * 255)),
    );
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (blur) {
    g.filter = `blur(${blur}px)`;
    g.drawImage(c, 0, 0);
    g.filter = "none";
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};
// horizontal brushed streaks for metal roughness
Studio.brushedTexture = function (THREE, size) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#b8b8b8";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 3; i++) {
    const y = Math.random() * size,
      l = 20 + Math.random() * size,
      a = 0.06 + Math.random() * 0.14;
    g.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${a})`;
    g.lineWidth = 0.5 + Math.random();
    g.beginPath();
    g.moveTo(Math.random() * size, y);
    g.lineTo(Math.random() * size + l, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
};
Studio.radialShadowTexture = function (THREE, size, inner) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gr.addColorStop(0, "rgba(0,0,0," + (inner || 0.7) + ")");
  gr.addColorStop(0.45, "rgba(0,0,0,0.28)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
};

// ---------- procedural studio environment (HDR via PMREM) ----------
// A dome with a vertical gradient, a long softbox above, a tall rim panel to the side,
// a low warm fill. Values above 1.0 make real highlights.
Studio.environment = function (THREE, renderer, opts) {
  opts = opts || {};
  const warm = opts.warm != null ? opts.warm : 1;
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(40, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0.95, 0.94, 0.92) },
        mid: { value: new THREE.Color(0.42, 0.42, 0.44) },
        bottom: { value: new THREE.Color(0.08, 0.08, 0.09) },
      },
      vertexShader:
        "varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 top, mid, bottom; varying vec3 vW; void main(){ float h = normalize(vW).y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.8)) : mix(mid, bottom, pow(-h, 0.6)); gl_FragColor = vec4(c, 1.0); }",
    }),
  );
  scene.add(dome);
  const panel = (w, h, color, intensity, pos, lookAt) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      }),
    );
    m.position.copy(pos);
    m.lookAt(lookAt || new THREE.Vector3(0, 0, 0));
    scene.add(m);
    return m;
  };
  panel(14, 3.2, 0xfff4e6, 6.5 * warm, new THREE.Vector3(-2, 9, 6)); // key softbox, long, above-front-left
  panel(2.2, 12, 0xdfe8ff, 4.5, new THREE.Vector3(10, 2, -2)); // tall cool rim, right
  panel(2.2, 12, 0xfff8f0, 2.0, new THREE.Vector3(-11, 1, 1)); // soft left edge
  panel(10, 6, 0xffffff, 0.9, new THREE.Vector3(0, -9, 3)); // floor bounce
  panel(5, 5, 0xffffff, 1.6, new THREE.Vector3(0, 3, -12)); // back glow
  const pmrem = new THREE.PMREMGenerator(renderer);
  const baked = pmrem.fromScene(scene, 0.025);
  const tex = baked.texture;
  tex.userData.riwayRenderTarget = baked;
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) o.material.dispose();
  });
  return tex;
};

// ---------- lights ----------
Studio.lights = function (THREE, scene, addons, low) {
  // high and in front: short, soft shadows that fall mostly behind the product
  const key = new THREE.SpotLight(0xfff1e2, 48, 40, Math.PI / 6, 0.75, 1.6);
  key.position.set(1.4, 9, 6.5);
  if (!low) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0002;
    key.shadow.radius = 10;
    key.shadow.blurSamples = 20;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
  }
  const rim = new THREE.DirectionalLight(0xdbe6ff, 1.4);
  rim.position.set(-4, 2.5, -3.5);
  const fill = new THREE.DirectionalLight(0xffe6cf, 0.35);
  fill.position.set(-2, -1, 4);
  scene.add(key, rim, fill, new THREE.AmbientLight(0xffffff, 0.12));
  if (addons && addons.RectAreaLightUniformsLib && THREE.RectAreaLight) {
    addons.RectAreaLightUniformsLib.init();
    const top = new THREE.RectAreaLight(0xfff5ea, 5.5, 7, 1.4);
    top.position.set(-1, 5.2, 2.5);
    top.lookAt(0, 0, 0);
    const side = new THREE.RectAreaLight(0xe4ecff, 3.5, 1, 6);
    side.position.set(4.5, 1, 1.5);
    side.lookAt(0, 0.3, 0);
    scene.add(top, side);
  }
  return { key, rim, fill };
};

// ---------- ground: cast-shadow catcher + contact disc ----------
Studio.ground = function (THREE, scene, y, low) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 48),
    new THREE.MeshBasicMaterial({
      map: Studio.radialShadowTexture(THREE, 256, 0.6),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = y + 0.002;
  g.add(disc);
  if (!low) {
    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.2 }),
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = y;
    catcher.receiveShadow = true;
    g.add(catcher);
  }
  scene.add(g);
  return g;
};

// ---------- renderer + optional post ----------
Studio.renderer = function (THREE, canvas, low, opts) {
  opts = opts || {};
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.5));
  // Khronos PBR Neutral keeps brand colours (the PURTIER red) true; ACES as fallback
  renderer.toneMapping =
    THREE.NeutralToneMapping || THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure != null ? opts.exposure : 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  if (!low) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
  }
  return renderer;
};

Studio.post = function (THREE, addons, renderer, scene, camera, low) {
  if (
    low ||
    !addons ||
    !addons.EffectComposer ||
    !addons.RenderPass ||
    !addons.UnrealBloomPass ||
    !addons.OutputPass
  ) {
    return { render: () => renderer.render(scene, camera), setSize: () => {} };
  }
  // multisampled target: without it the composer drops anti-aliasing and thin edges turn into dashes
  const samples = Math.min(
    4,
    (renderer.capabilities && renderer.capabilities.maxSamples) || 4,
  );
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples,
  });
  const composer = new addons.EffectComposer(renderer, rt);
  composer.addPass(new addons.RenderPass(scene, camera));
  const bloom = new addons.UnrealBloomPass(
    new THREE.Vector2(1, 1),
    0.06,
    0.3,
    2.0,
  );
  composer.addPass(bloom);
  composer.addPass(new addons.OutputPass());
  return {
    composer,
    bloom,
    render: () => composer.render(),
    setSize: (w, h) => {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
  };
};

export default Studio;

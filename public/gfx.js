// Parte visual do Última Ilha: céu, luz e sombras, relevo com textura, grama, árvores, casas detalhadas,
// soldados com equipamento, modelos de armas, arma em primeira pessoa e clarão de tiro.
// Tudo é gerado no código (sem arquivos de imagem), para o jogo continuar leve.
window.GFX = (function () {
  const TAU = Math.PI * 2;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const std = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: 0 }, o || {}));

  // ---------- texturas desenhadas em canvas ----------
  function canvasTex(size, draw, rep) {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep); return t;
  }
  let seedN = 7; const rnd = () => (seedN = (seedN * 16807) % 2147483647) / 2147483647;
  const TEX = {};
  function makeTextures(aniso) {
    TEX.ground = canvasTex(512, (g, s) => {
      g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) { const v = 150 + rnd() * 105 | 0; g.fillStyle = `rgba(${v},${v},${v},.35)`; g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3); }
      for (let i = 0; i < 60; i++) { const v = 170 + rnd() * 60 | 0, r = 10 + rnd() * 40; const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, `rgba(${v},${v},${v},.25)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(rnd() * s, rnd() * s); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
      g.strokeStyle = 'rgba(90,90,90,.18)'; for (let i = 0; i < 700; i++) { const x = rnd() * s, y = rnd() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 3, y - 3 - rnd() * 5); g.stroke(); }
    });
    TEX.plaster = canvasTex(256, (g, s) => {
      g.fillStyle = '#e6e2da'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4000; i++) { const v = 200 + rnd() * 55 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 10},.35)`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
      const gr = g.createLinearGradient(0, s, 0, s * .75); gr.addColorStop(0, 'rgba(70,60,45,.45)'); gr.addColorStop(1, 'rgba(70,60,45,0)'); g.fillStyle = gr; g.fillRect(0, s * .75, s, s * .25);
      for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(80,70,60,.08)'; g.fillRect(rnd() * s, 0, 2 + rnd() * 4, s * (.3 + rnd() * .5)); }
    });
    TEX.roof = canvasTex(256, (g, s) => {
      g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, s, 3); for (let x = (y / 16 % 2) * 16; x < s; x += 32) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x, y, 2, 16); } }
      for (let i = 0; i < 2500; i++) { const v = 150 + rnd() * 100 | 0; g.fillStyle = `rgba(${v},${v},${v},.2)`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
    });
    TEX.wood = canvasTex(256, (g, s) => {
      for (let x = 0; x < s; x += 32) { const v = 140 + rnd() * 50 | 0; g.fillStyle = `rgb(${v},${v * .72 | 0},${v * .48 | 0})`; g.fillRect(x, 0, 32, s); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, 0, 2, s); }
      g.strokeStyle = 'rgba(60,35,15,.18)'; for (let i = 0; i < 120; i++) { const x = rnd() * s; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, s * .3, x - 6, s * .6, x + 3, s); g.stroke(); }
    });
    TEX.grass = (() => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
      for (let i = 0; i < 46; i++) {
        const x = 6 + rnd() * 116, h = 50 + rnd() * 76, lean = (rnd() - .5) * 26, v = 120 + rnd() * 100 | 0;
        g.strokeStyle = `rgb(${v * .55 | 0},${v},${v * .35 | 0})`; g.lineWidth = 2 + rnd() * 2.5;
        g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + lean * .4, 128 - h * .6, x + lean, 128 - h); g.stroke();
      }
      const t = new THREE.CanvasTexture(c); return t;
    })();
    TEX.cloud = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
      for (let i = 0; i < 14; i++) { const x = 40 + rnd() * 176, y = 50 + rnd() * 40, r = 20 + rnd() * 34; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); }
      return new THREE.CanvasTexture(c);
    })();
    TEX.flash = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(.25, 'rgba(255,200,90,.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,230,160,.9)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); g.stroke(); }
      return new THREE.CanvasTexture(c);
    })();
    for (const k in TEX) TEX[k].anisotropy = aniso;
  }

  // junta várias geometrias em uma só, com cor por vértice
  function merge(parts) {
    const pos = [], nor = [], col = [], uv = [];
    const c = new THREE.Color();
    for (const p of parts) {
      const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone());
      if (p.m) g.applyMatrix4(p.m);
      const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
      c.set(p.color);
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); col.push(c.r, c.g, c.b);
        uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx || 1, sy || 1, sz || 1));

  // ---------- modelos de armas (apontam para -z, origem no punho) ----------
  const METAL = 0x26292c, METAL2 = 0x3a3f44, WOOD = 0x6b4a2b, POLY = 0x1d1f21;
  function gunGeo(t) {
    const P = [];
    const b = (x, y, z, sx, sy, sz, color, rx) => P.push({ geo: box, m: M4(x, y, z, rx || 0, 0, 0, sx, sy, sz), color });
    const cyl = (x, y, z, r, len, color) => P.push({ geo: new THREE.CylinderGeometry(r, r, len, 8), m: M4(x, y, z, Math.PI / 2, 0, 0), color });
    if (t === 'pistola') { b(0, .04, -.08, .04, .055, .22, METAL2); b(0, -.03, 0, .035, .1, .05, POLY, .25); cyl(0, .045, -.2, .009, .04, METAL); }
    else if (t === 'smg') { b(0, .03, -.15, .05, .08, .34, METAL); b(0, -.06, -.12, .035, .14, .045, POLY, .1); b(0, -.03, .02, .035, .09, .05, POLY, .3); cyl(0, .04, -.37, .014, .12, METAL2); b(0, .03, .12, .03, .05, .16, METAL2); }
    else if (t === 'escopeta') { b(0, .03, -.2, .05, .07, .45, METAL); cyl(0, .055, -.55, .018, .4, METAL2); b(0, .0, -.42, .05, .045, .16, WOOD); b(0, -.01, .12, .045, .1, .26, WOOD, -.1); b(0, -.05, .0, .035, .09, .045, WOOD, .3); }
    else if (t === 'fuzil') { b(0, .03, -.2, .055, .09, .42, METAL); cyl(0, .045, -.55, .013, .3, METAL2); b(0, -.07, -.2, .04, .16, .07, POLY, .25); b(0, -.03, .0, .035, .1, .05, POLY, .3); b(0, .03, .18, .04, .09, .24, POLY); b(0, .02, -.36, .06, .07, .16, METAL2); }
    else { b(0, .03, -.2, .055, .08, .55, 0x3d4a32); cyl(0, .045, -.7, .014, .5, METAL); b(0, -.06, -.12, .04, .12, .06, POLY); b(0, -.03, .05, .035, .1, .05, POLY, .3); b(0, .02, .25, .05, .11, .3, 0x3d4a32); cyl(0, .11, -.22, .028, .36, METAL); b(0, .075, -.22, .02, .04, .05, METAL); }
    return merge(P);
  }
  const GUN_GEO = {};
  const gunMat = std(0xffffff, { vertexColors: true, roughness: .55, metalness: .45 });
  function makeGun(t) { if (!GUN_GEO[t]) GUN_GEO[t] = gunGeo(t); const m = new THREE.Mesh(GUN_GEO[t], gunMat); m.castShadow = true; return m; }

  // ---------- fábrica ----------
  function create(canvas, conf) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: conf.graf !== 'baixo', powerPreference: 'high-performance' });
    makeTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    const scene = new THREE.Scene();
    const HORIZON = new THREE.Color(0xc9dce4);
    scene.background = HORIZON; scene.fog = new THREE.Fog(HORIZON, 90, 450);
    const camera = new THREE.PerspectiveCamera(70, 1, .08, 1200); camera.rotation.order = 'YXZ'; scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xd4e6f5, 0x4d5a36, .8));
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.05); sun.position.set(80, 140, 50); scene.add(sun, sun.target);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -45; sun.shadow.camera.right = sun.shadow.camera.top = 45; sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
    sun.shadow.bias = -.0008; sun.shadow.normalBias = .03;

    // céu em degradê
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x4f8fd0) }, hor: { value: HORIZON }, sunDir: { value: new THREE.Vector3(80, 140, 50).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.7)); float s = max(dot(vP, sunDir),0.0); c += vec3(1.0,0.9,0.7)*pow(s,400.0)*1.5 + vec3(1.0,0.85,0.6)*pow(s,8.0)*0.25; gl_FragColor = vec4(c,1.0); }'
    }));
    sky.renderOrder = -1; scene.add(sky);
    const clouds = new THREE.Group();
    for (let i = 0; i < 34; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.cloud, transparent: true, opacity: .85, fog: false, depthWrite: false }));
      s.position.set(-300 + rnd() * 1600, 200 + rnd() * 70, -300 + rnd() * 1600); const k = 70 + rnd() * 90; s.scale.set(k, k * .45, 1); clouds.add(s);
    }
    scene.add(clouds);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), std(0x2a6a80, { roughness: .12, metalness: .25, transparent: true, opacity: .86 }));
    water.rotation.x = -Math.PI / 2; water.position.set(SH.W / 2, SH.SEA, SH.W / 2); water.receiveShadow = true; scene.add(water);

    const G = { renderer, scene, camera, sun, sky, conf, chestMeshes: [], world: null, grass: null };

    G.applyGraphics = function (c) {
      G.conf = c;
      const dpr = window.devicePixelRatio || 1;
      renderer.setPixelRatio(c.graf === 'baixo' ? Math.min(dpr, 1) * .75 : c.graf === 'medio' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
      const far = c.graf === 'baixo' ? 320 : c.graf === 'medio' ? 480 : 700;
      scene.fog.far = far; scene.fog.near = far * .22; camera.far = far + 500; camera.updateProjectionMatrix();
      const sh = c.graf !== 'baixo';
      renderer.shadowMap.enabled = sh; renderer.shadowMap.type = THREE.PCFSoftShadowMap; sun.castShadow = sh;
      const ms = c.graf === 'alto' ? 2048 : 1024;
      if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
      if (G.grass) G.grass.visible = c.graf !== 'baixo';
      G.resize();
    };
    G.resize = function () { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };

    // ---------- mundo ----------
    let worldGroup = null;
    G.buildWorld = function (w) {
      if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse(o => { if (o.geometry && o.geometry !== box && !Object.values(GUN_GEO).includes(o.geometry)) o.geometry.dispose(); }); }
      const g = new THREE.Group(); worldGroup = g; G.world = w;
      const N = SH.N, ST = SH.STEP;
      // relevo
      const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2), idx = [];
      const c = new THREE.Color(), sand = new THREE.Color(0xc9b98a), grass = new THREE.Color(0x5f8a3e), grass2 = new THREE.Color(0x46702f), dry = new THREE.Color(0x8a8a4a), rock = new THREE.Color(0x7d7a72), dirt = new THREE.Color(0x857356);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, h = w.H[k];
        pos[k * 3] = i * ST; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * ST; uv[k * 2] = i * ST / 9; uv[k * 2 + 1] = j * ST / 9;
        const sl = Math.abs(w.H[k + (i < N - 1 ? 1 : 0)] - h) + Math.abs(w.H[k + (j < N - 1 ? N : 0)] - h);
        const n = (Math.sin(i * .37 + j * .11) * Math.cos(j * .29 - i * .07) + 1) / 2;
        if (h < 1.4) c.copy(sand); else if (sl > 5.2) c.copy(rock); else if (sl > 3.2) c.copy(dirt).lerp(rock, (sl - 3.2) / 2); else c.copy(grass).lerp(grass2, n * .7).lerp(dry, Math.max(0, h - 25) / 70 + (1 - n) * .15);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        if (i < N - 1 && j < N - 1) idx.push(k, k + N, k + 1, k + 1, k + N, k + N + 1);
      }
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      tg.setIndex(idx); tg.computeVertexNormals();
      const terrain = new THREE.Mesh(tg, std(0xffffff, { vertexColors: true, map: TEX.ground, roughness: 1 })); terrain.receiveShadow = true; g.add(terrain);

      // casas
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
      const walls = w.boxes.filter(b => b.wall), slabs = w.boxes.filter(b => b.roof);
      const wallMesh = new THREE.InstancedMesh(box, std(0xffffff, { map: TEX.plaster, roughness: .92 }), walls.length);
      walls.forEach((b, i) => { m4.compose(v.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), q, s.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0)); wallMesh.setMatrixAt(i, m4); wallMesh.setColorAt(i, c.set(b.house.color)); });
      wallMesh.castShadow = wallMesh.receiveShadow = true; g.add(wallMesh);
      const slabMesh = new THREE.InstancedMesh(box, std(0xe9e4da, { roughness: .95 }), slabs.length);
      slabs.forEach((b, i) => { m4.compose(v.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), q, s.set(b.x1 - b.x0 - .6, b.y1 - b.y0, b.z1 - b.z0 - .6)); slabMesh.setMatrixAt(i, m4); });
      g.add(slabMesh);
      const floorMesh = new THREE.InstancedMesh(box, std(0xc8a27a, { map: TEX.wood, roughness: .8 }), w.houses.length);
      w.houses.forEach((h, i) => { m4.compose(v.set(h.x, h.y - .08, h.z), q, s.set(h.w - .4, .2, h.d - .4)); floorMesh.setMatrixAt(i, m4); });
      floorMesh.receiveShadow = true; g.add(floorMesh);
      // janelas, batentes e telhados de duas águas
      const frames = [], glass = [], posts = [], roofP = [], gableP = [];
      const T = .3, H = 3.2;
      for (const h of w.houses) {
        const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, z0 = h.z - h.d / 2, z1 = h.z + h.d / 2, wy = h.y + 1.55;
        for (let sd = 0; sd < 4; sd++) {
          const horiz = sd < 2, len = horiz ? h.w : h.d, cc = horiz ? h.x : h.z;
          const fixed = horiz ? (sd === 0 ? z0 + T / 2 : z1 - T / 2) : (sd === 2 ? x0 + T / 2 : x1 - T / 2);
          const centers = sd === h.door ? [-len / 4 - .45, len / 4 + .45] : len > 9 ? [-len / 4, len / 4] : [0];
          for (const off of centers) {
            const a = cc + off;
            if (horiz) { frames.push([a, wy, fixed, 1.35, 1.2, T + .05]); glass.push([a, wy, fixed, 1.1, .95, T + .09]); }
            else { frames.push([fixed, wy, a, T + .05, 1.2, 1.35]); glass.push([fixed, wy, a, T + .09, .95, 1.1]); }
          }
          if (sd === h.door) for (const e of [-.9, .9]) {
            if (horiz) posts.push([cc + e, h.y + 1.15, fixed, .14, 2.3, T + .08]); else posts.push([fixed, h.y + 1.15, cc + e, T + .08, 2.3, .14]);
          }
        }
        // telhado
        const o = .45, rx0 = x0 - o, rx1 = x1 + o, rz0 = z0 - o, rz1 = z1 + o, yb = h.y + H + .3, rh = 1.7, alongX = h.w >= h.d;
        const tri = (arr, a, b, cpt) => arr.push(...a, ...b, ...cpt);
        if (alongX) {
          const zm = h.z, A = [rx0, yb, rz0], B = [rx1, yb, rz0], C = [rx1, yb + rh, zm], D = [rx0, yb + rh, zm], E = [rx0, yb, rz1], F = [rx1, yb, rz1];
          roofP.push({ v: [A, D, C, A, C, B], col: h.roof, len: rx1 - rx0, sl: Math.hypot(zm - rz0, rh) }, { v: [E, F, C, E, C, D], col: h.roof, len: rx1 - rx0, sl: Math.hypot(rz1 - zm, rh) });
          gableP.push({ v: [[x0, yb, z0], [x0, yb + rh - .2, zm], [x0, yb, z1]], col: h.color }, { v: [[x1, yb, z0], [x1, yb, z1], [x1, yb + rh - .2, zm]], col: h.color });
        } else {
          const xm = h.x, A = [rx0, yb, rz0], B = [rx0, yb, rz1], C = [xm, yb + rh, rz1], D = [xm, yb + rh, rz0], E = [rx1, yb, rz0], F = [rx1, yb, rz1];
          roofP.push({ v: [A, B, C, A, C, D], col: h.roof, len: rz1 - rz0, sl: Math.hypot(xm - rx0, rh) }, { v: [E, D, C, E, C, F], col: h.roof, len: rz1 - rz0, sl: Math.hypot(rx1 - xm, rh) });
          gableP.push({ v: [[x0, yb, z0], [x1, yb, z0], [xm, yb + rh - .2, z0]], col: h.color }, { v: [[x0, yb, z1], [xm, yb + rh - .2, z1], [x1, yb, z1]], col: h.color });
        }
      }
      const boxesMesh = (list, mat, cast) => {
        const im = new THREE.InstancedMesh(box, mat, Math.max(1, list.length));
        list.forEach((b, i) => { m4.compose(v.set(b[0], b[1], b[2]), q, s.set(b[3], b[4], b[5])); im.setMatrixAt(i, m4); });
        im.count = list.length; im.castShadow = !!cast; im.receiveShadow = true; g.add(im);
      };
      boxesMesh(frames, std(0xf1eee8, { roughness: .7 }));
      boxesMesh(glass, std(0x34495a, { roughness: .08, metalness: .6 }));
      boxesMesh(posts, std(0x6b4a2b, { map: TEX.wood, roughness: .8 }), true);
      const roofGeo = (parts, uvs) => {
        const p = [], col = [], uv = [], cc = new THREE.Color();
        for (const r of parts) {
          cc.set(r.col);
          for (let i = 0; i < r.v.length; i++) {
            p.push(...r.v[i]); col.push(cc.r, cc.g, cc.b);
            if (uvs) { const quad = [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]][i]; uv.push(quad[0] * r.len / 2, quad[1] * r.sl / 1.2); } else uv.push(0, 0);
          }
        }
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.computeVertexNormals(); return gg;
      };
      const roofs = new THREE.Mesh(roofGeo(roofP, true), std(0xffffff, { vertexColors: true, map: TEX.roof, roughness: .8, side: THREE.DoubleSide }));
      const gables = new THREE.Mesh(roofGeo(gableP, false), std(0xffffff, { vertexColors: true, roughness: .9, side: THREE.DoubleSide }));
      roofs.castShadow = gables.castShadow = true; roofs.receiveShadow = true; g.add(roofs, gables);

      // árvores: pinheiros e árvores de copa
      const pine = merge([
        { geo: new THREE.CylinderGeometry(.16, .26, 3.2, 6), m: M4(0, 1.6, 0), color: 0x5a3f28 },
        { geo: new THREE.ConeGeometry(1.9, 2.6, 8), m: M4(0, 3, 0), color: 0x2f5a2c },
        { geo: new THREE.ConeGeometry(1.5, 2.3, 8), m: M4(0, 4.3, 0, 0, .4), color: 0x346430 },
        { geo: new THREE.ConeGeometry(1.05, 2, 8), m: M4(0, 5.5, 0, 0, .8), color: 0x3a6c35 },
        { geo: new THREE.ConeGeometry(.6, 1.4, 7), m: M4(0, 6.5, 0), color: 0x41763a }
      ]);
      const leafy = merge([
        { geo: new THREE.CylinderGeometry(.18, .3, 2.8, 6), m: M4(0, 1.4, 0), color: 0x5e4630 },
        { geo: new THREE.CylinderGeometry(.08, .12, 1.4, 5), m: M4(.4, 2.6, 0, 0, 0, -.7), color: 0x5e4630 },
        { geo: new THREE.IcosahedronGeometry(1.7, 1), m: M4(0, 3.9, 0), color: 0x4a7a32 },
        { geo: new THREE.IcosahedronGeometry(1.2, 1), m: M4(1.1, 3.4, .4), color: 0x548638 },
        { geo: new THREE.IcosahedronGeometry(1.25, 1), m: M4(-.9, 3.5, -.5), color: 0x426e2c },
        { geo: new THREE.IcosahedronGeometry(1, 1), m: M4(.2, 4.8, -.3), color: 0x5a8c3c }
      ]);
      const treeMat = std(0xffffff, { vertexColors: true, flatShading: true, roughness: .9 });
      const pines = w.trees.filter((t, i) => i % 3 !== 0 || t.y0 > 30), leafs = w.trees.filter((t, i) => !(i % 3 !== 0 || t.y0 > 30));
      for (const [list, geo] of [[pines, pine], [leafs, leafy]]) {
        const im = new THREE.InstancedMesh(geo, treeMat, list.length);
        list.forEach((t, i) => {
          m4.compose(v.set(t.x, t.y0 + .9, t.z), q.setFromEuler(new THREE.Euler(0, i * 1.7, 0)), s.set(t.s, t.s * (.9 + (i % 5) * .05), t.s)); im.setMatrixAt(i, m4);
          im.setColorAt(i, c.setHSL(.25 + (i % 7) * .01, .25 + (i % 3) * .08, .55 + (i % 5) * .05));
        });
        q.identity(); im.castShadow = true; im.receiveShadow = true; g.add(im);
      }
      // pedras irregulares
      const rg = new THREE.DodecahedronGeometry(1, 1), rp = rg.attributes.position;
      for (let i = 0; i < rp.count; i++) { const k = .78 + Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * .38; rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * k * .85, rp.getZ(i) * k); }
      rg.computeVertexNormals();
      const rocks = new THREE.InstancedMesh(rg, std(0x8a877e, { flatShading: true, roughness: .95, map: TEX.ground }), w.rocks.length);
      w.rocks.forEach((r, i) => { m4.compose(v.set(r.x, r.y0 + 1 - r.r * .1, r.z), q.setFromEuler(new THREE.Euler(i * .3, i * 2, 0)), s.set(r.r, r.r * .9, r.r)); rocks.setMatrixAt(i, m4); rocks.setColorAt(i, c.setHSL(.1, .05, .45 + (i % 4) * .05)); });
      q.identity(); rocks.castShadow = rocks.receiveShadow = true; g.add(rocks);

      // caixas de suprimento (baús)
      G.chestMeshes = w.chests.map(ch => {
        const m = new THREE.Group();
        const body = new THREE.Mesh(box, std(ch.rare ? 0x55603e : 0x4b5a3a, { roughness: .8 })); body.scale.set(1.05, .5, .65); body.position.y = .25;
        const lid = new THREE.Group(); lid.position.set(0, .5, .325);
        const lidM = new THREE.Mesh(box, std(ch.rare ? 0x55603e : 0x4b5a3a)); lidM.scale.set(1.07, .14, .67); lidM.position.set(0, .07, -.335); lid.add(lidM);
        const band = new THREE.Mesh(box, std(0x2a2c2e, { metalness: .5, roughness: .5 })); band.scale.set(1.09, .08, .69); band.position.y = .32;
        const latch = new THREE.Mesh(box, std(ch.rare ? 0xd4a52a : 0x9a9a9a, { metalness: .7, roughness: .35, emissive: ch.rare ? 0x442f00 : 0 })); latch.scale.set(.12, .12, .04); latch.position.set(0, .4, .34);
        m.add(body, lid, band, latch); m.position.set(ch.x, ch.y, ch.z); m.rotation.y = (ch.x * 7 % 6);
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        m.userData.lid = lid; g.add(m); return m;
      });
      scene.add(g);
      // grama (perto do jogador)
      if (G.grass) { scene.remove(G.grass); G.grass = null; }
      const blade = merge([{ geo: new THREE.PlaneGeometry(.9, .55), m: M4(0, .27, 0), color: 0xffffff }, { geo: new THREE.PlaneGeometry(.9, .55), m: M4(0, .27, 0, 0, Math.PI / 2), color: 0xffffff }]);
      const gm = new THREE.MeshLambertMaterial({ map: TEX.grass, alphaTest: .5, side: THREE.DoubleSide, vertexColors: true });
      G.grass = new THREE.InstancedMesh(blade, gm, 7000); G.grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(7000 * 3).fill(1), 3); G.grass.count = 0; G.grass.frustumCulled = false; G.grass.visible = G.conf.graf !== 'baixo';
      scene.add(G.grass); G.grassAt = null;
    };
    G.setChestOpen = function (i) { const m = G.chestMeshes[i]; if (m) m.userData.lid.rotation.x = -1.9; };

    // reposiciona a grama em volta do jogador
    function updateGrass(x, z) {
      const w = G.world; if (!w || !G.grass || G.conf.graf === 'baixo') return;
      if (G.grassAt && Math.hypot(G.grassAt[0] - x, G.grassAt[1] - z) < 8) return;
      G.grassAt = [x, z];
      const R = G.conf.graf === 'alto' ? 55 : 38, cell = 1.9, max = G.conf.graf === 'alto' ? 7000 : 3200;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
      let n = 0;
      for (let i = Math.floor((x - R) / cell); i <= Math.floor((x + R) / cell) && n < max; i++) for (let j = Math.floor((z - R) / cell); j <= Math.floor((z + R) / cell) && n < max; j++) {
        const hsh = Math.abs(Math.sin(i * 127.1 + j * 311.7) * 43758.5453) % 1, h2 = Math.abs(Math.sin(i * 269.5 + j * 183.3) * 43758.5453) % 1;
        if (hsh > .62) continue;
        const px = (i + h2) * cell, pz = (j + hsh / .62) * cell;
        if ((px - x) ** 2 + (pz - z) ** 2 > R * R) continue;
        const hgt = SH.height(w, px, pz); if (hgt < 1.5) continue;
        const sl = Math.abs(SH.height(w, px + 1.5, pz) - hgt) + Math.abs(SH.height(w, px, pz + 1.5) - hgt); if (sl > 1.2) continue;
        let inHouse = false; for (const ho of w.houses) if (Math.abs(ho.x - px) < ho.w / 2 + .5 && Math.abs(ho.z - pz) < ho.d / 2 + .5) { inHouse = true; break; } if (inHouse) continue;
        const k = .7 + h2 * .7;
        m4.compose(v.set(px, hgt - .05, pz), q.setFromEuler(e.set(0, hsh * 6, 0)), s.set(k, k, k)); G.grass.setMatrixAt(n, m4);
        G.grass.setColorAt(n, c.setRGB(.55 + h2 * .25, .7 + hsh * .2, .4)); n++;
      }
      G.grass.count = n; G.grass.instanceMatrix.needsUpdate = true; if (G.grass.instanceColor) G.grass.instanceColor.needsUpdate = true;
    }

    // ---------- soldados ----------
    const SKIN = [0xe0b48a, 0xc68c5e, 0x8d5a3b, 0xf0c8a0];
    const UNIFORMS = [[0x5b6342, 0x3e4430], [0x8a7350, 0x5d4d35], [0x2e3033, 0x1c1d1f], [0x5c6166, 0x3c4045], [0x4a5a3a, 0x30392a], [0xa08a62, 0x6e5f44], [0x6d3a32, 0x3e2420], [0x3d4b5c, 0x262f3a]];
    function nameSprite(text, color) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
      g.font = '700 30px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, 128, 32); g.fillStyle = color; g.fillText(text, 128, 32);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.scale.set(2.2, .55, 1); sp.position.y = 2.3; sp.renderOrder = 10; return sp;
    }
    G.makeChar = function (id, kind, name) {
      // kind: 'me' | 'mate' | 'enemy'
      const uni = kind === 'enemy' ? UNIFORMS[id % UNIFORMS.length] : kind === 'me' ? [0x3b4a3a, 0x2a3329] : [0x3d4b5c, 0x262f3a];
      const vestC = kind === 'me' ? 0x8a7a52 : kind === 'mate' ? 0x2f6f8f : uni[1];
      const mk = c => std(c, { roughness: .9 });
      const cloth = mk(uni[0]), pants = mk(uni[1]), vest = mk(vestC), skin = mk(SKIN[id % SKIN.length]), boots = mk(0x2a2420), gear = mk(0x2b2d2a), helm = mk(kind === 'enemy' ? uni[1] : vestC);
      const g = new THREE.Group();
      const add = (parent, geo, mat, x, y, z, sx, sy, sz, rx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (sx) m.scale.set(sx, sy, sz); if (rx) m.rotation.x = rx; m.castShadow = true; parent.add(m); return m; };
      const cy = (r1, r2, h) => new THREE.CylinderGeometry(r1, r2, h, 8);
      const hips = new THREE.Group(); hips.position.y = .92; g.add(hips);
      add(hips, box, pants, 0, 0, 0, .36, .2, .22);
      const legs = [-.1, .1].map(x => {
        const th = new THREE.Group(); th.position.set(x, -.05, 0); hips.add(th);
        add(th, cy(.085, .075, .44), pants, 0, -.22, 0);
        const kn = new THREE.Group(); kn.position.y = -.44; th.add(kn);
        add(kn, cy(.072, .06, .42), pants, 0, -.21, 0);
        add(kn, box, boots, 0, -.44, -.04, .12, .09, .24);
        return { th, kn };
      });
      const chest = new THREE.Group(); chest.position.y = .1; hips.add(chest);
      const torso = add(chest, cy(.2, .17, .5), cloth, 0, .27, 0, 1, 1, .7);
      add(chest, box, vest, 0, .3, 0, .42, .38, .3);
      add(chest, box, gear, 0, .2, -.16, .3, .12, .05); // porta-carregadores
      add(chest, box, gear, 0, .3, .23, .32, .42, .17); // mochila
      add(chest, cy(.06, .06, .1), skin, 0, .57, 0);
      const head = new THREE.Group(); head.position.y = .72; chest.add(head);
      add(head, new THREE.SphereGeometry(.13, 12, 10), skin, 0, 0, 0, 1, 1.08, 1);
      add(head, new THREE.SphereGeometry(.145, 12, 8, 0, TAU, 0, Math.PI / 2), helm, 0, .02, 0);
      add(head, box, mk(0x111214), 0, .01, -.115, .2, .05, .03); // óculos
      const arms = new THREE.Group(); arms.position.set(0, .48, 0); chest.add(arms);
      const ra = add(arms, cy(.055, .05, .42), cloth, .2, -.06, -.16, 1, 1, 1, Math.PI / 2 - .3);
      const la = add(arms, cy(.055, .05, .46), cloth, -.12, -.06, -.24, 1, 1, 1, Math.PI / 2 - .2);
      ra.rotation.z = .25; la.rotation.z = -.5;
      add(arms, new THREE.SphereGeometry(.05, 8, 6), mk(0x1e1f1d), .12, -.11, -.36);
      add(arms, new THREE.SphereGeometry(.05, 8, 6), mk(0x1e1f1d), .02, -.08, -.5);
      const gunHolder = new THREE.Group(); gunHolder.position.set(.1, -.06, -.36); arms.add(gunHolder);
      const chute = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 6, 0, TAU, 0, Math.PI / 2.6), std(kind === 'enemy' ? 0xb05a3a : 0x4a7a9a, { side: THREE.DoubleSide, roughness: .7 }));
      chute.position.y = 3.9; chute.visible = false; g.add(chute);
      const blob = new THREE.Mesh(new THREE.CircleGeometry(.45, 14), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .25, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2;
      const root = new THREE.Group(); root.add(g, blob);
      if (name) root.add(nameSprite(name, kind === 'mate' ? '#6fe0ff' : '#ffffff'));
      root.userData = { g, hips, legs, chest, arms, gunHolder, gunType: -1, chute, blob, torso, cloth, phase: Math.random() * 6 };
      scene.add(root); return root;
    };
    G.poseChar = function (ch, s, dt) {
      const u = ch.userData, f = s.f, moving = (f & 128) && !(f & 66);
      ch.position.set(s.x, s.y, s.z);
      u.g.rotation.set(0, s.yaw, 0); u.g.position.y = 0;
      u.chute.visible = !!(f & 64);
      u.phase += dt * (moving ? 10 : 0);
      const sw = moving ? Math.sin(u.phase) * .55 : 0;
      let hipY = .92, bend = 0;
      if (f & 2) { u.g.rotation.x = -1.2; u.g.position.y = .9; }
      else if (f & 1) { u.g.rotation.x = -1.4; u.g.position.y = .25; }
      else if (f & 16) { hipY = .62; bend = 1.1; }
      u.hips.position.y = hipY + (moving ? Math.abs(Math.cos(u.phase)) * .04 : 0);
      u.legs[0].th.rotation.x = sw - bend; u.legs[1].th.rotation.x = -sw - bend * .6;
      u.legs[0].kn.rotation.x = Math.max(0, -sw) * .9 + bend * 1.6; u.legs[1].kn.rotation.x = Math.max(0, sw) * .9 + bend * 1.3;
      u.chest.rotation.x = (f & 16) ? .15 : 0;
      u.arms.rotation.x = (f & 1) ? 0 : s.pitch;
      u.blob.position.y = Math.max(0, (s.ground ?? s.y) - s.y) + .04; u.blob.visible = !(f & 2);
      u.cloth.emissive.setHex((f & 8) ? 0x661a1a : 0);
      if (s.wt !== u.gunType) {
        u.gunHolder.clear(); u.gunType = s.wt;
        if (s.wt >= 0) u.gunHolder.add(makeGun(SH.WK[s.wt]));
      }
    };

    // ---------- itens no chão ----------
    G.makeItem = function (it) {
      const g = new THREE.Group();
      if (it.k === 'w') { const gun = makeGun(it.w.t); gun.rotation.set(0, 0, Math.PI / 2); gun.scale.setScalar(1.4); g.add(gun); }
      else if (it.k === 'm2' || it.k === 'm4') {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(.045, .06, .32, 10), std(0x1d1f21, { metalness: .5, roughness: .4 })); b.rotation.x = Math.PI / 2; g.add(b);
        const l = new THREE.Mesh(new THREE.CircleGeometry(.05, 10), std(it.k === 'm4' ? 0xb56cff : 0x4aa8ff, { emissive: it.k === 'm4' ? 0x3a1a66 : 0x10305a, metalness: .3, roughness: .1 })); l.position.z = .161; g.add(l);
      } else if (it.k === 'ammo') {
        const b = new THREE.Mesh(box, std(0x4b5a3a)); b.scale.set(.42, .22, .26); g.add(b);
        const s = new THREE.Mesh(box, std(0xd8b63a, { metalness: .4 })); s.scale.set(.44, .05, .28); s.position.y = .03; g.add(s);
      } else if (it.k === 'med') {
        const b = new THREE.Mesh(box, std(0xeeeeea)); b.scale.set(.38, .22, .28); g.add(b);
        for (const [sx, sz] of [[.24, .07], [.07, .2]]) { const x = new THREE.Mesh(box, std(0xc93232)); x.scale.set(sx, .02, sz); x.position.y = .115; g.add(x); }
      } else {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .36, 12), std(0x2f86c4, { metalness: .3, roughness: .3, emissive: 0x0a2440 })); g.add(b);
        const c2 = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .06, 10), std(0xdddddd)); c2.position.y = .21; g.add(c2);
      }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const ring = new THREE.Mesh(new THREE.RingGeometry(.4, .5, 20), new THREE.MeshBasicMaterial({ color: it.k === 'w' ? SH.RAR[it.w.r].c : 0xfff2b0, transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -.33;
      const root = new THREE.Group(); root.add(g, ring); root.userData.spin = g;
      root.position.set(it.x, it.y + .4, it.z); scene.add(root); return root;
    };

    // ---------- arma em primeira pessoa (ao mirar) ----------
    const vm = new THREE.Group(); camera.add(vm); vm.visible = false;
    const vmLight = new THREE.PointLight(0xfff2e0, .9, 1.5); vmLight.position.set(.15, .1, 0); vm.add(vmLight);
    let vmType = null;
    const vmSight = new THREE.Group(); vm.add(vmSight);
    {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .035, 18, 1, true), std(0x2a2c2e, { metalness: .6, roughness: .4, side: THREE.DoubleSide }));
      housing.rotation.x = Math.PI / 2; vmSight.add(housing);
      const base = new THREE.Mesh(box, std(0x2a2c2e)); base.scale.set(.016, .014, .035); base.position.y = -.022; vmSight.add(base);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(.0011, 10), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); dot.position.z = -.012; vmSight.add(dot);
      vmSight.userData.dot = dot;
    }
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.visible = false; scene.add(flash);
    const flashLight = new THREE.PointLight(0xffc070, 0, 8); scene.add(flashLight);
    let flashT = 0, vmKick = 0;
    G.setViewModel = function (type, scope) {
      if (!type) { vm.visible = false; return; }
      vm.visible = true;
      if (type !== vmType) { vm.children.filter(o => o.userData.isGun).forEach(o => vm.remove(o)); const gun = makeGun(type); gun.castShadow = false; gun.userData.isGun = true; vm.add(gun); vmType = type; }
      // posiciona a arma com a mira alinhada ao centro da tela
      const gun = vm.children.find(o => o.userData.isGun);
      gun.position.set(.004, -.105 - vmKick * .004, -.34 + vmKick * .05); gun.rotation.set(vmKick * .06, 0, 0);
      vmSight.visible = scope === 'ponto' || scope === 'x2';
      vmSight.position.set(0, -vmKick * .003, -.36 + vmKick * .05);
      vmSight.scale.setScalar(scope === 'x2' ? 1.5 : 1);
    };
    G.kick = function () { vmKick = 1; };
    G.muzzle = function (x, y, z, own) {
      flash.position.set(x, y, z); flash.scale.setScalar(own ? .55 : .8); flash.material.rotation = Math.random() * TAU; flash.visible = true;
      flashLight.position.set(x, y, z); flashLight.intensity = own ? 1.6 : 1.1; flashT = .05;
    };
    G.frame = function (fx, fz, dt) {
      sky.position.copy(camera.position); sky.scale.setScalar(camera.far * .9);
      sun.position.set(fx + 80, 160, fz + 50); sun.target.position.set(fx, 0, fz); sun.target.updateMatrixWorld();
      updateGrass(fx, fz);
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flash.visible = false; flashLight.intensity = 0; } }
      vmKick = Math.max(0, vmKick - dt * 9);
    };
    G.render = function () { renderer.render(scene, camera); };
    G.applyGraphics(conf);
    return G;
  }
  return { create };
})();

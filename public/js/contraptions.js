(function () {
  'use strict';

  window.GAME = window.GAME || {};

  // ============================================================================
  // Clockwork Sanctum — Contraptions, Volumetric Sunbeams, Aqueducts, Pendulum,
  // Sky Ferry, Sanctuary Exit Stair & Zero-GC Particle Pool (`window.GAME.Contraptions`)
  // ============================================================================

  var _scene = null;
  var _root = null;
  var _initialized = false;
  var _assets = null;

  // Pre-allocated object pools (0 geometry/texture allocations on buildLevel -> 0 leaks across 8x reloads)
  var _mirrorPool = [];
  var _emitterPool = [];
  var _beamPool = [];
  var _flarePool = [];
  var _waterCellPool = [];
  var _sluicePool = [];
  var _rollerPool = [];
  var _pillarPool = [];
  var _relayPool = [];
  var _particlePool = [];

  var _waterLockRig = null;
  var _pendulumRig = null;
  var _ferryRig = null;
  var _exitRig = null;
  var _altarZoneRings = [];

  // Active state counts & interactive raycast array
  var _activeCounts = {
    mirrors: 0,
    emitters: 0,
    beams: 0,
    flares: 0,
    waterCells: 0,
    sluices: 0,
    rollers: 0,
    pillars: 0,
    relays: 0
  };
  var _pickables = [];
  var _particleCursor = 0;
  var PARTICLE_POOL_SIZE = 128;

  // Lookup maps by id for animations
  var _mirrorById = {};
  var _sluiceById = {};
  var _lastExitUnlocked = false;
  var _lastLevelId = -1;

  function getConfig() {
    return window.GAME.CONFIG || {};
  }

  function getTileSize() {
    var cfg = getConfig();
    return cfg.TILE_SIZE || 2.0;
  }

  function getBeamY() {
    var cfg = getConfig();
    return typeof cfg.BEAM_Y === 'number' ? cfg.BEAM_Y : 0.82;
  }

  function gridToWorld(col, row) {
    var cfg = getConfig();
    if (typeof cfg.gridToWorld === 'function') {
      return cfg.gridToWorld(col, row);
    }
    var ts = getTileSize();
    return { x: (col - 3.5) * ts, z: (row - 3.5) * ts };
  }

  function getDirs() {
    var cfg = getConfig();
    return cfg.DIRS || [
      { dc: 0, dr: -1, name: 'N' },
      { dc: 1, dr: 0, name: 'E' },
      { dc: 0, dr: 1, name: 'S' },
      { dc: -1, dr: 0, name: 'W' }
    ];
  }

  function clamp01(v) {
    return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
  }

  function shortestAngleDelta(fromRad, toRad) {
    var twoPi = Math.PI * 2.0;
    var diff = (toRad - fromRad) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    return diff;
  }

  // Position-hashed smooth normal welder (eliminates UV seam lighting creases)
  function weldSmoothNormals(geom, creaseAngleDeg) {
    geom.computeVertexNormals();
    var pos = geom.getAttribute('position');
    var norm = geom.getAttribute('normal');
    if (!pos || !norm) return geom;
    var cosThresh = Math.cos(((creaseAngleDeg || 68) * Math.PI) / 180.0);
    var buckets = new Map();
    for (var i = 0; i < pos.count; i++) {
      var key = Math.round(pos.getX(i) * 1e4) + ',' +
                Math.round(pos.getY(i) * 1e4) + ',' +
                Math.round(pos.getZ(i) * 1e4);
      var list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(i);
    }
    buckets.forEach(function (indices) {
      if (indices.length < 2) return;
      var orig = new Array(indices.length);
      for (var k = 0; k < indices.length; k++) {
        var idx = indices[k];
        orig[k] = [norm.getX(idx), norm.getY(idx), norm.getZ(idx)];
      }
      for (var a = 0; a < indices.length; a++) {
        var sx = 0, sy = 0, sz = 0, nA = orig[a];
        for (var b = 0; b < indices.length; b++) {
          var nB = orig[b];
          if (nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2] >= cosThresh) {
            sx += nB[0];
            sy += nB[1];
            sz += nB[2];
          }
        }
        var len = Math.hypot(sx, sy, sz) || 1.0;
        norm.setXYZ(indices[a], sx / len, sy / len, sz / len);
      }
    });
    norm.needsUpdate = true;
    geom.computeBoundingSphere();
    return geom;
  }

  function tagPickHierarchy(rootObj, userDataObj) {
    rootObj.userData = userDataObj;
    rootObj.traverse(function (child) {
      child.userData = userDataObj;
    });
  }

  // Tri-planar UV normalizer so ExtrudeGeometry bevels & sides never stretch bump maps
  function normalizeTriPlanarUVs(geom, scale) {
    geom.computeVertexNormals();
    var pos = geom.getAttribute('position');
    var norm = geom.getAttribute('normal');
    var uv = geom.getAttribute('uv');
    if (!pos || !norm) return geom;
    if (!uv) {
      uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
      geom.setAttribute('uv', uv);
    }
    var s = scale || 0.5;
    for (var i = 0; i < pos.count; i++) {
      var px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      var nx = Math.abs(norm.getX(i)), ny = Math.abs(norm.getY(i)), nz = Math.abs(norm.getZ(i));
      var u, v;
      if (nz >= nx && nz >= ny) {
        u = px * s + 0.5;
        v = py * s + 0.5;
      } else if (nx >= ny) {
        u = pz * s + 0.5;
        v = py * s + 0.5;
      } else {
        u = px * s + 0.5;
        v = pz * s + 0.5;
      }
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
    return geom;
  }

  // ============================================================================
  // Bespoke Procedural Textures (Created ONCE at init -> 0 texture leaks)
  // ============================================================================
  function createCrystalPaneTexture() {
    var S = 256;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');

    // Rich Ankama sky-cerulean -> lavender -> warm golden-peach prism dispersion (zero whiteout!)
    var bg = ctx.createLinearGradient(S * 0.15, 0, S * 0.85, S);
    bg.addColorStop(0.0, '#58B2EE');
    bg.addColorStop(0.38, '#8BD4FF');
    bg.addColorStop(0.68, '#BCBDF5');
    bg.addColorStop(0.88, '#E8BA9E');
    bg.addColorStop(1.0, '#F5B574');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);

    // Warm iridescent lower-apex prism refraction glow matching Master Reference mirrors
    var prism = ctx.createRadialGradient(S * 0.5, S * 0.82, 4, S * 0.5, S * 0.80, S * 0.46);
    prism.addColorStop(0.0, 'rgba(255, 198, 128, 0.62)');
    prism.addColorStop(0.50, 'rgba(198, 176, 250, 0.34)');
    prism.addColorStop(1.0, 'rgba(120, 196, 248, 0.0)');
    ctx.fillStyle = prism;
    ctx.fillRect(0, 0, S, S);

    // Deep sky-teal edge vignette for jewel depth inside the brass diamond bezel
    var edgeVig = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.20, S * 0.5, S * 0.5, S * 0.62);
    edgeVig.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    edgeVig.addColorStop(1.0, 'rgba(28, 88, 142, 0.34)');
    ctx.fillStyle = edgeVig;
    ctx.fillRect(0, 0, S, S);

    // Crisp diagonal Ankama toy-box sky-glass specular bands (controlled alpha so crystal stays blue!)
    ctx.save();
    ctx.translate(S * 0.5, S * 0.5);
    ctx.rotate(-Math.PI / 4.6);
    ctx.fillStyle = 'rgba(244, 252, 255, 0.52)';
    ctx.fillRect(-S, -38, S * 2, 18);
    ctx.fillStyle = 'rgba(244, 252, 255, 0.30)';
    ctx.fillRect(-S, -8, S * 2, 8);
    ctx.fillStyle = 'rgba(255, 238, 196, 0.28)';
    ctx.fillRect(-S, 38, S * 2, 12);
    ctx.restore();

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function createContactShadowTexture() {
    var S = 128;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    var c = S * 0.5;
    var grad = ctx.createRadialGradient(c, c, S * 0.04, c, c, c * 0.96);
    grad.addColorStop(0.0, 'rgba(28, 15, 6, 0.54)');
    grad.addColorStop(0.48, 'rgba(34, 18, 8, 0.28)');
    grad.addColorStop(0.80, 'rgba(38, 20, 9, 0.08)');
    grad.addColorStop(1.0, 'rgba(38, 20, 9, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function createStarburstTexture() {
    var S = 128;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    var c = S * 0.5;

    // Soft radial golden aura (strictly 0.0 alpha at border)
    var rad = ctx.createRadialGradient(c, c, 0, c, c, c * 0.94);
    rad.addColorStop(0.0, 'rgba(255, 254, 238, 1.0)');
    rad.addColorStop(0.24, 'rgba(255, 226, 128, 0.85)');
    rad.addColorStop(0.58, 'rgba(255, 184, 46, 0.28)');
    rad.addColorStop(1.0, 'rgba(255, 160, 24, 0.0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, S, S);

    // 8-point crisp golden starburst rays
    for (var i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((i * Math.PI) / 4.0);
      var len = (i % 2 === 0) ? c * 0.90 : c * 0.62;
      var wid = (i % 2 === 0) ? 5.2 : 3.4;
      var sg = ctx.createLinearGradient(-len, 0, len, 0);
      sg.addColorStop(0.0, 'rgba(255, 220, 110, 0.0)');
      sg.addColorStop(0.35, 'rgba(255, 244, 190, 0.72)');
      sg.addColorStop(0.5, 'rgba(255, 255, 245, 1.0)');
      sg.addColorStop(0.65, 'rgba(255, 244, 190, 0.72)');
      sg.addColorStop(1.0, 'rgba(255, 220, 110, 0.0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function createGroundBeamRibbonTexture() {
    var W = 64, H = 128;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(W, H);
    var d = img.data;

    for (var y = 0; y < H; y++) {
      var v = y / (H - 1);
      // Soft feather at longitudinal ends so joints blend seamlessly without hard lines
      var endFade = Math.min(1.0, Math.min(v, 1.0 - v) / 0.12);
      for (var x = 0; x < W; x++) {
        var u = (x / (W - 1)) * 2.0 - 1.0;
        var lat = Math.max(0.0, 1.0 - Math.abs(u));
        var a = Math.pow(lat, 2.1) * endFade;
        var core = Math.pow(lat, 4.5);
        var idx = (y * W + x) * 4;
        d[idx]     = 255;
        d[idx + 1] = Math.round(192 + core * 60);
        d[idx + 2] = Math.round(64 + core * 165);
        d[idx + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function createPortalColumnTexture() {
    var W = 64, H = 128;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(W, H);
    var d = img.data;

    for (var y = 0; y < H; y++) {
      // v=0 top of cylinder -> 0 alpha; v=1 bottom -> bright gold
      var v = y / (H - 1);
      var vert = Math.pow(v, 1.85) * Math.min(1.0, (1.0 - v) * 8.0 + 0.35);
      if (y === 0) vert = 0.0;
      for (var x = 0; x < W; x++) {
        var u = x / W;
        var flute = 0.72 + 0.28 * Math.sin(u * Math.PI * 12.0);
        var a = clamp01(vert * flute);
        var idx = (y * W + x) * 4;
        d[idx]     = 255;
        d[idx + 1] = 224;
        d[idx + 2] = 118;
        d[idx + 3] = Math.round(a * 220);
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function createBeamGlowStripTexture() {
    var W = 64, H = 32;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(W, H);
    var d = img.data;

    for (var y = 0; y < H; y++) {
      var v = y / (H - 1);
      // Slight soft feather at very tips (1.5%) while keeping 97% full seamless span
      var endMask = Math.min(1.0, Math.min(v, 1.0 - v) / 0.025 + 0.35);
      for (var x = 0; x < W; x++) {
        var u = (x / (W - 1)) * 2.0 - 1.0; // -1..+1 across strip width
        var absU = Math.min(1.0, Math.abs(u));
        // Exact 0.0 alpha at |u|=1.0 -> ZERO hard cylinder silhouette edge at 400% zoom!
        var bell = Math.cos(absU * Math.PI * 0.5);
        var a = Math.pow(Math.max(0.0, bell), 2.35) * endMask;
        if (x === 0 || x === W - 1) a = 0.0;
        var hotCore = Math.pow(Math.max(0.0, bell), 6.0);
        var idx = (y * W + x) * 4;
        d[idx]     = 255;
        d[idx + 1] = Math.round(212 + hotCore * 43);
        d[idx + 2] = Math.round(90 + hotCore * 155);
        d[idx + 3] = Math.round(clamp01(a) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function createSplashRingTexture() {
    var S = 96;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    var half = S * 0.5;

    var g0 = ctx.createRadialGradient(half, half, 0, half, half, half);
    g0.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    g0.addColorStop(0.42, 'rgba(248, 254, 255, 0.96)');
    g0.addColorStop(0.64, 'rgba(180, 242, 255, 0.55)');
    g0.addColorStop(0.80, 'rgba(255, 255, 255, 0.85)');
    g0.addColorStop(0.93, 'rgba(210, 248, 255, 0.28)');
    g0.addColorStop(1.0, 'rgba(210, 248, 255, 0.0)');
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, S, S);

    // Painterly frothy whitewater bubble puffs around the plunge boil
    var puffs = [
      [half - 14, half - 6, 9], [half + 13, half - 5, 9],
      [half - 8, half + 11, 10], [half + 9, half + 10, 10],
      [half, half - 13, 8], [half, half + 4, 12]
    ];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    for (var p = 0; p < puffs.length; p++) {
      ctx.beginPath();
      ctx.arc(puffs[p][0], puffs[p][1], puffs[p][2], 0, Math.PI * 2);
      ctx.fill();
    }

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function createFlowChevronTexture() {
    var S = 128;
    var canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, S, S);

    // Organic painterly sinuous whitewater foam ribbons & sunlit sparkles (no road-lane 'V' arrows!)
    ctx.lineCap = 'round';
    var lanes = [
      { xBase: 0.24, amp: 5.5, phase: 0.2, width: 3.6, alpha: 0.72 },
      { xBase: 0.50, amp: 7.0, phase: 2.1, width: 4.4, alpha: 0.82 },
      { xBase: 0.76, amp: 5.5, phase: 4.0, width: 3.6, alpha: 0.72 }
    ];

    for (var l = 0; l < lanes.length; l++) {
      var ln = lanes[l];
      for (var seg = 0; seg < 2; seg++) {
        var yStart = (seg * 0.5 + l * 0.17) % 1.0;
        var yLen = 0.30;
        ctx.strokeStyle = 'rgba(246, 254, 255, ' + ln.alpha + ')';
        ctx.lineWidth = ln.width;
        ctx.beginPath();
        for (var st = 0; st <= 10; st++) {
          var f = st / 10.0;
          var yy = ((yStart + f * yLen) * S);
          var xx = ln.xBase * S + Math.sin((yStart + f * yLen) * Math.PI * 2.0 + ln.phase) * ln.amp;
          if (st === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        // Tile wrap duplicate if crossing bottom edge
        if ((yStart + yLen) > 1.0) {
          ctx.beginPath();
          for (var st2 = 0; st2 <= 10; st2++) {
            var f2 = st2 / 10.0;
            var yy2 = ((yStart + f2 * yLen - 1.0) * S);
            var xx2 = ln.xBase * S + Math.sin((yStart + f2 * yLen) * Math.PI * 2.0 + ln.phase) * ln.amp;
            if (st2 === 0) ctx.moveTo(xx2, yy2);
            else ctx.lineTo(xx2, yy2);
          }
          ctx.stroke();
        }
      }
    }

    // Soft feathered whitewater bank foam wisps & sunlit water glints
    var sparkles = [
      [28, 22, 2.4], [66, 48, 2.8], [98, 18, 2.2],
      [42, 86, 2.6], [84, 104, 2.5], [58, 118, 2.2]
    ];
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    for (var sp = 0; sp < sparkles.length; sp++) {
      ctx.beginPath();
      ctx.arc(sparkles[sp][0], sparkles[sp][1], sparkles[sp][2], 0, Math.PI * 2);
      ctx.fill();
    }

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  function buildBeamStripGeometry(wStart, wEnd) {
    var segsZ = 8;
    var posArr = [];
    var normArr = [];
    var uvArr = [];
    var indices = [];

    for (var iz = 0; iz <= segsZ; iz++) {
      var f = iz / segsZ;
      var z = -0.5 + f;
      var hw = (wStart + (wEnd - wStart) * f) * 0.5;
      posArr.push(-hw, 0.0, z, hw, 0.0, z);
      normArr.push(0.0, 1.0, 0.0, 0.0, 1.0, 0.0);
      uvArr.push(0.0, f, 1.0, f);
    }
    for (var q = 0; q < segsZ; q++) {
      var a = q * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }

    var g = new THREE.BufferGeometry();
    g.setIndex(indices);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normArr), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    g.computeBoundingSphere();
    return g;
  }

  // Faceted 3D Double-Sided Jewel-Cut Diamond Prism Geometry (slim ±0.023m jewel bevels
  // catch crisp sky/gold specular facets without burying the 90° sunbeam vertex!)
  function buildDiamondPrismGeometry() {
    var cy = 0.82;
    var gRing = [
      [0.0,    0.365], // 0: bottom
      [0.428,  cy],    // 1: right
      [0.0,    1.275], // 2: top
      [-0.428, cy]     // 3: left
    ];
    var tRing = [
      [0.0,    0.535], // 0: bottom
      [0.245,  cy],    // 1: right
      [0.0,    1.105], // 2: top
      [-0.245, cy]     // 3: left
    ];
    var zG = 0.011;
    var zT = 0.018;
    var zApex = 0.023;

    var posArr = [];
    var uvArr = [];
    function pushVert(x, y, z) {
      posArr.push(x, y, z);
      uvArr.push((x / 0.86) + 0.5, (y - 0.36) / 0.92);
    }
    function pushTri(ax, ay, az, bx, by, bz, cx, cy2, cz) {
      pushVert(ax, ay, az);
      pushVert(bx, by, bz);
      pushVert(cx, cy2, cz);
    }

    for (var s = 0; s < 4; s++) {
      var sn = (s + 1) % 4;
      var g0 = gRing[s], g1 = gRing[sn];
      var t0 = tRing[s], t1 = tRing[sn];

      // Front (+Z) crown bevel quad + central pyramid facet
      pushTri(g0[0], g0[1], zG, g1[0], g1[1], zG, t1[0], t1[1], zT);
      pushTri(g0[0], g0[1], zG, t1[0], t1[1], zT, t0[0], t0[1], zT);
      pushTri(t0[0], t0[1], zT, t1[0], t1[1], zT, 0.0, cy, zApex);

      // Back (-Z) crown bevel quad + central pyramid facet (outward CCW from -Z)
      pushTri(g1[0], g1[1], -zG, g0[0], g0[1], -zG, t0[0], t0[1], -zT);
      pushTri(g1[0], g1[1], -zG, t0[0], t0[1], -zT, t1[0], t1[1], -zT);
      pushTri(t1[0], t1[1], -zT, t0[0], t0[1], -zT, 0.0, cy, -zApex);

      // Girdle side band connecting +zG and -zG
      pushTri(g0[0], g0[1], -zG, g1[0], g1[1], -zG, g1[0], g1[1], zG);
      pushTri(g0[0], g0[1], -zG, g1[0], g1[1], zG, g0[0], g0[1], zG);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    // Low crease angle (12 deg) keeps every crystal jewel facet razor-sharp!
    return weldSmoothNormals(geo, 12);
  }

  // ============================================================================
  // Shared Sculpted Geometries & Materials Cache (Built ONCE at init)
  // ============================================================================
  function buildAssetCache() {
    var Tex = window.GAME.Textures;
    var sandMap = Tex && Tex.get ? Tex.get('sandstone') : null;
    var sandBump = Tex && Tex.get ? Tex.get('sandstoneBump') : null;
    var bronzeMap = Tex && Tex.get ? Tex.get('bronze') : null;
    var bronzeBump = Tex && Tex.get ? Tex.get('bronzeBump') : null;
    var oakMap = Tex && Tex.get ? Tex.get('oakWood') : null;
    var oakBump = Tex && Tex.get ? Tex.get('oakBump') : null;
    var cliffMap = Tex && Tex.get ? Tex.get('cliffStone') : null;
    var waterFoamMap = Tex && Tex.get ? Tex.get('waterFoam') : null;
    var mossMap = Tex && Tex.get ? Tex.get('moss') : null;

    var crystalTex = createCrystalPaneTexture();
    var contactShadowTex = createContactShadowTexture();
    var starburstTex = createStarburstTexture();
    var beamGlowTex = createBeamGlowStripTexture();
    var splashRingTex = createSplashRingTexture();
    var groundBeamTex = createGroundBeamRibbonTexture();
    var portalColTex = createPortalColumnTexture();
    var flowChevronTex = createFlowChevronTexture();

    // --- Materials ---
    // Rich Sunlit 24k Ankama Honey-Gold & Burnished Antique Bronze (calibrated against sky PMREM so B stays low -> zero pale cream or dark chocolate!)
    var matBrassGold = new THREE.MeshStandardMaterial({
      color: 0xEE9E18,
      bumpMap: bronzeBump,
      bumpScale: 0.008,
      emissive: 0x6B3C04,
      emissiveIntensity: 0.22,
      metalness: 0.26,
      roughness: 0.32,
      envMapIntensity: 0.34
    });

    var matBronzeDark = new THREE.MeshStandardMaterial({
      color: 0x9C5A1C,
      bumpMap: bronzeBump,
      bumpScale: 0.010,
      emissive: 0x331804,
      emissiveIntensity: 0.14,
      metalness: 0.28,
      roughness: 0.38,
      envMapIntensity: 0.28
    });

    var matBronzeRecess = new THREE.MeshStandardMaterial({
      color: 0x241408,
      metalness: 0.35,
      roughness: 0.78,
      envMapIntensity: 0.16
    });

    var matSandstone = new THREE.MeshStandardMaterial({
      color: 0xD99E4E,
      map: sandMap,
      bumpMap: sandBump,
      bumpScale: 0.016,
      metalness: 0.03,
      roughness: 0.78,
      envMapIntensity: 0.34
    });

    var matMoss = new THREE.MeshStandardMaterial({
      color: 0x8CC61E,
      map: mossMap,
      metalness: 0.02,
      roughness: 0.82,
      envMapIntensity: 0.34
    });

    var matOak = new THREE.MeshStandardMaterial({
      color: 0x824C24,
      map: oakMap,
      bumpMap: oakBump,
      bumpScale: 0.012,
      metalness: 0.05,
      roughness: 0.74,
      envMapIntensity: 0.32
    });

    var matCliffStone = new THREE.MeshStandardMaterial({
      color: 0x7E8592,
      map: cliffMap,
      metalness: 0.06,
      roughness: 0.78,
      envMapIntensity: 0.34
    });

    // Saturated Sky-Cerulean + Lavender/Gold Iridescent Prism Crystal (opaque -> 0 #FFFFFF whiteout!)
    var matPrismCrystal = new THREE.MeshStandardMaterial({
      color: 0x9ADFFF,
      map: crystalTex,
      emissive: 0x2C74A8,
      emissiveIntensity: 0.20,
      envMapIntensity: 0.46,
      metalness: 0.10,
      roughness: 0.10
    });

    // Struck mirrors glow warm sunlit sky-gold (#DCF4FF + #FFB838 emissive) without #FFFFFF blowout!
    var matPrismCrystalLit = new THREE.MeshStandardMaterial({
      color: 0xDCF4FF,
      map: crystalTex,
      emissive: 0xFFB838,
      emissiveIntensity: 0.38,
      envMapIntensity: 0.50,
      metalness: 0.08,
      roughness: 0.12
    });

    var matPrismCrystalDormant = new THREE.MeshStandardMaterial({
      color: 0x6E8FA8,
      map: crystalTex,
      emissive: 0x1E3A50,
      emissiveIntensity: 0.12,
      envMapIntensity: 0.28,
      metalness: 0.12,
      roughness: 0.26
    });

    var matSunGemActive = new THREE.MeshStandardMaterial({
      color: 0xFFF7D4,
      emissive: 0xFFB82A,
      emissiveIntensity: 0.78,
      envMapIntensity: 0.40,
      metalness: 0.12,
      roughness: 0.16
    });

    var matTurquoiseGem = new THREE.MeshStandardMaterial({
      color: 0x4ED8FF,
      emissive: 0x18A4EC,
      emissiveIntensity: 0.65,
      envMapIntensity: 0.40,
      metalness: 0.10,
      roughness: 0.18
    });

    var matAmberDanger = new THREE.MeshBasicMaterial({
      color: 0xEB9420,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matContactShadow = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });

    // Incandescent 3-Layer Feathered Golden Sunbeam:
    // 1. Crisp #FFFDF0 3D core filament (r=0.038m)
    // 2. Feathered NormalBlending #FFD248 golden sheath strip (zero hard cylinder edge!)
    // 3. Pure B=0 (#FF8800) AdditiveBlending warm amber bloom strip (never adds blue over sky!)
    var matBeamCore = new THREE.MeshBasicMaterial({
      color: 0xFFFBE2,
      transparent: true,
      opacity: 0.99,
      depthWrite: false
    });

    var matBeamInnerGlow = new THREE.MeshBasicMaterial({
      color: 0xFFC832,
      map: beamGlowTex,
      transparent: true,
      opacity: 0.93,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matBeamOuterHalo = new THREE.MeshBasicMaterial({
      color: 0xFF8800,
      map: beamGlowTex,
      transparent: true,
      opacity: 0.50,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matGroundRibbon = new THREE.MeshBasicMaterial({
      color: 0xFFB830,
      map: groundBeamTex,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matStarburst = new THREE.MeshBasicMaterial({
      color: 0xFFF2B2,
      map: starburstTex,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // Sparkling Cerulean-Turquoise Aqueduct Water Materials
    var matWaterSurface = new THREE.MeshStandardMaterial({
      color: 0x149CE6,
      map: waterFoamMap,
      emissive: 0x0B68A8,
      emissiveIntensity: 0.34,
      envMapIntensity: 0.42,
      metalness: 0.06,
      roughness: 0.12,
      transparent: true,
      opacity: 0.93
    });

    var matWaterFlowChevron = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      map: flowChevronTex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matSplashRing = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      map: splashRingTex,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matWaterDryChannel = new THREE.MeshStandardMaterial({
      color: 0x1E658C,
      emissive: 0x0A324A,
      emissiveIntensity: 0.14,
      envMapIntensity: 0.22,
      roughness: 0.28,
      metalness: 0.04,
      transparent: true,
      opacity: 0.30
    });

    var matPortalBeam = new THREE.MeshBasicMaterial({
      color: 0xFFE274,
      map: portalColTex,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    var matChevronGold = new THREE.MeshStandardMaterial({
      color: 0xFFDC64,
      emissive: 0xD98B16,
      emissiveIntensity: 0.28,
      metalness: 0.55,
      roughness: 0.26,
      envMapIntensity: 0.45
    });

    var matInvisibleHitbox = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });

    // Particle Pool Materials (4 shared materials -> 0 shader churn)
    var matPartRubble = cliffMap
      ? matCliffStone
      : new THREE.MeshStandardMaterial({ color: 0x8E9299, roughness: 0.8 });
    var matPartGoldSpark = new THREE.MeshBasicMaterial({
      color: 0xFFE578,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    });
    var matPartDust = new THREE.MeshStandardMaterial({
      color: 0xE6B86E,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: 0.76,
      depthWrite: false
    });
    var matPartSplash = new THREE.MeshBasicMaterial({
      color: 0xC6F4FF,
      transparent: true,
      opacity: 0.90,
      depthWrite: false
    });

    // --- Sculpted Geometries ---
    // 1. True 45° Diamond / Lozenge ('◇') Brass Frame & 3D Faceted Crystal Prism (strictly in local XY plane!)
    function makeMirrorDiamondPath(path, halfW, centerY, halfH) {
      path.moveTo(0.0, centerY - halfH);
      path.lineTo(halfW, centerY);
      path.lineTo(0.0, centerY + halfH);
      path.lineTo(-halfW, centerY);
      path.closePath();
    }

    var frameShape = new THREE.Shape();
    makeMirrorDiamondPath(frameShape, 0.54, 0.82, 0.57);
    var holePath = new THREE.Path();
    makeMirrorDiamondPath(holePath, 0.418, 0.82, 0.445);
    frameShape.holes.push(holePath);

    var geoMirrorFrame = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.088,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.022,
      bevelThickness: 0.022
    });
    geoMirrorFrame.translate(0, 0, -0.044);
    normalizeTriPlanarUVs(geoMirrorFrame, 0.65);
    weldSmoothNormals(geoMirrorFrame, 32);

    var lipShape = new THREE.Shape();
    makeMirrorDiamondPath(lipShape, 0.435, 0.82, 0.462);
    var lipHole = new THREE.Path();
    makeMirrorDiamondPath(lipHole, 0.398, 0.82, 0.425);
    lipShape.holes.push(lipHole);
    var geoMirrorInnerLip = new THREE.ExtrudeGeometry(lipShape, {
      depth: 0.104,
      bevelEnabled: false,
      steps: 1
    });
    geoMirrorInnerLip.translate(0, 0, -0.052);
    normalizeTriPlanarUVs(geoMirrorInnerLip, 0.70);
    weldSmoothNormals(geoMirrorInnerLip, 24);

    var geoMirrorPane = buildDiamondPrismGeometry();

    var geoContactDisc = new THREE.CircleGeometry(0.64, 24);
    geoContactDisc.rotateX(-Math.PI / 2);
    geoContactDisc.computeBoundingSphere();

    var geoTurntableOuter = weldSmoothNormals(new THREE.CylinderGeometry(0.35, 0.41, 0.058, 24), 45);
    normalizeTriPlanarUVs(geoTurntableOuter, 0.85);

    // Merged 12-tooth chiseled clockwork turntable gear (saves 8 draw calls per mirror!)
    var gearShape = new THREE.Shape();
    var gearTeeth = 12;
    for (var gt = 0; gt < gearTeeth * 2; gt++) {
      var ga = (gt / (gearTeeth * 2)) * Math.PI * 2;
      var gr = (gt % 2 === 0) ? 0.335 : 0.268;
      var gx = Math.cos(ga) * gr;
      var gy = Math.sin(ga) * gr;
      if (gt === 0) gearShape.moveTo(gx, gy);
      else gearShape.lineTo(gx, gy);
    }
    gearShape.closePath();
    var geoTurntableGear = new THREE.ExtrudeGeometry(gearShape, {
      depth: 0.056,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.006,
      bevelThickness: 0.006
    });
    geoTurntableGear.rotateX(-Math.PI / 2);
    geoTurntableGear.translate(0, -0.028, 0);
    normalizeTriPlanarUVs(geoTurntableGear, 0.85);
    weldSmoothNormals(geoTurntableGear, 32);

    var geoGearTooth = new THREE.BoxGeometry(0.068, 0.048, 0.095);
    geoGearTooth.computeBoundingSphere();
    var geoBracket = weldSmoothNormals(new THREE.BoxGeometry(0.072, 0.34, 0.105), 25);
    normalizeTriPlanarUVs(geoBracket, 0.85);
    var geoBossSphere = weldSmoothNormals(new THREE.SphereGeometry(0.048, 14, 10), 75);

    // Merged 3-point diamond frame bosses ([-0.54, 0.82], [+0.54, 0.82], [0, 0.26]) -> 1 draw call per mirror!
    var bossOffsets = [[-0.54, 0.82, 0.0], [0.54, 0.82, 0.0], [0.0, 0.26, 0.0]];
    var bSrcPos = geoBossSphere.getAttribute('position');
    var bSrcNorm = geoBossSphere.getAttribute('normal');
    var bSrcUv = geoBossSphere.getAttribute('uv');
    var bSrcIdx = geoBossSphere.getIndex();
    var bVCount = bSrcPos.count;
    var bOutPos = new Float32Array(bVCount * 3 * 3);
    var bOutNorm = new Float32Array(bVCount * 3 * 3);
    var bOutUv = bSrcUv ? new Float32Array(bVCount * 2 * 3) : null;
    var bOutIdx = bSrcIdx ? new Uint16Array(bSrcIdx.count * 3) : null;
    for (var bc = 0; bc < 3; bc++) {
      var box = bossOffsets[bc][0], boy = bossOffsets[bc][1], boz = bossOffsets[bc][2];
      var bvBase = bc * bVCount;
      for (var bi = 0; bi < bVCount; bi++) {
        var bp3 = (bvBase + bi) * 3;
        bOutPos[bp3]     = bSrcPos.getX(bi) + box;
        bOutPos[bp3 + 1] = bSrcPos.getY(bi) + boy;
        bOutPos[bp3 + 2] = bSrcPos.getZ(bi) + boz;
        bOutNorm[bp3]     = bSrcNorm.getX(bi);
        bOutNorm[bp3 + 1] = bSrcNorm.getY(bi);
        bOutNorm[bp3 + 2] = bSrcNorm.getZ(bi);
        if (bOutUv) {
          var bu2 = (bvBase + bi) * 2;
          bOutUv[bu2]     = bSrcUv.getX(bi);
          bOutUv[bu2 + 1] = bSrcUv.getY(bi);
        }
      }
      if (bOutIdx) {
        var biBase = bc * bSrcIdx.count;
        for (var bk = 0; bk < bSrcIdx.count; bk++) {
          bOutIdx[biBase + bk] = bSrcIdx.getX(bk) + bvBase;
        }
      }
    }
    var geoMirrorBosses = new THREE.BufferGeometry();
    geoMirrorBosses.setAttribute('position', new THREE.BufferAttribute(bOutPos, 3));
    geoMirrorBosses.setAttribute('normal', new THREE.BufferAttribute(bOutNorm, 3));
    if (bOutUv) geoMirrorBosses.setAttribute('uv', new THREE.BufferAttribute(bOutUv, 2));
    if (bOutIdx) geoMirrorBosses.setIndex(new THREE.BufferAttribute(bOutIdx, 1));
    geoMirrorBosses.computeBoundingSphere();

    var geoFinial = weldSmoothNormals(new THREE.OctahedronGeometry(0.068, 0), 20);

    // 2. Unit-length (1.0m along +Z) Feathered 3-Layer Incandescent Golden Sunbeams
    var geoBeamCore = new THREE.CylinderGeometry(0.028, 0.028, 1.0, 14, 1, false);
    geoBeamCore.rotateX(Math.PI / 2);
    geoBeamCore.computeBoundingSphere();

    var geoBeamInner = buildBeamStripGeometry(0.25, 0.25);
    var geoBeamOuter = buildBeamStripGeometry(0.44, 0.44);

    var geoBeamCoreTaper = new THREE.CylinderGeometry(0.003, 0.028, 1.0, 14, 1, false);
    geoBeamCoreTaper.rotateX(Math.PI / 2);
    geoBeamCoreTaper.computeBoundingSphere();

    var geoBeamInnerTaper = buildBeamStripGeometry(0.25, 0.012);
    var geoBeamOuterTaper = buildBeamStripGeometry(0.44, 0.022);

    var geoGroundRibbon = new THREE.PlaneGeometry(0.48, 1.0);
    geoGroundRibbon.rotateX(-Math.PI / 2);
    geoGroundRibbon.computeBoundingSphere();

    var geoStarburstQuad = new THREE.PlaneGeometry(0.46, 0.46);
    geoStarburstQuad.computeBoundingSphere();
    var geoMoteOrb = weldSmoothNormals(new THREE.SphereGeometry(0.024, 10, 8), 75);
    var geoCorePearl = weldSmoothNormals(new THREE.SphereGeometry(0.068, 14, 12), 75);

    // 3. 3D Extruded Brass Directional Chevron Shape
    var chevShape = new THREE.Shape();
    chevShape.moveTo(-0.24, 0.13);
    chevShape.lineTo(0.0, -0.15);
    chevShape.lineTo(0.24, 0.13);
    chevShape.lineTo(0.14, 0.20);
    chevShape.lineTo(0.0, 0.03);
    chevShape.lineTo(-0.14, 0.20);
    chevShape.closePath();
    var geoChevron = new THREE.ExtrudeGeometry(chevShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.006,
      bevelThickness: 0.006
    });
    geoChevron.rotateX(-Math.PI / 2);
    normalizeTriPlanarUVs(geoChevron, 1.2);
    weldSmoothNormals(geoChevron, 28);

    // 4. Emitter Pedestal & Sun-Lens Ring
    var geoEmitterPedestal = weldSmoothNormals(new THREE.CylinderGeometry(0.32, 0.42, 0.56, 8), 35);
    normalizeTriPlanarUVs(geoEmitterPedestal, 0.7);
    var geoLensTorus = weldSmoothNormals(new THREE.TorusGeometry(0.25, 0.042, 14, 28), 70);
    var geoInnerRing = weldSmoothNormals(new THREE.TorusGeometry(0.18, 0.024, 12, 24), 70);
    var geoSunCrystal = weldSmoothNormals(new THREE.OctahedronGeometry(0.14, 1), 25);

    // 5. Level 2 Aqueduct Water (1.04m x 2.02m fits cleanly inside carved stone banks & (5,1) 90° miter!), Intake Flume & Sluice Gate
    var geoWaterPatch = new THREE.PlaneGeometry(1.04, 2.02, 4, 8);
    geoWaterPatch.rotateX(-Math.PI / 2);
    geoWaterPatch.computeBoundingSphere();

    // Upstream dammed water terminates at z=+0.10m (strictly behind gatePlate z=-0.06..+0.06m -> 0 downstream bleed!)
    var geoWaterUpstreamHalf = new THREE.PlaneGeometry(1.04, 0.91, 4, 4);
    geoWaterUpstreamHalf.rotateX(-Math.PI / 2);
    geoWaterUpstreamHalf.translate(0, 0, 0.555);
    geoWaterUpstreamHalf.computeBoundingSphere();

    var geoWaterSpill = weldSmoothNormals(new THREE.CylinderGeometry(0.42, 0.18, 2.25, 14, 3, true, Math.PI * 0.5, Math.PI), 65);
    var geoIntakePlume = weldSmoothNormals(new THREE.CylinderGeometry(0.34, 0.44, 0.78, 14, 2, true, Math.PI * 0.5, Math.PI), 65);
    var geoSplashDisc = new THREE.CircleGeometry(0.50, 24);
    geoSplashDisc.rotateX(-Math.PI / 2);
    geoSplashDisc.computeBoundingSphere();
    var geoIntakeHood = weldSmoothNormals(new THREE.CylinderGeometry(0.46, 0.52, 0.46, 14, 1, false, 0, Math.PI), 55);
    geoIntakeHood.rotateZ(Math.PI / 2);
    normalizeTriPlanarUVs(geoIntakeHood, 0.8);
    geoIntakeHood.computeBoundingSphere();

    var geoSluicePost = new THREE.BoxGeometry(0.16, 1.38, 0.18);
    geoSluicePost.computeBoundingSphere();
    var geoSluiceBeam = new THREE.BoxGeometry(1.44, 0.16, 0.22);
    geoSluiceBeam.computeBoundingSphere();
    var geoSluiceGatePlate = new THREE.BoxGeometry(1.24, 0.76, 0.12);
    geoSluiceGatePlate.computeBoundingSphere();
    var geoHandWheelRim = weldSmoothNormals(new THREE.TorusGeometry(0.22, 0.028, 10, 20), 70);
    var geoScrewRod = weldSmoothNormals(new THREE.CylinderGeometry(0.032, 0.032, 1.12, 10), 70);

    var geoLockWheelRim = weldSmoothNormals(new THREE.TorusGeometry(0.54, 0.062, 12, 24), 70);
    var geoLockPaddle = new THREE.BoxGeometry(0.28, 0.16, 0.045);
    geoLockPaddle.computeBoundingSphere();

    // 6. Level 3 Proud 3D Bronze Conveyor Rollers & Slim Open-Frame Pendulum Pylons
    var geoRollerFrameSide = new THREE.BoxGeometry(0.085, 0.068, 1.40);
    normalizeTriPlanarUVs(geoRollerFrameSide, 0.75);
    geoRollerFrameSide.computeBoundingSphere();
    var geoRollerBed = new THREE.PlaneGeometry(1.42, 1.42);
    geoRollerBed.rotateX(-Math.PI / 2);
    geoRollerBed.computeBoundingSphere();
    var geoRollerCyl = weldSmoothNormals(new THREE.CylinderGeometry(0.092, 0.092, 1.28, 20), 75);
    geoRollerCyl.rotateZ(Math.PI / 2);
    normalizeTriPlanarUVs(geoRollerCyl, 0.9);
    geoRollerCyl.computeBoundingSphere();
    var geoRollerCollar = weldSmoothNormals(new THREE.CylinderGeometry(0.102, 0.102, 0.065, 18), 65);
    geoRollerCollar.rotateZ(Math.PI / 2);
    geoRollerCollar.computeBoundingSphere();

    // Compact Open-Frame Side Pylons (height 4.65m, width 0.52m) + Single Slim r=0.072m Overhead Axle at Y=4.55m
    var geoPylonPlinth = weldSmoothNormals(new THREE.CylinderGeometry(0.28, 0.36, 0.95, 8), 28);
    normalizeTriPlanarUVs(geoPylonPlinth, 0.65);
    var geoPylonStrut = weldSmoothNormals(new THREE.CylinderGeometry(0.056, 0.074, 3.82, 14), 65);
    var geoPylonCrown = weldSmoothNormals(new THREE.CylinderGeometry(0.18, 0.22, 0.34, 12), 55);
    geoPylonCrown.rotateZ(Math.PI / 2);
    geoPylonCrown.computeBoundingSphere();
    var geoAxleRod = weldSmoothNormals(new THREE.CylinderGeometry(0.072, 0.072, 17.0, 16), 70);
    geoAxleRod.rotateZ(Math.PI / 2);
    geoAxleRod.computeBoundingSphere();
    var geoPendulumRod = weldSmoothNormals(new THREE.CylinderGeometry(0.040, 0.040, 3.48, 12), 70);

    // Sleek Crescent Bell-Hammer blade shape (0.28m crisp clockwork blade depth + UV-normalized!)
    var bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.86, 0.38);
    bladeShape.quadraticCurveTo(0.0, 0.06, 0.86, 0.38);
    bladeShape.quadraticCurveTo(0.64, -0.44, 0.0, -0.58);
    bladeShape.quadraticCurveTo(-0.64, -0.44, -0.86, 0.38);
    var geoBellBlade = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.28,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.028,
      bevelThickness: 0.028
    });
    geoBellBlade.translate(0, 0, -0.14);
    normalizeTriPlanarUVs(geoBellBlade, 0.55);
    weldSmoothNormals(geoBellBlade, 38);

    // 7. Level 4 2x2 Sky Ferry & Chasm Rails
    var geoChasmRail = new THREE.BoxGeometry(16.4, 0.14, 0.16);
    geoChasmRail.computeBoundingSphere();
    var geoFerryChassis = new THREE.BoxGeometry(3.92, 0.36, 3.92);
    normalizeTriPlanarUVs(geoFerryChassis, 0.45);
    geoFerryChassis.computeBoundingSphere();
    var geoFerryQuadDeck = new THREE.BoxGeometry(1.82, 0.08, 1.82);
    normalizeTriPlanarUVs(geoFerryQuadDeck, 0.48);
    geoFerryQuadDeck.computeBoundingSphere();
    var geoFerryCog = weldSmoothNormals(new THREE.CylinderGeometry(0.76, 0.76, 0.14, 18), 35);
    normalizeTriPlanarUVs(geoFerryCog, 0.55);
    var geoBollard = weldSmoothNormals(new THREE.CylinderGeometry(0.11, 0.14, 0.38, 14), 65);
    var geoLeverStick = weldSmoothNormals(new THREE.CylinderGeometry(0.032, 0.042, 0.58, 10), 70);

    // 8. Sanctuary Exit Stair & Pillars
    var geoExitOuterRing = weldSmoothNormals(new THREE.RingGeometry(0.66, 0.88, 32), 60);
    geoExitOuterRing.rotateX(-Math.PI / 2);
    geoExitOuterRing.computeBoundingSphere();
    var geoExitInnerDisc = weldSmoothNormals(new THREE.CylinderGeometry(0.64, 0.68, 0.045, 28), 60);
    normalizeTriPlanarUVs(geoExitInnerDisc, 0.55);
    var geoExitStepArc = weldSmoothNormals(new THREE.CylinderGeometry(0.84, 0.90, 0.10, 24, 1, false, 0, Math.PI * 0.42), 45);
    var geoPortalCylinder = new THREE.CylinderGeometry(0.56, 0.68, 3.6, 24, 1, true);
    geoPortalCylinder.translate(0, 1.8, 0);
    geoPortalCylinder.computeBoundingSphere();
    var geoObeliskBody = weldSmoothNormals(new THREE.CylinderGeometry(0.38, 0.52, 1.65, 8), 28);
    normalizeTriPlanarUVs(geoObeliskBody, 0.5);
    var geoObeliskTip = weldSmoothNormals(new THREE.ConeGeometry(0.38, 0.44, 8), 28);

    // 9. Hitboxes & Particles
    var geoHitMirror = new THREE.BoxGeometry(1.18, 1.62, 0.78);
    geoHitMirror.translate(0, 0.81, 0);
    geoHitMirror.computeBoundingSphere();
    var geoHitSluice = new THREE.BoxGeometry(1.45, 1.55, 1.15);
    geoHitSluice.translate(0, 0.72, 0);
    geoHitSluice.computeBoundingSphere();
    var geoHitLever = new THREE.BoxGeometry(0.95, 1.05, 0.95);
    geoHitLever.translate(0, 0.48, 0);
    geoHitLever.computeBoundingSphere();

    var geoPartChunk = weldSmoothNormals(new THREE.DodecahedronGeometry(0.13, 0), 18);
    var geoPartPuff = weldSmoothNormals(new THREE.SphereGeometry(0.16, 10, 8), 75);
    var geoPartDrop = weldSmoothNormals(new THREE.SphereGeometry(0.075, 8, 6), 75);

    return {
      textures: {
        crystal: crystalTex,
        contactShadow: contactShadowTex,
        starburst: starburstTex,
        beamGlow: beamGlowTex,
        splashRing: splashRingTex,
        groundBeam: groundBeamTex,
        portalCol: portalColTex,
        flowChevron: flowChevronTex,
        waterFoam: waterFoamMap
      },
      mats: {
        brassGold: matBrassGold,
        bronzeDark: matBronzeDark,
        bronzeRecess: matBronzeRecess,
        sandstone: matSandstone,
        moss: matMoss,
        oak: matOak,
        cliffStone: matCliffStone,
        prismCrystal: matPrismCrystal,
        prismCrystalLit: matPrismCrystalLit,
        prismCrystalDormant: matPrismCrystalDormant,
        sunGemActive: matSunGemActive,
        turquoiseGem: matTurquoiseGem,
        amberDanger: matAmberDanger,
        contactShadow: matContactShadow,
        beamCore: matBeamCore,
        beamInner: matBeamInnerGlow,
        beamOuter: matBeamOuterHalo,
        groundRibbon: matGroundRibbon,
        starburst: matStarburst,
        waterSurface: matWaterSurface,
        waterFlowChevron: matWaterFlowChevron,
        splashRing: matSplashRing,
        waterDryChannel: matWaterDryChannel,
        portalBeam: matPortalBeam,
        chevronGold: matChevronGold,
        invisibleHit: matInvisibleHitbox,
        partRubble: matPartRubble,
        partGoldSpark: matPartGoldSpark,
        partDust: matPartDust,
        partSplash: matPartSplash
      },
      geos: {
        mirrorFrame: geoMirrorFrame,
        mirrorInnerLip: geoMirrorInnerLip,
        mirrorPane: geoMirrorPane,
        contactDisc: geoContactDisc,
        turntableOuter: geoTurntableOuter,
        turntableGear: geoTurntableGear,
        gearTooth: geoGearTooth,
        bracket: geoBracket,
        bossSphere: geoBossSphere,
        mirrorBosses: geoMirrorBosses,
        finial: geoFinial,
        beamCore: geoBeamCore,
        beamInner: geoBeamInner,
        beamOuter: geoBeamOuter,
        beamCoreTaper: geoBeamCoreTaper,
        beamInnerTaper: geoBeamInnerTaper,
        beamOuterTaper: geoBeamOuterTaper,
        groundRibbon: geoGroundRibbon,
        starburstQuad: geoStarburstQuad,
        moteOrb: geoMoteOrb,
        corePearl: geoCorePearl,
        chevron: geoChevron,
        emitterPedestal: geoEmitterPedestal,
        lensTorus: geoLensTorus,
        innerRing: geoInnerRing,
        sunCrystal: geoSunCrystal,
        waterPatch: geoWaterPatch,
        waterUpstreamHalf: geoWaterUpstreamHalf,
        waterSpill: geoWaterSpill,
        intakePlume: geoIntakePlume,
        splashDisc: geoSplashDisc,
        intakeHood: geoIntakeHood,
        sluicePost: geoSluicePost,
        sluiceBeam: geoSluiceBeam,
        sluiceGatePlate: geoSluiceGatePlate,
        handWheelRim: geoHandWheelRim,
        screwRod: geoScrewRod,
        lockWheelRim: geoLockWheelRim,
        lockPaddle: geoLockPaddle,
        rollerFrameSide: geoRollerFrameSide,
        rollerBed: geoRollerBed,
        rollerCyl: geoRollerCyl,
        rollerCollar: geoRollerCollar,
        pylonPlinth: geoPylonPlinth,
        pylonStrut: geoPylonStrut,
        pylonCrown: geoPylonCrown,
        axleRod: geoAxleRod,
        pendulumRod: geoPendulumRod,
        bellBlade: geoBellBlade,
        chasmRail: geoChasmRail,
        ferryChassis: geoFerryChassis,
        ferryQuadDeck: geoFerryQuadDeck,
        ferryCog: geoFerryCog,
        bollard: geoBollard,
        leverStick: geoLeverStick,
        exitOuterRing: geoExitOuterRing,
        exitInnerDisc: geoExitInnerDisc,
        exitStepArc: geoExitStepArc,
        portalCylinder: geoPortalCylinder,
        obeliskBody: geoObeliskBody,
        obeliskTip: geoObeliskTip,
        hitMirror: geoHitMirror,
        hitSluice: geoHitSluice,
        hitLever: geoHitLever,
        partChunk: geoPartChunk,
        partPuff: geoPartPuff,
        partDrop: geoPartDrop
      }
    };
  }

  // ============================================================================
  // Contraption Rig Builders
  // ============================================================================
  function createMirrorRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // Dark-umber radial contact AO shadow disc grounding the turntable on the sandstone tile
    var aoDisc = new THREE.Mesh(g.contactDisc, m.contactShadow);
    aoDisc.position.y = 0.007;
    aoDisc.renderOrder = 2;
    root.add(aoDisc);

    // Compact stepped antique-bronze turntable socket on tile surface (Y=0..0.058m)
    var baseCollar = new THREE.Mesh(g.turntableOuter, m.bronzeDark);
    baseCollar.position.y = 0.029;
    baseCollar.castShadow = true;
    baseCollar.receiveShadow = true;
    root.add(baseCollar);

    // Optional Level 2 Water-Dynamo Collar (shown when turretWaterPowered === true)
    var waterCollar = new THREE.Group();
    waterCollar.visible = false;
    var wcRing = new THREE.Mesh(g.lensTorus, m.brassGold);
    wcRing.rotation.x = Math.PI / 2;
    wcRing.scale.set(1.78, 1.78, 1.25);
    wcRing.position.y = 0.075;
    waterCollar.add(wcRing);
    for (var wg = 0; wg < 4; wg++) {
      var gem = new THREE.Mesh(g.bossSphere, m.turquoiseGem);
      var ang = (wg * Math.PI) / 2;
      gem.position.set(Math.cos(ang) * 0.44, 0.085, Math.sin(ang) * 0.44);
      waterCollar.add(gem);
    }
    root.add(waterCollar);

    // Rotating Mirror Group: local crystal plane lies strictly in local XY!
    // mirrorVisualYaw(rot) adds an isometric presentation cant on odd rotations so '\' mirrors never collapse edge-on!
    var mirrorGroup = new THREE.Group();
    root.add(mirrorGroup);

    var innerGear = new THREE.Mesh(g.turntableGear, m.brassGold);
    innerGear.position.y = 0.070;
    innerGear.castShadow = true;
    innerGear.receiveShadow = true;
    mirrorGroup.add(innerGear);

    // Curved 45-degree brass yoke cradle arms hugging the lower diamond edges
    var brL = new THREE.Mesh(g.bracket, m.bronzeDark);
    brL.position.set(-0.22, 0.34, 0.0);
    brL.rotation.z = 0.74;
    brL.castShadow = true;
    mirrorGroup.add(brL);

    var brR = new THREE.Mesh(g.bracket, m.bronzeDark);
    brR.position.set(0.22, 0.34, 0.0);
    brR.rotation.z = -0.74;
    brR.castShadow = true;
    mirrorGroup.add(brR);

    // Center pedestal stem & bottom apex boss anchoring the diamond lozenge at (0, 0.25)
    var stem = new THREE.Mesh(g.bracket, m.brassGold);
    stem.scale.set(1.15, 0.62, 1.15);
    stem.position.set(0.0, 0.18, 0.0);
    stem.castShadow = true;
    mirrorGroup.add(stem);

    // True 45° Diamond ('◇') Gleaming Gold-Brass Beveled Frame centered at BEAM_Y = 0.82m
    var frameMesh = new THREE.Mesh(g.mirrorFrame, m.brassGold);
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    mirrorGroup.add(frameMesh);

    // Dark-bronze inner jewelry bezel lip for crisp contrast around the sky crystal
    var innerLipMesh = new THREE.Mesh(g.mirrorInnerLip, m.bronzeRecess);
    mirrorGroup.add(innerLipMesh);

    // Slim Faceted 3D Double-Sided Jewel-Cut Sky-Crystal Prism Wedge
    var paneMesh = new THREE.Mesh(g.mirrorPane, m.prismCrystal);
    paneMesh.castShadow = true;
    paneMesh.receiveShadow = false;
    mirrorGroup.add(paneMesh);

    // Merged 3-point diamond bosses + top crown finial
    var bossesMesh = new THREE.Mesh(g.mirrorBosses, m.bronzeDark);
    mirrorGroup.add(bossesMesh);

    var topFinial = new THREE.Mesh(g.finial, m.brassGold);
    topFinial.position.set(0.0, 1.44, 0.0);
    topFinial.castShadow = true;
    mirrorGroup.add(topFinial);

    // Generous raycast hitbox
    var hitMesh = new THREE.Mesh(g.hitMirror, m.invisibleHit);
    mirrorGroup.add(hitMesh);

    var rig = {
      id: null,
      col: 0,
      row: 0,
      rot: 0,
      root: root,
      mirrorGroup: mirrorGroup,
      paneMesh: paneMesh,
      waterCollar: waterCollar,
      hitMesh: hitMesh,
      goalX: 0,
      goalZ: 0,
      curYaw: Math.PI / 4,
      startYaw: Math.PI / 4,
      targetYaw: Math.PI / 4,
      animTimer: 0,
      animDuration: 0.26,
      onComplete: null,
      powered: true,
      turretWaterPowered: false,
      struck: false
    };

    _root.add(root);
    return rig;
  }

  function createEmitterRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    var aoDisc = new THREE.Mesh(g.contactDisc, m.contactShadow);
    aoDisc.position.y = 0.007;
    aoDisc.scale.setScalar(0.95);
    aoDisc.renderOrder = 2;
    root.add(aoDisc);

    // Pedestal base (hidden if mounted beside a corner brazier)
    var pedestal = new THREE.Mesh(g.emitterPedestal, m.sandstone);
    pedestal.position.y = 0.28;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    root.add(pedestal);

    var pedCollar = new THREE.Mesh(g.turntableOuter, m.bronzeDark);
    pedCollar.position.y = 0.03;
    pedCollar.scale.set(1.05, 1.0, 1.05);
    root.add(pedCollar);

    // Elevated Sun-Lens Turret Assembly centered at BEAM_Y = 0.82m
    var head = new THREE.Group();
    head.position.y = getBeamY();
    root.add(head);

    var outerBezel = new THREE.Mesh(g.lensTorus, m.brassGold);
    outerBezel.position.z = -0.24; // Points forward along local -Z (North = dir 0)
    outerBezel.castShadow = true;
    head.add(outerBezel);

    var gyroRing1 = new THREE.Mesh(g.innerRing, m.bronzeDark);
    head.add(gyroRing1);

    var gyroRing2 = new THREE.Mesh(g.innerRing, m.brassGold);
    gyroRing2.rotation.y = Math.PI / 2;
    head.add(gyroRing2);

    var crystal = new THREE.Mesh(g.sunCrystal, m.sunGemActive);
    head.add(crystal);

    // Directional golden floor chevron showing emission direction clearly
    var chev = new THREE.Mesh(g.chevron, m.chevronGold);
    chev.position.set(0, 0.018, -0.66);
    root.add(chev);

    _root.add(root);
    return {
      root: root,
      aoDisc: aoDisc,
      pedestal: pedestal,
      pedCollar: pedCollar,
      head: head,
      gyroRing1: gyroRing1,
      gyroRing2: gyroRing2,
      crystal: crystal,
      active: true
    };
  }

  function createBeamRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    var spanGroup = new THREE.Group();
    root.add(spanGroup);

    var outer = new THREE.Mesh(g.beamOuter, m.beamOuter);
    outer.renderOrder = 9;
    spanGroup.add(outer);

    var inner = new THREE.Mesh(g.beamInner, m.beamInner);
    inner.renderOrder = 10;
    spanGroup.add(inner);

    var core = new THREE.Mesh(g.beamCore, m.beamCore);
    core.renderOrder = 11;
    spanGroup.add(core);

    var ground = new THREE.Mesh(g.groundRibbon, m.groundRibbon);
    ground.renderOrder = 5;
    root.add(ground);

    _root.add(root);
    return {
      root: root,
      spanGroup: spanGroup,
      core: core,
      inner: inner,
      outer: outer,
      ground: ground,
      midX: 0.0,
      midY: 0.82,
      midZ: 0.0,
      yaw: 0.0,
      segLen: 1.0,
      bounceIndex: 0
    };
  }

  function createFlareRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    var pearl = new THREE.Mesh(g.corePearl, m.beamCore);
    pearl.renderOrder = 13;
    root.add(pearl);

    var starHoriz = new THREE.Mesh(g.starburstQuad, m.starburst);
    starHoriz.rotation.x = -Math.PI / 2;
    starHoriz.renderOrder = 14;
    root.add(starHoriz);

    // Camera-facing billboard wrapper + rotating starburst quad inside
    var starBillboard = new THREE.Group();
    root.add(starBillboard);
    var starDiag1 = new THREE.Mesh(g.starburstQuad, m.starburst);
    starDiag1.renderOrder = 14;
    starBillboard.add(starDiag1);

    var motes = [];
    for (var i = 0; i < 2; i++) {
      var mote = new THREE.Mesh(g.moteOrb, m.partGoldSpark);
      mote.renderOrder = 15;
      root.add(mote);
      motes.push(mote);
    }

    _root.add(root);
    return {
      root: root,
      pearl: pearl,
      starHoriz: starHoriz,
      starBillboard: starBillboard,
      starDiag1: starDiag1,
      motes: motes,
      baseX: 0.0,
      baseY: 0.82,
      baseZ: 0.0,
      camOffset: 0.056,
      baseScale: 1.0,
      seed: Math.random() * 6.28
    };
  }

  function createWaterCellRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // 1.04m wide channel ribbon recessed strictly inside World's carved sandstone banks!
    var surf = new THREE.Mesh(g.waterPatch, m.waterSurface);
    surf.position.y = -0.095;
    surf.receiveShadow = true;
    root.add(surf);

    var chevronOverlay = new THREE.Mesh(g.waterPatch, m.waterFlowChevron);
    chevronOverlay.scale.set(0.90, 1.0, 0.96);
    chevronOverlay.position.y = -0.084;
    chevronOverlay.renderOrder = 4;
    root.add(chevronOverlay);

    // 90° L-Corner Perpendicular Inflow Elbow Leg (seamless carved corner on (5,0)->(5,1)->(4,1)!)
    var inflowGroup = new THREE.Group();
    inflowGroup.visible = false;
    var inflowSurf = new THREE.Mesh(g.waterUpstreamHalf, m.waterSurface);
    inflowSurf.position.y = -0.0955;
    inflowSurf.receiveShadow = true;
    inflowGroup.add(inflowSurf);

    var inflowFoam = new THREE.Mesh(g.waterUpstreamHalf, m.waterFlowChevron);
    inflowFoam.scale.set(0.88, 1.0, 0.92);
    inflowFoam.position.y = -0.0845;
    inflowFoam.renderOrder = 4;
    inflowGroup.add(inflowFoam);
    root.add(inflowGroup);

    // Cliff-edge waterfall spill plume (tapered + frothy spray crown!)
    var spillGroup = new THREE.Group();
    spillGroup.visible = false;
    var spill = new THREE.Mesh(g.waterSpill, m.waterSurface);
    spill.position.set(0, -1.16, -1.02);
    spillGroup.add(spill);
    var spillSplash = new THREE.Mesh(g.splashDisc, m.splashRing);
    spillSplash.position.set(0, -0.088, -0.94);
    spillSplash.scale.set(0.92, 1.0, 0.72);
    spillSplash.renderOrder = 6;
    spillGroup.add(spillSplash);
    root.add(spillGroup);

    // Upstream Waterwheel Intake Cascade, Bronze Spout & Frothy Plunge Splash Ring ((5,0) & (6,0)!)
    var intakeGroup = new THREE.Group();
    intakeGroup.visible = false;
    var hood = new THREE.Mesh(g.intakeHood, m.bronzeDark);
    hood.position.set(0, 0.14, 0.96);
    hood.castShadow = true;
    intakeGroup.add(hood);

    var hoodLip = new THREE.Mesh(g.lensTorus, m.brassGold);
    hoodLip.scale.set(1.85, 1.15, 1.0);
    hoodLip.position.set(0, 0.08, 0.82);
    intakeGroup.add(hoodLip);

    var plume = new THREE.Mesh(g.intakePlume, m.waterSurface);
    plume.rotation.x = 0.50;
    plume.position.set(0, 0.04, 0.78);
    intakeGroup.add(plume);

    var plumeFoam = new THREE.Mesh(g.intakePlume, m.waterFlowChevron);
    plumeFoam.rotation.x = 0.50;
    plumeFoam.scale.set(0.86, 0.96, 1.03);
    plumeFoam.position.set(0, 0.045, 0.77);
    plumeFoam.renderOrder = 5;
    intakeGroup.add(plumeFoam);

    var splashDisc = new THREE.Mesh(g.splashDisc, m.splashRing);
    splashDisc.position.set(0, -0.078, 0.56);
    splashDisc.renderOrder = 6;
    intakeGroup.add(splashDisc);

    root.add(intakeGroup);

    _root.add(root);
    return {
      root: root,
      surf: surf,
      chevronOverlay: chevronOverlay,
      inflowGroup: inflowGroup,
      spill: spillGroup,
      intakeGroup: intakeGroup,
      splashDisc: splashDisc,
      active: false,
      phase: Math.random() * 6.28
    };
  }

  function createSluiceRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // Brimming upstream turquoise headwater dammed right behind closed bronze sluice gate!
    var upstreamWater = new THREE.Mesh(g.waterUpstreamHalf, m.waterSurface);
    upstreamWater.position.y = -0.092;
    upstreamWater.receiveShadow = true;
    root.add(upstreamWater);

    var upstreamFoam = new THREE.Mesh(g.waterUpstreamHalf, m.waterFlowChevron);
    upstreamFoam.scale.set(0.88, 1.0, 0.92);
    upstreamFoam.position.y = -0.081;
    upstreamFoam.renderOrder = 4;
    root.add(upstreamFoam);

    var postL = new THREE.Mesh(g.sluicePost, m.bronzeDark);
    postL.position.set(-0.66, 0.56, 0);
    postL.castShadow = true;
    postL.receiveShadow = true;
    root.add(postL);

    var postR = new THREE.Mesh(g.sluicePost, m.bronzeDark);
    postR.position.set(0.66, 0.56, 0);
    postR.castShadow = true;
    postR.receiveShadow = true;
    root.add(postR);

    var crossBeam = new THREE.Mesh(g.sluiceBeam, m.brassGold);
    crossBeam.position.set(0, 1.24, 0);
    crossBeam.castShadow = true;
    root.add(crossBeam);

    var screw = new THREE.Mesh(g.screwRod, m.brassGold);
    screw.position.set(0, 0.72, 0);
    root.add(screw);

    var gatePlate = new THREE.Mesh(g.sluiceGatePlate, m.bronzeDark);
    gatePlate.position.set(0, 0.16, 0);
    gatePlate.castShadow = true;
    gatePlate.receiveShadow = true;
    root.add(gatePlate);

    var wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 1.38, 0);
    var wheelRim = new THREE.Mesh(g.handWheelRim, m.brassGold);
    wheelRim.rotation.x = Math.PI / 2;
    wheelRim.castShadow = true;
    wheelGroup.add(wheelRim);
    var spoke1 = new THREE.Mesh(g.gearTooth, m.brassGold);
    spoke1.scale.set(5.2, 0.6, 0.5);
    wheelGroup.add(spoke1);
    var spoke2 = new THREE.Mesh(g.gearTooth, m.brassGold);
    spoke2.scale.set(0.5, 0.6, 4.0);
    wheelGroup.add(spoke2);
    root.add(wheelGroup);

    var statusGem = new THREE.Mesh(g.bossSphere, m.turquoiseGem);
    statusGem.scale.set(1.35, 1.35, 1.35);
    statusGem.position.set(0, 1.24, 0.12);
    root.add(statusGem);

    var hitMesh = new THREE.Mesh(g.hitSluice, m.invisibleHit);
    root.add(hitMesh);

    _root.add(root);
    return {
      id: null,
      root: root,
      upstreamWater: upstreamWater,
      upstreamFoam: upstreamFoam,
      gatePlate: gatePlate,
      wheelGroup: wheelGroup,
      statusGem: statusGem,
      hitMesh: hitMesh,
      open: false,
      curOpen: 0.0
    };
  }

  function buildWaterLockRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // Bronze aqueduct frame straddling the channel lock cell
    var sideL = new THREE.Mesh(g.bracket, m.bronzeDark);
    sideL.scale.set(1.6, 2.5, 3.6);
    sideL.position.set(-0.74, 0.36, 0);
    sideL.castShadow = true;
    root.add(sideL);

    var sideR = new THREE.Mesh(g.bracket, m.bronzeDark);
    sideR.scale.set(1.6, 2.5, 3.6);
    sideR.position.set(0.74, 0.36, 0);
    sideR.castShadow = true;
    root.add(sideR);

    // Undershot bronze-and-oak paddle wheel (rotates around X axis when flow is N/S)
    var wheel = new THREE.Group();
    wheel.position.set(0, 0.42, 0);
    root.add(wheel);

    var rimL = new THREE.Mesh(g.lockWheelRim, m.brassGold);
    rimL.rotation.y = Math.PI / 2;
    rimL.position.x = -0.18;
    rimL.castShadow = true;
    wheel.add(rimL);

    var rimR = new THREE.Mesh(g.lockWheelRim, m.brassGold);
    rimR.rotation.y = Math.PI / 2;
    rimR.position.x = 0.18;
    rimR.castShadow = true;
    wheel.add(rimR);

    var axle = new THREE.Mesh(g.rollerCyl, m.bronzeDark);
    axle.scale.set(1.18, 0.65, 0.65);
    wheel.add(axle);

    for (var p = 0; p < 8; p++) {
      var ang = (p * Math.PI) / 4;
      var pad = new THREE.Mesh(g.lockPaddle, m.oak);
      pad.position.set(0, Math.sin(ang) * 0.54, Math.cos(ang) * 0.54);
      pad.rotation.x = -ang;
      pad.castShadow = true;
      wheel.add(pad);
    }

    // Side dynamo beacon spire showing power transmission to Prism Turret
    var spire = new THREE.Mesh(g.emitterPedestal, m.brassGold);
    spire.scale.set(0.42, 1.45, 0.42);
    spire.position.set(-0.74, 0.92, 0);
    spire.castShadow = true;
    root.add(spire);

    var dynamoCrystal = new THREE.Mesh(g.sunCrystal, m.prismCrystalDormant);
    dynamoCrystal.scale.set(1.15, 1.30, 1.15);
    dynamoCrystal.position.set(-0.74, 1.46, 0);
    root.add(dynamoCrystal);

    _root.add(root);
    return {
      root: root,
      wheel: wheel,
      dynamoCrystal: dynamoCrystal,
      active: false,
      spinSpeed: 0.0
    };
  }

  function createRollerRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // Deep dark oiled-bronze recessed pit liner (sits inside World's -0.095m roller recess;
    // also frames bold dark crevices between the 5 proud 3D bronze cylinders!)
    var bed = new THREE.Mesh(g.rollerBed, m.bronzeRecess);
    bed.position.y = -0.086;
    bed.receiveShadow = true;
    root.add(bed);

    var railL = new THREE.Mesh(g.rollerFrameSide, m.bronzeDark);
    railL.position.set(-0.675, -0.024, 0);
    railL.castShadow = true;
    railL.receiveShadow = true;
    root.add(railL);

    var railR = new THREE.Mesh(g.rollerFrameSide, m.bronzeDark);
    railR.position.set(0.675, -0.024, 0);
    railR.castShadow = true;
    railR.receiveShadow = true;
    root.add(railR);

    var railF = new THREE.Mesh(g.rollerFrameSide, m.bronzeDark);
    railF.rotation.y = Math.PI / 2;
    railF.position.set(0, -0.026, -0.675);
    root.add(railF);

    var railB = new THREE.Mesh(g.rollerFrameSide, m.bronzeDark);
    railB.rotation.y = Math.PI / 2;
    railB.position.set(0, -0.026, 0.675);
    root.add(railB);

    // 5 Proud 3D Cylindrical Bronze Rollers (r=0.092m centered at y=-0.066m -> crests proudly at +0.026m!)
    var cylinders = [];
    for (var i = 0; i < 5; i++) {
      var zPos = (i - 2) * 0.285;
      var cylGrp = new THREE.Group();
      cylGrp.position.set(0, -0.066, zPos);

      var cyl = new THREE.Mesh(g.rollerCyl, (i % 2 === 0) ? m.brassGold : m.bronzeDark);
      cyl.castShadow = true;
      cyl.receiveShadow = true;
      cylGrp.add(cyl);

      // 3 raised traction rings along each roller cylinder for unmistakable 3D mechanical relief
      for (var cIdx = -1; cIdx <= 1; cIdx++) {
        var colMesh = new THREE.Mesh(g.rollerCollar, (i % 2 === 0) ? m.bronzeDark : m.brassGold);
        colMesh.position.x = cIdx * 0.42;
        cylGrp.add(colMesh);
      }

      root.add(cylGrp);
      cylinders.push(cylGrp);

      // Bearing end-bosses on side rails
      var capL = new THREE.Mesh(g.bossSphere, m.brassGold);
      capL.scale.set(0.72, 0.72, 0.72);
      capL.position.set(-0.675, 0.022, zPos);
      root.add(capL);

      var capR = new THREE.Mesh(g.bossSphere, m.brassGold);
      capR.scale.set(0.72, 0.72, 0.72);
      capR.position.set(0.675, 0.022, zPos);
      root.add(capR);
    }

    // Dark recessed shadow bars between cylinders so 5 distinct cylinders pop at 400% zoom
    for (var sb = 0; sb < 6; sb++) {
      var slotBar = new THREE.Mesh(g.gearTooth, m.bronzeRecess);
      slotBar.scale.set(18.8, 0.25, 0.52);
      slotBar.position.set(0, -0.002, (sb - 2.5) * 0.285);
      root.add(slotBar);
    }

    var chev1 = new THREE.Mesh(g.chevron, m.chevronGold);
    chev1.scale.set(0.78, 1.0, 0.78);
    chev1.position.set(0, 0.032, 0.24);
    root.add(chev1);

    var chev2 = new THREE.Mesh(g.chevron, m.chevronGold);
    chev2.scale.set(0.78, 1.0, 0.78);
    chev2.position.set(0, 0.032, -0.24);
    root.add(chev2);

    _root.add(root);
    return {
      root: root,
      cylinders: cylinders,
      chev1: chev1,
      chev2: chev2
    };
  }

  function buildPendulumRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // Compact Open-Frame Bronze-and-Stone Side Pylons (height 4.65m, width 0.52m) outside ±8.42m cliffs
    // Keeps Mage at (3,0)/(4,0) and ALL north courtyard tiles 100% un-occluded!
    function addOpenPylon(wx) {
      var tGrp = new THREE.Group();
      tGrp.position.set(wx, 0, 0);

      // Chiseled octagonal stone base plinth (-0.25m .. +0.70m)
      var plinth = new THREE.Mesh(g.pylonPlinth, m.sandstone);
      plinth.position.y = 0.22;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      tGrp.add(plinth);

      var plinthCollar = new THREE.Mesh(g.turntableOuter, m.bronzeDark);
      plinthCollar.scale.set(0.92, 1.15, 0.92);
      plinthCollar.position.y = 0.70;
      tGrp.add(plinthCollar);

      // Open-frame twin slender A-frame bronze stanchion struts converging to Y = 4.55m
      var strutN = new THREE.Mesh(g.pylonStrut, m.bronzeDark);
      strutN.position.set(0, 2.62, -0.22);
      strutN.rotation.x = 0.055;
      strutN.castShadow = true;
      tGrp.add(strutN);

      var strutS = new THREE.Mesh(g.pylonStrut, m.bronzeDark);
      strutS.position.set(0, 2.62, 0.22);
      strutS.rotation.x = -0.055;
      strutS.castShadow = true;
      tGrp.add(strutS);

      // Mid-height open ring tie
      var midRing = new THREE.Mesh(g.lensTorus, m.brassGold);
      midRing.rotation.x = Math.PI / 2;
      midRing.scale.set(1.12, 1.12, 1.0);
      midRing.position.y = 2.65;
      tGrp.add(midRing);

      // Apex bearing housing at Y = 4.55m + finial at Y = 4.82m
      var crown = new THREE.Mesh(g.pylonCrown, m.brassGold);
      crown.position.y = 4.55;
      crown.castShadow = true;
      tGrp.add(crown);

      var finial = new THREE.Mesh(g.finial, m.brassGold);
      finial.scale.setScalar(1.35);
      finial.position.y = 4.84;
      tGrp.add(finial);

      // Compact r=0.42m side clockwork escapement gear wheel
      var sideCog = new THREE.Mesh(g.ferryCog, m.brassGold);
      sideCog.rotation.z = Math.PI / 2;
      sideCog.scale.set(0.55, 0.75, 0.55);
      sideCog.position.set(wx < 0 ? -0.20 : 0.20, 4.55, 0.0);
      sideCog.castShadow = true;
      tGrp.add(sideCog);

      root.add(tGrp);
      return sideCog;
    }

    var cogWest = addOpenPylon(-8.42);
    var cogEast = addOpenPylon(8.42);

    // Single Slim Overhead Bronze Axle Rod (r = 0.072m at Y = 4.55m -> zero courtyard occlusion!)
    var axleRod = new THREE.Mesh(g.axleRod, m.bronzeDark);
    axleRod.position.set(0, 4.55, 0);
    axleRod.castShadow = true;
    root.add(axleRod);

    var hubEscapement = new THREE.Mesh(g.ferryCog, m.brassGold);
    hubEscapement.rotation.order = 'ZYX';
    hubEscapement.rotation.x = Math.PI / 2;
    hubEscapement.scale.set(0.46, 1.15, 0.46);
    hubEscapement.position.set(0, 4.55, 0);
    root.add(hubEscapement);

    // Swinging Pendulum Arm pivoting around Z at (0, 4.55, 0)
    var swingPivot = new THREE.Group();
    swingPivot.position.set(0, 4.55, 0);
    root.add(swingPivot);

    var rodN = new THREE.Mesh(g.pendulumRod, m.brassGold);
    rodN.position.set(0, -1.76, -0.24);
    rodN.castShadow = true;
    swingPivot.add(rodN);

    var rodS = new THREE.Mesh(g.pendulumRod, m.brassGold);
    rodS.position.set(0, -1.76, 0.24);
    rodS.castShadow = true;
    swingPivot.add(rodS);

    var bobGroup = new THREE.Group();
    bobGroup.position.set(0, -3.52, 0);
    swingPivot.add(bobGroup);

    var bladeMesh = new THREE.Mesh(g.bellBlade, m.brassGold);
    bladeMesh.castShadow = true;
    bladeMesh.receiveShadow = true;
    bobGroup.add(bladeMesh);

    var coreDrum = new THREE.Mesh(g.emitterPedestal, m.bronzeDark);
    coreDrum.rotation.x = Math.PI / 2;
    coreDrum.scale.set(0.68, 1.15, 0.68);
    coreDrum.position.y = 0.04;
    bobGroup.add(coreDrum);

    var sunBossF = new THREE.Mesh(g.bossSphere, m.sunGemActive);
    sunBossF.scale.set(1.85, 1.85, 1.1);
    sunBossF.position.set(0, -0.12, 0.17);
    bobGroup.add(sunBossF);

    var sunBossB = new THREE.Mesh(g.bossSphere, m.sunGemActive);
    sunBossB.scale.set(1.85, 1.85, 1.1);
    sunBossB.position.set(0, -0.12, -0.17);
    bobGroup.add(sunBossB);

    // Subtle amber sweep-lane danger strip on floor (visible when turnsUntilSweep <= 1)
    var dangerGeo = new THREE.PlaneGeometry(15.6, 3.76);
    dangerGeo.computeBoundingSphere();
    var dangerStrip = new THREE.Mesh(dangerGeo, m.amberDanger);
    dangerStrip.rotation.x = -Math.PI / 2;
    dangerStrip.position.set(0, 0.011, 0);
    dangerStrip.visible = false;
    root.add(dangerStrip);

    _root.add(root);
    return {
      root: root,
      swingPivot: swingPivot,
      cogWest: cogWest,
      cogEast: cogEast,
      hubEscapement: hubEscapement,
      dangerStrip: dangerStrip,
      restSide: -1,
      sweeping: false,
      sweepTimer: 0,
      sweepDuration: 0.72,
      startAngle: -0.64,
      endAngle: 0.64,
      apexFired: false,
      onApex: null,
      onComplete: null,
      imminent: false
    };
  }

  function buildFerryRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    // Stationary cross-chasm bronze rack guide rails at North/South lips of rows 3..4
    var railNorth = new THREE.Mesh(g.chasmRail, m.bronzeDark);
    railNorth.position.set(0, -0.34, -1.94);
    railNorth.receiveShadow = true;
    root.add(railNorth);

    var railSouth = new THREE.Mesh(g.chasmRail, m.bronzeDark);
    railSouth.position.set(0, -0.34, 1.94);
    railSouth.receiveShadow = true;
    root.add(railSouth);

    // Movable 2x2 Ferry Platform (4.0m x 4.0m, top deck flush with Y=0.000m!)
    var platform = new THREE.Group();
    root.add(platform);

    // Riveted bronze chassis (-0.42m..-0.06m)
    var chassis = new THREE.Mesh(g.ferryChassis, m.bronzeDark);
    chassis.position.y = -0.24;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    platform.add(chassis);

    // 4 beveled sandstone-and-brass deck quadrants (-0.08m..-0.003m so zero z-fight if World also draws ferry tiles, while 100% solid if World leaves chasm open!)
    var qOffsets = [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]];
    for (var q = 0; q < 4; q++) {
      var deckTile = new THREE.Mesh(g.ferryQuadDeck, m.sandstone);
      deckTile.position.set(qOffsets[q][0], -0.043, qOffsets[q][1]);
      deckTile.castShadow = true;
      deckTile.receiveShadow = true;
      platform.add(deckTile);
    }

    // Brass cross-trim & perimeter trim
    var crossX = new THREE.Mesh(g.rollerFrameSide, m.brassGold);
    crossX.rotation.y = Math.PI / 2;
    crossX.scale.set(1.1, 0.35, 2.46);
    crossX.position.y = -0.012;
    platform.add(crossX);

    var crossZ = new THREE.Mesh(g.rollerFrameSide, m.brassGold);
    crossZ.scale.set(1.1, 0.35, 2.46);
    crossZ.position.y = -0.012;
    platform.add(crossZ);

    // 4 Corner Brass Bollards (at ±1.84m so unit tile centers ±1.0m stay 100% clear!)
    var cogs = [];
    var cornerSigns = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var c = 0; c < 4; c++) {
      var sx = cornerSigns[c][0], sz = cornerSigns[c][1];
      var bol = new THREE.Mesh(g.bollard, m.brassGold);
      bol.position.set(sx * 1.83, 0.19, sz * 1.83);
      bol.castShadow = true;
      platform.add(bol);

      var bolCap = new THREE.Mesh(g.bossSphere, m.bronzeDark);
      bolCap.scale.set(1.8, 1.4, 1.8);
      bolCap.position.set(sx * 1.83, 0.39, sz * 1.83);
      platform.add(bolCap);

      // Spinning underside bronze drive cogwheels meshing with chasm rails
      var cog = new THREE.Mesh(g.ferryCog, (c % 2 === 0) ? m.brassGold : m.bronzeDark);
      cog.rotation.x = Math.PI / 2;
      cog.position.set(sx * 1.15, -0.36, sz * 1.96);
      cog.castShadow = true;
      platform.add(cog);
      cogs.push(cog);
    }

    // Large horizontal underside turbine cogwheel
    var underCog = new THREE.Mesh(g.ferryCog, m.brassGold);
    underCog.scale.set(2.1, 1.2, 2.1);
    underCog.position.set(0, -0.48, 0);
    platform.add(underCog);
    cogs.push(underCog);

    // Central Clickable Brass Ferry Control Lever (at (0,0) seam intersection between the 4 tiles!)
    var leverGroup = new THREE.Group();
    platform.add(leverGroup);

    var capstan = new THREE.Mesh(g.bollard, m.bronzeDark);
    capstan.scale.set(1.45, 0.65, 1.45);
    capstan.position.y = 0.12;
    capstan.castShadow = true;
    leverGroup.add(capstan);

    var leverPivot = new THREE.Group();
    leverPivot.position.y = 0.22;
    leverGroup.add(leverPivot);

    var stick = new THREE.Mesh(g.leverStick, m.brassGold);
    stick.position.y = 0.26;
    stick.castShadow = true;
    leverPivot.add(stick);

    var knob = new THREE.Mesh(g.bossSphere, m.sunGemActive);
    knob.scale.set(1.5, 1.5, 1.5);
    knob.position.y = 0.56;
    leverPivot.add(knob);

    var chevW = new THREE.Mesh(g.chevron, m.chevronGold);
    chevW.rotation.y = Math.PI / 2;
    chevW.scale.set(0.65, 1.0, 0.65);
    chevW.position.set(-0.34, 0.02, 0);
    leverGroup.add(chevW);

    var chevE = new THREE.Mesh(g.chevron, m.chevronGold);
    chevE.rotation.y = -Math.PI / 2;
    chevE.scale.set(0.65, 1.0, 0.65);
    chevE.position.set(0.34, 0.02, 0);
    leverGroup.add(chevE);

    var hitLever = new THREE.Mesh(g.hitLever, m.invisibleHit);
    leverGroup.add(hitLever);

    _root.add(root);
    return {
      root: root,
      platform: platform,
      leverGroup: leverGroup,
      leverPivot: leverPivot,
      hitLever: hitLever,
      cogs: cogs,
      curX: 0,
      goalX: 0,
      curZ: 0,
      leverTilt: 0.25
    };
  }

  function createRelayRingRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    var outer = new THREE.Mesh(g.lensTorus, m.brassGold);
    outer.scale.set(1.25, 1.25, 1.0);
    root.add(outer);

    var inner = new THREE.Mesh(g.innerRing, m.bronzeDark);
    root.add(inner);

    var strut = new THREE.Mesh(g.screwRod, m.bronzeDark);
    strut.scale.set(0.85, 1.05, 0.85);
    strut.position.y = -0.68;
    root.add(strut);

    _root.add(root);
    return {
      root: root,
      outer: outer,
      inner: inner,
      lit: false
    };
  }

  function createPillarRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    var body = new THREE.Mesh(g.obeliskBody, m.sandstone);
    body.position.y = 0.82;
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    var collar = new THREE.Mesh(g.turntableOuter, m.bronzeDark);
    collar.scale.set(1.12, 1.2, 1.12);
    collar.position.y = 0.04;
    root.add(collar);

    var tip = new THREE.Mesh(g.obeliskTip, m.brassGold);
    tip.position.y = 1.86;
    tip.castShadow = true;
    root.add(tip);

    _root.add(root);
    return { root: root };
  }

  function buildExitRig() {
    var g = _assets.geos;
    var m = _assets.mats;

    var root = new THREE.Group();
    root.visible = false;

    var outerRing = new THREE.Mesh(g.exitOuterRing, m.brassGold);
    outerRing.position.y = 0.016;
    outerRing.receiveShadow = true;
    root.add(outerRing);

    var innerDisc = new THREE.Mesh(g.exitInnerDisc, m.sandstone);
    innerDisc.position.y = 0.012;
    innerDisc.receiveShadow = true;
    root.add(innerDisc);

    var runeGems = [];
    for (var i = 0; i < 4; i++) {
      var a = (i * Math.PI) / 2 + Math.PI / 4;
      var gem = new THREE.Mesh(g.bossSphere, m.prismCrystalDormant);
      gem.scale.set(1.3, 0.9, 1.3);
      gem.position.set(Math.cos(a) * 0.77, 0.032, Math.sin(a) * 0.77);
      root.add(gem);
      runeGems.push(gem);
    }

    // 4 rising golden stepped arch segments around perimeter (leaves central Hero standing pad flat!)
    var stairSteps = [];
    for (var s = 0; s < 4; s++) {
      var stepMesh = new THREE.Mesh(g.exitStepArc, m.brassGold);
      stepMesh.rotation.y = (s * Math.PI) / 2 + 0.12;
      stepMesh.position.y = -0.06;
      stepMesh.castShadow = true;
      stepMesh.receiveShadow = true;
      root.add(stepMesh);
      stairSteps.push(stepMesh);
    }

    // Soaring Golden Sanctuary Portal Beam & Celestial Rings (visible when unlocked)
    var portalGroup = new THREE.Group();
    portalGroup.visible = false;
    root.add(portalGroup);

    var beamCol = new THREE.Mesh(g.portalCylinder, m.portalBeam);
    beamCol.renderOrder = 9;
    portalGroup.add(beamCol);

    var ringLow = new THREE.Mesh(g.lensTorus, m.brassGold);
    ringLow.rotation.x = Math.PI / 2;
    ringLow.scale.set(2.4, 2.4, 1.0);
    ringLow.position.y = 0.42;
    portalGroup.add(ringLow);

    var ringHigh = new THREE.Mesh(g.innerRing, m.sunGemActive);
    ringHigh.rotation.x = Math.PI / 2;
    ringHigh.scale.set(2.9, 2.9, 1.0);
    ringHigh.position.y = 1.18;
    portalGroup.add(ringHigh);

    _root.add(root);
    return {
      root: root,
      innerDisc: innerDisc,
      runeGems: runeGems,
      stairSteps: stairSteps,
      portalGroup: portalGroup,
      ringLow: ringLow,
      ringHigh: ringHigh,
      unlocked: false,
      unlockProgress: 0.0
    };
  }

  function ensurePoolCapacity(pool, needed, factoryFn) {
    while (pool.length < needed) {
      pool.push(factoryFn());
    }
  }

  function hidePoolFrom(pool, startIdx) {
    for (var i = startIdx; i < pool.length; i++) {
      pool[i].root.visible = false;
    }
  }

  // ============================================================================
  // Reusable Zero-GC Particle Pool
  // ============================================================================
  function initParticlePool() {
    _particlePool.length = 0;
    for (var i = 0; i < PARTICLE_POOL_SIZE; i++) {
      var mesh = new THREE.Mesh(_assets.geos.partChunk, _assets.mats.partRubble);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      _root.add(mesh);
      _particlePool.push({
        mesh: mesh,
        active: false,
        age: 0,
        life: 1.0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        gravity: 0,
        bounce: 0,
        startScale: 1.0,
        endScale: 0.01
      });
    }
  }

  function allocParticle() {
    for (var i = 0; i < PARTICLE_POOL_SIZE; i++) {
      var idx = (_particleCursor + i) % PARTICLE_POOL_SIZE;
      if (!_particlePool[idx].active) {
        _particleCursor = (idx + 1) % PARTICLE_POOL_SIZE;
        return _particlePool[idx];
      }
    }
    var p = _particlePool[_particleCursor];
    _particleCursor = (_particleCursor + 1) % PARTICLE_POOL_SIZE;
    return p;
  }

  function spawnShatterRubble(wx, wy, wz, _colorHex) {
    if (!_initialized) return;
    var baseY = typeof wy === 'number' ? wy : 0.65;

    // 18 tumbling chiseled stone rubble chunks
    for (var i = 0; i < 18; i++) {
      var p = allocParticle();
      var ang = (i / 18.0) * Math.PI * 2 + (i % 3) * 0.27;
      var spd = 1.6 + (i % 5) * 0.65;
      p.mesh.geometry = _assets.geos.partChunk;
      p.mesh.material = _assets.mats.partRubble;
      p.mesh.position.set(wx + Math.cos(ang) * 0.18, baseY + (i % 4) * 0.12, wz + Math.sin(ang) * 0.18);
      p.mesh.rotation.set(i * 0.7, i * 1.1, i * 0.5);
      p.vx = Math.cos(ang) * spd;
      p.vy = 2.6 + (i % 4) * 0.95;
      p.vz = Math.sin(ang) * spd;
      p.rx = (i % 2 === 0 ? 1 : -1) * (4.5 + (i % 3) * 2.0);
      p.ry = 5.2;
      p.rz = 3.8;
      p.gravity = -15.5;
      p.bounce = 0.36;
      p.startScale = 0.75 + (i % 4) * 0.22;
      p.endScale = 0.02;
      p.age = 0;
      p.life = 0.75 + (i % 4) * 0.12;
      p.active = true;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.visible = true;
    }

    // 10 radiant golden sun-sparks
    for (var s = 0; s < 10; s++) {
      var sp = allocParticle();
      var sang = (s / 10.0) * Math.PI * 2 + 0.3;
      sp.mesh.geometry = _assets.geos.moteOrb;
      sp.mesh.material = _assets.mats.partGoldSpark;
      sp.mesh.position.set(wx, baseY + 0.15, wz);
      sp.vx = Math.cos(sang) * (2.2 + (s % 3) * 0.8);
      sp.vy = 1.8 + (s % 4) * 0.8;
      sp.vz = Math.sin(sang) * (2.2 + (s % 3) * 0.8);
      sp.rx = 0; sp.ry = 0; sp.rz = 0;
      sp.gravity = -3.0;
      sp.bounce = 0.0;
      sp.startScale = 1.8;
      sp.endScale = 0.02;
      sp.age = 0;
      sp.life = 0.55;
      sp.active = true;
      sp.mesh.scale.setScalar(sp.startScale);
      sp.mesh.visible = true;
    }

    spawnDustPuff(wx, 0.12, wz);

    if (window.GAME.VfxPost) {
      if (typeof window.GAME.VfxPost.triggerShake === 'function') {
        window.GAME.VfxPost.triggerShake(0.18, 0.32);
      }
      if (typeof window.GAME.VfxPost.pulseSunFlash === 'function') {
        window.GAME.VfxPost.pulseSunFlash(0.28, 0.50);
      }
    }
  }

  function spawnDustPuff(wx, wy, wz) {
    if (!_initialized) return;
    var baseY = typeof wy === 'number' ? wy : 0.08;
    for (var i = 0; i < 9; i++) {
      var p = allocParticle();
      var ang = (i / 9.0) * Math.PI * 2 + 0.4;
      var spd = 0.85 + (i % 3) * 0.45;
      p.mesh.geometry = _assets.geos.partPuff;
      p.mesh.material = _assets.mats.partDust;
      p.mesh.position.set(wx + Math.cos(ang) * 0.22, baseY, wz + Math.sin(ang) * 0.22);
      p.vx = Math.cos(ang) * spd;
      p.vy = 0.75 + (i % 3) * 0.35;
      p.vz = Math.sin(ang) * spd;
      p.rx = 1.2; p.ry = 1.8; p.rz = 0.9;
      p.gravity = -0.6;
      p.bounce = 0.0;
      p.startScale = 0.95 + (i % 3) * 0.25;
      p.endScale = 0.02;
      p.age = 0;
      p.life = 0.52 + (i % 3) * 0.09;
      p.active = true;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.visible = true;
    }
  }

  function spawnWaterSplash(wx, wy, wz) {
    if (!_initialized) return;
    var baseY = typeof wy === 'number' ? wy : 0.05;
    for (var i = 0; i < 14; i++) {
      var p = allocParticle();
      var ang = (i / 14.0) * Math.PI * 2;
      var spd = 1.1 + (i % 4) * 0.5;
      p.mesh.geometry = _assets.geos.partDrop;
      p.mesh.material = _assets.mats.partSplash;
      p.mesh.position.set(wx + Math.cos(ang) * 0.16, baseY, wz + Math.sin(ang) * 0.16);
      p.vx = Math.cos(ang) * spd;
      p.vy = 2.4 + (i % 4) * 0.65;
      p.vz = Math.sin(ang) * spd;
      p.rx = 0; p.ry = 0; p.rz = 0;
      p.gravity = -12.5;
      p.bounce = 0.2;
      p.startScale = 1.25;
      p.endScale = 0.02;
      p.age = 0;
      p.life = 0.56 + (i % 3) * 0.08;
      p.active = true;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.visible = true;
    }
  }

  // ============================================================================
  // Board State Extraction Helpers
  // ============================================================================
  function extractTilesFlat(simState) {
    var out = [];
    if (!simState) return out;
    if (Array.isArray(simState.tileList)) return simState.tileList;
    var raw = simState.tileGrid || simState.tiles;
    if (!Array.isArray(raw)) return out;
    if (Array.isArray(raw[0])) {
      for (var r = 0; r < raw.length; r++) {
        for (var c = 0; c < raw[r].length; c++) {
          if (raw[r][c]) out.push(raw[r][c]);
        }
      }
    } else {
      for (var i = 0; i < raw.length; i++) {
        if (raw[i]) out.push(raw[i]);
      }
    }
    return out;
  }

  // Visual isometric presentation cant on odd rotations ('\' mirrors at rot=1,3) so they open
  // generously toward the ~39.5° isometric camera (zero 1D thin-stick collapse!) while keeping Simulation's reflectDir untouched.
  function mirrorVisualYaw(rot) {
    var r = ((rot || 0) % 4 + 4) % 4;
    var isoCant = (r % 2 === 1) ? 0.38 : 0.0;
    return Math.PI / 4 + r * (Math.PI / 2) + isoCant;
  }

  function getLiveCamPos() {
    var cam = (window.GAME && window.GAME.VfxPost && typeof window.GAME.VfxPost.getCamera === 'function')
      ? window.GAME.VfxPost.getCamera()
      : null;
    if (cam && cam.position) {
      return cam.position;
    }
    return { x: 18.0, y: 20.2, z: 21.8 };
  }

  // Rolls an XZ beam strip around its local +Z axis so its +Y normal faces the active camera with zero shear!
  function computeAxialRoll(midX, midY, midZ, yaw, camPos) {
    var vx = camPos.x - midX;
    var vy = camPos.y - midY;
    var vz = camPos.z - midZ;
    var lx = vx * Math.cos(yaw) - vz * Math.sin(yaw);
    var ly = vy;
    return -Math.atan2(lx, ly);
  }

  // Offsets pinpoint flare strictly along the camera sightline so 2D screen projection has 0.0px parallax
  // while clearing the jewel prism in depth!
  function positionFlareTowardCam(fRig, camPos) {
    var vx = camPos.x - fRig.baseX;
    var vy = camPos.y - fRig.baseY;
    var vz = camPos.z - fRig.baseZ;
    var vLen = Math.hypot(vx, vy, vz) || 1.0;
    var off = fRig.camOffset;
    fRig.root.position.set(
      fRig.baseX + (vx / vLen) * off,
      fRig.baseY + (vy / vLen) * off,
      fRig.baseZ + (vz / vLen) * off
    );
    if (fRig.starBillboard && typeof fRig.starBillboard.lookAt === 'function') {
      fRig.starBillboard.lookAt(camPos.x, camPos.y, camPos.z);
    }
  }

  function updateBeams(beamSegments, beamHits) {
    var segs = Array.isArray(beamSegments) ? beamSegments : [];
    var hits = Array.isArray(beamHits) ? beamHits : [];
    var beamY = getBeamY();
    var camPos = getLiveCamPos();

    // Mark which mirrors & relays are actively struck by sunlight
    var struckMirrors = {};
    var struckRelays = {};
    for (var h = 0; h < hits.length; h++) {
      var hit = hits[h];
      if (!hit) continue;
      if (hit.kind === 'mirror' && hit.targetId) {
        struckMirrors[hit.targetId] = true;
      } else if (hit.kind === 'relay' && hit.targetId) {
        struckRelays[hit.targetId] = true;
      }
    }

    for (var mi = 0; mi < _activeCounts.mirrors; mi++) {
      var mRig = _mirrorPool[mi];
      mRig.struck = !!struckMirrors[mRig.id];
      if (!mRig.powered) {
        mRig.paneMesh.material = _assets.mats.prismCrystalDormant;
      } else if (mRig.struck) {
        mRig.paneMesh.material = _assets.mats.prismCrystalLit;
      } else {
        mRig.paneMesh.material = _assets.mats.prismCrystal;
      }
    }

    // 1. Update Feathered 3-Layer Incandescent Golden Sunbeams + Rim-Tapered Exits + Ground Ribbons
    ensurePoolCapacity(_beamPool, segs.length, createBeamRig);
    var usedBeams = 0;
    var gCache = _assets.geos;

    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      if (!seg) continue;
      var x1 = seg.x1, z1 = seg.z1, x2 = seg.x2, z2 = seg.z2;
      if (typeof x1 !== 'number' && typeof seg.col1 === 'number') {
        var p1 = gridToWorld(seg.col1, seg.row1);
        var p2 = gridToWorld(seg.col2, seg.row2);
        x1 = p1.x; z1 = p1.z; x2 = p2.x; z2 = p2.z;
      }
      var dx = x2 - x1;
      var dz = z2 - z1;
      var len = Math.hypot(dx, dz);
      if (len < 0.04) continue;

      var bRig = _beamPool[usedBeams++];
      var midX = (x1 + x2) * 0.5;
      var midZ = (z1 + z2) * 0.5;
      var segY = typeof seg.y === 'number' ? seg.y : beamY;
      var yaw = Math.atan2(dx, dz);
      var exitsEdge = (Math.abs(x2) >= 7.85 || Math.abs(z2) >= 7.85);

      bRig.core.geometry = exitsEdge ? gCache.beamCoreTaper : gCache.beamCore;
      bRig.inner.geometry = exitsEdge ? gCache.beamInnerTaper : gCache.beamInner;
      bRig.outer.geometry = exitsEdge ? gCache.beamOuterTaper : gCache.beamOuter;

      bRig.midX = midX;
      bRig.midY = segY;
      bRig.midZ = midZ;
      bRig.yaw = yaw;

      bRig.root.visible = true;
      bRig.root.position.set(midX, 0, midZ);
      bRig.root.rotation.y = yaw;

      bRig.spanGroup.position.y = segY;
      bRig.spanGroup.rotation.z = computeAxialRoll(midX, segY, midZ, yaw, camPos);
      bRig.spanGroup.scale.set(1.0, 1.0, len);

      // Hide ground ribbon when spanning across Level 4's open sky chasm off the ferry deck
      var crossesOpenChasm = false;
      if (_ferryRig && _ferryRig.root.visible) {
        var minZ = Math.min(z1, z2);
        var maxZ = Math.max(z1, z2);
        if (minZ < 1.5 && maxZ > -1.5 && Math.abs(midX - _ferryRig.curX) > 1.85) {
          crossesOpenChasm = true;
        }
      }
      bRig.ground.visible = !crossesOpenChasm;
      bRig.ground.position.y = 0.022;
      bRig.ground.scale.set(1.0, 1.0, exitsEdge ? Math.max(0.2, len - 0.35) : len);
      bRig.segLen = len;
      bRig.bounceIndex = seg.bounceIndex || 0;

      // Light up any Cross-Chasm Relay Ring crossed by this beam
      for (var ri = 0; ri < _activeCounts.relays; ri++) {
        var rel = _relayPool[ri];
        var rx = rel.root.position.x;
        var rz = rel.root.position.z;
        if (Math.abs(dx) < 0.05 && Math.abs(rx - x1) < 0.25 && rz >= Math.min(z1, z2) - 0.1 && rz <= Math.max(z1, z2) + 0.1) {
          rel.lit = true;
        } else if (Math.abs(dz) < 0.05 && Math.abs(rz - z1) < 0.25 && rx >= Math.min(x1, x2) - 0.1 && rx <= Math.max(x1, x2) + 0.1) {
          rel.lit = true;
        }
      }
    }
    _activeCounts.beams = usedBeams;
    hidePoolFrom(_beamPool, usedBeams);

    // 2. Update Camera-Ray-Offset Pinpoint Starburst Flares (0 beamCore gap, 0 #FFFFFF blowout!)
    ensurePoolCapacity(_flarePool, hits.length, createFlareRig);
    var usedFlares = 0;
    for (var j = 0; j < hits.length; j++) {
      var ht = hits[j];
      if (!ht || typeof ht.x !== 'number' || typeof ht.z !== 'number') continue;
      if (ht.kind === 'edge') continue;

      var fRig = _flarePool[usedFlares++];
      fRig.root.visible = true;
      fRig.baseX = ht.x;
      fRig.baseY = typeof ht.y === 'number' ? ht.y : beamY;
      fRig.baseZ = ht.z;

      var sc = 0.44;
      var cOff = 0.045;
      if (ht.kind === 'gargoyle') { sc = 0.88; cOff = 0.080; }
      else if (ht.kind === 'mirror') { sc = 0.50; cOff = 0.056; }
      else if (ht.kind === 'emitter') { sc = 0.58; cOff = 0.048; }
      else if (ht.kind === 'relay') { sc = 0.44; cOff = 0.036; }
      fRig.baseScale = sc;
      fRig.camOffset = cOff;
      fRig.root.scale.setScalar(sc);
      positionFlareTowardCam(fRig, camPos);
    }
    _activeCounts.flares = usedFlares;
    hidePoolFrom(_flarePool, usedFlares);
  }

  // ============================================================================
  // Lifecycle: init, buildLevel, syncFromState, Animations & update
  // ============================================================================
  var _gpuPrewarmGroup = null;

  function init(scene) {
    _scene = scene || _scene;
    if (!_initialized && _scene) {
      _assets = buildAssetCache();
      _root = new THREE.Group();
      _root.name = 'ContraptionsRoot';
      _scene.add(_root);

      ensurePoolCapacity(_mirrorPool, 10, createMirrorRig);
      ensurePoolCapacity(_emitterPool, 4, createEmitterRig);
      ensurePoolCapacity(_beamPool, 24, createBeamRig);
      ensurePoolCapacity(_flarePool, 24, createFlareRig);
      ensurePoolCapacity(_waterCellPool, 20, createWaterCellRig);
      ensurePoolCapacity(_sluicePool, 4, createSluiceRig);
      ensurePoolCapacity(_rollerPool, 12, createRollerRig);
      ensurePoolCapacity(_pillarPool, 6, createPillarRig);
      ensurePoolCapacity(_relayPool, 6, createRelayRingRig);

      _waterLockRig = buildWaterLockRig();
      _pendulumRig = buildPendulumRig();
      _ferryRig = buildFerryRig();
      _exitRig = buildExitRig();

      // Secondary altar flank rings for Level 4 multi-hero Sanctuary Altar
      for (var az = 0; az < 3; az++) {
        var zMesh = new THREE.Mesh(_assets.geos.exitOuterRing, _assets.mats.brassGold);
        zMesh.scale.setScalar(0.84);
        zMesh.visible = false;
        _root.add(zMesh);
        _altarZoneRings.push(zMesh);
      }

      initParticlePool();

      // Frame-1 GPU Buffer & Texture Pre-Warm (guarantees deltaGeometries === 0 & deltaTextures === 0 across 8x reloads!)
      _gpuPrewarmGroup = new THREE.Group();
      _gpuPrewarmGroup.position.set(0, -3.2, 0);
      _gpuPrewarmGroup.scale.set(0.0001, 0.0001, 0.0001);
      var gKeys = Object.keys(_assets.geos);
      var mList = [];
      var mKeys = Object.keys(_assets.mats);
      for (var mk = 0; mk < mKeys.length; mk++) {
        mList.push(_assets.mats[mKeys[mk]]);
      }
      var pairCount = Math.max(gKeys.length, mList.length);
      for (var pk = 0; pk < pairCount; pk++) {
        var pg = _assets.geos[gKeys[pk % gKeys.length]];
        var pmMat = mList[pk % mList.length];
        var pm = new THREE.Mesh(pg, pmMat);
        pm.frustumCulled = false;
        if (pk === pairCount - 1) {
          pm.onAfterRender = function () {
            if (_gpuPrewarmGroup) _gpuPrewarmGroup.visible = false;
          };
        }
        _gpuPrewarmGroup.add(pm);
      }
      _root.add(_gpuPrewarmGroup);

      _initialized = true;
    } else if (_root && _scene && _root.parent !== _scene) {
      _scene.add(_root);
    }
  }

  function buildLevel(simState) {
    if (!_initialized || !simState) return;

    // Clear active particles on level load
    for (var p = 0; p < _particlePool.length; p++) {
      _particlePool[p].active = false;
      _particlePool[p].mesh.visible = false;
    }

    _lastLevelId = simState.levelId || 1;
    _lastExitUnlocked = !!(simState.exit && simState.exit.unlocked);

    // Build / position static & dynamic contraptions via syncFromState(..., false)
    syncFromState(simState, false);
  }

  function syncFromState(simState, animateChanges) {
    if (!_initialized || !simState) return;

    _pickables.length = 0;
    _mirrorById = {};
    _sluiceById = {};
    var dirs = getDirs();

    // 1. Diamond Brass Prism Mirrors
    var mirrors = simState.mirrors || [];
    ensurePoolCapacity(_mirrorPool, mirrors.length, createMirrorRig);
    var mCount = 0;
    for (var i = 0; i < mirrors.length; i++) {
      var mData = mirrors[i];
      if (!mData || mData.removed) continue;
      var mRig = _mirrorPool[mCount++];
      var wp = gridToWorld(mData.col, mData.row);
      var rot = ((mData.rot || 0) % 4 + 4) % 4;
      var desiredYaw = mirrorVisualYaw(rot);

      var sameMirror = (mRig.id === mData.id) && animateChanges;
      mRig.id = mData.id;
      mRig.col = mData.col;
      mRig.row = mData.row;
      mRig.rot = rot;
      mRig.turretWaterPowered = !!mData.turretWaterPowered;
      mRig.powered = mData.turretWaterPowered ? !!simState.waterLockActive : (mData.powered !== false);
      mRig.waterCollar.visible = mRig.turretWaterPowered;

      mRig.goalX = wp.x;
      mRig.goalZ = wp.z;
      if (!sameMirror) {
        mRig.root.position.set(wp.x, 0.0, wp.z);
        mRig.curYaw = desiredYaw;
        mRig.targetYaw = desiredYaw;
        mRig.animTimer = 0;
        mRig.mirrorGroup.rotation.y = desiredYaw;
      } else if (Math.abs(shortestAngleDelta(mRig.targetYaw, desiredYaw)) > 0.01 && mRig.animTimer <= 0) {
        mRig.startYaw = mRig.curYaw;
        mRig.targetYaw = desiredYaw;
        mRig.animTimer = mRig.animDuration;
      }

      mRig.root.visible = true;
      var mUd = {
        pickType: 'mirror',
        mirrorId: mData.id,
        id: mData.id,
        col: mData.col,
        row: mData.row
      };
      tagPickHierarchy(mRig.hitMesh, mUd);
      mRig.mirrorGroup.userData = mUd;
      _pickables.push(mRig.hitMesh);
      _mirrorById[mData.id] = mRig;
    }
    _activeCounts.mirrors = mCount;
    hidePoolFrom(_mirrorPool, mCount);

    // 2. Sunbeam Emitter Turrets / Crystals
    var emitters = simState.emitters || [];
    ensurePoolCapacity(_emitterPool, emitters.length, createEmitterRig);
    var eCount = 0;
    for (var ei = 0; ei < emitters.length; ei++) {
      var em = emitters[ei];
      if (!em) continue;
      var eRig = _emitterPool[eCount++];
      var ewp = gridToWorld(em.col, em.row);
      var eDir = ((em.dir || 0) % 4 + 4) % 4;
      var isCornerBrazier = (em.col === 0 || em.col === 7) && (em.row === 0 || em.row === 7);

      eRig.root.visible = true;
      eRig.aoDisc.visible = !isCornerBrazier;
      eRig.pedestal.visible = !isCornerBrazier;
      eRig.pedCollar.visible = !isCornerBrazier;

      // Local -Z is North (dir 0); rotating around Y by -dir * PI/2 aligns local -Z with N(0), E(1), S(2), W(3)
      eRig.root.rotation.y = -eDir * (Math.PI / 2);
      if (isCornerBrazier) {
        var dv = dirs[eDir];
        eRig.root.position.set(ewp.x + dv.dc * 0.48, 0.0, ewp.z + dv.dr * 0.48);
      } else {
        eRig.root.position.set(ewp.x, 0.0, ewp.z);
      }
      eRig.active = (em.active !== false) && (!em.requiresWaterLock || !!simState.waterLockActive);
      eRig.crystal.material = eRig.active ? _assets.mats.sunGemActive : _assets.mats.prismCrystalDormant;
    }
    _activeCounts.emitters = eCount;
    hidePoolFrom(_emitterPool, eCount);

    // 3. Tile-based Contraptions: Level 2 Water Ribbons, Level 3 Rollers, Stone Pillars
    var allTiles = extractTilesFlat(simState);
    var waterMap = {};
    var waterList = simState.waterCells || [];
    for (var wi = 0; wi < waterList.length; wi++) {
      var wc = waterList[wi];
      if (!wc) continue;
      if (typeof wc === 'string') {
        waterMap[wc] = { key: wc };
      } else if (typeof wc.col === 'number') {
        waterMap[wc.col + ',' + wc.row] = wc;
      }
    }

    var wCellSpecs = [];
    var rollerSpecs = [];
    var pillarSpecs = [];

    for (var ti = 0; ti < allTiles.length; ti++) {
      var tl = allTiles[ti];
      if (!tl) continue;
      var key = tl.col + ',' + tl.row;
      var wEntry = waterMap[key];
      var isHeadwaterTile = !!(tl.alwaysWet || tl.headwater || tl.intake);
      if (wEntry || isHeadwaterTile) {
        var wFlow = (wEntry && wEntry.flowDir !== undefined)
          ? wEntry.flowDir
          : (tl.flowDir !== undefined ? tl.flowDir : (tl.channelAxis === 'row' ? 3 : 2));
        wCellSpecs.push({
          col: tl.col,
          row: tl.row,
          active: true,
          flowDir: wFlow,
          channelAxis: tl.channelAxis
        });
      } else if (tl.type === 'channel' || tl.channel) {
        var dryFlow = tl.flowDir !== undefined ? tl.flowDir : (tl.channelAxis === 'row' ? 3 : 2);
        wCellSpecs.push({
          col: tl.col,
          row: tl.row,
          active: false,
          flowDir: dryFlow,
          channelAxis: tl.channelAxis
        });
      }
      if (tl.type === 'roller' || tl.rollerDir !== undefined) {
        rollerSpecs.push({ col: tl.col, row: tl.row, dir: tl.rollerDir !== undefined ? tl.rollerDir : (tl.dir || 0) });
      }
      if (tl.type === 'pillar' || tl.obstacle === 'pillar') {
        pillarSpecs.push({ col: tl.col, row: tl.row });
      }
    }

    // Water Ribbons, 90° L-Corner Elbows & Rim Intake Cascades
    var wetFlowByCell = {};
    for (var wmi = 0; wmi < wCellSpecs.length; wmi++) {
      if (wCellSpecs[wmi].active) {
        wetFlowByCell[wCellSpecs[wmi].col + ',' + wCellSpecs[wmi].row] =
          ((wCellSpecs[wmi].flowDir || 0) % 4 + 4) % 4;
      }
    }

    ensurePoolCapacity(_waterCellPool, wCellSpecs.length, createWaterCellRig);
    for (var wci = 0; wci < wCellSpecs.length; wci++) {
      var ws = wCellSpecs[wci];
      var wRig = _waterCellPool[wci];
      var wwp = gridToWorld(ws.col, ws.row);
      var fDir = ((ws.flowDir || 0) % 4 + 4) % 4;
      var fVec = dirs[fDir];
      var nextC = ws.col + fVec.dc;
      var nextR = ws.row + fVec.dr;
      var spillsOffEdge = ws.active && (nextC < 0 || nextC > 7 || nextR < 0 || nextR > 7);
      var isRimIntake = ws.active && ((ws.row === 0 && fDir === 2) || (ws.col === 7 && fDir === 3));

      wRig.root.visible = ws.active;
      wRig.root.position.set(wwp.x, 0.0, wwp.z);
      wRig.root.rotation.y = -fDir * (Math.PI / 2);
      wRig.active = ws.active;
      wRig.surf.material = _assets.mats.waterSurface;
      wRig.surf.position.y = -0.095;
      wRig.surf.scale.set(1.0, 1.0, 1.0);
      wRig.surf.position.z = 0.0;
      wRig.chevronOverlay.scale.set(0.90, 1.0, 0.96);
      wRig.chevronOverlay.position.z = 0.0;
      wRig.inflowGroup.visible = false;

      if (ws.active) {
        var oppDir = (fDir + 2) % 4;
        var backC = ws.col + dirs[oppDir].dc;
        var backR = ws.row + dirs[oppDir].dr;
        var hasCollinearInflow = isRimIntake || (wetFlowByCell[backC + ',' + backR] === fDir);
        var perpInDir = -1;
        for (var dCheck = 0; dCheck < 4; dCheck++) {
          if (dCheck === fDir || dCheck === oppDir) continue;
          var inFromC = ws.col - dirs[dCheck].dc;
          var inFromR = ws.row - dirs[dCheck].dr;
          if (wetFlowByCell[inFromC + ',' + inFromR] === dCheck) {
            perpInDir = dCheck;
            break;
          }
        }
        if (perpInDir !== -1 && !hasCollinearInflow) {
          // 90° L-Corner Trim (e.g. (5,0)->(5,1)->(4,1)): stops East end at +0.52m so 0 cyan pixels peek at (5,1)/(6,1) miter!
          wRig.surf.scale.set(1.0, 1.0, 0.757);
          wRig.surf.position.z = -0.245;
          wRig.chevronOverlay.scale.set(0.90, 1.0, 0.73);
          wRig.chevronOverlay.position.z = -0.245;
          wRig.inflowGroup.visible = true;
          wRig.inflowGroup.rotation.y = (fDir - perpInDir) * (Math.PI / 2);
        }
      }

      wRig.chevronOverlay.visible = ws.active;
      wRig.spill.visible = spillsOffEdge;
      wRig.intakeGroup.visible = isRimIntake;
    }
    _activeCounts.waterCells = wCellSpecs.length;
    hidePoolFrom(_waterCellPool, wCellSpecs.length);

    // Clickable Bronze Sluice Gates (Level 2) — closed gates hold brimming upstream headwater!
    var sluices = simState.sluiceGates || [];
    ensurePoolCapacity(_sluicePool, sluices.length, createSluiceRig);
    for (var si = 0; si < sluices.length; si++) {
      var sg = sluices[si];
      var sRig = _sluicePool[si];
      var swp = gridToWorld(sg.col, sg.row);
      var sDir = ((sg.flowDir !== undefined ? sg.flowDir : (sg.dir || 0)) % 4 + 4) % 4;

      sRig.id = sg.id;
      sRig.open = !!sg.open;
      if (!animateChanges) {
        sRig.curOpen = sRig.open ? 1.0 : 0.0;
      }
      sRig.root.visible = true;
      sRig.root.position.set(swp.x, 0.0, swp.z);
      sRig.root.rotation.y = -sDir * (Math.PI / 2);
      sRig.upstreamWater.visible = !sRig.open;
      sRig.upstreamFoam.visible = !sRig.open;
      sRig.statusGem.material = sRig.open ? _assets.mats.turquoiseGem : _assets.mats.sunGemActive;

      var sUd = {
        pickType: 'sluice',
        sluiceId: sg.id,
        id: sg.id,
        col: sg.col,
        row: sg.row
      };
      tagPickHierarchy(sRig.hitMesh, sUd);
      sRig.root.userData = sUd;
      _pickables.push(sRig.hitMesh);
      _sluiceById[sg.id] = sRig;
    }
    _activeCounts.sluices = sluices.length;
    hidePoolFrom(_sluicePool, sluices.length);

    // Sanctuary Waterwheel Lock (Level 2)
    var wLock = simState.waterLock || simState.waterWheelLock;
    if (wLock && typeof wLock.col === 'number') {
      var lwp = gridToWorld(wLock.col, wLock.row);
      _waterLockRig.root.visible = true;
      _waterLockRig.root.position.set(lwp.x, 0.0, lwp.z);
      _waterLockRig.active = !!(simState.waterLockActive || wLock.active);
      _waterLockRig.dynamoCrystal.material = _waterLockRig.active
        ? _assets.mats.sunGemActive
        : _assets.mats.prismCrystalDormant;
    } else {
      _waterLockRig.root.visible = false;
      _waterLockRig.active = false;
    }

    // Recessed Spinning Bronze Conveyor Rollers (Level 3)
    ensurePoolCapacity(_rollerPool, rollerSpecs.length, createRollerRig);
    for (var rli = 0; rli < rollerSpecs.length; rli++) {
      var rs = rollerSpecs[rli];
      var rRig = _rollerPool[rli];
      var rwp = gridToWorld(rs.col, rs.row);
      var rDir = ((rs.dir || 0) % 4 + 4) % 4;
      rRig.root.visible = true;
      rRig.root.position.set(rwp.x, 0.0, rwp.z);
      rRig.root.rotation.y = -rDir * (Math.PI / 2);
    }
    _activeCounts.rollers = rollerSpecs.length;
    hidePoolFrom(_rollerPool, rollerSpecs.length);

    // Carved Sandstone Sun-Obelisk Pillars (if any tile has type === 'pillar')
    ensurePoolCapacity(_pillarPool, pillarSpecs.length, createPillarRig);
    for (var pi = 0; pi < pillarSpecs.length; pi++) {
      var ps = pillarSpecs[pi];
      var pwp = gridToWorld(ps.col, ps.row);
      _pillarPool[pi].root.visible = true;
      _pillarPool[pi].root.position.set(pwp.x, 0.0, pwp.z);
    }
    _activeCounts.pillars = pillarSpecs.length;
    hidePoolFrom(_pillarPool, pillarSpecs.length);

    // Overhead Swinging Bronze Clockwork Pendulum & Compact Open-Frame Side Pylons (Level 3)
    if (simState.pendulum) {
      var pend = simState.pendulum;
      var pRows = pend.rows || [3, 4];
      var avgRow = (pRows[0] + pRows[pRows.length - 1]) * 0.5;
      var laneWorld = gridToWorld(3.5, avgRow);
      _pendulumRig.root.visible = true;
      _pendulumRig.root.position.set(0.0, 0.0, laneWorld.z);
      _pendulumRig.restSide = (pend.direction || 1) >= 0 ? -1 : 1;
      _pendulumRig.imminent = (pend.turnsUntilSweep !== undefined && pend.turnsUntilSweep <= 1);
      _pendulumRig.dangerStrip.visible = _pendulumRig.imminent;
      if (!animateChanges && !_pendulumRig.sweeping) {
        _pendulumRig.swingPivot.rotation.z = _pendulumRig.restSide * 0.62;
      }
    } else {
      _pendulumRig.root.visible = false;
      _pendulumRig.sweeping = false;
    }

    // Level 4 Twin-Cog Sky Ferry & Cross-Chasm Brass Sun-Relay Rings
    var relayCoords = [];
    if (Array.isArray(simState.relays) && simState.relays.length > 0) {
      for (var ryi = 0; ryi < simState.relays.length; ryi++) {
        var rItem = simState.relays[ryi];
        var ryWp = gridToWorld(rItem.col, rItem.row);
        relayCoords.push({ x: ryWp.x, z: ryWp.z });
      }
    }

    if (simState.ferry) {
      var f = simState.ferry;
      var fw = f.width || 2;
      var fRows = f.rows || [3, 4];
      var fCenterCol = f.col + (fw - 1) * 0.5;
      var fCenterRow = (fRows[0] + fRows[fRows.length - 1]) * 0.5;
      var fwp = gridToWorld(fCenterCol, fCenterRow);

      _ferryRig.root.visible = true;
      _ferryRig.root.position.set(0.0, 0.0, fwp.z);
      _ferryRig.goalX = fwp.x;
      if (!animateChanges) {
        _ferryRig.curX = fwp.x;
        _ferryRig.platform.position.x = fwp.x;
      }

      var fUd = {
        pickType: 'ferryLever',
        gearId: f.id || 'ferry',
        id: f.id || 'ferry',
        col: f.col,
        row: fRows[0]
      };
      tagPickHierarchy(_ferryRig.hitLever, fUd);
      _ferryRig.leverGroup.userData = fUd;
      _pickables.push(_ferryRig.hitLever);

      // Default Cross-Chasm Brass Sun-Relay Rings along columns 1, 3, 6 where the 5-mirror circuit crosses
      if (relayCoords.length === 0) {
        var defaultRelayCols = [1, 3, 6];
        for (var drc = 0; drc < defaultRelayCols.length; drc++) {
          var rcWp = gridToWorld(defaultRelayCols[drc], fCenterRow);
          relayCoords.push({ x: rcWp.x, z: rcWp.z });
        }
      }
    } else {
      _ferryRig.root.visible = false;
    }

    ensurePoolCapacity(_relayPool, relayCoords.length, createRelayRingRig);
    for (var rci = 0; rci < relayCoords.length; rci++) {
      var rRig2 = _relayPool[rci];
      rRig2.root.visible = true;
      rRig2.root.position.set(relayCoords[rci].x, getBeamY(), relayCoords[rci].z);
      rRig2.lit = false;
    }
    _activeCounts.relays = relayCoords.length;
    hidePoolFrom(_relayPool, relayCoords.length);

    // Golden Sanctuary Exit Stair
    if (simState.exit && typeof simState.exit.col === 'number') {
      var ex = simState.exit;
      var exWp = gridToWorld(ex.col, ex.row);
      _exitRig.root.visible = true;
      _exitRig.root.position.set(exWp.x, 0.0, exWp.z);

      var nowUnlocked = !!ex.unlocked;
      if (nowUnlocked && !_lastExitUnlocked && animateChanges) {
        spawnDustPuff(exWp.x, 0.08, exWp.z);
        if (window.GAME.VfxPost && typeof window.GAME.VfxPost.pulseSunFlash === 'function') {
          window.GAME.VfxPost.pulseSunFlash(0.30, 0.55);
        }
      }
      _lastExitUnlocked = nowUnlocked;
      _exitRig.unlocked = nowUnlocked;
      if (!animateChanges) {
        _exitRig.unlockProgress = nowUnlocked ? 1.0 : 0.0;
      }

      // Light up rune gems proportional to defeated Gargoyles
      var gargs = simState.gargoyles || [];
      var defCount = 0;
      for (var gi = 0; gi < gargs.length; gi++) {
        if (gargs[gi].defeated) defCount++;
      }
      var litGems = gargs.length > 0
        ? Math.round((defCount / gargs.length) * _exitRig.runeGems.length)
        : 0;
      if (nowUnlocked) litGems = _exitRig.runeGems.length;
      for (var rgi = 0; rgi < _exitRig.runeGems.length; rgi++) {
        _exitRig.runeGems[rgi].material = (rgi < litGems)
          ? _assets.mats.sunGemActive
          : _assets.mats.prismCrystalDormant;
      }

      // Optional multi-tile Sanctuary Altar zone rings (Level 4)
      var zList = Array.isArray(ex.zone) ? ex.zone : [];
      var zUsed = 0;
      for (var zi = 0; zi < zList.length && zUsed < _altarZoneRings.length; zi++) {
        if (zList[zi].col === ex.col && zList[zi].row === ex.row) continue;
        var zwp = gridToWorld(zList[zi].col, zList[zi].row);
        var zm = _altarZoneRings[zUsed++];
        zm.position.set(zwp.x, 0.015, zwp.z);
        zm.visible = true;
      }
      for (var zk = zUsed; zk < _altarZoneRings.length; zk++) {
        _altarZoneRings[zk].visible = false;
      }
    } else {
      _exitRig.root.visible = false;
      for (var zh = 0; zh < _altarZoneRings.length; zh++) {
        _altarZoneRings[zh].visible = false;
      }
    }

    // 4. Sync Volumetric Sunbeams & Starburst Flares
    updateBeams(simState.beamSegments, simState.beamHits);
  }

  function animateMirrorRotate(mirrorId, newRot, onComplete) {
    var mRig = _mirrorById[mirrorId];
    if (!mRig) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    var rot = ((newRot || 0) % 4 + 4) % 4;
    mRig.rot = rot;
    mRig.startYaw = mRig.curYaw;
    mRig.targetYaw = mirrorVisualYaw(rot);
    mRig.animTimer = mRig.animDuration;
    mRig.onComplete = (typeof onComplete === 'function') ? onComplete : null;
  }

  function animatePendulumSweep(direction, onApexCallback, onComplete) {
    if (!_pendulumRig || !_pendulumRig.root.visible) {
      if (typeof onApexCallback === 'function') onApexCallback();
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    var dirSign = (typeof direction === 'number' && direction < 0) ? -1 : 1;
    _pendulumRig.sweeping = true;
    _pendulumRig.sweepTimer = 0.0;
    _pendulumRig.startAngle = -dirSign * 0.68;
    _pendulumRig.endAngle = dirSign * 0.68;
    _pendulumRig.restSide = dirSign;
    _pendulumRig.apexFired = false;
    _pendulumRig.onApex = (typeof onApexCallback === 'function') ? onApexCallback : null;
    _pendulumRig.onComplete = (typeof onComplete === 'function') ? onComplete : null;
  }

  function getInteractivePickables() {
    return _pickables;
  }

  function update(dt, elapsed) {
    if (!_initialized) return;
    var safeDt = (typeof dt === 'number' && dt > 0.0 && dt < 0.25) ? dt : (1.0 / 60.0);
    var t = (typeof elapsed === 'number' && !isNaN(elapsed)) ? elapsed : 0.0;

    // 1. Smooth Mirror 90° Clockwork Detent Rotation (0.26s) & Gear-Row Slide Tracking
    var posLerp = 1.0 - Math.exp(-15.0 * safeDt);
    for (var m = 0; m < _activeCounts.mirrors; m++) {
      var mRig = _mirrorPool[m];
      mRig.root.position.x += (mRig.goalX - mRig.root.position.x) * posLerp;
      mRig.root.position.z += (mRig.goalZ - mRig.root.position.z) * posLerp;

      if (mRig.animTimer > 0.0) {
        mRig.animTimer = Math.max(0.0, mRig.animTimer - safeDt);
        var u = 1.0 - (mRig.animTimer / mRig.animDuration);
        // Crisp clockwork spring overshoot settling into exact mechanical detent
        var c1 = 1.70158;
        var c3 = c1 + 1.0;
        var um1 = u - 1.0;
        var eased = 1.0 + c3 * um1 * um1 * um1 + c1 * um1 * um1;
        var dYaw = shortestAngleDelta(mRig.startYaw, mRig.targetYaw);
        mRig.curYaw = mRig.startYaw + dYaw * eased;
        mRig.mirrorGroup.rotation.y = mRig.curYaw;
        mRig.mirrorGroup.position.y = Math.sin(u * Math.PI) * 0.036;

        if (mRig.animTimer <= 0.0) {
          mRig.curYaw = mRig.targetYaw;
          mRig.mirrorGroup.rotation.y = mRig.targetYaw;
          mRig.mirrorGroup.position.y = 0.0;
          if (mRig.onComplete) {
            var cb = mRig.onComplete;
            mRig.onComplete = null;
            cb();
          }
        }
      }

      if (mRig.waterCollar.visible) {
        mRig.waterCollar.rotation.y += (mRig.powered ? 2.4 : 0.25) * safeDt;
      }
    }

    // 2. Emitter Armillary Rings & Crystal Bob
    for (var e = 0; e < _activeCounts.emitters; e++) {
      var eRig = _emitterPool[e];
      var eSpd = eRig.active ? 1.6 : 0.25;
      eRig.gyroRing1.rotation.z = t * eSpd;
      eRig.gyroRing2.rotation.x = -t * (eSpd * 0.8);
      eRig.crystal.rotation.y = t * 2.1;
    }

    // 3. Feathered 3-Layer Incandescent Golden Sunbeams & Camera-Ray-Locked Pinpoint Joint Flares
    var camPos = getLiveCamPos();
    _assets.mats.beamInner.opacity = 0.91 + 0.05 * Math.sin(t * 6.0);
    _assets.mats.beamOuter.opacity = 0.48 + 0.05 * Math.cos(t * 4.8);
    _assets.mats.groundRibbon.opacity = 0.44 + 0.05 * Math.sin(t * 5.2);

    for (var bi = 0; bi < _activeCounts.beams; bi++) {
      var bRig = _beamPool[bi];
      bRig.spanGroup.rotation.z = computeAxialRoll(bRig.midX, bRig.midY, bRig.midZ, bRig.yaw, camPos);
    }

    for (var f = 0; f < _activeCounts.flares; f++) {
      var fRig = _flarePool[f];
      var fPulse = fRig.baseScale * (0.94 + 0.07 * Math.sin(t * 7.5 + fRig.seed));
      positionFlareTowardCam(fRig, camPos);
      fRig.starHoriz.rotation.z = t * 1.4 + fRig.seed;
      fRig.starDiag1.rotation.z = -t * 1.1 + fRig.seed;
      fRig.root.scale.setScalar(fPulse);

      for (var mo = 0; mo < fRig.motes.length; mo++) {
        var ma = t * 3.2 + fRig.seed + (mo * Math.PI);
        var mr = 0.105 + 0.022 * Math.sin(t * 5.0 + mo);
        fRig.motes[mo].position.set(
          Math.cos(ma) * mr,
          Math.sin(t * 4.2 + mo * 2.1) * 0.045,
          Math.sin(ma) * mr
        );
      }
    }

    // 4. Level 2 Sparkling Water Scrolling, Frothy Plunge Splash, Sluice Winch & Sanctuary Waterwheel Lock
    if (_activeCounts.waterCells > 0) {
      if (_assets.textures.flowChevron) {
        _assets.textures.flowChevron.offset.y = (t * 0.82) % 1.0;
      }
      if (_assets.textures.waterFoam) {
        _assets.textures.waterFoam.offset.y = (t * 0.40) % 1.0;
        _assets.textures.waterFoam.offset.x = Math.sin(t * 0.9) * 0.05;
      }
      for (var wIdx = 0; wIdx < _activeCounts.waterCells; wIdx++) {
        var wcRig = _waterCellPool[wIdx];
        if (wcRig.intakeGroup.visible && wcRig.splashDisc) {
          var spSc = 0.94 + 0.09 * Math.sin(t * 6.2 + wcRig.phase);
          wcRig.splashDisc.scale.set(spSc, 1.0, spSc * 0.88);
          wcRig.splashDisc.rotation.z = t * 0.9 + wcRig.phase;
        }
      }
    }

    for (var s = 0; s < _activeCounts.sluices; s++) {
      var sRig = _sluicePool[s];
      var goalOpen = sRig.open ? 1.0 : 0.0;
      sRig.curOpen += (goalOpen - sRig.curOpen) * (1.0 - Math.exp(-12.0 * safeDt));
      sRig.gatePlate.position.y = 0.16 + sRig.curOpen * 0.62;
      sRig.wheelGroup.rotation.y = sRig.curOpen * Math.PI * 2.0;
    }

    if (_waterLockRig && _waterLockRig.root.visible) {
      var targetWheelSpd = _waterLockRig.active ? 7.2 : 0.15;
      _waterLockRig.spinSpeed += (targetWheelSpd - _waterLockRig.spinSpeed) * (1.0 - Math.exp(-6.0 * safeDt));
      _waterLockRig.wheel.rotation.x -= _waterLockRig.spinSpeed * safeDt;
      _waterLockRig.dynamoCrystal.rotation.y += (_waterLockRig.active ? 3.5 : 0.4) * safeDt;
    }

    // 5. Level 3 Spinning Bronze Conveyor Rollers & Overhead Pendulum Sweep
    for (var r = 0; r < _activeCounts.rollers; r++) {
      var rRig = _rollerPool[r];
      for (var rc = 0; rc < rRig.cylinders.length; rc++) {
        rRig.cylinders[rc].rotation.x -= 4.2 * safeDt;
      }
      var cPulse = (t * 1.8) % 1.0;
      rRig.chev1.position.z = 0.36 - cPulse * 0.28;
      rRig.chev2.position.z = -0.12 - cPulse * 0.28;
    }

    if (_pendulumRig && _pendulumRig.root.visible) {
      _pendulumRig.cogWest.rotation.x = t * 0.85;
      _pendulumRig.cogEast.rotation.x = -t * 0.85;
      _pendulumRig.hubEscapement.rotation.z = Math.sin(t * 3.14159) * 0.35;

      if (_pendulumRig.dangerStrip.visible) {
        _assets.mats.amberDanger.opacity = 0.22 + 0.14 * Math.sin(t * 7.5);
      }

      if (_pendulumRig.sweeping) {
        _pendulumRig.sweepTimer += safeDt;
        var su = clamp01(_pendulumRig.sweepTimer / _pendulumRig.sweepDuration);
        var sEase = 0.5 - 0.5 * Math.cos(su * Math.PI);
        _pendulumRig.swingPivot.rotation.z =
          _pendulumRig.startAngle + (_pendulumRig.endAngle - _pendulumRig.startAngle) * sEase;

        if (!_pendulumRig.apexFired && su >= 0.50) {
          _pendulumRig.apexFired = true;
          spawnDustPuff(0.0, 0.12, _pendulumRig.root.position.z);
          if (_pendulumRig.onApex) {
            var apexCb = _pendulumRig.onApex;
            _pendulumRig.onApex = null;
            apexCb();
          }
        }

        if (su >= 1.0) {
          _pendulumRig.sweeping = false;
          if (_pendulumRig.onComplete) {
            var pDone = _pendulumRig.onComplete;
            _pendulumRig.onComplete = null;
            pDone();
          }
        }
      } else {
        var tickOsc = Math.sin(t * 3.2) * (_pendulumRig.imminent ? 0.036 : 0.016);
        var goalAng = _pendulumRig.restSide * 0.62 + tickOsc;
        _pendulumRig.swingPivot.rotation.z += (goalAng - _pendulumRig.swingPivot.rotation.z) * (1.0 - Math.exp(-10.0 * safeDt));
      }
    }

    // 6. Level 4 Twin-Cog Sky Ferry & Cross-Chasm Sun-Relay Rings
    if (_ferryRig && _ferryRig.root.visible) {
      var prevFX = _ferryRig.curX;
      _ferryRig.curX += (_ferryRig.goalX - _ferryRig.curX) * (1.0 - Math.exp(-12.0 * safeDt));
      var fVel = (_ferryRig.curX - prevFX) / Math.max(1e-4, safeDt);
      _ferryRig.platform.position.x = _ferryRig.curX;
      _ferryRig.platform.position.y = Math.sin(t * 2.2) * 0.012; // Gentle sky-buoyancy hover (<1.2cm)

      var cogRate = 0.75 + Math.abs(fVel) * 1.4;
      for (var fc = 0; fc < _ferryRig.cogs.length; fc++) {
        _ferryRig.cogs[fc].rotation.y += cogRate * safeDt * (fc % 2 === 0 ? 1 : -1);
      }
      var targetTilt = Math.abs(fVel) > 0.1 ? (fVel > 0 ? -0.38 : 0.38) : 0.18 * Math.sin(t * 1.6);
      _ferryRig.leverPivot.rotation.z += (targetTilt - _ferryRig.leverPivot.rotation.z) * (1.0 - Math.exp(-10.0 * safeDt));
    }

    for (var ry = 0; ry < _activeCounts.relays; ry++) {
      var relRig = _relayPool[ry];
      var rRate = relRig.lit ? 2.8 : 0.6;
      relRig.outer.rotation.z = t * rRate;
      relRig.inner.rotation.x = t * rRate * 1.3;
      relRig.inner.material = relRig.lit ? _assets.mats.sunGemActive : _assets.mats.bronzeDark;
    }

    // 7. Golden Sanctuary Exit Stair Unlock & Portal Beam
    if (_exitRig && _exitRig.root.visible) {
      var goalUnlock = _exitRig.unlocked ? 1.0 : 0.0;
      _exitRig.unlockProgress += (goalUnlock - _exitRig.unlockProgress) * (1.0 - Math.exp(-7.0 * safeDt));
      var up = _exitRig.unlockProgress;

      for (var stIdx = 0; stIdx < _exitRig.stairSteps.length; stIdx++) {
        _exitRig.stairSteps[stIdx].position.y = -0.06 + up * (0.08 + stIdx * 0.055);
        _exitRig.stairSteps[stIdx].rotation.y = (stIdx * Math.PI) / 2 + up * 0.35;
      }

      _exitRig.portalGroup.visible = up > 0.04;
      if (_exitRig.portalGroup.visible) {
        _exitRig.portalGroup.scale.set(1.0, Math.max(0.05, up), 1.0);
        _exitRig.ringLow.rotation.z = t * 1.5;
        _exitRig.ringHigh.rotation.z = -t * 2.2;
        _exitRig.ringHigh.position.y = 1.12 + 0.12 * Math.sin(t * 3.0);
        if (_assets.textures.portalCol) {
          _assets.textures.portalCol.offset.x = (t * 0.18) % 1.0;
        }
      }
    }

    // 8. Step Zero-GC Particle Pool
    for (var pi = 0; pi < PARTICLE_POOL_SIZE; pi++) {
      var part = _particlePool[pi];
      if (!part.active) continue;
      part.age += safeDt;
      if (part.age >= part.life) {
        part.active = false;
        part.mesh.visible = false;
        continue;
      }
      var k = part.age / part.life;
      part.vy += part.gravity * safeDt;
      part.mesh.position.x += part.vx * safeDt;
      part.mesh.position.y += part.vy * safeDt;
      part.mesh.position.z += part.vz * safeDt;

      if (part.bounce > 0.0 && part.mesh.position.y < 0.045 && part.vy < 0.0) {
        part.mesh.position.y = 0.045;
        part.vy = -part.vy * part.bounce;
        part.vx *= 0.72;
        part.vz *= 0.72;
      }

      part.mesh.rotation.x += part.rx * safeDt;
      part.mesh.rotation.y += part.ry * safeDt;
      part.mesh.rotation.z += part.rz * safeDt;

      var sc = part.startScale * (1.0 - k * k) + part.endScale * (k * k);
      part.mesh.scale.setScalar(Math.max(0.01, sc));
    }
  }

  window.GAME.Contraptions = {
    init: init,
    buildLevel: buildLevel,
    syncFromState: syncFromState,
    updateBeams: updateBeams,
    animateMirrorRotate: animateMirrorRotate,
    animatePendulumSweep: animatePendulumSweep,
    spawnShatterRubble: spawnShatterRubble,
    spawnDustPuff: spawnDustPuff,
    spawnWaterSplash: spawnWaterSplash,
    getInteractivePickables: getInteractivePickables,
    update: update
  };
})();

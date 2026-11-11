/**
 * Clockwork Sanctum: The Living Board
 * Sculpted Ankama / Krosmaster Toy-Box Chibi Heroes & Carved Limestone Gargoyles
 * Owns ONLY: js/units.js
 * Exposes: window.GAME.Units
 */
(function () {
  'use strict';

  window.GAME = window.GAME || {};

  var PI = Math.PI;
  var TWO_PI = Math.PI * 2.0;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function shortestAngleDelta(fromRad, toRad) {
    var d = (toRad - fromRad) % TWO_PI;
    if (d > PI) d -= TWO_PI;
    if (d < -PI) d += TWO_PI;
    return d;
  }

  function srgbChannelToLinear(c) {
    return (c <= 0.04045) ? (c / 12.92) : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function hexToRgb01(hex) {
    return [
      srgbChannelToLinear(((hex >> 16) & 255) / 255.0),
      srgbChannelToLinear(((hex >> 8) & 255) / 255.0),
      srgbChannelToLinear((hex & 255) / 255.0)
    ];
  }

  function gridToWorld(col, row) {
    var cfg = window.GAME.CONFIG;
    if (cfg && typeof cfg.gridToWorld === 'function') {
      return cfg.gridToWorld(col, row);
    }
    return { x: (col - 3.5) * 2.0, z: (row - 3.5) * 2.0 };
  }

  // ============================================================================
  // 1. Ultra-Smooth Organic 3D Sculpting Primitives (Three.js r128 Safe, 0 Leaks)
  // ============================================================================

  /**
   * Position-hashed smooth normal welder (eliminates UV seam creases & low-poly facets).
   */
  function weldSmoothNormals(geom, creaseAngleDeg) {
    if (!geom) return geom;
    geom.computeVertexNormals();
    var pos = geom.getAttribute('position');
    var norm = geom.getAttribute('normal');
    if (!pos || !norm) return geom;

    var deg = (creaseAngleDeg !== undefined && creaseAngleDeg !== null) ? creaseAngleDeg : 70;
    var cosThresh = Math.cos((deg * PI) / 180.0);
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
        var sx = 0, sy = 0, sz = 0;
        var nA = orig[a];
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
    return geom;
  }

  function catmull1D(p0, p1, p2, p3, t) {
    var t2 = t * t;
    var t3 = t2 * t;
    return 0.5 * (
      (2.0 * p1) +
      (-p0 + p2) * t +
      (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 +
      (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    );
  }

  /**
   * Builds a recessed matte-dark interior shadow plug inside an open garment hem
   * (`capStart: false`), preventing bright flat under-skirt discs at any angle.
   */
  function buildRecessedGarmentShadow(rx, rz, ox, oz, yHem, recessDepth) {
    var segs = 24;
    var depth = recessDepth || 0.065;
    var yIn = yHem + depth;
    var rxIn = rx * 0.76;
    var rzIn = rz * 0.76;
    var posArr = [];
    var colArr = [];
    var uvArr = [];
    var darkRim = [0.09, 0.07, 0.07];
    var darkCore = [0.04, 0.03, 0.03];

    function pushVert(vx, vy, vz, rgb) {
      posArr.push(vx, vy, vz);
      colArr.push(rgb[0], rgb[1], rgb[2]);
      uvArr.push(vx * 0.5 + 0.5, vz * 0.5 + 0.5);
    }

    for (var i = 0; i < segs; i++) {
      var a0 = (i / segs) * TWO_PI;
      var a1 = ((i + 1) / segs) * TWO_PI;
      var c0 = Math.cos(a0), s0 = Math.sin(a0);
      var c1 = Math.cos(a1), s1 = Math.sin(a1);

      var x0Out = ox + c0 * rx, z0Out = oz + s0 * rz;
      var x1Out = ox + c1 * rx, z1Out = oz + s1 * rz;
      var x0In  = ox + c0 * rxIn, z0In = oz + s0 * rzIn;
      var x1In  = ox + c1 * rxIn, z1In = oz + s1 * rzIn;

      // Inward-sloping shadow bevel facing downward
      pushVert(x0Out, yHem, z0Out, darkRim);
      pushVert(x1Out, yHem, z1Out, darkRim);
      pushVert(x1In,  yIn,  z1In,  darkCore);

      pushVert(x0Out, yHem, z0Out, darkRim);
      pushVert(x1In,  yIn,  z1In,  darkCore);
      pushVert(x0In,  yIn,  z0In,  darkCore);

      // Recessed matte ceiling cap facing downward (-Y)
      pushVert(ox,   yIn + 0.01, oz,   darkCore);
      pushVert(x0In, yIn,        z0In, darkCore);
      pushVert(x1In, yIn,        z1In, darkCore);
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colArr), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Smooth Catmull-Rom organic loft (`24` radial segs, `3` sub-rings per span).
   * stations: [{ y, rx, rz, ox, oz, pleatAmp, pleatFreq, rgb/hex }]
   * opts: { capStart: false, capEnd: true, recessedShadow: false, recessDepth: 0.065, smoothAngle: 72 }
   */
  function catmullRomLoft(stations, radialSegs, subRingsPerSpan, opts) {
    opts = opts || {};
    var segs = radialSegs || 24;
    var subs = subRingsPerSpan || 3;
    var nSt = stations.length;

    function normSt(s) {
      var rx = s.rx !== undefined ? s.rx : (s.r !== undefined ? s.r : 0.2);
      var rz = s.rz !== undefined ? s.rz : rx;
      var rgb = s.rgb ? s.rgb : (s.hex !== undefined ? hexToRgb01(s.hex) : [1.0, 1.0, 1.0]);
      return {
        y: s.y || 0.0,
        rx: Math.max(0.001, rx),
        rz: Math.max(0.001, rz),
        ox: s.ox || 0.0,
        oz: s.oz || 0.0,
        pleatAmp: s.pleatAmp || 0.0,
        pleatFreq: s.pleatFreq || 6.0,
        frontBulge: s.frontBulge || 0.0,
        rgb: rgb
      };
    }

    var st = stations.map(normSt);
    var rings = [];

    for (var i = 0; i < nSt - 1; i++) {
      var s0 = st[Math.max(0, i - 1)];
      var s1 = st[i];
      var s2 = st[i + 1];
      var s3 = st[Math.min(nSt - 1, i + 2)];
      var steps = (i === nSt - 2) ? subs : subs;
      for (var step = 0; step < steps; step++) {
        var t = step / subs;
        rings.push({
          y: catmull1D(s0.y, s1.y, s2.y, s3.y, t),
          rx: Math.max(0.001, catmull1D(s0.rx, s1.rx, s2.rx, s3.rx, t)),
          rz: Math.max(0.001, catmull1D(s0.rz, s1.rz, s2.rz, s3.rz, t)),
          ox: catmull1D(s0.ox, s1.ox, s2.ox, s3.ox, t),
          oz: catmull1D(s0.oz, s1.oz, s2.oz, s3.oz, t),
          pleatAmp: lerp(s1.pleatAmp, s2.pleatAmp, t),
          pleatFreq: s1.pleatFreq,
          frontBulge: lerp(s1.frontBulge, s2.frontBulge, t),
          rgb: [
            clamp(lerp(s1.rgb[0], s2.rgb[0], t), 0, 1),
            clamp(lerp(s1.rgb[1], s2.rgb[1], t), 0, 1),
            clamp(lerp(s1.rgb[2], s2.rgb[2], t), 0, 1)
          ]
        });
      }
    }
    rings.push(st[nSt - 1]);

    // Optional smooth hemispherical top dome when capEnd === true
    if (opts.capEnd !== false) {
      var top = rings[rings.length - 1];
      if (top.rx > 0.012 || top.rz > 0.012) {
        var domeH = opts.domeHeight !== undefined ? opts.domeHeight : Math.min(top.rx, top.rz) * 0.42;
        var domeRings = 3;
        for (var d = 1; d <= domeRings; d++) {
          var ang = (d / (domeRings + 1)) * (PI * 0.5);
          var c = Math.cos(ang);
          var sn = Math.sin(ang);
          rings.push({
            y: top.y + sn * domeH,
            rx: Math.max(0.002, top.rx * c),
            rz: Math.max(0.002, top.rz * c),
            ox: top.ox,
            oz: top.oz,
            pleatAmp: top.pleatAmp * c,
            pleatFreq: top.pleatFreq,
            frontBulge: top.frontBulge * c,
            rgb: top.rgb
          });
        }
      }
    }

    var nR = rings.length;
    var ringVerts = new Array(nR);
    for (var r = 0; r < nR; r++) {
      var rg = rings[r];
      var rowPts = new Array(segs);
      for (var k = 0; k < segs; k++) {
        var theta = (k / segs) * TWO_PI;
        var ct = Math.cos(theta);
        var stt = Math.sin(theta);
        var mod = 1.0 + rg.pleatAmp * Math.cos(theta * rg.pleatFreq);
        // theta=PI/2 is +Z (local forward)
        var fBulge = rg.frontBulge * Math.max(0.0, stt);
        var vx = rg.ox + ct * rg.rx * mod;
        var vz = rg.oz + stt * rg.rz * mod + fBulge;
        rowPts[k] = [vx, rg.y, vz];
      }
      ringVerts[r] = rowPts;
    }

    var posArr = [];
    var colArr = [];
    var uvArr = [];

    function emitV(pt, rgb, u, v) {
      posArr.push(pt[0], pt[1], pt[2]);
      colArr.push(rgb[0], rgb[1], rgb[2]);
      uvArr.push(u, v);
    }

    for (var band = 0; band < nR - 1; band++) {
      var pA = ringVerts[band];
      var pB = ringVerts[band + 1];
      var cA = rings[band].rgb;
      var cB = rings[band + 1].rgb;
      var vA = band / (nR - 1);
      var vB = (band + 1) / (nR - 1);
      for (var s = 0; s < segs; s++) {
        var sn2 = (s + 1) % segs;
        var u0 = s / segs;
        var u1 = (s + 1) / segs;
        // Outward CCW winding when viewed from outside (+Y upward)
        emitV(pA[s],   cA, u0, vA);
        emitV(pB[s],   cB, u0, vB);
        emitV(pB[sn2], cB, u1, vB);

        emitV(pA[s],   cA, u0, vA);
        emitV(pB[sn2], cB, u1, vB);
        emitV(pA[sn2], cA, u1, vA);
      }
    }

    if (opts.capStart === true) {
      var bot = rings[0];
      var botPts = ringVerts[0];
      var botCenter = [bot.ox, bot.y, bot.oz];
      for (var bs = 0; bs < segs; bs++) {
        var bsn = (bs + 1) % segs;
        emitV(botCenter,   bot.rgb, 0.5, 0.5);
        emitV(botPts[bs],  bot.rgb, 0.5, 0.0);
        emitV(botPts[bsn], bot.rgb, 1.0, 0.0);
      }
    }

    if (opts.capEnd !== false) {
      var lastR = rings[nR - 1];
      var lastPts = ringVerts[nR - 1];
      var apexY = lastR.y + (opts.domeHeight !== undefined ? opts.domeHeight * 0.22 : Math.min(lastR.rx, lastR.rz) * 0.25);
      var topCenter = [lastR.ox, apexY, lastR.oz];
      for (var ts = 0; ts < segs; ts++) {
        var tsn = (ts + 1) % segs;
        emitV(topCenter,    lastR.rgb, 0.5, 1.0);
        emitV(lastPts[tsn], lastR.rgb, 1.0, 1.0);
        emitV(lastPts[ts],  lastR.rgb, 0.0, 1.0);
      }
    }

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colArr), 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    weldSmoothNormals(geom, opts.smoothAngle !== undefined ? opts.smoothAngle : 72);

    if (opts.capStart === false && opts.recessedShadow) {
      var b0 = st[0];
      var plug = buildRecessedGarmentShadow(b0.rx, b0.rz, b0.ox, b0.oz, b0.y, opts.recessDepth || 0.065);
      return mergeBufferGeometries([geom, plug]);
    }
    return geom;
  }

  /**
   * Parallel-Transport (Bishop Frame) 3D Catmull-Rom Spline Tube (`16` radial segs).
   * Eliminates Frenet twist flips on curved wizard hats, staves, horns, hair tufts & bat-wing spars!
   */
  function splineTube(ctrlPts, radialSegs, tubularSteps, opts) {
    opts = opts || {};
    var segs = radialSegs || 16;
    var steps = tubularSteps || 22;
    var nC = ctrlPts.length;

    function normPt(p) {
      var r = p.r !== undefined ? p.r : 0.05;
      return {
        x: p.x || 0.0,
        y: p.y || 0.0,
        z: p.z || 0.0,
        rx: p.rx !== undefined ? p.rx : r,
        rz: p.rz !== undefined ? p.rz : r,
        rgb: p.rgb ? p.rgb : (p.hex !== undefined ? hexToRgb01(p.hex) : [1.0, 1.0, 1.0])
      };
    }

    var cp = ctrlPts.map(normPt);
    var samples = [];

    for (var s = 0; s <= steps; s++) {
      var u = (s / steps) * (nC - 1);
      var seg = Math.min(nC - 2, Math.floor(u));
      var t = u - seg;
      var p0 = cp[Math.max(0, seg - 1)];
      var p1 = cp[seg];
      var p2 = cp[seg + 1];
      var p3 = cp[Math.min(nC - 1, seg + 2)];

      samples.push({
        x: catmull1D(p0.x, p1.x, p2.x, p3.x, t),
        y: catmull1D(p0.y, p1.y, p2.y, p3.y, t),
        z: catmull1D(p0.z, p1.z, p2.z, p3.z, t),
        rx: Math.max(0.0015, catmull1D(p0.rx, p1.rx, p2.rx, p3.rx, t)),
        rz: Math.max(0.0015, catmull1D(p0.rz, p1.rz, p2.rz, p3.rz, t)),
        rgb: [
          clamp(lerp(p1.rgb[0], p2.rgb[0], t), 0, 1),
          clamp(lerp(p1.rgb[1], p2.rgb[1], t), 0, 1),
          clamp(lerp(p1.rgb[2], p2.rgb[2], t), 0, 1)
        ]
      });
    }

    // Compute tangents & parallel-transport normals
    var tangents = new Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var prev = samples[Math.max(0, i - 1)];
      var next = samples[Math.min(samples.length - 1, i + 1)];
      var tx = next.x - prev.x;
      var ty = next.y - prev.y;
      var tz = next.z - prev.z;
      var tl = Math.hypot(tx, ty, tz) || 1.0;
      tangents[i] = [tx / tl, ty / tl, tz / tl];
    }

    var t0 = tangents[0];
    var upX = Math.abs(t0[1]) > 0.9 ? 1.0 : 0.0;
    var upY = Math.abs(t0[1]) > 0.9 ? 0.0 : 1.0;
    var upZ = 0.0;

    // n0 = normalize(up x t0)
    var nx = upY * t0[2] - upZ * t0[1];
    var ny = upZ * t0[0] - upX * t0[2];
    var nz = upX * t0[1] - upY * t0[0];
    var nl = Math.hypot(nx, ny, nz) || 1.0;
    nx /= nl; ny /= nl; nz /= nl;

    var ringVerts = new Array(samples.length);
    for (var k = 0; k < samples.length; k++) {
      var tk = tangents[k];
      if (k > 0) {
        // Project previous normal perpendicular to new tangent
        var dotNT = nx * tk[0] + ny * tk[1] + nz * tk[2];
        nx -= dotNT * tk[0];
        ny -= dotNT * tk[1];
        nz -= dotNT * tk[2];
        var nLen = Math.hypot(nx, ny, nz) || 1.0;
        nx /= nLen; ny /= nLen; nz /= nLen;
      }
      // Binormal b = tk x n
      var bx = tk[1] * nz - tk[2] * ny;
      var by = tk[2] * nx - tk[0] * nz;
      var bz = tk[0] * ny - tk[1] * nx;

      var smp = samples[k];
      var pts = new Array(segs);
      for (var cIdx = 0; cIdx < segs; cIdx++) {
        var ang = (cIdx / segs) * TWO_PI;
        var ca = Math.cos(ang) * smp.rx;
        var sa = Math.sin(ang) * smp.rz;
        pts[cIdx] = [
          smp.x + nx * ca + bx * sa,
          smp.y + ny * ca + by * sa,
          smp.z + nz * ca + bz * sa
        ];
      }
      ringVerts[k] = pts;
    }

    var posArr = [];
    var colArr = [];
    var uvArr = [];
    function pushV(pt, rgb, u, v) {
      posArr.push(pt[0], pt[1], pt[2]);
      colArr.push(rgb[0], rgb[1], rgb[2]);
      uvArr.push(u, v);
    }

    for (var b = 0; b < samples.length - 1; b++) {
      var rA = ringVerts[b];
      var rB = ringVerts[b + 1];
      var colA = samples[b].rgb;
      var colB = samples[b + 1].rgb;
      var v0 = b / (samples.length - 1);
      var v1 = (b + 1) / (samples.length - 1);
      for (var j = 0; j < segs; j++) {
        var jn = (j + 1) % segs;
        // Outward CCW winding: (rB - rA) ~ +tk, (rA[jn] - rA[j]) ~ +b, and b x tk = +n (outward!)
        pushV(rA[j],  colA, j / segs, v0);
        pushV(rB[jn], colB, (j + 1) / segs, v1);
        pushV(rB[j],  colB, j / segs, v1);

        pushV(rA[j],  colA, j / segs, v0);
        pushV(rA[jn], colA, (j + 1) / segs, v0);
        pushV(rB[jn], colB, (j + 1) / segs, v1);
      }
    }

    if (opts.capStart !== false) {
      var sStart = samples[0];
      var tS = tangents[0];
      var cap0 = [
        sStart.x - tS[0] * sStart.rx * 0.45,
        sStart.y - tS[1] * sStart.rx * 0.45,
        sStart.z - tS[2] * sStart.rx * 0.45
      ];
      for (var cs = 0; cs < segs; cs++) {
        var csn = (cs + 1) % segs;
        pushV(cap0,              sStart.rgb, 0.5, 0.0);
        pushV(ringVerts[0][csn], sStart.rgb, 1.0, 0.0);
        pushV(ringVerts[0][cs],  sStart.rgb, 0.0, 0.0);
      }
    }

    if (opts.capEnd !== false) {
      var lastIdx = samples.length - 1;
      var sEnd = samples[lastIdx];
      var tE = tangents[lastIdx];
      var cap1 = [
        sEnd.x + tE[0] * sEnd.rx * 0.55,
        sEnd.y + tE[1] * sEnd.rx * 0.55,
        sEnd.z + tE[2] * sEnd.rx * 0.55
      ];
      for (var ce = 0; ce < segs; ce++) {
        var cen = (ce + 1) % segs;
        pushV(cap1,                    sEnd.rgb, 0.5, 1.0);
        pushV(ringVerts[lastIdx][ce],  sEnd.rgb, 0.0, 1.0);
        pushV(ringVerts[lastIdx][cen], sEnd.rgb, 1.0, 1.0);
      }
    }

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colArr), 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    weldSmoothNormals(geom, opts.smoothAngle !== undefined ? opts.smoothAngle : 72);
    return geom;
  }

  /**
   * Transforms a BufferGeometry, preserves existing vertex colors (`rts_kingdom_strategy.md`),
   * applies smooth normal welding + Ankama sunlit shading, and disposes temporary source geom.
   */
  function bakePart(srcGeom, opts) {
    opts = opts || {};
    var g = srcGeom.index ? srcGeom.toNonIndexed() : srcGeom.clone();
    if (opts.disposeSrc !== false && srcGeom !== g && typeof srcGeom.dispose === 'function') {
      srcGeom.dispose();
    }

    var sx = opts.sx !== undefined ? opts.sx : 1.0;
    var sy = opts.sy !== undefined ? opts.sy : 1.0;
    var sz = opts.sz !== undefined ? opts.sz : 1.0;
    if (sx !== 1.0 || sy !== 1.0 || sz !== 1.0) {
      g.scale(sx, sy, sz);
      // Flip triangle winding if negative mirror scale inverted handedness!
      if (sx * sy * sz < 0.0) {
        var pFlip = g.getAttribute('position');
        var uvFlip = g.getAttribute('uv');
        var colFlip = g.getAttribute('color');
        for (var f = 0; f < pFlip.count; f += 3) {
          var tx = pFlip.getX(f + 1), ty = pFlip.getY(f + 1), tz = pFlip.getZ(f + 1);
          pFlip.setXYZ(f + 1, pFlip.getX(f + 2), pFlip.getY(f + 2), pFlip.getZ(f + 2));
          pFlip.setXYZ(f + 2, tx, ty, tz);
          if (uvFlip) {
            var tu = uvFlip.getX(f + 1), tv = uvFlip.getY(f + 1);
            uvFlip.setXY(f + 1, uvFlip.getX(f + 2), uvFlip.getY(f + 2));
            uvFlip.setXY(f + 2, tu, tv);
          }
          if (colFlip) {
            var cr = colFlip.getX(f + 1), cg = colFlip.getY(f + 1), cb = colFlip.getZ(f + 1);
            colFlip.setXYZ(f + 1, colFlip.getX(f + 2), colFlip.getY(f + 2), colFlip.getZ(f + 2));
            colFlip.setXYZ(f + 2, cr, cg, cb);
          }
        }
      }
    }

    if (opts.rx) g.rotateX(opts.rx);
    if (opts.ry) g.rotateY(opts.ry);
    if (opts.rz) g.rotateZ(opts.rz);
    if (opts.tx || opts.ty || opts.tz) {
      g.translate(opts.tx || 0.0, opts.ty || 0.0, opts.tz || 0.0);
    }

    var smoothDeg = opts.smoothAngle !== undefined ? opts.smoothAngle : 70;
    if (smoothDeg > 0) {
      weldSmoothNormals(g, smoothDeg);
    } else {
      g.computeVertexNormals();
    }

    var pos = g.getAttribute('position');
    var norm = g.getAttribute('normal');
    var count = pos.count;

    var uv = g.getAttribute('uv');
    if (!uv || opts.boxUvScale) {
      var uvs = new Float32Array(count * 2);
      var sc = opts.boxUvScale || 1.2;
      for (var u = 0; u < count; u++) {
        var vx = pos.getX(u), vy = pos.getY(u), vz = pos.getZ(u);
        var anx = Math.abs(norm.getX(u)), any = Math.abs(norm.getY(u)), anz = Math.abs(norm.getZ(u));
        if (any >= anx && any >= anz) {
          uvs[u * 2] = vx * sc + 0.5;
          uvs[u * 2 + 1] = vz * sc + 0.5;
        } else if (anx >= anz) {
          uvs[u * 2] = vz * sc + 0.5;
          uvs[u * 2 + 1] = vy * sc + 0.5;
        } else {
          uvs[u * 2] = vx * sc + 0.5;
          uvs[u * 2 + 1] = vy * sc + 0.5;
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }

    var baseRgb = hexToRgb01(opts.color !== undefined ? opts.color : 0xFFFFFF);
    var existingCol = g.getAttribute('color');
    var cols = new Float32Array(count * 3);
    var shadeFn = opts.shadeFn || null;

    for (var i = 0; i < count; i++) {
      var px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      var pnx = norm.getX(i), pny = norm.getY(i), pnz = norm.getZ(i);
      var cr = baseRgb[0], cg = baseRgb[1], cb = baseRgb[2];
      if (existingCol) {
        cr *= existingCol.getX(i);
        cg *= existingCol.getY(i);
        cb *= existingCol.getZ(i);
      }
      if (shadeFn) {
        var mod = shadeFn(px, py, pz, pnx, pny, pnz);
        if (typeof mod === 'number') {
          cr *= mod; cg *= mod; cb *= mod;
        } else if (mod) {
          cr *= mod[0]; cg *= mod[1]; cb *= mod[2];
        }
      } else if (opts.autoToyShade !== false) {
        // Subtle warm Ankama top-down figurine gradient
        var sunLift = 0.90 + 0.14 * clamp(pny * 0.65 + pnz * 0.25 + 0.35, 0.0, 1.0);
        cr *= sunLift;
        cg *= sunLift * 0.99;
        cb *= sunLift * 0.97;
      }
      cols[i * 3]     = clamp(cr, 0.0, 1.0);
      cols[i * 3 + 1] = clamp(cg, 0.0, 1.0);
      cols[i * 3 + 2] = clamp(cb, 0.0, 1.0);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    return g;
  }

  function mergeBufferGeometries(parts) {
    var totalVerts = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) totalVerts += parts[i].getAttribute('position').count;
    }
    var positions = new Float32Array(totalVerts * 3);
    var normals = new Float32Array(totalVerts * 3);
    var uvs = new Float32Array(totalVerts * 2);
    var colors = new Float32Array(totalVerts * 3);

    var vOff = 0;
    for (var p = 0; p < parts.length; p++) {
      var g = parts[p];
      if (!g) continue;
      var pos = g.getAttribute('position');
      var norm = g.getAttribute('normal');
      var uv = g.getAttribute('uv');
      var col = g.getAttribute('color');
      var cnt = pos.count;

      positions.set(pos.array, vOff * 3);
      if (norm) normals.set(norm.array, vOff * 3);
      if (uv) uvs.set(uv.array, vOff * 2);
      if (col) {
        colors.set(col.array, vOff * 3);
      } else {
        for (var c = 0; c < cnt * 3; c++) colors[vOff * 3 + c] = 1.0;
      }
      vOff += cnt;
      g.dispose();
    }

    var merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    merged.computeBoundingSphere();
    return merged;
  }

  /**
   * Shifts a boot/paw BufferGeometry vertically so its lowest sole vertex sits at exact targetMinY.
   */
  function alignBottomToY(geom, targetMinY) {
    var pos = geom.getAttribute('position');
    var minY = Infinity;
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i);
      if (y < minY) minY = y;
    }
    if (isFinite(minY)) {
      geom.translate(0.0, (targetMinY || 0.0) - minY, 0.0);
      geom.computeBoundingSphere();
    }
    return geom;
  }

  // ============================================================================
  // 2. Signature Glowing Rounded-Square Tile Base Outlines & Selection Chevron
  // ============================================================================

  function sampleRoundedSquareLoop(halfSize, cornerR, segsPerCorner) {
    var r = Math.min(cornerR, halfSize * 0.9);
    var c = halfSize - r;
    var pts = [];
    var corners = [
      { ox:  c, oz:  c, a0: 0.0,       a1: PI * 0.5 },
      { ox: -c, oz:  c, a0: PI * 0.5,  a1: PI },
      { ox: -c, oz: -c, a0: PI,        a1: PI * 1.5 },
      { ox:  c, oz: -c, a0: PI * 1.5,  a1: TWO_PI }
    ];
    for (var q = 0; q < 4; q++) {
      var kc = corners[q];
      for (var s = 0; s < segsPerCorner; s++) {
        var ang = kc.a0 + (kc.a1 - kc.a0) * (s / segsPerCorner);
        pts.push([kc.ox + Math.cos(ang) * r, kc.oz + Math.sin(ang) * r]);
      }
    }
    return pts;
  }

  /**
   * Builds a multi-band rounded-square flat ribbon in XZ at Y=0:
   * - Crisp Core Outline: outer 1.78m x 1.78m (`half = 0.89m`), cornerR `0.22m`, width `0.095m`
   *   with bright luminous center spine -> rich saturated border color!
   * - Soft Additive Halo: feathered from 0.0 at inner `0.71m` -> peak at `0.842m` -> 0.0 at outer `0.965m`
   *   (strictly 0% intensity at outer perimeter -> zero rectangular quad edges!).
   */
  function buildRoundedSquareRibbonGeometry(ringsSpec) {
    // ringsSpec: [{ half, cornerR, rgb }] from inner to outer
    var segs = 12;
    var loops = ringsSpec.map(function (rs) {
      return sampleRoundedSquareLoop(rs.half, rs.cornerR, segs);
    });
    var N = loops[0].length;
    var posArr = [];
    var colArr = [];
    var uvArr = [];
    var normArr = [];

    function pushV(pt, rgb) {
      posArr.push(pt[0], 0.0, pt[1]);
      colArr.push(rgb[0], rgb[1], rgb[2]);
      uvArr.push(pt[0] * 0.5 + 0.5, pt[1] * 0.5 + 0.5);
      normArr.push(0.0, 1.0, 0.0);
    }

    for (var b = 0; b < ringsSpec.length - 1; b++) {
      var lA = loops[b];
      var lB = loops[b + 1];
      var cA = ringsSpec[b].rgb;
      var cB = ringsSpec[b + 1].rgb;
      for (var i = 0; i < N; i++) {
        var j = (i + 1) % N;
        pushV(lA[i], cA);
        pushV(lA[j], cA);
        pushV(lB[j], cB);

        pushV(lA[i], cA);
        pushV(lB[j], cB);
        pushV(lB[i], cB);
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normArr), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colArr), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));
    g.computeBoundingSphere();
    return g;
  }

  function buildTileOutlineCoreGeometry(collarHex, edgeHex, spineHex) {
    var collar = hexToRgb01(collarHex);
    var edge = hexToRgb01(edgeHex);
    var spine = hexToRgb01(spineHex);
    // Contrast-rimmed rounded-square ribbon (outer ~1.79m x 1.79m, width ~0.126m, cornerR = 0.22m):
    // Dark contrast collar (#084A57 cyan / #4D083B magenta) frames vivid core so outlines pop on warm sandstone!
    return buildRoundedSquareRibbonGeometry([
      { half: 0.769, cornerR: 0.152, rgb: collar },
      { half: 0.790, cornerR: 0.164, rgb: edge },
      { half: 0.832, cornerR: 0.188, rgb: spine },
      { half: 0.874, cornerR: 0.212, rgb: edge },
      { half: 0.895, cornerR: 0.224, rgb: collar }
    ]);
  }

  function buildTileOutlineHaloGeometry(glowHex) {
    var c = hexToRgb01(glowHex);
    var zero = [0.0, 0.0, 0.0];
    var mid = [c[0] * 0.42, c[1] * 0.42, c[2] * 0.42];
    return buildRoundedSquareRibbonGeometry([
      { half: 0.705, cornerR: 0.128, rgb: zero },
      { half: 0.785, cornerR: 0.162, rgb: mid },
      { half: 0.832, cornerR: 0.188, rgb: c },
      { half: 0.880, cornerR: 0.215, rgb: mid },
      { half: 0.962, cornerR: 0.260, rgb: zero }
    ]);
  }

  function buildContactShadowTexture() {
    var size = 64;
    if (typeof document !== 'undefined' && document.createElement) {
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      if (ctx) {
        var half = size * 0.5;
        var grad = ctx.createRadialGradient(half, half, 0.0, half, half, half);
        grad.addColorStop(0.00, 'rgba(28, 15, 6, 0.58)');
        grad.addColorStop(0.42, 'rgba(30, 16, 7, 0.44)');
        grad.addColorStop(0.72, 'rgba(36, 20, 9, 0.17)');
        grad.addColorStop(1.00, 'rgba(36, 20, 9, 0.00)');
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        var cTex = new THREE.CanvasTexture(canvas);
        if (THREE.sRGBEncoding) cTex.encoding = THREE.sRGBEncoding;
        cTex.needsUpdate = true;
        return cTex;
      }
    }
    // Headless gjs fallback (no DOM canvas): 32x32 RGBA DataTexture
    var dSize = 32;
    var data = new Uint8Array(dSize * dSize * 4);
    var cHalf = (dSize - 1) * 0.5;
    for (var y = 0; y < dSize; y++) {
      for (var x = 0; x < dSize; x++) {
        var rNorm = Math.min(1.0, Math.hypot(x - cHalf, y - cHalf) / cHalf);
        var a = Math.pow(1.0 - rNorm, 1.85) * 0.56;
        var idx = (y * dSize + x) * 4;
        data[idx] = 30;
        data[idx + 1] = 16;
        data[idx + 2] = 7;
        data[idx + 3] = Math.round(clamp(a, 0.0, 1.0) * 255);
      }
    }
    var dTex = new THREE.DataTexture(data, dSize, dSize, THREE.RGBAFormat);
    dTex.needsUpdate = true;
    return dTex;
  }

  function buildSelectionChevronGeometry() {
    var parts = [];
    // Sculpted downward-pointing Golden Toy-Box Crown Chevron + central diamond prism
    parts.push(bakePart(new THREE.OctahedronGeometry(0.11, 0), {
      sx: 0.95, sy: 1.45, sz: 0.95,
      ty: 0.02,
      smoothAngle: 20,
      color: 0xFFE66D
    }));
    // Left & right golden chevron wings
    parts.push(bakePart(splineTube([
      { x: -0.22, y:  0.15, z: 0.0, r: 0.022, hex: 0xFFF29C },
      { x: -0.11, y:  0.03, z: 0.0, r: 0.036, hex: 0xF5B82E },
      { x:  0.00, y: -0.10, z: 0.0, r: 0.040, hex: 0xFFD94A },
      { x:  0.11, y:  0.03, z: 0.0, r: 0.036, hex: 0xF5B82E },
      { x:  0.22, y:  0.15, z: 0.0, r: 0.022, hex: 0xFFF29C }
    ], 12, 18, { smoothAngle: 68 }), { color: 0xFFFFFF }));
    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 3. Shared Chibi Head & Facial Expression Builder + WARRIOR & MAGE Templates
  // ============================================================================

  /**
   * Appends a smooth Ankama / Krosmaster chibi head (`center y = 0.30m` above neck pivot)
   * with plump cheeks, rounded ears, button nose, brow & mouth!
   */
  function appendChibiHeadBase(parts, opts) {
    opts = opts || {};
    var skinHex = opts.skinHex || 0xF5C299;
    var skinRgb = hexToRgb01(skinHex);
    var cheekRgb = hexToRgb01(opts.cheekHex || 0xED9478);
    var crownRgb = hexToRgb01(opts.crownHex || 0xFAD6B6);
    var shadowRgb = hexToRgb01(opts.shadowHex || 0xD99873);

    // Buried spherical neck ball-socket (`y = -0.05..+0.08`) so head pitch/turn never leaves a gap
    parts.push(bakePart(new THREE.SphereGeometry(0.115, 16, 12), {
      ty: 0.02,
      color: opts.shadowHex || 0xD99873,
      smoothAngle: 75
    }));

    // Plump rounded-squircle chibi cranium (`width ~ 0.60m, height ~ 0.53m, depth ~ 0.54m`)
    var headLoft = catmullRomLoft([
      { y: 0.04, rx: 0.145, rz: 0.140, oz:  0.010, rgb: shadowRgb },
      { y: 0.10, rx: 0.255, rz: 0.238, oz:  0.022, frontBulge: 0.018, rgb: skinRgb },
      { y: 0.19, rx: 0.302, rz: 0.272, oz:  0.020, frontBulge: 0.022, rgb: cheekRgb },
      { y: 0.30, rx: 0.296, rz: 0.268, oz:  0.010, frontBulge: 0.010, rgb: skinRgb },
      { y: 0.42, rx: 0.274, rz: 0.254, oz:  0.000, rgb: crownRgb },
      { y: 0.50, rx: 0.210, rz: 0.198, oz: -0.005, rgb: crownRgb }
    ], 28, 3, { capStart: true, capEnd: true, domeHeight: 0.075, smoothAngle: 78 });
    parts.push(bakePart(headLoft, {
      color: 0xFFFFFF,
      shadeFn: function (px, py, pz) {
        // Gentle rosy blush exclusively on outer front cheeks
        var cheekFactor = clamp(1.0 - Math.hypot((Math.abs(px) - 0.18) / 0.11, (py - 0.20) / 0.09, (pz - 0.23) / 0.12), 0.0, 1.0);
        return [1.0 + 0.04 * cheekFactor, 1.0 - 0.05 * cheekFactor, 1.0 - 0.07 * cheekFactor];
      }
    }));

    // Rounded chibi ears (`x = ±0.295m, y = 0.25m`)
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(new THREE.SphereGeometry(0.072, 14, 12), {
        sx: 0.62, sy: 1.05, sz: 0.82,
        ry: s * -0.22,
        tx: s * 0.292, ty: 0.25, tz: 0.005,
        color: skinHex,
        smoothAngle: 75
      }));
      parts.push(bakePart(new THREE.SphereGeometry(0.042, 10, 8), {
        sx: 0.50, sy: 0.80, sz: 0.65,
        tx: s * 0.305, ty: 0.25, tz: 0.018,
        color: 0xCE8464,
        smoothAngle: 72
      }));
    }

    // Cute sculpted chibi button nose (`+Z`)
    parts.push(bakePart(new THREE.SphereGeometry(0.044, 14, 12), {
      sx: 1.05, sy: 0.82, sz: 0.95,
      tx: 0.0, ty: 0.225, tz: 0.286,
      color: 0xEEAB84,
      smoothAngle: 76
    }));

    // Subtle expressive mouth line
    var smileY = opts.smile ? 0.012 : -0.004;
    parts.push(bakePart(splineTube([
      { x: -0.052, y: 0.152 + smileY, z: 0.266, r: 0.010, hex: 0x9C5540 },
      { x:  0.000, y: 0.146,          z: 0.274, r: 0.012, hex: 0x874432 },
      { x:  0.052, y: 0.152 + smileY, z: 0.266, r: 0.010, hex: 0x9C5540 }
    ], 10, 12), { color: 0xFFFFFF }));

    // Expressive chibi eyes (dark lash + colored iris + pupil) & sculpted eyebrows
    var browHex = opts.browHex || 0x4E2A16;
    var browTilt = opts.browTilt !== undefined ? opts.browTilt : 0.18;
    var irisHex = opts.irisHex || 0x3A2116;

    for (var side = -1; side <= 1; side += 2) {
      // Dark upper lash / eye socket oval
      parts.push(bakePart(new THREE.SphereGeometry(0.058, 16, 14), {
        sx: 0.86, sy: 1.12, sz: 0.38,
        ry: side * 0.18,
        rx: -0.06,
        tx: side * 0.115, ty: 0.268, tz: 0.264,
        color: 0x1D1310,
        autoToyShade: false,
        smoothAngle: 75
      }));
      // Colored lower iris crescent
      parts.push(bakePart(new THREE.SphereGeometry(0.045, 14, 12), {
        sx: 0.84, sy: 0.96, sz: 0.36,
        ry: side * 0.18,
        rx: -0.06,
        tx: side * 0.115, ty: 0.260, tz: 0.273,
        color: irisHex,
        autoToyShade: false,
        smoothAngle: 75
      }));
      // Deep pupil core
      parts.push(bakePart(new THREE.SphereGeometry(0.028, 12, 10), {
        sx: 0.82, sy: 0.95, sz: 0.36,
        ry: side * 0.18,
        tx: side * 0.113, ty: 0.265, tz: 0.281,
        color: 0x0E0908,
        autoToyShade: false,
        smoothAngle: 75
      }));

      // Sculpted eyebrow (`splineTube`)
      parts.push(bakePart(splineTube([
        { x: side * 0.182, y: 0.352 + browTilt * 0.03, z: 0.242, r: 0.016, hex: browHex },
        { x: side * 0.122, y: 0.366,                   z: 0.270, r: 0.023, hex: browHex },
        { x: side * 0.062, y: 0.350 - browTilt * 0.05, z: 0.276, r: 0.019, hex: browHex }
      ], 12, 14), { color: 0xFFFFFF }));
    }
  }

  function buildHeroEyeSparklesGeometry(offsetY, offsetZ) {
    var parts = [];
    for (var side = -1; side <= 1; side += 2) {
      parts.push(bakePart(new THREE.SphereGeometry(0.016, 10, 8), {
        sx: 0.9, sy: 1.0, sz: 0.5,
        tx: side * 0.126 - 0.012,
        ty: (offsetY || 0.284),
        tz: (offsetZ || 0.289),
        color: 0xFFFFFF,
        autoToyShade: false
      }));
      parts.push(bakePart(new THREE.SphereGeometry(0.008, 8, 6), {
        tx: side * 0.104 + 0.008,
        ty: (offsetY || 0.284) - 0.036,
        tz: (offsetZ || 0.289) - 0.002,
        color: 0xE6F7FF,
        autoToyShade: false
      }));
    }
    return mergeBufferGeometries(parts);
  }

  // --------------------------------------------------------------------------
  // 3A. WARRIOR GEOMETRIES (`type: 'warrior'`)
  // --------------------------------------------------------------------------
  function buildWarriorUpperLegGeometry() {
    return catmullRomLoft([
      { y: -0.20, rx: 0.080, rz: 0.082, hex: 0x4E3220 },
      { y: -0.10, rx: 0.092, rz: 0.094, hex: 0x5E3D28 },
      { y:  0.00, rx: 0.096, rz: 0.096, hex: 0x5A3A25 }
    ], 18, 2, { capStart: true, capEnd: true, domeHeight: 0.045 });
  }

  function buildWarriorLowerBootGeometry() {
    var parts = [];
    // Chunky cuffed brown leather boot lofted from flat welted sole up to folded cuff
    parts.push(catmullRomLoft([
      { y: 0.000, rx: 0.104, rz: 0.138, oz: 0.038, hex: 0x2F1B10 },
      { y: 0.028, rx: 0.108, rz: 0.144, oz: 0.042, frontBulge: 0.024, hex: 0x3D2315 },
      { y: 0.068, rx: 0.098, rz: 0.124, oz: 0.026, frontBulge: 0.018, hex: 0x6E3F22 },
      { y: 0.135, rx: 0.088, rz: 0.094, oz: 0.004, hex: 0x7A4728 },
      { y: 0.185, rx: 0.102, rz: 0.106, oz: 0.002, hex: 0x8F5632 },
      { y: 0.218, rx: 0.092, rz: 0.096, oz: 0.000, hex: 0x6B3E22 }
    ], 22, 3, { capStart: true, capEnd: true, domeHeight: 0.025 }));

    // Brushed steel front shin-greave plate + brass ankle stud
    parts.push(bakePart(new THREE.CylinderGeometry(0.078, 0.072, 0.11, 14, 1, false, -PI * 0.35, PI * 0.70), {
      ty: 0.132, tz: 0.024,
      color: 0x9BA7B8,
      smoothAngle: 72
    }));
    parts.push(bakePart(new THREE.BoxGeometry(0.065, 0.034, 0.030), {
      ty: 0.095, tz: 0.112,
      color: 0xE5A83C,
      smoothAngle: 35
    }));

    var merged = mergeBufferGeometries(parts);
    alignBottomToY(merged, 0.0);
    // Translate by -0.22m so inside kneePivot (at y=0.22m), sole rests at exact Y = 0.0000m!
    merged.translate(0.0, -0.22, 0.0);
    merged.computeBoundingSphere();
    return merged;
  }

  function buildWarriorTorsoGeometry() {
    var parts = [];
    // 1. Pleated Crimson-Russet Tunic Skirt (`y = -0.15m..+0.09m` relative to waistPivot at y=0.40m)
    // Open bottom (`capStart: false`) + recessed dark under-hem shadow plug!
    parts.push(catmullRomLoft([
      { y: -0.15, rx: 0.268, rz: 0.236, pleatAmp: 0.036, pleatFreq: 8, hex: 0xDF9E36 },
      { y: -0.12, rx: 0.258, rz: 0.228, pleatAmp: 0.032, pleatFreq: 8, hex: 0x7D2618 },
      { y: -0.03, rx: 0.232, rz: 0.204, pleatAmp: 0.018, pleatFreq: 8, hex: 0x993422 },
      { y:  0.07, rx: 0.212, rz: 0.190, hex: 0x6E2014 }
    ], 24, 3, { capStart: false, capEnd: false, recessedShadow: true, recessDepth: 0.072 }));

    // 2. Chiseled Steel-and-Leather Cuirass (`y = 0.05m..0.47m`) with deep crease AO (`#4E5B6E` vs `#C4D2E3`)
    parts.push(catmullRomLoft([
      { y: 0.05, rx: 0.218, rz: 0.194, hex: 0x4E5B6E },
      { y: 0.14, rx: 0.248, rz: 0.218, frontBulge: 0.026, hex: 0x6D7B8F },
      { y: 0.24, rx: 0.266, rz: 0.232, frontBulge: 0.038, hex: 0x95A4B8 },
      { y: 0.34, rx: 0.276, rz: 0.236, frontBulge: 0.040, hex: 0xBDCBE0 },
      { y: 0.42, rx: 0.242, rz: 0.204, frontBulge: 0.016, hex: 0x9AA9BD },
      { y: 0.47, rx: 0.162, rz: 0.152, hex: 0x566478 }
    ], 24, 3, { capStart: false, capEnd: true, domeHeight: 0.03 }));

    // Dark recessed breastplate sternal & lower-rib AO seam lines
    parts.push(bakePart(splineTube([
      { x: -0.19, y: 0.18, z: 0.16, r: 0.014, hex: 0x465264 },
      { x:  0.00, y: 0.15, z: 0.232, r: 0.016, hex: 0x3D4859 },
      { x:  0.19, y: 0.18, z: 0.16, r: 0.014, hex: 0x465264 }
    ], 10, 14), { color: 0xFFFFFF, autoToyShade: false }));

    // 3. Thick Leather Waist Belt + Golden Brass Buckle + Side Bronze Tassets
    parts.push(catmullRomLoft([
      { y: 0.032, rx: 0.240, rz: 0.214, hex: 0x381E0E },
      { y: 0.075, rx: 0.246, rz: 0.218, hex: 0x5E351B },
      { y: 0.112, rx: 0.236, rz: 0.210, hex: 0x402311 }
    ], 24, 2, { capStart: false, capEnd: false }));

    parts.push(bakePart(new THREE.BoxGeometry(0.122, 0.098, 0.052), {
      ty: 0.074, tz: 0.214,
      color: 0xEEB03B,
      smoothAngle: 32
    }));
    parts.push(bakePart(new THREE.BoxGeometry(0.064, 0.052, 0.056), {
      ty: 0.074, tz: 0.218,
      color: 0x4E2B15,
      smoothAngle: 25
    }));

    // Side armored tasset plates with dark AO backing
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(new THREE.SphereGeometry(0.108, 14, 10), {
        sx: 0.38, sy: 1.18, sz: 0.98,
        rz: s * -0.22,
        tx: s * 0.246, ty: -0.02, tz: 0.01,
        color: 0xB87B2C,
        smoothAngle: 70
      }));
    }

    // 4. Burnished Bronze Chest V-Trim & Warm Crimson Collar Rim
    parts.push(bakePart(splineTube([
      { x: -0.18, y: 0.42, z: 0.155, r: 0.025, hex: 0xC4842D },
      { x: -0.08, y: 0.28, z: 0.244, r: 0.028, hex: 0xDF9E38 },
      { x:  0.00, y: 0.21, z: 0.262, r: 0.030, hex: 0xF2B84B },
      { x:  0.08, y: 0.28, z: 0.244, r: 0.028, hex: 0xDF9E38 },
      { x:  0.18, y: 0.42, z: 0.155, r: 0.025, hex: 0xC4842D }
    ], 12, 18), { color: 0xFFFFFF }));

    parts.push(bakePart(new THREE.TorusGeometry(0.166, 0.034, 12, 24), {
      rx: PI * 0.5 + 0.10,
      ty: 0.455, tz: 0.01,
      color: 0x8F2E1E,
      smoothAngle: 72
    }));

    // 5. Layered Burnished Bronze Shoulder Pauldrons with Dark Crease Collar & Brass Rivets
    for (var side = -1; side <= 1; side += 2) {
      // Dark under-pauldron AO shadow ring so shoulder armor never washes out
      parts.push(bakePart(new THREE.TorusGeometry(0.136, 0.024, 10, 20), {
        rx: PI * 0.5,
        ry: side * 0.48,
        tx: side * 0.268, ty: 0.332, tz: 0.005,
        color: 0x38200E,
        autoToyShade: false,
        smoothAngle: 70
      }));
      parts.push(bakePart(new THREE.SphereGeometry(0.156, 18, 14, 0, TWO_PI, 0, PI * 0.62), {
        sx: 1.12, sy: 0.90, sz: 1.05,
        rz: side * -0.48,
        tx: side * 0.276, ty: 0.388, tz: 0.005,
        color: 0xBD7E2C,
        smoothAngle: 75
      }));
      parts.push(bakePart(new THREE.TorusGeometry(0.142, 0.022, 10, 20), {
        rx: PI * 0.5,
        ry: side * 0.48,
        tx: side * 0.290, ty: 0.348, tz: 0.005,
        color: 0xE6A840,
        smoothAngle: 72
      }));
      for (var rv = -1; rv <= 1; rv++) {
        var rAng = rv * 0.62;
        parts.push(bakePart(new THREE.SphereGeometry(0.020, 8, 8), {
          tx: side * (0.372 - Math.abs(rv) * 0.02),
          ty: 0.385 + Math.cos(rAng) * 0.026,
          tz: Math.sin(rAng) * 0.102,
          color: 0xFFD96A
        }));
      }
    }

    return mergeBufferGeometries(parts);
  }

  function buildWarriorHeadGeometry() {
    var parts = [];
    appendChibiHeadBase(parts, {
      skinHex: 0xF4BE93,
      cheekHex: 0xEA9072,
      crownHex: 0xFAD3B2,
      browHex: 0x3D1E0E,
      browTilt: 0.26,
      irisHex: 0x422314,
      smile: false
    });

    // Sculpted Ankama Chestnut Hair Cap (`#3D1E0C` deep root AO -> `#6E3B1E` warm chestnut -> `#9A5830` crown)
    parts.push(bakePart(new THREE.SphereGeometry(0.314, 26, 20), {
      sx: 1.05, sy: 0.96, sz: 1.05,
      rx: -0.28,
      ty: 0.342, tz: -0.044,
      color: 0x6E3B1E,
      smoothAngle: 76,
      shadeFn: function (px, py, pz) {
        var t = clamp((py - 0.10) / 0.48, 0.0, 1.0);
        var backAO = clamp((pz + 0.32) / 0.55, 0.78, 1.06);
        return [(0.62 + 0.52 * t) * backAO, (0.58 + 0.48 * t) * backAO, (0.54 + 0.42 * t) * backAO];
      }
    }));

    // Neat sculpted sideburns framing chibi ears
    for (var sb = -1; sb <= 1; sb += 2) {
      parts.push(bakePart(splineTube([
        { x: sb * 0.262, y: 0.41, z: 0.11, rx: 0.058, rz: 0.068, hex: 0x5E3118 },
        { x: sb * 0.292, y: 0.31, z: 0.09, rx: 0.048, rz: 0.058, hex: 0x4E2813 },
        { x: sb * 0.282, y: 0.21, z: 0.10, rx: 0.024, rz: 0.030, hex: 0x3D1E0C }
      ], 12, 14), { color: 0xFFFFFF }));
    }

    // Thick Swept-Back Chunky Ankama Chestnut Hair Locks (hugging head silhouette — NO sea-urchin spikes!)
    var hairLocks = [
      // Center-swept front hairline roll & asymmetric parted brow fringe (matches Master Reference Warrior!)
      [
        { x: -0.22, y: 0.45, z: 0.16, rx: 0.072, rz: 0.062, hex: 0x4E2813 },
        { x: -0.08, y: 0.49, z: 0.235, rx: 0.086, rz: 0.068, hex: 0x7A4324 },
        { x:  0.08, y: 0.48, z: 0.240, rx: 0.082, rz: 0.065, hex: 0x8F512C },
        { x:  0.22, y: 0.43, z: 0.165, rx: 0.066, rz: 0.056, hex: 0x5E3118 }
      ],
      // Swept brow lock dipping neatly above right temple
      [
        { x: -0.04, y: 0.49, z: 0.22, rx: 0.064, rz: 0.050, hex: 0x7A4324 },
        { x:  0.07, y: 0.44, z: 0.268, rx: 0.052, rz: 0.040, hex: 0x8F512C },
        { x:  0.16, y: 0.39, z: 0.266, rx: 0.024, rz: 0.020, hex: 0x6E3B1E }
      ],
      // Swept left temple lock
      [
        { x: -0.10, y: 0.48, z: 0.21, rx: 0.060, rz: 0.048, hex: 0x6E3B1E },
        { x: -0.19, y: 0.43, z: 0.248, rx: 0.048, rz: 0.038, hex: 0x7E4626 },
        { x: -0.25, y: 0.37, z: 0.220, rx: 0.024, rz: 0.020, hex: 0x4E2813 }
      ],
      // Broad central swept-back crown wave (hugs cranium cleanly, subtle rear crest!)
      [
        { x:  0.00, y: 0.51, z:  0.17, rx: 0.125, rz: 0.076, hex: 0x7D4525 },
        { x:  0.01, y: 0.59, z:  0.02, rx: 0.132, rz: 0.084, hex: 0x9A5830 },
        { x:  0.02, y: 0.58, z: -0.16, rx: 0.112, rz: 0.076, hex: 0x874C29 },
        { x:  0.02, y: 0.51, z: -0.31, rx: 0.052, rz: 0.042, hex: 0x5C3018 }
      ],
      // Left swept-back crown lock (separated by dark #3D1E0C parting valley)
      [
        { x: -0.15, y: 0.48, z:  0.12, rx: 0.095, rz: 0.068, hex: 0x6E3B1E },
        { x: -0.19, y: 0.55, z: -0.03, rx: 0.102, rz: 0.072, hex: 0x8F512C },
        { x: -0.20, y: 0.53, z: -0.19, rx: 0.086, rz: 0.064, hex: 0x754022 },
        { x: -0.17, y: 0.45, z: -0.32, rx: 0.042, rz: 0.036, hex: 0x4A2511 }
      ],
      // Right swept-back crown lock
      [
        { x:  0.15, y: 0.48, z:  0.12, rx: 0.095, rz: 0.068, hex: 0x6E3B1E },
        { x:  0.19, y: 0.55, z: -0.03, rx: 0.102, rz: 0.072, hex: 0x8F512C },
        { x:  0.20, y: 0.53, z: -0.19, rx: 0.086, rz: 0.064, hex: 0x754022 },
        { x:  0.17, y: 0.45, z: -0.32, rx: 0.042, rz: 0.036, hex: 0x4A2511 }
      ],
      // Side-swept ear-top waves (left & right)
      [
        { x: -0.25, y: 0.41, z:  0.04, rx: 0.072, rz: 0.068, hex: 0x5E3118 },
        { x: -0.29, y: 0.44, z: -0.12, rx: 0.074, rz: 0.066, hex: 0x6E3B1E },
        { x: -0.26, y: 0.39, z: -0.27, rx: 0.040, rz: 0.036, hex: 0x452210 }
      ],
      [
        { x:  0.25, y: 0.41, z:  0.04, rx: 0.072, rz: 0.068, hex: 0x5E3118 },
        { x:  0.29, y: 0.44, z: -0.12, rx: 0.074, rz: 0.066, hex: 0x6E3B1E },
        { x:  0.26, y: 0.39, z: -0.27, rx: 0.040, rz: 0.036, hex: 0x452210 }
      ],
      // Thick tapered nape locks hugging back of neck (`#3D1E0C` deep root AO)
      [
        { x:  0.00, y: 0.34, z: -0.24, rx: 0.135, rz: 0.068, hex: 0x4E2813 },
        { x:  0.00, y: 0.22, z: -0.31, rx: 0.115, rz: 0.056, hex: 0x3D1E0C },
        { x:  0.00, y: 0.13, z: -0.33, rx: 0.058, rz: 0.028, hex: 0x331809 }
      ]
    ];
    for (var h = 0; h < hairLocks.length; h++) {
      parts.push(bakePart(splineTube(hairLocks[h], 14, 16), { color: 0xFFFFFF }));
    }

    // Subtle dark parting creases (`#3D1E0C`) between swept crown waves for crisp painterly definition
    for (var pg = -1; pg <= 1; pg += 2) {
      parts.push(bakePart(splineTube([
        { x: pg * 0.088, y: 0.51, z:  0.16, r: 0.016, hex: 0x3D1E0C },
        { x: pg * 0.105, y: 0.56, z:  0.00, r: 0.018, hex: 0x361A0A },
        { x: pg * 0.102, y: 0.53, z: -0.18, r: 0.015, hex: 0x3D1E0C }
      ], 10, 14), { color: 0xFFFFFF, autoToyShade: false }));
    }

    return mergeBufferGeometries(parts);
  }

  function buildWarriorRightSwordArmGeometry() {
    var parts = [];
    // ShoulderPivotR is at (-0.28, 0.78, 0.0)
    parts.push(bakePart(splineTube([
      { x:  0.00, y:  0.00, z: 0.00, r: 0.078, hex: 0x993422 },
      { x: -0.04, y: -0.12, z: 0.05, r: 0.072, hex: 0x7D2618 },
      { x: -0.05, y: -0.21, z: 0.14, r: 0.068, hex: 0x5E351B },
      { x: -0.04, y: -0.26, z: 0.21, r: 0.062, hex: 0x472713 }
    ], 16, 16), { color: 0xFFFFFF }));

    parts.push(bakePart(new THREE.TorusGeometry(0.066, 0.015, 10, 18), {
      rx: PI * 0.32,
      tx: -0.045, ty: -0.21, tz: 0.145,
      color: 0xE5A83C
    }));
    parts.push(bakePart(new THREE.SphereGeometry(0.072, 14, 12), {
      tx: -0.04, ty: -0.27, tz: 0.24,
      color: 0xF4BE93,
      smoothAngle: 75
    }));

    // Larger Chunky Ankama Silver-Edged Broadsword (`~1.26x` wider/longer heroic blade!)
    var swordParts = [];
    swordParts.push(bakePart(new THREE.CylinderGeometry(0.036, 0.040, 0.22, 14), {
      ty: 0.0, color: 0x4E2B16, smoothAngle: 70
    }));
    swordParts.push(bakePart(new THREE.SphereGeometry(0.068, 14, 12), {
      ty: -0.13, color: 0xE6A436, smoothAngle: 75
    }));
    swordParts.push(bakePart(splineTube([
      { x: -0.205, y: 0.135, z: 0.0, rx: 0.034, rz: 0.028, hex: 0xFFD060 },
      { x: -0.100, y: 0.112, z: 0.0, rx: 0.044, rz: 0.036, hex: 0xCC8A29 },
      { x:  0.000, y: 0.105, z: 0.0, rx: 0.054, rz: 0.044, hex: 0xEEB044 },
      { x:  0.100, y: 0.112, z: 0.0, rx: 0.044, rz: 0.036, hex: 0xCC8A29 },
      { x:  0.205, y: 0.135, z: 0.0, rx: 0.034, rz: 0.028, hex: 0xFFD060 }
    ], 14, 16), { color: 0xFFFFFF }));

    // Wide beveled silver broadsword blade (`y = 0.11..1.04m`, bold fuller contrast!)
    swordParts.push(catmullRomLoft([
      { y: 0.11, rx: 0.116, rz: 0.032, hex: 0xAFC0D6 },
      { y: 0.42, rx: 0.124, rz: 0.030, hex: 0xD2DFEE },
      { y: 0.76, rx: 0.132, rz: 0.028, hex: 0xE6EFFA },
      { y: 0.93, rx: 0.078, rz: 0.020, hex: 0xF5F9FF },
      { y: 1.04, rx: 0.008, rz: 0.006, hex: 0xFFFFFF }
    ], 8, 3, { capStart: true, capEnd: true, domeHeight: 0.02, smoothAngle: 34 }));

    // Deep slate steel fuller groove along blade spine so blade bevels pop!
    swordParts.push(bakePart(new THREE.BoxGeometry(0.048, 0.62, 0.038), {
      ty: 0.46, color: 0x56667A, smoothAngle: 22
    }));

    var swordMerged = mergeBufferGeometries(swordParts);
    parts.push(bakePart(swordMerged, {
      rx: PI * 0.33,
      rz: 0.12,
      tx: -0.04, ty: -0.27, tz: 0.25,
      color: 0xFFFFFF
    }));

    return mergeBufferGeometries(parts);
  }

  function buildWarriorLeftShieldArmGeometry() {
    var parts = [];
    parts.push(bakePart(splineTube([
      { x: 0.00, y:  0.00, z: 0.00, r: 0.078, hex: 0x993422 },
      { x: 0.05, y: -0.12, z: 0.05, r: 0.072, hex: 0x7D2618 },
      { x: 0.06, y: -0.21, z: 0.13, r: 0.066, hex: 0x5E351B }
    ], 16, 14), { color: 0xFFFFFF }));

    parts.push(bakePart(new THREE.SphereGeometry(0.066, 12, 10), {
      tx: 0.06, ty: -0.23, tz: 0.16,
      color: 0xF4BE93, smoothAngle: 75
    }));

    // Larger Round Bronze-Rimmed Buckler Shield (`radius = 0.34m`) facing outward (+X/+Z)
    var shParts = [];
    shParts.push(bakePart(new THREE.CylinderGeometry(0.335, 0.335, 0.050, 26), {
      rx: PI * 0.5, color: 0x5E371B, smoothAngle: 65
    }));
    shParts.push(bakePart(new THREE.CylinderGeometry(0.285, 0.285, 0.056, 26), {
      rx: PI * 0.5, tz: 0.005, color: 0x566478, smoothAngle: 65
    }));
    // Dark inner rim groove + thick burnished bronze outer rim
    shParts.push(bakePart(new THREE.TorusGeometry(0.282, 0.016, 10, 26), {
      tz: 0.026, color: 0x362212, autoToyShade: false
    }));
    shParts.push(bakePart(new THREE.TorusGeometry(0.330, 0.048, 14, 28), {
      color: 0xC9882E, smoothAngle: 75
    }));
    // Gleaming central golden shield boss + 8 brass perimeter rivets
    shParts.push(bakePart(new THREE.SphereGeometry(0.106, 16, 12), {
      sz: 0.60, tz: 0.032, color: 0xF0B23E, smoothAngle: 75
    }));
    for (var r = 0; r < 8; r++) {
      var a = (r / 8) * TWO_PI;
      shParts.push(bakePart(new THREE.SphereGeometry(0.023, 8, 8), {
        tx: Math.cos(a) * 0.330, ty: Math.sin(a) * 0.330, tz: 0.044,
        color: 0xFFE074
      }));
    }
    var shieldMerged = mergeBufferGeometries(shParts);
    parts.push(bakePart(shieldMerged, {
      ry: PI * 0.36,
      rx: -0.14,
      tx: 0.16, ty: -0.18, tz: 0.18,
      color: 0xFFFFFF
    }));

    return mergeBufferGeometries(parts);
  }

  // --------------------------------------------------------------------------
  // 3B. MAGE GEOMETRIES (`type: 'mage'`)
  // --------------------------------------------------------------------------
  function buildMageUpperLegGeometry() {
    return catmullRomLoft([
      { y: -0.18, rx: 0.068, rz: 0.070, hex: 0x243F7A },
      { y:  0.00, rx: 0.080, rz: 0.080, hex: 0x1D3363 }
    ], 16, 2, { capStart: true, capEnd: true, domeHeight: 0.035 });
  }

  function buildMageLowerBootGeometry() {
    var parts = [];
    parts.push(catmullRomLoft([
      { y: 0.000, rx: 0.092, rz: 0.128, oz: 0.036, hex: 0x331E12 },
      { y: 0.026, rx: 0.096, rz: 0.136, oz: 0.044, frontBulge: 0.026, hex: 0x5C361E },
      { y: 0.075, rx: 0.084, rz: 0.106, oz: 0.020, hex: 0x7A4929 },
      { y: 0.155, rx: 0.078, rz: 0.084, oz: 0.000, hex: 0x6B3E22 },
      { y: 0.200, rx: 0.082, rz: 0.086, oz: 0.000, hex: 0x59331B }
    ], 20, 3, { capStart: true, capEnd: true, domeHeight: 0.02 }));
    // Golden buckle on ankle
    parts.push(bakePart(new THREE.BoxGeometry(0.056, 0.032, 0.026), {
      ty: 0.085, tz: 0.102, color: 0xF2B632, smoothAngle: 30
    }));

    var merged = mergeBufferGeometries(parts);
    alignBottomToY(merged, 0.0);
    // Inside kneePivot at y = 0.20m -> sole sits at exact Y = 0.0000m!
    merged.translate(0.0, -0.20, 0.0);
    merged.computeBoundingSphere();
    return merged;
  }

  function buildMageRobeTorsoGeometry() {
    var parts = [];
    // WaistPivot at y = 0.40m -> robe hem at y = -0.28m (world y = 0.12m) up to neck y = +0.46m
    // Deep royal-blue fold AO (#152F6E -> #2354BC -> #3670E0) + rich burnished gold trim (#EEAC24)!
    parts.push(catmullRomLoft([
      { y: -0.28, rx: 0.348, rz: 0.318, pleatAmp: 0.044, pleatFreq: 8, hex: 0xEEAC24 },
      { y: -0.23, rx: 0.332, rz: 0.304, pleatAmp: 0.040, pleatFreq: 8, hex: 0xC98816 },
      { y: -0.20, rx: 0.320, rz: 0.292, pleatAmp: 0.036, pleatFreq: 8, hex: 0x152F6E },
      { y: -0.06, rx: 0.268, rz: 0.244, pleatAmp: 0.024, pleatFreq: 8, hex: 0x2251B8 },
      { y:  0.08, rx: 0.214, rz: 0.194, hex: 0x163578 },
      { y:  0.22, rx: 0.238, rz: 0.210, frontBulge: 0.024, hex: 0x285FD0 },
      { y:  0.36, rx: 0.232, rz: 0.200, frontBulge: 0.016, hex: 0x3570E2 },
      { y:  0.46, rx: 0.150, rz: 0.144, hex: 0x183880 }
    ], 26, 3, { capStart: false, capEnd: true, domeHeight: 0.03, recessedShadow: true, recessDepth: 0.082 }));

    // Golden-Trimmed Royal-Blue Arcane Shoulder Mantle / Capelet (`y = 0.25m..0.46m`)
    parts.push(catmullRomLoft([
      { y: 0.25, rx: 0.320, rz: 0.274, oz: -0.018, pleatAmp: 0.028, pleatFreq: 6, hex: 0xEEAC24 },
      { y: 0.29, rx: 0.304, rz: 0.260, oz: -0.015, pleatAmp: 0.022, pleatFreq: 6, hex: 0x1B4298 },
      { y: 0.39, rx: 0.260, rz: 0.222, oz: -0.008, hex: 0x316CE0 },
      { y: 0.46, rx: 0.175, rz: 0.162, oz:  0.000, hex: 0xEEAC24 }
    ], 24, 2, { capStart: false, capEnd: false }));

    // Golden Waist Sash + Glowing Cyan Gem Buckle + Front Hanging Gold-Trimmed Stole
    parts.push(catmullRomLoft([
      { y: 0.042, rx: 0.234, rz: 0.212, hex: 0x9E640C },
      { y: 0.085, rx: 0.240, rz: 0.218, hex: 0xF2B42E },
      { y: 0.124, rx: 0.230, rz: 0.208, hex: 0xBD7C12 }
    ], 24, 2, { capStart: false, capEnd: false }));

    parts.push(bakePart(splineTube([
      { x: 0.0, y:  0.06, z: 0.220, rx: 0.076, rz: 0.018, hex: 0xEEAC24 },
      { x: 0.0, y: -0.08, z: 0.258, rx: 0.084, rz: 0.018, hex: 0x15357A },
      { x: 0.0, y: -0.22, z: 0.298, rx: 0.090, rz: 0.016, hex: 0xEEAC24 }
    ], 12, 14), { color: 0xFFFFFF }));

    parts.push(bakePart(new THREE.OctahedronGeometry(0.068, 0), {
      sx: 1.18, sy: 1.18, sz: 0.55,
      ty: 0.088, tz: 0.222,
      color: 0xFFCC40, smoothAngle: 25
    }));
    parts.push(bakePart(new THREE.OctahedronGeometry(0.040, 0), {
      sx: 1.0, sy: 1.15, sz: 0.65,
      ty: 0.088, tz: 0.238,
      color: 0x48EBFF, autoToyShade: false, smoothAngle: 25
    }));

    return mergeBufferGeometries(parts);
  }

  function buildMageHeadAndHatGeometry() {
    var parts = [];
    appendChibiHeadBase(parts, {
      skinHex: 0xF8CAA2,
      cheekHex: 0xEE8B72,
      crownHex: 0xFCE2C8,
      shadowHex: 0xD8926C,
      browHex: 0x8F4E0C,
      browTilt: 0.08,
      irisHex: 0x1656C4,
      smile: true
    });

    // Rich Honey-Amber Golden Hair (`#9E5608` deep roots/undersides -> `#DC8C18` mid -> `#F2B436` sunlit locks)
    // Distinct warm amber-gold hue separates cleanly from peach chibi cheeks at 400% zoom!
    parts.push(bakePart(new THREE.SphereGeometry(0.294, 22, 16), {
      sx: 0.99, sy: 0.62, sz: 0.99,
      rx: -0.16,
      ty: 0.27, tz: -0.035,
      color: 0xC97B12,
      smoothAngle: 76
    }));

    // Parted honey-gold front bangs tucked neatly high under wizard hat brim so sapphire eyes shine clearly!
    parts.push(bakePart(splineTube([
      { x: -0.23, y: 0.41, z: 0.185, r: 0.048, hex: 0xA85E0A },
      { x: -0.09, y: 0.45, z: 0.252, r: 0.052, hex: 0xDC8C18 },
      { x:  0.02, y: 0.47, z: 0.256, r: 0.042, hex: 0xF2B234 }
    ], 12, 14), { color: 0xFFFFFF }));
    parts.push(bakePart(splineTube([
      { x:  0.02, y: 0.47, z: 0.256, r: 0.042, hex: 0xF2B234 },
      { x:  0.12, y: 0.44, z: 0.248, r: 0.050, hex: 0xDC8C18 },
      { x:  0.24, y: 0.40, z: 0.182, r: 0.046, hex: 0xA85E0A }
    ], 12, 14), { color: 0xFFFFFF }));

    // Plump twin honey-gold side-locks tucked behind cheeks (`z = 0.03..0.06`) so 3/4 face & sapphire eyes are 100% open!
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(splineTube([
        { x: s * 0.272, y: 0.38, z: 0.035, r: 0.066, hex: 0xAD600A },
        { x: s * 0.296, y: 0.25, z: 0.032, r: 0.070, hex: 0xE2941E },
        { x: s * 0.278, y: 0.12, z: 0.052, r: 0.054, hex: 0xBE700F },
        { x: s * 0.244, y: 0.04, z: 0.075, r: 0.024, hex: 0x8F4D06 }
      ], 14, 16), {
        color: 0xFFFFFF,
        shadeFn: function (px, py) {
          var innerAO = Math.abs(px) < 0.255 ? 0.72 : 1.04;
          var hi = clamp((py - 0.04) / 0.34, 0.82, 1.08);
          return [innerAO * hi, innerAO * hi * 0.96, innerAO * hi * 0.90];
        }
      }));
    }

    // 5 Thick Sculpted Honey-Amber Hair Locks cascading down the back (`-Z`) with dark root valleys
    for (var b = -2; b <= 2; b++) {
      var bx = b * 0.098;
      var bzOff = Math.abs(b) * 0.022;
      var lockHex = (b % 2 === 0) ? 0xE2941E : 0xC67812;
      parts.push(bakePart(splineTube([
        { x: bx * 0.85, y: 0.38, z: -0.18 + bzOff, r: 0.084, hex: 0x9C5508 },
        { x: bx * 1.06, y: 0.22, z: -0.27 + bzOff, r: 0.090, hex: lockHex },
        { x: bx * 1.16, y: 0.05, z: -0.30 + bzOff, r: 0.076, hex: 0xCF8015 },
        { x: bx * 1.18, y: -0.07, z: -0.28 + bzOff, r: 0.032, hex: 0x944F07 }
      ], 14, 16), { color: 0xFFFFFF }));
    }

    // OVERSIZED ROYAL-BLUE POINTED WIZARD HAT (tilted back `-0.22 rad` to reveal sapphire eyes + zero staff clip!)
    var hatParts = [];
    var brimLoft = catmullRomLoft([
      { y: -0.030, rx: 0.225, rz: 0.218, hex: 0x0F2254 },
      { y: -0.016, rx: 0.452, rz: 0.432, pleatAmp: 0.026, pleatFreq: 4, hex: 0x153278 },
      { y:  0.016, rx: 0.558, rz: 0.532, pleatAmp: 0.034, pleatFreq: 4, hex: 0x265AC7 },
      { y:  0.048, rx: 0.512, rz: 0.488, pleatAmp: 0.026, pleatFreq: 4, hex: 0x3A75E8 },
      { y:  0.068, rx: 0.308, rz: 0.296, hex: 0x1D47A3 },
      { y:  0.082, rx: 0.205, rz: 0.198, hex: 0x163885 }
    ], 30, 3, { capStart: false, capEnd: true, domeHeight: 0.015 });
    var bPos = brimLoft.getAttribute('position');
    for (var bi = 0; bi < bPos.count; bi++) {
      var vx = bPos.getX(bi), vy = bPos.getY(bi), vz = bPos.getZ(bi);
      var rad = Math.hypot(vx, vz);
      var flare = Math.max(0.0, (rad - 0.24) / 0.32);
      // Gently lift front brim (`vz > 0`) so chibi eyes & brow stay brightly framed in 3/4 view!
      var frontLift = vz > 0.0 ? vz * 0.11 * flare : 0.0;
      var wave = (vx * vx - vz * vz * 0.75) * 0.22 * flare + frontLift;
      bPos.setY(bi, vy + wave);
    }
    weldSmoothNormals(brimLoft, 74);
    hatParts.push(brimLoft);

    // Thick Burnished Golden Hatband (`#EEAC24`) + Dark Crease Collar + Front Sun-Buckle
    hatParts.push(catmullRomLoft([
      { y: 0.042, rx: 0.308, rz: 0.296, hex: 0x8F5808 },
      { y: 0.092, rx: 0.314, rz: 0.302, hex: 0xF5BC33 },
      { y: 0.140, rx: 0.294, rz: 0.284, hex: 0xCC8614 }
    ], 26, 2, { capStart: false, capEnd: false }));

    hatParts.push(bakePart(new THREE.OctahedronGeometry(0.074, 0), {
      sx: 1.28, sy: 1.18, sz: 0.52,
      ty: 0.095, tz: 0.300,
      color: 0xFFD854, smoothAngle: 25
    }));

    // Tall Whimsical Bent Pointed Wizard Cone (`splineTube`, rich fold contrast!)
    hatParts.push(bakePart(splineTube([
      { x:  0.00, y: 0.115, z:  0.00,  rx: 0.290, rz: 0.280, hex: 0x173A8A },
      { x:  0.01, y: 0.280, z: -0.02,  rx: 0.222, rz: 0.214, hex: 0x2455BD },
      { x:  0.05, y: 0.450, z: -0.08,  rx: 0.148, rz: 0.143, hex: 0x3169DA },
      { x:  0.10, y: 0.580, z: -0.17,  rx: 0.088, rz: 0.086, hex: 0x3D79EE },
      { x:  0.17, y: 0.610, z: -0.28,  rx: 0.046, rz: 0.046, hex: 0x265AC7 },
      { x:  0.22, y: 0.540, z: -0.37,  rx: 0.018, rz: 0.018, hex: 0x163885 }
    ], 20, 24), { color: 0xFFFFFF }));

    hatParts.push(bakePart(new THREE.SphereGeometry(0.040, 12, 10), {
      tx: 0.23, ty: 0.525, tz: -0.385,
      color: 0xFFCC40, smoothAngle: 75
    }));

    var hatMerged = mergeBufferGeometries(hatParts);
    parts.push(bakePart(hatMerged, {
      rx: -0.21,
      rz: -0.04,
      ty: 0.452, tz: -0.042,
      color: 0xFFFFFF
    }));

    return mergeBufferGeometries(parts);
  }

  function buildMageRightStaffArmGeometry() {
    var parts = [];
    // Extended outward (`-X`) & forward (`+Z`) so the Golden Sun-Staff clears the wizard hat brim by >17cm!
    parts.push(bakePart(splineTube([
      { x:  0.00, y:  0.00, z: 0.00, r: 0.072, hex: 0x1D47A3 },
      { x: -0.09, y: -0.10, z: 0.10, r: 0.092, hex: 0x2D64D8 },
      { x: -0.17, y: -0.17, z: 0.23, r: 0.110, hex: 0xEEAC24 }
    ], 16, 14), { color: 0xFFFFFF }));
    parts.push(bakePart(new THREE.SphereGeometry(0.060, 12, 10), {
      tx: -0.19, ty: -0.18, tz: 0.27,
      color: 0xF8CAA2, smoothAngle: 75
    }));

    // Tall Ornate Golden Prism Sun-Staff Shaft pitched cleanly outward & forward (`0` hat-brim intersection!)
    var shaftParts = [];
    shaftParts.push(bakePart(splineTube([
      { x: 0.0, y: -0.50, z: 0.0, r: 0.030, hex: 0xE5A229 },
      { x: 0.0, y: -0.38, z: 0.0, r: 0.035, hex: 0x78441F },
      { x: 0.0, y:  0.00, z: 0.0, r: 0.040, hex: 0x995A2C },
      { x: 0.0, y:  0.40, z: 0.0, r: 0.044, hex: 0xCC8522 },
      { x: 0.0, y:  0.66, z: 0.0, r: 0.056, hex: 0xEEAC28 },
      { x: 0.0, y:  0.74, z: 0.0, r: 0.086, hex: 0xFFCC42 }
    ], 16, 20), { color: 0xFFFFFF }));

    var ringYs = [-0.42, 0.08, 0.46, 0.68];
    for (var i = 0; i < ringYs.length; i++) {
      shaftParts.push(bakePart(new THREE.TorusGeometry(0.054, 0.016, 10, 18), {
        rx: PI * 0.5,
        ty: ringYs[i],
        color: 0xFFD954
      }));
    }

    var shaftMerged = mergeBufferGeometries(shaftParts);
    // Tilt forward (`rx: +0.20`) and outward (`rz: +0.16` tilts +Y toward -X!) around hand `(-0.20, -0.18, 0.28)`
    parts.push(bakePart(shaftMerged, {
      rx: 0.20,
      rz: 0.16,
      tx: -0.20, ty: -0.18, tz: 0.28,
      color: 0xFFFFFF
    }));

    return mergeBufferGeometries(parts);
  }

  function buildMageSunStaffRingGeometry() {
    var parts = [];
    // Larger Ornate Golden Sun-Halo (`r = 0.225m`) + 8 Bold Sun-Rays!
    parts.push(bakePart(new THREE.TorusGeometry(0.225, 0.038, 14, 30), {
      color: 0xFFC836, smoothAngle: 75
    }));
    parts.push(bakePart(new THREE.TorusGeometry(0.155, 0.018, 10, 24), {
      color: 0xFFE678, smoothAngle: 72
    }));
    for (var i = 0; i < 8; i++) {
      var ang = (i / 8) * TWO_PI;
      var len = (i % 2 === 0) ? 0.118 : 0.076;
      parts.push(bakePart(new THREE.ConeGeometry(0.034, len, 8), {
        rz: ang - PI * 0.5,
        tx: Math.cos(ang) * (0.235 + len * 0.42),
        ty: Math.sin(ang) * (0.235 + len * 0.42),
        color: 0xFFE266,
        smoothAngle: 45
      }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildMageLeftArmGeometry() {
    var parts = [];
    parts.push(bakePart(splineTube([
      { x: 0.00, y:  0.00, z: 0.00, r: 0.070, hex: 0x2A6BE4 },
      { x: 0.06, y: -0.11, z: 0.06, r: 0.088, hex: 0x3578F2 },
      { x: 0.09, y: -0.18, z: 0.15, r: 0.106, hex: 0xF2B632 }
    ], 16, 14), { color: 0xFFFFFF }));
    parts.push(bakePart(new THREE.SphereGeometry(0.056, 12, 10), {
      tx: 0.10, ty: -0.19, tz: 0.19,
      color: 0xF7C69E, smoothAngle: 75
    }));
    return mergeBufferGeometries(parts);
  }

  // --------------------------------------------------------------------------
  // 3C. ROGUE GEOMETRIES (`type: 'rogue'`)
  // --------------------------------------------------------------------------
  function buildRogueUpperLegGeometry() {
    return catmullRomLoft([
      { y: -0.20, rx: 0.072, rz: 0.074, hex: 0x282C36 },
      { y: -0.10, rx: 0.084, rz: 0.086, hex: 0x323742 },
      { y:  0.00, rx: 0.088, rz: 0.088, hex: 0x2B2F39 }
    ], 16, 2, { capStart: true, capEnd: true, domeHeight: 0.038 });
  }

  function buildRogueLowerBootGeometry() {
    var parts = [];
    parts.push(catmullRomLoft([
      { y: 0.000, rx: 0.094, rz: 0.132, oz: 0.036, hex: 0x241710 },
      { y: 0.024, rx: 0.098, rz: 0.138, oz: 0.040, frontBulge: 0.022, hex: 0x3D2618 },
      { y: 0.072, rx: 0.084, rz: 0.106, oz: 0.018, hex: 0x523421 },
      { y: 0.155, rx: 0.080, rz: 0.086, oz: 0.002, hex: 0x452B1B },
      { y: 0.198, rx: 0.094, rz: 0.098, oz: 0.000, hex: 0x5E3B25 },
      { y: 0.220, rx: 0.085, rz: 0.088, oz: 0.000, hex: 0x3D2618 }
    ], 20, 3, { capStart: true, capEnd: true, domeHeight: 0.02 }));
    // Brass ankle strap
    parts.push(bakePart(new THREE.TorusGeometry(0.084, 0.013, 8, 18), {
      rx: PI * 0.5, ty: 0.096, tz: 0.01, color: 0xE5A832
    }));

    var merged = mergeBufferGeometries(parts);
    alignBottomToY(merged, 0.0);
    merged.translate(0.0, -0.22, 0.0);
    merged.computeBoundingSphere();
    return merged;
  }

  function buildRogueTunicTorsoGeometry() {
    var parts = [];
    // Dark Obsidian-Crimson Shadow Hunter Tunic (`#2A0E1A` fold AO -> `#4D162B` mid -> `#661D38` chest) + recessed shadow plug!
    parts.push(catmullRomLoft([
      { y: -0.14, rx: 0.248, rz: 0.220, pleatAmp: 0.035, pleatFreq: 6, hex: 0xD9962B },
      { y: -0.11, rx: 0.238, rz: 0.212, pleatAmp: 0.030, pleatFreq: 6, hex: 0x290D18 },
      { y: -0.01, rx: 0.210, rz: 0.188, pleatAmp: 0.016, pleatFreq: 6, hex: 0x421426 },
      { y:  0.12, rx: 0.202, rz: 0.182, hex: 0x54192F },
      { y:  0.28, rx: 0.236, rz: 0.206, frontBulge: 0.024, hex: 0x691F3A },
      { y:  0.40, rx: 0.218, rz: 0.192, hex: 0x3D1223 },
      { y:  0.46, rx: 0.150, rz: 0.144, hex: 0x1A1118 }
    ], 24, 3, { capStart: false, capEnd: true, domeHeight: 0.03, recessedShadow: true, recessDepth: 0.070 }));

    // Deep Obsidian-Plum Assassin Cloak / Capelet (`0x261722` / `0x170E15`) + Crimson-Gold Clasp on Chest!
    parts.push(catmullRomLoft([
      { y: 0.30, rx: 0.292, rz: 0.254, oz: -0.035, pleatAmp: 0.035, pleatFreq: 7, hex: 0x170E15 },
      { y: 0.38, rx: 0.264, rz: 0.228, oz: -0.018, pleatAmp: 0.020, pleatFreq: 7, hex: 0x261722 },
      { y: 0.45, rx: 0.182, rz: 0.172, oz:  0.000, hex: 0x362030 }
    ], 24, 2, { capStart: false, capEnd: false }));

    // Ornate ruby-gold cloak clasp medallion at throat
    parts.push(bakePart(new THREE.OctahedronGeometry(0.050, 0), {
      sx: 1.25, sy: 1.0, sz: 0.55,
      ty: 0.375, tz: 0.205,
      color: 0xFF3355, smoothAngle: 28
    }));

    // Flowing back cloak tail (`z = -0.22m..-0.30m`)
    for (var ct = -1; ct <= 1; ct++) {
      parts.push(bakePart(splineTube([
        { x: ct * 0.12, y:  0.34, z: -0.19, rx: 0.118, rz: 0.028, hex: 0x281522 },
        { x: ct * 0.14, y:  0.14, z: -0.25, rx: 0.128, rz: 0.025, hex: 0x1E101A },
        { x: ct * 0.16, y: -0.05, z: -0.29, rx: 0.098, rz: 0.019, hex: 0x140A12 }
      ], 12, 14), { color: 0xFFFFFF }));
    }

    // Leather Utility Belt + Gleaming Brass Buckle + Hip Pouches
    parts.push(catmullRomLoft([
      { y: 0.035, rx: 0.224, rz: 0.200, hex: 0x3D2212 },
      { y: 0.072, rx: 0.228, rz: 0.204, hex: 0x5E361D },
      { y: 0.105, rx: 0.218, rz: 0.196, hex: 0x452714 }
    ], 24, 2, { capStart: false, capEnd: false }));

    parts.push(bakePart(new THREE.BoxGeometry(0.108, 0.086, 0.046), {
      ty: 0.070, tz: 0.200, color: 0xE6A832, smoothAngle: 30
    }));

    // Diagonal Leather Chest Cross-Strap (`+X` shoulder to `-X` hip)
    parts.push(bakePart(splineTube([
      { x:  0.18, y: 0.41, z:  0.115, rx: 0.038, rz: 0.017, hex: 0x61381E },
      { x:  0.04, y: 0.25, z:  0.220, rx: 0.040, rz: 0.017, hex: 0x734325 },
      { x: -0.14, y: 0.09, z:  0.180, rx: 0.038, rz: 0.017, hex: 0x522E18 }
    ], 12, 16), { color: 0xFFFFFF }));

    // Coiled Hemp Rope + 3-Pronged Brass Grapple Hook on Left Hip (`+X`)!
    parts.push(bakePart(new THREE.TorusGeometry(0.072, 0.024, 10, 20), {
      ry: PI * 0.45, rx: 0.25,
      tx: 0.232, ty: 0.04, tz: -0.02,
      color: 0xC49C5E
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(0.019, 0.021, 0.135, 10), {
      rz: 0.25, tx: 0.252, ty: -0.03, tz: 0.02, color: 0xE5A832
    }));
    for (var gp = 0; gp < 3; gp++) {
      var ga = (gp / 3) * TWO_PI;
      parts.push(bakePart(splineTube([
        { x: 0.265, y: -0.09, z: 0.02, r: 0.016, hex: 0xE5A832 },
        { x: 0.265 + Math.cos(ga) * 0.056, y: -0.11, z: 0.02 + Math.sin(ga) * 0.056, r: 0.013, hex: 0xF5BE49 },
        { x: 0.265 + Math.cos(ga) * 0.046, y: -0.06, z: 0.02 + Math.sin(ga) * 0.046, r: 0.007, hex: 0xFFE27A }
      ], 10, 12), { color: 0xFFFFFF }));
    }

    return mergeBufferGeometries(parts);
  }

  function buildRogueHoodHeadGeometry() {
    var parts = [];
    // Neck ball-socket
    parts.push(bakePart(new THREE.SphereGeometry(0.11, 14, 10), {
      ty: 0.02, color: 0x161E1A, smoothAngle: 72
    }));

    // Deep Shadowed Inner Cowl Recess + Dark Cloth Assassin Mask (ZERO mid-face yellow beak!)
    parts.push(catmullRomLoft([
      { y: 0.05, rx: 0.165, rz: 0.165, oz: 0.015, hex: 0x121816 },
      { y: 0.16, rx: 0.252, rz: 0.244, oz: 0.024, frontBulge: 0.026, hex: 0x1A2320 },
      { y: 0.24, rx: 0.258, rz: 0.246, oz: 0.020, frontBulge: 0.016, hex: 0x141B19 },
      { y: 0.28, rx: 0.250, rz: 0.236, oz: 0.010, hex: 0x0B0F0E },
      { y: 0.36, rx: 0.244, rz: 0.232, oz: 0.006, hex: 0x090C0B },
      { y: 0.44, rx: 0.210, rz: 0.205, oz: 0.000, hex: 0x0D1210 }
    ], 24, 3, { capStart: true, capEnd: true, domeHeight: 0.04 }));

    // Subtle dark cloth mask upper bridge seam (`#25302B` dark slate-green, NO yellow beak!)
    parts.push(bakePart(splineTube([
      { x: -0.18, y: 0.215, z: 0.195, r: 0.011, hex: 0x1E2824 },
      { x:  0.00, y: 0.242, z: 0.268, r: 0.013, hex: 0x2A3832 },
      { x:  0.18, y: 0.215, z: 0.195, r: 0.011, hex: 0x1E2824 }
    ], 10, 14), { color: 0xFFFFFF, autoToyShade: false }));

    // Deep Obsidian-Plum Pointed Assassin Hood (`0x241521` -> `0x3B1D33` sunlit crown, 100% seamless dome!)
    var hoodShell = catmullRomLoft([
      { y: 0.02, rx: 0.292, rz: 0.274, oz: -0.025, hex: 0x170E16 },
      { y: 0.16, rx: 0.334, rz: 0.312, oz: -0.032, hex: 0x221420 },
      { y: 0.32, rx: 0.342, rz: 0.320, oz: -0.022, hex: 0x2D1929 },
      { y: 0.46, rx: 0.302, rz: 0.292, oz: -0.008, hex: 0x381F33 },
      { y: 0.56, rx: 0.210, rz: 0.224, oz: -0.038, hex: 0x45243D }
    ], 26, 3, { capStart: false, capEnd: true, domeHeight: 0.065 });

    var hp = hoodShell.getAttribute('position');
    for (var i = 0; i < hp.count; i++) {
      var vx = hp.getX(i), vy = hp.getY(i), vz = hp.getZ(i);
      if (vz > 0.08 && vy > 0.08 && vy < 0.43) {
        var faceWindow = clamp(1.0 - Math.abs(vy - 0.26) / 0.16, 0.0, 1.0) * clamp(1.0 - Math.abs(vx) / 0.24, 0.0, 1.0);
        hp.setZ(i, vz - faceWindow * 0.165);
      }
      if (vz > 0.12 && vy >= 0.35 && Math.abs(vx) < 0.22) {
        var centerPeak = 1.0 - Math.abs(vx) / 0.22;
        hp.setY(i, vy - centerPeak * 0.062);
        hp.setZ(i, vz + centerPeak * 0.062);
      }
    }
    weldSmoothNormals(hoodShell, 72);
    parts.push(hoodShell);

    // Thick sculpted front cowl rim + crimson-gold outer hood trim piping!
    parts.push(bakePart(splineTube([
      { x: -0.245, y: 0.08, z: 0.12,  r: 0.044, hex: 0x1E1019 },
      { x: -0.258, y: 0.25, z: 0.185, r: 0.048, hex: 0x2B1624 },
      { x: -0.155, y: 0.39, z: 0.248, r: 0.048, hex: 0x381C2E },
      { x:  0.000, y: 0.35, z: 0.302, r: 0.050, hex: 0x452239 },
      { x:  0.155, y: 0.39, z: 0.248, r: 0.048, hex: 0x381C2E },
      { x:  0.258, y: 0.25, z: 0.185, r: 0.048, hex: 0x2B1624 },
      { x:  0.245, y: 0.08, z: 0.12,  r: 0.044, hex: 0x1E1019 }
    ], 14, 22), { color: 0xFFFFFF }));

    // Vivid crimson-gold outer cowl edge piping along hood rim (clear of face!)
    parts.push(bakePart(splineTube([
      { x: -0.272, y: 0.11, z: 0.135, r: 0.013, hex: 0xB8203D },
      { x: -0.282, y: 0.26, z: 0.195, r: 0.014, hex: 0xE62E50 },
      { x: -0.168, y: 0.415, z: 0.258, r: 0.014, hex: 0xFF4769 },
      { x:  0.000, y: 0.375, z: 0.318, r: 0.015, hex: 0xFFB84D },
      { x:  0.168, y: 0.415, z: 0.258, r: 0.014, hex: 0xFF4769 },
      { x:  0.282, y: 0.26, z: 0.195, r: 0.014, hex: 0xE62E50 },
      { x:  0.272, y: 0.11, z: 0.135, r: 0.013, hex: 0xB8203D }
    ], 10, 22), { color: 0xFFFFFF }));

    // Pointed Assassin Hood Tail tucked cleanly inside back-lower cranium (`y <= 0.34, z <= -0.12` -> ZERO crown gash!)
    parts.push(bakePart(splineTube([
      { x: 0.0, y: 0.34, z: -0.13, rx: 0.155, rz: 0.140, hex: 0x2B1624 },
      { x: 0.0, y: 0.31, z: -0.26, rx: 0.112, rz: 0.105, hex: 0x331A2B },
      { x: 0.0, y: 0.24, z: -0.37, rx: 0.062, rz: 0.058, hex: 0x22121D },
      { x: 0.0, y: 0.16, z: -0.45, rx: 0.020, rz: 0.020, hex: 0x170C14 }
    ], 16, 18), { color: 0xFFFFFF }));

    return mergeBufferGeometries(parts);
  }

  function buildRogueGlowingEyesGeometry() {
    var parts = [];
    // Blazing crimson-ember assassin eyes recessed inside the dark cowl shadow!
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(splineTube([
        { x: s * 0.172, y: 0.312, z: 0.238, rx: 0.015, rz: 0.011, hex: 0xFF1F44 },
        { x: s * 0.115, y: 0.295, z: 0.262, rx: 0.034, rz: 0.019, hex: 0xFFE6EC },
        { x: s * 0.058, y: 0.281, z: 0.268, rx: 0.019, rz: 0.011, hex: 0xFF385C }
      ], 12, 12), { color: 0xFFFFFF, autoToyShade: false }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildRogueDaggerArmGeometry(sideSign) {
    // sideSign: -1 for Right arm (-X), +1 for Left arm (+X)
    // Dark `#202B26` upper-arm shoulder cap blends seamlessly into dark forest-charcoal cloak mantle!
    var parts = [];
    parts.push(bakePart(splineTube([
      { x: 0.00,            y:  0.00, z: 0.00, r: 0.068, hex: 0x202B26 },
      { x: sideSign * 0.05, y: -0.11, z: 0.05, r: 0.064, hex: 0x24302A },
      { x: sideSign * 0.06, y: -0.21, z: 0.15, r: 0.058, hex: 0x1B2420 }
    ], 14, 14), { color: 0xFFFFFF }));

    parts.push(bakePart(new THREE.TorusGeometry(0.058, 0.013, 8, 16), {
      rx: PI * 0.35, tx: sideSign * 0.055, ty: -0.17, tz: 0.11, color: 0xE5A832
    }));
    parts.push(bakePart(new THREE.SphereGeometry(0.058, 12, 10), {
      tx: sideSign * 0.06, ty: -0.23, tz: 0.18, color: 0x18201D, smoothAngle: 72
    }));

    // Larger Curved Silver Assassin Dagger (`~1.26x` chunkier/longer blade + dark steel fuller!)
    var dagParts = [];
    dagParts.push(bakePart(new THREE.CylinderGeometry(0.027, 0.030, 0.155, 12), {
      color: 0x472916, smoothAngle: 65
    }));
    dagParts.push(bakePart(new THREE.SphereGeometry(0.042, 10, 8), {
      ty: -0.09, color: 0xE5A832
    }));
    dagParts.push(bakePart(splineTube([
      { x: -0.115, y: 0.088, z: -0.02, r: 0.022, hex: 0xFFD25E },
      { x:  0.000, y: 0.075, z:  0.00, r: 0.032, hex: 0xCC8A26 },
      { x:  0.115, y: 0.088, z:  0.02, r: 0.022, hex: 0xFFD25E }
    ], 10, 12), { color: 0xFFFFFF }));

    // Wide curved gleaming silver assassin blade (`y = 0.08..0.58m`)
    dagParts.push(bakePart(splineTube([
      { x: 0.0, y: 0.08, z:  0.00, rx: 0.020, rz: 0.068, hex: 0xAFC2D8 },
      { x: 0.0, y: 0.25, z:  0.025, rx: 0.020, rz: 0.082, hex: 0xDCE8F6 },
      { x: 0.0, y: 0.43, z:  0.085, rx: 0.016, rz: 0.064, hex: 0xF2F7FF },
      { x: 0.0, y: 0.58, z:  0.175, rx: 0.006, rz: 0.012, hex: 0xFFFFFF }
    ], 10, 16, { smoothAngle: 38 }), { color: 0xFFFFFF }));

    // Dark slate blade spine fuller for crisp beveled steel contrast
    dagParts.push(bakePart(splineTube([
      { x: 0.0, y: 0.11, z: -0.018, rx: 0.023, rz: 0.018, hex: 0x56667A },
      { x: 0.0, y: 0.26, z:  0.004, rx: 0.022, rz: 0.018, hex: 0x5E7086 },
      { x: 0.0, y: 0.42, z:  0.062, rx: 0.016, rz: 0.014, hex: 0x6B7E96 }
    ], 8, 12), { color: 0xFFFFFF, autoToyShade: false }));

    var dagMerged = mergeBufferGeometries(dagParts);
    parts.push(bakePart(dagMerged, {
      rx: sideSign < 0 ? PI * 0.41 : PI * 0.57,
      ry: sideSign * 0.28,
      rz: sideSign * -0.18,
      tx: sideSign * 0.06, ty: -0.23, tz: 0.19,
      color: 0xFFFFFF
    }));

    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 4. WARM WEATHERED ASH-LIMESTONE GARGOYLE TEMPLATES (`#9E988E -> #6E6A63 -> #35322E`)
  // ============================================================================

  function gargoyleStoneShade(px, py, pz, nx, ny, nz) {
    // Warm weathered sanctuary ash-limestone: sunlit crown (#A69E92 / #9E988E) -> mid (#6E6A63) -> crevices (#35322E)!
    var sunDot = clamp(-nx * 0.30 + ny * 0.68 + nz * 0.38, -0.68, 0.96);
    var ao = clamp(0.52 + py * 0.48, 0.48, 1.05);
    var v = clamp((0.75 + 0.34 * sunDot) * ao, 0.32, 1.07);
    return [v * 1.04, v * 1.00, v * 0.93];
  }

  function buildGargoyleBaseBodyGeometry() {
    var parts = [];
    // 1. Chiseled Faceted Crouching Hind Haunches & 3-Clawed Stone Paws (`x = ±0.28m`)
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(catmullRomLoft([
        { y: 0.05, rx: 0.160, rz: 0.190, oz:  0.03, hex: 0x45413C },
        { y: 0.20, rx: 0.215, rz: 0.245, oz: -0.01, hex: 0x7A746C },
        { y: 0.38, rx: 0.205, rz: 0.225, oz: -0.04, hex: 0x948E84 },
        { y: 0.52, rx: 0.150, rz: 0.168, oz: -0.05, hex: 0x6E6962 }
      ], 12, 3, { capStart: true, capEnd: true, domeHeight: 0.045, smoothAngle: 46 }), {
        rz: s * -0.14,
        tx: s * 0.270, ty: 0.02, tz: -0.04,
        color: 0xFFFFFF,
        shadeFn: gargoyleStoneShade
      }));

      // Deep dark `#35322E` haunch-to-torso carved crease seam
      parts.push(bakePart(splineTube([
        { x: s * 0.18, y: 0.14, z:  0.14, r: 0.022, hex: 0x35322E },
        { x: s * 0.21, y: 0.32, z:  0.04, r: 0.024, hex: 0x2E2B28 },
        { x: s * 0.19, y: 0.46, z: -0.10, r: 0.020, hex: 0x35322E }
      ], 8, 12), { color: 0xFFFFFF, autoToyShade: false }));

      // Broad flat-bottomed stone hind paw (`y = 0.000m..0.11m`) + dark toe-joint crevices!
      parts.push(bakePart(catmullRomLoft([
        { y: 0.000, rx: 0.155, rz: 0.210, oz: 0.06, hex: 0x3A3733 },
        { y: 0.045, rx: 0.162, rz: 0.218, oz: 0.06, hex: 0x706B64 },
        { y: 0.108, rx: 0.136, rz: 0.172, oz: 0.03, hex: 0x8A847B }
      ], 14, 2, { capStart: true, capEnd: true, domeHeight: 0.03, smoothAngle: 48 }), {
        ry: s * -0.15,
        tx: s * 0.290, ty: 0.0, tz: 0.04,
        color: 0xFFFFFF,
        shadeFn: gargoyleStoneShade
      }));

      for (var cl = -1; cl <= 1; cl++) {
        parts.push(bakePart(splineTube([
          { x: s * 0.290 + cl * 0.056, y: 0.056, z: 0.19, r: 0.036, hex: 0x807A72 },
          { x: s * 0.290 + cl * 0.066, y: 0.032, z: 0.27, r: 0.028, hex: 0x948E84 },
          { x: s * 0.290 + cl * 0.070, y: 0.008, z: 0.32, r: 0.012, hex: 0x3D3934 }
        ], 8, 10, { smoothAngle: 42 }), { color: 0xFFFFFF, shadeFn: gargoyleStoneShade }));
      }
    }

    // 2. Broad Hunched Carved Ash-Limestone Torso (`y = 0.14m..0.85m`) with Dark Crevice Grooves
    parts.push(bakePart(catmullRomLoft([
      { y: 0.14, rx: 0.315, rz: 0.290, oz: -0.04, hex: 0x4A4640 },
      { y: 0.28, rx: 0.362, rz: 0.325, oz: -0.01, frontBulge: 0.025, hex: 0x6E6A63 },
      { y: 0.48, rx: 0.396, rz: 0.345, oz:  0.03, frontBulge: 0.045, hex: 0x878178 },
      { y: 0.68, rx: 0.412, rz: 0.340, oz:  0.06, frontBulge: 0.042, hex: 0x969086 },
      { y: 0.83, rx: 0.322, rz: 0.274, oz:  0.07, hex: 0x807A71 }
    ], 16, 3, { capStart: true, capEnd: true, domeHeight: 0.065, smoothAngle: 52 }), {
      color: 0xFFFFFF,
      shadeFn: gargoyleStoneShade
    }));

    // Deep `#35322E` carved neck collar & sternum/pectoral crevices!
    parts.push(bakePart(new THREE.TorusGeometry(0.245, 0.028, 10, 20), {
      rx: PI * 0.5 - 0.16,
      ty: 0.77, tz: 0.14,
      color: 0x35322E,
      autoToyShade: false
    }));
    parts.push(bakePart(splineTube([
      { x:  0.00, y: 0.72, z: 0.34,  r: 0.020, hex: 0x35322E },
      { x:  0.00, y: 0.54, z: 0.382, r: 0.022, hex: 0x2E2B28 },
      { x:  0.00, y: 0.38, z: 0.355, r: 0.018, hex: 0x35322E }
    ], 8, 12), { color: 0xFFFFFF, autoToyShade: false }));

    // Chiseled Faceted Stone Pectoral Plates & Beveled Shoulder Haunches
    for (var ps = -1; ps <= 1; ps += 2) {
      parts.push(bakePart(catmullRomLoft([
        { y: -0.08, rx: 0.155, rz: 0.085, hex: 0x4D4943 },
        { y:  0.00, rx: 0.178, rz: 0.105, hex: 0x8A847A },
        { y:  0.08, rx: 0.150, rz: 0.082, hex: 0x999288 }
      ], 8, 2, { capStart: true, capEnd: true, domeHeight: 0.025, smoothAngle: 38 }), {
        rz: ps * 0.16,
        rx: 0.12,
        tx: ps * 0.165, ty: 0.60, tz: 0.27,
        color: 0xFFFFFF,
        shadeFn: gargoyleStoneShade
      }));
      parts.push(bakePart(splineTube([
        { x: ps * 0.04, y: 0.50, z: 0.365, r: 0.018, hex: 0x35322E },
        { x: ps * 0.17, y: 0.49, z: 0.335, r: 0.020, hex: 0x2E2B28 },
        { x: ps * 0.28, y: 0.53, z: 0.245, r: 0.016, hex: 0x35322E }
      ], 8, 10), { color: 0xFFFFFF, autoToyShade: false }));

      // Chiseled 8-faceted warm ash-limestone shoulder deltoid arch
      parts.push(bakePart(catmullRomLoft([
        { y: -0.10, rx: 0.165, rz: 0.175, hex: 0x3D3A35 },
        { y: -0.02, rx: 0.188, rz: 0.192, hex: 0x7D776E },
        { y:  0.07, rx: 0.162, rz: 0.168, hex: 0x948E84 },
        { y:  0.13, rx: 0.108, rz: 0.118, hex: 0xA0998E }
      ], 8, 2, { capStart: true, capEnd: true, domeHeight: 0.025, smoothAngle: 38 }), {
        rz: ps * -0.28,
        tx: ps * 0.330, ty: 0.68, tz: 0.05,
        color: 0xFFFFFF,
        shadeFn: gargoyleStoneShade
      }));
      parts.push(bakePart(new THREE.TorusGeometry(0.158, 0.022, 8, 14), {
        rx: PI * 0.5,
        ry: ps * 0.32,
        tx: ps * 0.332, ty: 0.585, tz: 0.055,
        color: 0x35322E,
        autoToyShade: false
      }));
    }

    // Curled Carved Ash-Limestone Gargoyle Tail tucked around the back (`-Z`)
    parts.push(bakePart(splineTube([
      { x:  0.00, y: 0.24, z: -0.26, r: 0.090, hex: 0x615D56 },
      { x: -0.10, y: 0.15, z: -0.40, r: 0.070, hex: 0x807A71 },
      { x: -0.24, y: 0.10, z: -0.38, r: 0.052, hex: 0x918B81 },
      { x: -0.32, y: 0.13, z: -0.26, r: 0.034, hex: 0x6E6A63 },
      { x: -0.30, y: 0.18, z: -0.18, r: 0.016, hex: 0x47433E }
    ], 10, 18, { smoothAngle: 48 }), { color: 0xFFFFFF, shadeFn: gargoyleStoneShade }));

    var merged = mergeBufferGeometries(parts);
    alignBottomToY(merged, 0.0);
    return merged;
  }

  function buildGargoyleForearmGeometry(sideSign) {
    // Articulated at shoulder `(sideSign * 0.32, 0.66, 0.08)`:
    var parts = [];
    parts.push(bakePart(splineTube([
      { x: 0.00,             y:  0.00, z: 0.00, r: 0.132, hex: 0x827C73 },
      { x: sideSign * 0.03,  y: -0.22, z: 0.10, r: 0.124, hex: 0x8F897F },
      { x: sideSign * -0.04, y: -0.44, z: 0.18, r: 0.142, hex: 0x878178 },
      { x: sideSign * -0.09, y: -0.58, z: 0.22, r: 0.132, hex: 0x5E5A54 }
    ], 10, 16, { smoothAngle: 44 }), { color: 0xFFFFFF, shadeFn: gargoyleStoneShade }));

    // Dark `#35322E` carved stone wrist & elbow joint bands
    parts.push(bakePart(new THREE.TorusGeometry(0.118, 0.018, 8, 14), {
      rx: PI * 0.42,
      tx: sideSign * 0.01, ty: -0.24, tz: 0.11,
      color: 0x35322E,
      autoToyShade: false
    }));
    parts.push(bakePart(new THREE.TorusGeometry(0.122, 0.019, 8, 14), {
      rx: PI * 0.45,
      tx: sideSign * -0.08, ty: -0.53, tz: 0.21,
      color: 0x33302C,
      autoToyShade: false
    }));

    // Faceted stone fist/knuckles resting solidly forward on the tile
    parts.push(bakePart(catmullRomLoft([
      { y: -0.65, rx: 0.148, rz: 0.165, hex: 0x3D3935 },
      { y: -0.60, rx: 0.158, rz: 0.175, hex: 0x7D776E },
      { y: -0.53, rx: 0.132, rz: 0.145, hex: 0x918B81 }
    ], 10, 2, { capStart: true, capEnd: true, domeHeight: 0.025, smoothAngle: 42 }), {
      tx: sideSign * -0.10, ty: 0.0, tz: 0.25,
      color: 0xFFFFFF,
      shadeFn: gargoyleStoneShade
    }));

    for (var k = -1; k <= 1; k++) {
      parts.push(bakePart(new THREE.BoxGeometry(0.052, 0.068, 0.088), {
        rx: 0.22,
        tx: sideSign * -0.10 + k * 0.062, ty: -0.61, tz: 0.34,
        color: 0x756F67,
        smoothAngle: 28,
        shadeFn: gargoyleStoneShade
      }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildGargoyleHeadGeometry() {
    var parts = [];
    // HeadPivot at (0, 0.78, 0.17)
    // 1. Chiseled Wide Warm Ash-Limestone Cranium & Gargoyle Jowls (`#9E988E` crown -> `#6E6A63` mid -> `#35322E` crevices)
    parts.push(bakePart(catmullRomLoft([
      { y: -0.06, rx: 0.225, rz: 0.218, oz: 0.02, hex: 0x47433E },
      { y:  0.04, rx: 0.305, rz: 0.282, oz: 0.05, frontBulge: 0.035, hex: 0x7D776E },
      { y:  0.15, rx: 0.292, rz: 0.272, oz: 0.04, frontBulge: 0.025, hex: 0x918B81 },
      { y:  0.26, rx: 0.258, rz: 0.246, oz: 0.01, hex: 0x9E988E },
      { y:  0.34, rx: 0.180, rz: 0.180, oz: 0.00, hex: 0xA8A196 }
    ], 16, 3, { capStart: true, capEnd: true, domeHeight: 0.052, smoothAngle: 48 }), {
      color: 0xFFFFFF, shadeFn: gargoyleStoneShade
    }));

    // Delicate flush-set weathered sagittal forehead / cranial stone seam (`0` protruding ridges!)
    parts.push(bakePart(splineTube([
      { x:  0.000, y: 0.212, z: 0.286, rx: 0.006, rz: 0.006, hex: 0x4E4942 },
      { x: -0.006, y: 0.286, z: 0.247, rx: 0.006, rz: 0.006, hex: 0x544F48 },
      { x:  0.005, y: 0.352, z: 0.172, rx: 0.005, rz: 0.005, hex: 0x5C564E },
      { x:  0.000, y: 0.391, z: 0.045, rx: 0.004, rz: 0.004, hex: 0x666058 }
    ], 8, 12), { color: 0xFFFFFF, autoToyShade: false }));
    parts.push(bakePart(splineTube([
      { x: -0.006, y: 0.286, z: 0.247, r: 0.005, hex: 0x544F48 },
      { x:  0.042, y: 0.322, z: 0.218, r: 0.004, hex: 0x635D55 }
    ], 6, 8), { color: 0xFFFFFF, autoToyShade: false }));

    // 2. Heavy Chiseled Furrowed V-Brow Ridge (`+Z`) + Deep `#211E1B` Carved Eye Socket Recess!
    for (var es = -1; es <= 1; es += 2) {
      parts.push(bakePart(new THREE.SphereGeometry(0.072, 12, 10), {
        sx: 1.24, sy: 0.74, sz: 0.56,
        ry: es * 0.22,
        tx: es * 0.122, ty: 0.148, tz: 0.302,
        color: 0x211E1B,
        autoToyShade: false,
        smoothAngle: 68
      }));
    }
    // Dark crease above V-brow so the heavy brow ridge stands out in bold relief
    parts.push(bakePart(splineTube([
      { x: -0.22, y: 0.265, z: 0.195, r: 0.018, hex: 0x35322E },
      { x:  0.00, y: 0.205, z: 0.302, r: 0.022, hex: 0x2E2B27 },
      { x:  0.22, y: 0.265, z: 0.195, r: 0.018, hex: 0x35322E }
    ], 8, 14), { color: 0xFFFFFF, autoToyShade: false }));

    parts.push(bakePart(splineTube([
      { x: -0.26, y: 0.235, z: 0.185, rx: 0.058, rz: 0.062, hex: 0x807A71 },
      { x: -0.13, y: 0.208, z: 0.292, rx: 0.072, rz: 0.078, hex: 0xA29B90 },
      { x:  0.00, y: 0.148, z: 0.332, rx: 0.078, rz: 0.080, hex: 0x8C867C },
      { x:  0.13, y: 0.208, z: 0.292, rx: 0.072, rz: 0.078, hex: 0xA29B90 },
      { x:  0.26, y: 0.235, z: 0.185, rx: 0.058, rz: 0.062, hex: 0x807A71 }
    ], 10, 18, { smoothAngle: 44 }), { color: 0xFFFFFF, shadeFn: gargoyleStoneShade }));

    // 3. Chiseled Broad Gargoyle Snout, Deep Nostril Pits & Heavy Grimacing Stone Jaw
    parts.push(bakePart(new THREE.BoxGeometry(0.185, 0.115, 0.145), {
      rx: 0.12,
      ty: 0.102, tz: 0.285,
      color: 0x918B81, smoothAngle: 36, shadeFn: gargoyleStoneShade
    }));
    for (var ns = -1; ns <= 1; ns += 2) {
      parts.push(bakePart(new THREE.SphereGeometry(0.024, 8, 8), {
        tx: ns * 0.048, ty: 0.088, tz: 0.354,
        color: 0x24211E, autoToyShade: false
      }));
    }
    parts.push(bakePart(splineTube([
      { x: -0.19, y: 0.02, z: 0.20, rx: 0.058, rz: 0.062, hex: 0x736E66 },
      { x: -0.09, y: 0.00, z: 0.285, rx: 0.068, rz: 0.068, hex: 0x878178 },
      { x:  0.00, y: 0.00, z: 0.308, rx: 0.072, rz: 0.072, hex: 0x918B81 },
      { x:  0.09, y: 0.00, z: 0.285, rx: 0.068, rz: 0.068, hex: 0x878178 },
      { x:  0.19, y: 0.02, z: 0.20, rx: 0.058, rz: 0.062, hex: 0x736E66 }
    ], 10, 16, { smoothAngle: 44 }), { color: 0xFFFFFF, shadeFn: gargoyleStoneShade }));

    parts.push(bakePart(splineTube([
      { x: -0.15, y: 0.046, z: 0.268, r: 0.020, hex: 0x2B2824 },
      { x:  0.00, y: 0.055, z: 0.320, r: 0.022, hex: 0x24211E },
      { x:  0.15, y: 0.046, z: 0.268, r: 0.020, hex: 0x2B2824 }
    ], 8, 12), { color: 0xFFFFFF, autoToyShade: false }));

    // 4. ONE Bold Swept-Outward & Upward Chiseled Horn-Ear Pair (warm weathered ash-limestone!)
    for (var side = -1; side <= 1; side += 2) {
      parts.push(bakePart(splineTube([
        { x: side * 0.17, y: 0.22, z:  0.05, rx: 0.088, rz: 0.056, hex: 0x807A71 },
        { x: side * 0.31, y: 0.33, z: -0.02, rx: 0.078, rz: 0.046, hex: 0x999288 },
        { x: side * 0.43, y: 0.44, z: -0.09, rx: 0.052, rz: 0.032, hex: 0xABA397 },
        { x: side * 0.51, y: 0.52, z: -0.15, rx: 0.018, rz: 0.014, hex: 0x968F85 }
      ], 10, 16, { smoothAngle: 44 }), { color: 0xFFFFFF, shadeFn: gargoyleStoneShade }));

      // Dark `#35322E` carved inner-ear hollow along the front concave pocket of each horn-ear
      parts.push(bakePart(splineTube([
        { x: side * 0.21, y: 0.21, z:  0.085, rx: 0.042, rz: 0.022, hex: 0x35322E },
        { x: side * 0.33, y: 0.31, z:  0.015, rx: 0.036, rz: 0.018, hex: 0x2E2B27 },
        { x: side * 0.42, y: 0.40, z: -0.055, rx: 0.018, rz: 0.010, hex: 0x383530 }
      ], 8, 12), { color: 0xFFFFFF, autoToyShade: false }));
    }

    return mergeBufferGeometries(parts);
  }

  function buildGargoyleEyesGeometry() {
    var parts = [];
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(splineTube([
        { x: s * 0.175, y: 0.162, z: 0.294, rx: 0.014, rz: 0.014, hex: 0xFFFFFF },
        { x: s * 0.118, y: 0.144, z: 0.334, rx: 0.024, rz: 0.020, hex: 0xFFFFFF },
        { x: s * 0.064, y: 0.132, z: 0.344, rx: 0.014, rz: 0.014, hex: 0xFFFFFF }
      ], 10, 12), { color: 0xFFFFFF, autoToyShade: false }));
    }
    return mergeBufferGeometries(parts);
  }

  /**
   * Builds a thick, chiseled warm ash-limestone Bat-Wing (`sideSign = +1` Left, `-1` Right)
   * with proud front-facing `#A69E92` carved bone spars/finger-ribs over `#4E4A45` recessed webbing
   * and an upward `+0.40 Y` normal bias so wings show crisp stone relief instead of black silhouettes!
   */
  function buildGargoyleWingGeometry(sideSign) {
    var parts = [];
    // 1. Thick curved upper wing-arm bone spar (`z(x) ~ -0.17 * x + 0.012` proud on front!)
    parts.push(splineTube([
      { x: 0.00, y:  0.00, z:  0.012, r: 0.078, hex: 0x857E75 },
      { x: 0.17, y:  0.16, z: -0.018, r: 0.070, hex: 0x9E978D },
      { x: 0.39, y:  0.30, z: -0.055, r: 0.064, hex: 0xB2AA9E },
      { x: 0.59, y:  0.19, z: -0.088, r: 0.050, hex: 0xA69E92 },
      { x: 0.70, y: -0.03, z: -0.108, r: 0.028, hex: 0x8A8379 }
    ], 12, 20, { smoothAngle: 48 }));

    // 2. Two proud front-facing (`+0.028m Z`) carved stone finger-ribs (`#ADA599 -> #8F887E`)!
    // Standing cleanly in front of the `±0.022m` membrane so 100% of each rib catches warm sunlight!
    parts.push(splineTube([
      { x: 0.39, y:  0.28, z: -0.038, r: 0.046, hex: 0xB0A89B },
      { x: 0.48, y:  0.05, z: -0.052, r: 0.038, hex: 0x9E978D },
      { x: 0.50, y: -0.20, z: -0.058, r: 0.026, hex: 0x878077 }
    ], 10, 14, { smoothAngle: 46 }));

    parts.push(splineTube([
      { x: 0.37, y:  0.26, z: -0.035, r: 0.046, hex: 0xB0A89B },
      { x: 0.29, y:  0.02, z: -0.022, r: 0.038, hex: 0x9E978D },
      { x: 0.24, y: -0.24, z: -0.014, r: 0.026, hex: 0x857E75 }
    ], 10, 14, { smoothAngle: 46 }));

    // 3. Recessed warm slate-ash (`#59544E`) scalloped limestone wing-membrane inside bone spars!
    var webShape = new THREE.Shape();
    webShape.moveTo(0.02, -0.06);
    webShape.lineTo(0.17, 0.15);
    webShape.lineTo(0.39, 0.29);
    webShape.lineTo(0.58, 0.18);
    webShape.lineTo(0.68, -0.03);
    webShape.quadraticCurveTo(0.57, -0.05, 0.50, -0.19);
    webShape.quadraticCurveTo(0.37, -0.09, 0.24, -0.23);
    webShape.quadraticCurveTo(0.12, -0.14, 0.02, -0.18);
    webShape.closePath();

    var webExtrude = new THREE.ExtrudeGeometry(webShape, {
      depth: 0.038,
      bevelEnabled: true,
      bevelThickness: 0.010,
      bevelSize: 0.010,
      bevelSegments: 2,
      curveSegments: 10
    });
    webExtrude.translate(0.0, 0.0, -0.019);
    parts.push(bakePart(webExtrude, {
      ry: 0.17,
      color: 0x5C5750,
      smoothAngle: 48
    }));

    var wingMerged = mergeBufferGeometries(parts);
    var wingBaked = bakePart(wingMerged, {
      sx: sideSign < 0 ? -1.0 : 1.0,
      color: 0xFFFFFF,
      smoothAngle: 52,
      shadeFn: function (px, py, pz, nx, ny, nz) {
        // Upward + frontward normal bias (`+0.40 Y, +0.26 Z`) prevents shadowed wing black-out!
        var bny = ny + 0.40;
        var bnz = nz + 0.26;
        var bl = Math.hypot(nx, bny, bnz) || 1.0;
        return gargoyleStoneShade(px, py, pz, nx / bl, bny / bl, bnz / bl);
      }
    });
    // Also bias the WebGL vertex normals upward (`+0.38 Y, +0.22 Z`) so `MeshStandardMaterial` catches warm sun!
    var wn = wingBaked.getAttribute('normal');
    for (var wi = 0; wi < wn.count; wi++) {
      var wnx = wn.getX(wi);
      var wny = wn.getY(wi) + 0.38;
      var wnz = wn.getZ(wi) + 0.22;
      var wLen = Math.hypot(wnx, wny, wnz) || 1.0;
      wn.setXYZ(wi, wnx / wLen, wny / wLen, wnz / wLen);
    }
    wn.needsUpdate = true;
    return wingBaked;
  }

  function buildGargoyleFissuresGeometry() {
    // Blazing solar-gold emissive crack network across chest, shoulders & brow when `sunstruck === true`!
    var parts = [];
    var veins = [
      [
        { x:  0.02, y: 0.30, z: 0.39, r: 0.020, hex: 0xFF9800 },
        { x: -0.05, y: 0.52, z: 0.435, r: 0.028, hex: 0xFFD026 },
        { x:  0.04, y: 0.71, z: 0.415, r: 0.024, hex: 0xFFE866 },
        { x:  0.22, y: 0.84, z: 0.25, r: 0.018, hex: 0xFFA000 }
      ],
      [
        { x: -0.05, y: 0.54, z: 0.435, r: 0.024, hex: 0xFFE866 },
        { x: -0.25, y: 0.70, z: 0.30, r: 0.022, hex: 0xFFC41E },
        { x: -0.45, y: 0.78, z: 0.10, r: 0.018, hex: 0xFF9400 }
      ],
      [
        { x:  0.05, y: 0.56, z: 0.425, r: 0.022, hex: 0xFFD838 },
        { x:  0.28, y: 0.72, z: 0.28, r: 0.022, hex: 0xFFC41E },
        { x:  0.46, y: 0.78, z: 0.09, r: 0.018, hex: 0xFF9400 }
      ],
      // Forehead & crown solar veins visible from isometric top-down camera!
      [
        { x: -0.11, y: 1.08, z:  0.28, r: 0.018, hex: 0xFFA400 },
        { x:  0.00, y: 1.14, z:  0.19, r: 0.024, hex: 0xFFE04D },
        { x:  0.12, y: 1.09, z:  0.05, r: 0.018, hex: 0xFFA400 }
      ],
      [
        { x:  0.00, y: 0.42, z: -0.34, r: 0.022, hex: 0xFFC41E },
        { x:  0.05, y: 0.66, z: -0.32, r: 0.024, hex: 0xFFE04D },
        { x: -0.08, y: 0.84, z: -0.18, r: 0.018, hex: 0xFF9800 }
      ]
    ];
    for (var i = 0; i < veins.length; i++) {
      parts.push(bakePart(splineTube(veins[i], 10, 14), { color: 0xFFFFFF, autoToyShade: false }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildShatterChunkGeometry() {
    var g = new THREE.DodecahedronGeometry(0.14, 0);
    return bakePart(g, {
      sx: 1.15, sy: 0.82, sz: 0.96,
      smoothAngle: 15,
      color: 0x9E988E,
      shadeFn: gargoyleStoneShade
    });
  }

  // --------------------------------------------------------------------------
  // 4B. HUNTER INTENTION ARROW, TIME-CRYSTAL CAGE, ASTRAL SUMMON & SUN-BURST
  // --------------------------------------------------------------------------
  function buildRogueIntentArrowGeometry() {
    var parts = [];
    // Sculpted 3D Beveled Crimson-Gold Double Chevron Arrow pointing toward +Z!
    // Primary forward arrowhead (`z = +0.10 .. +0.44`)
    parts.push(bakePart(splineTube([
      { x: -0.30, y: 0.032, z: 0.04, rx: 0.036, rz: 0.030, hex: 0xFFB84D },
      { x: -0.15, y: 0.045, z: 0.22, rx: 0.052, rz: 0.042, hex: 0xFF294D },
      { x:  0.00, y: 0.056, z: 0.42, rx: 0.064, rz: 0.052, hex: 0xFFE6EC },
      { x:  0.15, y: 0.045, z: 0.22, rx: 0.052, rz: 0.042, hex: 0xFF294D },
      { x:  0.30, y: 0.032, z: 0.04, rx: 0.036, rz: 0.030, hex: 0xFFB84D }
    ], 12, 20, { smoothAngle: 68 }), { color: 0xFFFFFF, autoToyShade: false }));

    // Trailing secondary chevron (`z = -0.26 .. +0.06`)
    parts.push(bakePart(splineTube([
      { x: -0.22, y: 0.026, z: -0.24, rx: 0.028, rz: 0.024, hex: 0xCC1838 },
      { x:  0.00, y: 0.042, z:  0.02, rx: 0.046, rz: 0.038, hex: 0xFF4769 },
      { x:  0.22, y: 0.026, z: -0.24, rx: 0.028, rz: 0.024, hex: 0xCC1838 }
    ], 10, 16, { smoothAngle: 68 }), { color: 0xFFFFFF, autoToyShade: false }));

    // Central faceted ruby spear-gem at tip
    parts.push(bakePart(new THREE.OctahedronGeometry(0.082, 0), {
      sx: 0.95, sy: 0.52, sz: 1.55,
      ty: 0.055, tz: 0.36,
      smoothAngle: 22,
      color: 0xFF3358,
      autoToyShade: false
    }));
    return mergeBufferGeometries(parts);
  }

  function buildIntentTargetRingGeometry() {
    var cOuter = hexToRgb01(0x520814);
    var cMid = hexToRgb01(0xFF2442);
    var cCore = hexToRgb01(0xFFD6DE);
    return buildRoundedSquareRibbonGeometry([
      { half: 0.52, cornerR: 0.14, rgb: cOuter },
      { half: 0.56, cornerR: 0.15, rgb: cMid },
      { half: 0.60, cornerR: 0.16, rgb: cCore },
      { half: 0.64, cornerR: 0.17, rgb: cMid },
      { half: 0.68, cornerR: 0.18, rgb: cOuter }
    ]);
  }

  function buildTimeCrystalCageGeometry() {
    var parts = [];
    // Crown of 6 faceted sapphire-cyan starlight crystal spires angling slightly inward around Rogue
    for (var i = 0; i < 6; i++) {
      var ang = (i / 6) * TWO_PI + 0.26;
      var rad = 0.58;
      var h = (i % 2 === 0) ? 1.62 : 1.32;
      var cx = Math.cos(ang) * rad;
      var cz = Math.sin(ang) * rad;
      var tilt = 0.14;
      parts.push(bakePart(new THREE.ConeGeometry(0.155, h, 6), {
        rx: -Math.sin(ang) * tilt,
        rz:  Math.cos(ang) * tilt,
        ry: ang,
        tx: cx,
        ty: h * 0.48,
        tz: cz,
        smoothAngle: 18,
        color: (i % 2 === 0) ? 0x6CF2FF : 0x38B6FF
      }));
      // Base crystal cluster shard
      parts.push(bakePart(new THREE.OctahedronGeometry(0.16, 0), {
        sx: 1.0, sy: 1.45, sz: 0.9,
        ry: ang + 0.4,
        tx: Math.cos(ang + 0.35) * 0.66,
        ty: 0.20,
        tz: Math.sin(ang + 0.35) * 0.66,
        smoothAngle: 15,
        color: 0xA8FFFF
      }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildTimeAstrolabeRingGeometry() {
    var parts = [];
    parts.push(bakePart(new THREE.TorusGeometry(0.76, 0.024, 10, 36), {
      rx: PI * 0.5, color: 0xFFE074, smoothAngle: 70
    }));
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * TWO_PI;
      parts.push(bakePart(new THREE.OctahedronGeometry(0.052, 0), {
        tx: Math.cos(a) * 0.76,
        ty: 0.0,
        tz: Math.sin(a) * 0.76,
        color: (i % 2 === 0) ? 0x7EF9FF : 0xFFE680,
        smoothAngle: 20
      }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildAstralSigilGeometry() {
    var parts = [];
    parts.push(bakePart(new THREE.RingGeometry(1.06, 1.22, 36), {
      rx: -PI * 0.5, color: 0x6BF4FF, autoToyShade: false
    }));
    parts.push(bakePart(new THREE.RingGeometry(0.68, 0.78, 32), {
      rx: -PI * 0.5, color: 0xFFE47A, autoToyShade: false
    }));
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * TWO_PI;
      parts.push(bakePart(new THREE.RingGeometry(0.08, 0.16, 4), {
        rx: -PI * 0.5,
        ry: a,
        tx: Math.cos(a) * 0.94,
        ty: 0.004,
        tz: Math.sin(a) * 0.94,
        color: 0xFFFFFF,
        autoToyShade: false
      }));
    }
    return mergeBufferGeometries(parts);
  }

  function buildAstralPillarGeometry() {
    // Open-ended vertical celestial starlight cylinder with soft alpha/brightness falloff toward top
    var cyl = new THREE.CylinderGeometry(0.72, 0.92, 5.2, 24, 6, true);
    cyl.translate(0.0, 2.6, 0.0);
    return bakePart(cyl, {
      color: 0xFFFFFF,
      autoToyShade: false,
      shadeFn: function (px, py) {
        var u = clamp(py / 5.2, 0.0, 1.0);
        var fade = Math.pow(1.0 - u, 1.65) * (u < 0.06 ? (u / 0.06) : 1.0);
        return [0.45 * fade, 0.88 * fade, 1.0 * fade];
      }
    });
  }

  function buildSunStarGeometry() {
    var parts = [];
    parts.push(bakePart(new THREE.OctahedronGeometry(0.09, 0), {
      sx: 1.5, sy: 0.55, sz: 0.55, color: 0xFFF29C, smoothAngle: 18, autoToyShade: false
    }));
    parts.push(bakePart(new THREE.OctahedronGeometry(0.09, 0), {
      sx: 0.55, sy: 0.55, sz: 1.5, color: 0xFFC938, smoothAngle: 18, autoToyShade: false
    }));
    return mergeBufferGeometries(parts);
  }

  function buildAmbushSlashGeometry() {
    var parts = [];
    for (var s = -1; s <= 1; s += 2) {
      parts.push(bakePart(splineTube([
        { x: -0.68, y: 0.18, z: -0.68 * s, rx: 0.015, rz: 0.015, hex: 0x990F29 },
        { x:  0.00, y: 0.62, z:  0.00,     rx: 0.058, rz: 0.032, hex: 0xFFE6EC },
        { x:  0.68, y: 0.18, z:  0.68 * s, rx: 0.015, rz: 0.015, hex: 0xFF2442 }
      ], 10, 16), { color: 0xFFFFFF, autoToyShade: false }));
    }
    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 5. Cached Asset Registry & Pooled Articulated Rig Builders (0 Leaks!)
  // ============================================================================

  var _scene = null;
  var _rootGroup = null;
  var _prewarmGroup = null;
  var _initialized = false;
  var _assets = null;

  var MAX_HERO_SLOTS = 4;
  var MAX_GARGOYLE_SLOTS = 8;
  var SHARDS_PER_GARGOYLE = 12;

  var _heroPool = [];
  var _gargoylePool = [];
  var _rogueSlot = null;
  var _astralSummon = null;
  var _sunBurst = null;
  var _ambushFx = null;
  var _activeHeroes = [];
  var _activeGargoyles = [];
  var _unitById = {};
  var _pickables = [];

  var _selectedHeroId = null;
  var _selectedChevron = null;
  var _elapsedSec = 0.0;

  // Live physics & locomotion audit metrics
  var _auditMetrics = {
    maxFootDriftM: 0.0,
    overlapPairs: 0,
    stoppedSkatingFrames: 0
  };

  var HERO_SCALE_XZ = 1.24;
  var HERO_SCALE_Y = 1.16;
  var GARGOYLE_SCALE_XZ = 1.20;
  var GARGOYLE_SCALE_Y = 1.08;

  function buildCachedAssets() {
    var texMaps = (window.GAME.Textures && window.GAME.Textures.init)
      ? window.GAME.Textures.init()
      : {};
    var contactShadowTex = buildContactShadowTexture();

    var magePrismCrystal = new THREE.OctahedronGeometry(0.118, 0);
    magePrismCrystal.scale(0.95, 1.48, 0.95);
    magePrismCrystal.computeVertexNormals();

    var contactShadowDisc = new THREE.CircleGeometry(1.0, 28);
    contactShadowDisc.rotateX(-PI * 0.5);

    var geoms = {
      // Contrast-Rimmed Tile Base Outlines, Contact Shadow Disc & Selection Chevron
      heroOutlineCore: buildTileOutlineCoreGeometry(0x084A57, 0x00F0FF, 0xC8FFFF),
      heroOutlineHalo: buildTileOutlineHaloGeometry(0x00F0FF),
      rogueOutlineCore: buildTileOutlineCoreGeometry(0x520814, 0xFF2442, 0xFFD6DE),
      rogueOutlineHalo: buildTileOutlineHaloGeometry(0xFF1E3C),
      gargOutlineCore: buildTileOutlineCoreGeometry(0x4D083B, 0xFF26D4, 0xFFD4FA),
      gargOutlineHalo: buildTileOutlineHaloGeometry(0xFF26D4),
      contactShadow: contactShadowDisc,
      chevron: buildSelectionChevronGeometry(),

      // Hunter Intention Arrow, Time-Crystal Cage, Astral Summon & Sun-Burst
      intentArrow: buildRogueIntentArrowGeometry(),
      intentTargetRing: buildIntentTargetRingGeometry(),
      timeCrystalCage: buildTimeCrystalCageGeometry(),
      timeAstrolabeRing: buildTimeAstrolabeRingGeometry(),
      astralSigil: buildAstralSigilGeometry(),
      astralPillar: buildAstralPillarGeometry(),
      sunStar: buildSunStarGeometry(),
      ambushSlash: buildAmbushSlashGeometry(),
      sunBurstDome: new THREE.SphereGeometry(1.0, 24, 16, 0, TWO_PI, 0, PI * 0.5),

      // Hitboxes & Action Ring / Grapple Rope
      heroHit: new THREE.CylinderGeometry(0.68, 0.68, 2.02, 12),
      gargHit: new THREE.CylinderGeometry(0.76, 0.76, 1.58, 12),
      actionRing: new THREE.RingGeometry(0.32, 0.50, 24),
      grappleLine: new THREE.CylinderGeometry(0.020, 0.020, 1.0, 8),
      arcaneOrb: new THREE.OctahedronGeometry(0.095, 0),

      // Warrior
      warriorUpperLeg: buildWarriorUpperLegGeometry(),
      warriorLowerBoot: buildWarriorLowerBootGeometry(),
      warriorTorso: buildWarriorTorsoGeometry(),
      warriorHead: buildWarriorHeadGeometry(),
      warriorSparkles: buildHeroEyeSparklesGeometry(0.284, 0.289),
      warriorArmR: buildWarriorRightSwordArmGeometry(),
      warriorArmL: buildWarriorLeftShieldArmGeometry(),

      // Mage
      mageUpperLeg: buildMageUpperLegGeometry(),
      mageLowerBoot: buildMageLowerBootGeometry(),
      mageTorso: buildMageRobeTorsoGeometry(),
      mageHead: buildMageHeadAndHatGeometry(),
      mageSparkles: buildHeroEyeSparklesGeometry(0.284, 0.289),
      mageArmR: buildMageRightStaffArmGeometry(),
      mageStaffRing: buildMageSunStaffRingGeometry(),
      mageStaffCrystal: magePrismCrystal,
      mageArmL: buildMageLeftArmGeometry(),

      // Rogue
      rogueUpperLeg: buildRogueUpperLegGeometry(),
      rogueLowerBoot: buildRogueLowerBootGeometry(),
      rogueTorso: buildRogueTunicTorsoGeometry(),
      rogueHead: buildRogueHoodHeadGeometry(),
      rogueEyes: buildRogueGlowingEyesGeometry(),
      rogueArmR: buildRogueDaggerArmGeometry(-1),
      rogueArmL: buildRogueDaggerArmGeometry(1),

      // Stone Gargoyle
      gargBody: buildGargoyleBaseBodyGeometry(),
      gargForearmL: buildGargoyleForearmGeometry(1),
      gargForearmR: buildGargoyleForearmGeometry(-1),
      gargHead: buildGargoyleHeadGeometry(),
      gargEyes: buildGargoyleEyesGeometry(),
      gargWingL: buildGargoyleWingGeometry(1),
      gargWingR: buildGargoyleWingGeometry(-1),
      gargFissures: buildGargoyleFissuresGeometry(),
      shatterChunk: buildShatterChunkGeometry()
    };

    geoms.heroHit.translate(0.0, 1.01, 0.0);
    geoms.heroHit.computeBoundingSphere();
    geoms.gargHit.translate(0.0, 0.79, 0.0);
    geoms.gargHit.computeBoundingSphere();
    geoms.actionRing.rotateX(-PI * 0.5);
    geoms.grappleLine.rotateX(PI * 0.5);
    geoms.grappleLine.translate(0.0, 0.0, 0.5); // Origin at start -> +Z length 1.0

    var mats = {
      heroFigurines: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        roughness: 0.64,
        metalness: 0.04,
        bumpMap: texMaps.bronzeBump || null,
        bumpScale: 0.003,
        envMapIntensity: 0.22
      }),
      heroMetallic: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        roughness: 0.48,
        metalness: 0.12,
        bumpMap: texMaps.bronzeBump || null,
        bumpScale: 0.006,
        envMapIntensity: 0.24
      }),
      eyeSparkle: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true
      }),
      sunCrystal: new THREE.MeshStandardMaterial({
        color: 0x82F6FF,
        emissive: 0x26C4FF,
        emissiveIntensity: 0.95,
        roughness: 0.14,
        metalness: 0.12,
        envMapIntensity: 0.75
      }),
      arcaneMote: new THREE.MeshBasicMaterial({
        color: 0xFFF29E,
        transparent: true,
        opacity: 0.90,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }),
      gargStone: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        emissive: 0x1A1714,
        emissiveIntensity: 0.10,
        roughness: 0.84,
        metalness: 0.03,
        bumpMap: texMaps.cliffBump || null,
        bumpScale: 0.006,
        envMapIntensity: 0.26
      }),
      gargFissure: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
        toneMapped: false
      }),
      contactShadow: new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }),
      chevronGold: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        emissive: 0xFFA81E,
        emissiveIntensity: 0.42,
        roughness: 0.26,
        metalness: 0.55,
        envMapIntensity: 0.85
      }),
      grappleBrass: new THREE.MeshBasicMaterial({
        color: 0xF0C265
      }),
      intentArrowMat: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
        toneMapped: false
      }),
      intentTargetMat: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }),
      timeCrystalMat: new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        emissive: 0x1BA8FF,
        emissiveIntensity: 0.65,
        roughness: 0.12,
        metalness: 0.18,
        transparent: true,
        opacity: 0.68,
        depthWrite: false
      }),
      astralBeamMat: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }),
      astralSigilMat: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }),
      cyanMoteMat: new THREE.MeshBasicMaterial({
        color: 0x7EF9FF,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }),
      ambushSlashMat: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }),
      sunBurstDomeMat: new THREE.MeshBasicMaterial({
        color: 0xFFE47A,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false
      }),
      hitProxy: new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        colorWrite: false
      })
    };

    return { geoms: geoms, mats: mats, contactShadowTex: contactShadowTex };
  }

  function buildHeroVariantSubRig(type, G, M) {
    var rig = new THREE.Group();
    rig.name = 'HeroModel_' + type;
    // Chunkier Ankama Toy-Box Proportions (`1.24x X/Z, 1.16x Y` around boot sole Y = 0.0000m -> 0 drift!)
    rig.scale.set(HERO_SCALE_XZ, HERO_SCALE_Y, HERO_SCALE_XZ);

    var hipY = (type === 'mage') ? 0.40 : 0.42;
    var kneeOffset = (type === 'mage') ? -0.20 : -0.20;
    var hipX = (type === 'warrior') ? 0.135 : ((type === 'mage') ? 0.115 : 0.125);

    var uLegGeo = (type === 'warrior') ? G.warriorUpperLeg : ((type === 'mage') ? G.mageUpperLeg : G.rogueUpperLeg);
    var lBootGeo = (type === 'warrior') ? G.warriorLowerBoot : ((type === 'mage') ? G.mageLowerBoot : G.rogueLowerBoot);
    var torsoGeo = (type === 'warrior') ? G.warriorTorso : ((type === 'mage') ? G.mageTorso : G.rogueTorso);
    var headGeo = (type === 'warrior') ? G.warriorHead : ((type === 'mage') ? G.mageHead : G.rogueHead);
    var armRGeo = (type === 'warrior') ? G.warriorArmR : ((type === 'mage') ? G.mageArmR : G.rogueArmR);
    var armLGeo = (type === 'warrior') ? G.warriorArmL : ((type === 'mage') ? G.mageArmL : G.rogueArmL);

    var hipL = new THREE.Group();
    hipL.position.set(hipX, hipY, 0.0);
    var uLegMeshL = new THREE.Mesh(uLegGeo, M.heroFigurines);
    uLegMeshL.castShadow = true;
    uLegMeshL.receiveShadow = true;
    hipL.add(uLegMeshL);

    var kneeL = new THREE.Group();
    kneeL.position.set(0.0, kneeOffset, 0.0);
    var bootMeshL = new THREE.Mesh(lBootGeo, M.heroFigurines);
    bootMeshL.castShadow = true;
    bootMeshL.receiveShadow = true;
    kneeL.add(bootMeshL);
    hipL.add(kneeL);
    rig.add(hipL);

    var hipR = new THREE.Group();
    hipR.position.set(-hipX, hipY, 0.0);
    var uLegMeshR = new THREE.Mesh(uLegGeo, M.heroFigurines);
    uLegMeshR.castShadow = true;
    uLegMeshR.receiveShadow = true;
    hipR.add(uLegMeshR);

    var kneeR = new THREE.Group();
    kneeR.position.set(0.0, kneeOffset, 0.0);
    var bootMeshR = new THREE.Mesh(lBootGeo, M.heroFigurines);
    bootMeshR.castShadow = true;
    bootMeshR.receiveShadow = true;
    kneeR.add(bootMeshR);
    hipR.add(kneeR);
    rig.add(hipR);

    // Waist / Upper Body Pivot (breathes & pitches during actions while feet stay planted!)
    var waistPivot = new THREE.Group();
    waistPivot.position.set(0.0, 0.40, 0.0);
    var torsoMat = (type === 'warrior') ? M.heroMetallic : M.heroFigurines;
    var torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    waistPivot.add(torsoMesh);

    var headPivot = new THREE.Group();
    headPivot.position.set(0.0, (type === 'mage' || type === 'rogue') ? 0.46 : 0.48, 0.0);
    // Slightly fuller Ankama chibi head (`1.06x`) for irresistible toy-miniature charm!
    headPivot.scale.set(1.06, 1.05, 1.06);
    var headMesh = new THREE.Mesh(headGeo, M.heroFigurines);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headPivot.add(headMesh);

    if (type === 'rogue') {
      var rEyes = new THREE.Mesh(G.rogueEyes, M.eyeSparkle);
      headPivot.add(rEyes);
    } else {
      var spk = new THREE.Mesh(type === 'warrior' ? G.warriorSparkles : G.mageSparkles, M.eyeSparkle);
      headPivot.add(spk);
    }
    waistPivot.add(headPivot);

    var armY = (type === 'warrior') ? 0.38 : 0.36;
    var armX = (type === 'warrior') ? 0.28 : ((type === 'mage') ? 0.265 : 0.255);

    var shoulderR = new THREE.Group();
    shoulderR.position.set(-armX, armY, (type === 'mage') ? 0.02 : 0.0);
    var armMeshR = new THREE.Mesh(armRGeo, type === 'warrior' ? M.heroMetallic : M.heroFigurines);
    armMeshR.castShadow = true;
    armMeshR.receiveShadow = true;
    shoulderR.add(armMeshR);

    var staffRingMesh = null;
    var staffCrystalMesh = null;
    if (type === 'mage') {
      // Coaxially mounted at the top of the outward-and-forward tilted Sun-Staff (`0` hat-brim intersection!)
      var staffTopGroup = new THREE.Group();
      staffTopGroup.position.set(-0.351, 0.754, 0.472);
      staffTopGroup.rotation.set(0.20, 0.0, 0.16, 'ZYX');

      staffRingMesh = new THREE.Mesh(G.mageStaffRing, M.chevronGold);
      staffRingMesh.castShadow = true;
      staffTopGroup.add(staffRingMesh);

      staffCrystalMesh = new THREE.Mesh(G.mageStaffCrystal, M.sunCrystal);
      staffTopGroup.add(staffCrystalMesh);
      shoulderR.add(staffTopGroup);
    }
    waistPivot.add(shoulderR);

    var shoulderL = new THREE.Group();
    shoulderL.position.set(armX, armY, 0.0);
    var armMeshL = new THREE.Mesh(armLGeo, type === 'warrior' ? M.heroMetallic : M.heroFigurines);
    armMeshL.castShadow = true;
    armMeshL.receiveShadow = true;
    shoulderL.add(armMeshL);

    var palmOrbMesh = null;
    if (type === 'mage') {
      palmOrbMesh = new THREE.Mesh(G.arcaneOrb, M.arcaneMote);
      palmOrbMesh.scale.set(0.55, 0.55, 0.55);
      palmOrbMesh.position.set(0.11, -0.14, 0.24);
      shoulderL.add(palmOrbMesh);
    }
    waistPivot.add(shoulderL);

    rig.add(waistPivot);

    return {
      group: rig,
      hipL: hipL,
      hipR: hipR,
      kneeL: kneeL,
      kneeR: kneeR,
      waist: waistPivot,
      head: headPivot,
      shoulderR: shoulderR,
      shoulderL: shoulderL,
      staffRing: staffRingMesh,
      staffCrystal: staffCrystalMesh,
      palmOrb: palmOrbMesh
    };
  }

  function createHeroSlot(slotIdx, G, M) {
    var root = new THREE.Group();
    root.name = 'HeroSlot_' + slotIdx;
    root.visible = false;

    // 0. Dark-Umber Radial Contact AO Shadow Disc (`Y = 0.008m`, `r = 0.68m`, `NormalBlending`)
    var shadowMesh = new THREE.Mesh(G.contactShadow, M.contactShadow);
    shadowMesh.position.y = 0.008;
    shadowMesh.scale.set(0.68, 1.0, 0.68);
    shadowMesh.renderOrder = 3;
    root.add(shadowMesh);

    // 1. Contrast-Rimmed Glowing Cyan (`#00F0FF` + `#084A57` collar) Tile Base Outline (`Y = 0.022m`)
    var outlineGroup = new THREE.Group();
    outlineGroup.position.y = 0.022;

    var coreMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    var haloMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    var coreMesh = new THREE.Mesh(G.heroOutlineCore, coreMat);
    coreMesh.renderOrder = 7;
    var haloMesh = new THREE.Mesh(G.heroOutlineHalo, haloMat);
    haloMesh.position.y = -0.002;
    haloMesh.renderOrder = 6;

    outlineGroup.add(haloMesh);
    outlineGroup.add(coreMesh);
    root.add(outlineGroup);

    // 2. Character Articulated Pose Group (rotates with `facingYaw` + hop squash/stretch)
    var poseGroup = new THREE.Group();
    root.add(poseGroup);

    var variants = {
      warrior: buildHeroVariantSubRig('warrior', G, M),
      mage: buildHeroVariantSubRig('mage', G, M),
      rogue: buildHeroVariantSubRig('rogue', G, M)
    };
    poseGroup.add(variants.warrior.group);
    poseGroup.add(variants.mage.group);
    poseGroup.add(variants.rogue.group);

    // 3. Action VFX meshes (Warrior/Mage golden pulse ring, Mage cast bolt, Rogue grapple line)
    var actionRingMat = new THREE.MeshBasicMaterial({
      color: 0xFFE27A,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var actionRingMesh = new THREE.Mesh(G.actionRing, actionRingMat);
    actionRingMesh.position.y = 0.06;
    actionRingMesh.visible = false;
    actionRingMesh.renderOrder = 8;
    root.add(actionRingMesh);

    var castBoltMesh = new THREE.Mesh(G.arcaneOrb, M.arcaneMote);
    castBoltMesh.visible = false;
    castBoltMesh.renderOrder = 9;
    root.add(castBoltMesh);

    var grappleMesh = new THREE.Mesh(G.grappleLine, M.grappleBrass);
    grappleMesh.visible = false;
    root.add(grappleMesh);

    // 4. Invisible Interactive Raycast Hitbox
    var hitMesh = new THREE.Mesh(G.heroHit, M.hitProxy);
    hitMesh.userData = { pickType: 'hero', unitId: null, id: null, col: 0, row: 0 };
    root.add(hitMesh);

    return {
      isHero: true,
      slotIdx: slotIdx,
      id: null,
      type: 'warrior',
      col: 0,
      row: 0,
      defeated: false,
      x: 0.0,
      y: 0.0,
      z: 0.0,
      prevX: 0.0,
      prevZ: 0.0,
      radius: 0.40,
      height: 1.94,
      minLocalY: 0.0,
      facing: 1,
      yaw: PI * 0.5,
      targetYaw: PI * 0.5,
      stridePhase: 0.0,
      legSwingAmp: 0.0,
      hopAnim: null,
      glideAnim: null,
      actionAnim: null,
      root: root,
      shadowMesh: shadowMesh,
      poseGroup: poseGroup,
      outlineGroup: outlineGroup,
      outlineCoreMat: coreMat,
      outlineHaloMat: haloMat,
      variants: variants,
      activeRig: variants.warrior,
      actionRingMesh: actionRingMesh,
      actionRingMat: actionRingMat,
      castBoltMesh: castBoltMesh,
      grappleMesh: grappleMesh,
      hitMesh: hitMesh
    };
  }

  function createGargoyleSlot(slotIdx, G, M) {
    var root = new THREE.Group();
    root.name = 'GargoyleSlot_' + slotIdx;
    root.visible = false;

    // 0. Dark-Umber Radial Contact AO Shadow Disc (`Y = 0.008m`, `r = 0.84m`, `NormalBlending`)
    var shadowMesh = new THREE.Mesh(G.contactShadow, M.contactShadow);
    shadowMesh.position.y = 0.008;
    shadowMesh.scale.set(0.84, 1.0, 0.82);
    shadowMesh.renderOrder = 3;
    root.add(shadowMesh);

    // 1. Contrast-Rimmed Glowing Magenta (`#FF26D4` + `#4D083B` collar) Tile Base Outline (`Y = 0.022m`)
    var outlineGroup = new THREE.Group();
    outlineGroup.position.y = 0.022;

    var coreMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    var haloMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    var coreMesh = new THREE.Mesh(G.gargOutlineCore, coreMat);
    coreMesh.renderOrder = 7;
    var haloMesh = new THREE.Mesh(G.gargOutlineHalo, haloMat);
    haloMesh.position.y = -0.002;
    haloMesh.renderOrder = 6;
    outlineGroup.add(haloMesh);
    outlineGroup.add(coreMesh);
    root.add(outlineGroup);

    // 2. Gargoyle Statue Articulated Rig (`1.20x X/Z, 1.08x Y` around Y = 0.000m!)
    var poseGroup = new THREE.Group();
    root.add(poseGroup);

    var statueGroup = new THREE.Group();
    statueGroup.scale.set(GARGOYLE_SCALE_XZ, GARGOYLE_SCALE_Y, GARGOYLE_SCALE_XZ);
    poseGroup.add(statueGroup);

    var bodyMesh = new THREE.Mesh(G.gargBody, M.gargStone);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    statueGroup.add(bodyMesh);

    var forearmL = new THREE.Group();
    forearmL.position.set(0.32, 0.66, 0.08);
    var faMeshL = new THREE.Mesh(G.gargForearmL, M.gargStone);
    faMeshL.castShadow = true;
    faMeshL.receiveShadow = true;
    forearmL.add(faMeshL);
    statueGroup.add(forearmL);

    var forearmR = new THREE.Group();
    forearmR.position.set(-0.32, 0.66, 0.08);
    var faMeshR = new THREE.Mesh(G.gargForearmR, M.gargStone);
    faMeshR.castShadow = true;
    faMeshR.receiveShadow = true;
    forearmR.add(faMeshR);
    statueGroup.add(forearmR);

    var headPivot = new THREE.Group();
    headPivot.position.set(0.0, 0.78, 0.17);
    var headMesh = new THREE.Mesh(G.gargHead, M.gargStone);
    headMesh.castShadow = true;
    headMesh.receiveShadow = true;
    headPivot.add(headMesh);

    // Per-slot eye material: warm dark recessed carved stone (`0x2B2824`, roughness `0.92`) when sleeping!
    var eyeMat = new THREE.MeshStandardMaterial({
      color: 0x2B2824,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.92,
      metalness: 0.02
    });
    var eyeMesh = new THREE.Mesh(G.gargEyes, eyeMat);
    headPivot.add(eyeMesh);
    statueGroup.add(headPivot);

    // Articulated Left & Right Carved Stone Bat-Wings
    var wingL = new THREE.Group();
    wingL.position.set(0.19, 0.72, -0.08);
    var wingMeshL = new THREE.Mesh(G.gargWingL, M.gargStone);
    wingMeshL.castShadow = true;
    wingMeshL.receiveShadow = true;
    wingL.add(wingMeshL);
    statueGroup.add(wingL);

    var wingR = new THREE.Group();
    wingR.position.set(-0.19, 0.72, -0.08);
    var wingMeshR = new THREE.Mesh(G.gargWingR, M.gargStone);
    wingMeshR.castShadow = true;
    wingMeshR.receiveShadow = true;
    wingR.add(wingMeshR);
    statueGroup.add(wingR);

    // Blazing Golden Sunstruck Fissure Veins (`visible = true` when `g.sunstruck === true`)
    var fissureMesh = new THREE.Mesh(G.gargFissures, M.gargFissure);
    fissureMesh.visible = false;
    fissureMesh.renderOrder = 8;
    statueGroup.add(fissureMesh);

    // 3. Pre-Pooled Shatter Limestone Rubble Shards (0 runtime allocations!)
    var shatterGroup = new THREE.Group();
    shatterGroup.visible = false;
    var shards = [];
    for (var s = 0; s < SHARDS_PER_GARGOYLE; s++) {
      var sm = new THREE.Mesh(G.shatterChunk, s % 4 === 0 ? M.gargFissure : M.gargStone);
      sm.castShadow = true;
      shatterGroup.add(sm);
      var ang = (s / SHARDS_PER_GARGOYLE) * TWO_PI + (s % 3) * 0.25;
      var spd = 2.1 + (s % 5) * 0.55;
      shards.push({
        mesh: sm,
        vx: Math.cos(ang) * spd,
        vy: 2.6 + (s % 4) * 0.85,
        vz: Math.sin(ang) * spd,
        y0: 0.25 + (s % 3) * 0.28,
        rx: (s % 2 === 0 ? 1 : -1) * (4.0 + s * 0.5),
        rz: (s % 3 === 0 ? -1 : 1) * (3.5 + s * 0.4),
        baseScale: 0.65 + (s % 4) * 0.22
      });
    }
    root.add(shatterGroup);

    // 4. Invisible Interactive Raycast Hitbox
    var hitMesh = new THREE.Mesh(G.gargHit, M.hitProxy);
    hitMesh.userData = { pickType: 'gargoyle', unitId: null, id: null, col: 0, row: 0 };
    root.add(hitMesh);

    return {
      isHero: false,
      slotIdx: slotIdx,
      id: null,
      type: 'gargoyle',
      col: 0,
      row: 0,
      sleeping: true,
      awakened: false,
      sunstruck: false,
      defeated: false,
      x: 0.0,
      y: 0.0,
      z: 0.0,
      prevX: 0.0,
      prevZ: 0.0,
      radius: 0.45,
      height: 1.52,
      minLocalY: 0.0,
      facing: 2,
      yaw: 0.0,
      targetYaw: 0.0,
      awakeBlend: 0.0,
      stridePhase: 0.0,
      legSwingAmp: 0.0,
      hopAnim: null,
      glideAnim: null,
      defeatAnim: null,
      root: root,
      shadowMesh: shadowMesh,
      poseGroup: poseGroup,
      statueGroup: statueGroup,
      outlineGroup: outlineGroup,
      outlineCoreMat: coreMat,
      outlineHaloMat: haloMat,
      forearmL: forearmL,
      forearmR: forearmR,
      head: headPivot,
      eyeMat: eyeMat,
      wingL: wingL,
      wingR: wingR,
      fissureMesh: fissureMesh,
      shatterGroup: shatterGroup,
      shards: shards,
      hitMesh: hitMesh
    };
  }

  function createRogueVillainSlot(G, M) {
    var root = new THREE.Group();
    root.name = 'ShadowRogueVillain';
    root.visible = false;

    var shadowMesh = new THREE.Mesh(G.contactShadow, M.contactShadow);
    shadowMesh.position.y = 0.008;
    shadowMesh.scale.set(0.72, 1.0, 0.72);
    shadowMesh.renderOrder = 3;
    root.add(shadowMesh);

    // Vivid Crimson-Red Rounded-Square Base Outline (`#FF2442` + `#520814` collar)
    var outlineGroup = new THREE.Group();
    outlineGroup.position.y = 0.024;

    var coreMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    var haloMat = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });

    var coreMesh = new THREE.Mesh(G.rogueOutlineCore, coreMat);
    coreMesh.renderOrder = 7;
    var haloMesh = new THREE.Mesh(G.rogueOutlineHalo, haloMat);
    haloMesh.position.y = -0.002;
    haloMesh.renderOrder = 6;
    outlineGroup.add(haloMesh);
    outlineGroup.add(coreMesh);
    root.add(outlineGroup);

    var poseGroup = new THREE.Group();
    root.add(poseGroup);

    var rogueRig = buildHeroVariantSubRig('rogue', G, M);
    poseGroup.add(rogueRig.group);

    // 3D Faceted Time-Crystal Prison (`frozenSteps > 0`)
    var freezeGroup = new THREE.Group();
    freezeGroup.visible = false;

    var cageMat = M.timeCrystalMat.clone();
    var cageMesh = new THREE.Mesh(G.timeCrystalCage, cageMat);
    cageMesh.renderOrder = 10;
    freezeGroup.add(cageMesh);

    var astroRingLow = new THREE.Mesh(G.timeAstrolabeRing, M.chevronGold);
    astroRingLow.position.y = 0.56;
    freezeGroup.add(astroRingLow);

    var astroRingHigh = new THREE.Mesh(G.timeAstrolabeRing, M.chevronGold);
    astroRingHigh.position.y = 1.18;
    astroRingHigh.scale.set(0.84, 1.0, 0.84);
    freezeGroup.add(astroRingHigh);

    var freezeSigilMat = M.astralSigilMat.clone();
    var freezeSigil = new THREE.Mesh(G.astralSigil, freezeSigilMat);
    freezeSigil.position.y = 0.032;
    freezeSigil.scale.set(0.82, 1.0, 0.82);
    freezeSigil.renderOrder = 8;
    freezeGroup.add(freezeSigil);
    root.add(freezeGroup);

    // Pooled Crystal Thaw Shards (8 shards bursting when frozenSteps hits 0)
    var thawGroup = new THREE.Group();
    thawGroup.visible = false;
    var thawShards = [];
    for (var ts = 0; ts < 8; ts++) {
      var tMesh = new THREE.Mesh(G.arcaneOrb, M.cyanMoteMat);
      var tAng = (ts / 8) * TWO_PI;
      thawGroup.add(tMesh);
      thawShards.push({
        mesh: tMesh,
        vx: Math.cos(tAng) * 2.4,
        vy: 1.9 + (ts % 3) * 0.65,
        vz: Math.sin(tAng) * 2.4,
        y0: 0.45 + (ts % 2) * 0.35
      });
    }
    root.add(thawGroup);

    // Orbiting Golden Sun-Stars when `sunBlinded === true`
    var sunBlindGroup = new THREE.Group();
    sunBlindGroup.visible = false;
    var sunStars = [];
    for (var ss = 0; ss < 5; ss++) {
      var starMesh = new THREE.Mesh(G.sunStar, M.arcaneMote);
      starMesh.renderOrder = 11;
      sunBlindGroup.add(starMesh);
      sunStars.push(starMesh);
    }
    root.add(sunBlindGroup);

    // World-space 3D Hitman GO Next-Step Intention Arrow + Target Tile Danger Reticle
    var intentGroup = new THREE.Group();
    intentGroup.name = 'ShadowRogueIntention';
    intentGroup.visible = false;

    var intentArrowMat = M.intentArrowMat.clone();
    var intentArrowMesh = new THREE.Mesh(G.intentArrow, intentArrowMat);
    intentArrowMesh.renderOrder = 9;
    intentGroup.add(intentArrowMesh);

    var intentTargetMat = M.intentTargetMat.clone();
    var intentTargetMesh = new THREE.Mesh(G.intentTargetRing, intentTargetMat);
    intentTargetMesh.renderOrder = 8;
    intentGroup.add(intentTargetMesh);

    var hitMesh = new THREE.Mesh(G.heroHit, M.hitProxy);
    hitMesh.userData = { pickType: 'rogueVillain', unitId: 'rogue', id: 'rogue', col: 0, row: 0 };
    root.add(hitMesh);

    return {
      isHero: false,
      isRogueVillain: true,
      slotIdx: 0,
      id: 'rogue',
      type: 'rogue',
      col: 0,
      row: 0,
      facing: 3,
      frozenSteps: 0,
      prevFrozenSteps: 0,
      sunBlinded: false,
      banished: false,
      defeated: false,
      nextStep: null,
      x: 0.0,
      y: 0.0,
      z: 0.0,
      prevX: 0.0,
      prevZ: 0.0,
      radius: 0.40,
      height: 1.94,
      minLocalY: 0.0,
      yaw: -PI * 0.44,
      targetYaw: -PI * 0.44,
      stridePhase: 0.0,
      legSwingAmp: 0.0,
      hopAnim: null,
      glideAnim: null,
      thawAnim: null,
      banishAnim: null,
      ambushAnim: null,
      freezeScale: 0.0,
      root: root,
      shadowMesh: shadowMesh,
      poseGroup: poseGroup,
      outlineGroup: outlineGroup,
      outlineCoreMat: coreMat,
      outlineHaloMat: haloMat,
      activeRig: rogueRig,
      freezeGroup: freezeGroup,
      cageMat: cageMat,
      astroRingLow: astroRingLow,
      astroRingHigh: astroRingHigh,
      freezeSigil: freezeSigil,
      freezeSigilMat: freezeSigilMat,
      thawGroup: thawGroup,
      thawShards: thawShards,
      sunBlindGroup: sunBlindGroup,
      sunStars: sunStars,
      intentGroup: intentGroup,
      intentArrowMesh: intentArrowMesh,
      intentArrowMat: intentArrowMat,
      intentTargetMesh: intentTargetMesh,
      intentTargetMat: intentTargetMat,
      hitMesh: hitMesh
    };
  }

  function createAstralSummonGroup(G, M) {
    var root = new THREE.Group();
    root.name = 'MageAstralAidSummon';
    root.visible = false;

    var beamMat = M.astralBeamMat.clone();
    var beamMesh = new THREE.Mesh(G.astralPillar, beamMat);
    beamMesh.renderOrder = 9;
    root.add(beamMesh);

    var sigilMat = M.astralSigilMat.clone();
    var sigilMesh = new THREE.Mesh(G.astralSigil, sigilMat);
    sigilMesh.position.y = 0.038;
    sigilMesh.renderOrder = 8;
    root.add(sigilMesh);

    var magePose = new THREE.Group();
    var mageRig = buildHeroVariantSubRig('mage', G, M);
    magePose.add(mageRig.group);
    root.add(magePose);

    // 12 Spiraling Starlight-Frost Motes flying in a double helix from Mage's Sun-Staff to Rogue
    var motesGroup = new THREE.Group();
    var motes = [];
    for (var m = 0; m < 12; m++) {
      var moteMesh = new THREE.Mesh(
        m % 2 === 0 ? G.sunStar : G.arcaneOrb,
        m % 2 === 0 ? M.arcaneMote : M.cyanMoteMat
      );
      moteMesh.renderOrder = 12;
      motesGroup.add(moteMesh);
      motes.push(moteMesh);
    }

    var waveMat = new THREE.MeshBasicMaterial({
      color: 0x7EF9FF,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });
    var waveMesh = new THREE.Mesh(G.actionRing, waveMat);
    waveMesh.renderOrder = 10;
    motesGroup.add(waveMesh);

    return {
      root: root,
      motesGroup: motesGroup,
      beamMesh: beamMesh,
      beamMat: beamMat,
      sigilMesh: sigilMesh,
      sigilMat: sigilMat,
      magePose: magePose,
      mageRig: mageRig,
      motes: motes,
      waveMesh: waveMesh,
      waveMat: waveMat,
      anim: null
    };
  }

  function createSunBurstGroup(G, M) {
    var root = new THREE.Group();
    root.name = 'VictorySunBurst';
    root.visible = false;

    var domeMat = M.sunBurstDomeMat.clone();
    var domeMesh = new THREE.Mesh(G.sunBurstDome, domeMat);
    domeMesh.renderOrder = 11;
    root.add(domeMesh);

    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xFFE680,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });
    var ringMesh = new THREE.Mesh(G.actionRing, ringMat);
    ringMesh.position.y = 0.08;
    ringMesh.renderOrder = 11;
    root.add(ringMesh);

    var motes = [];
    for (var i = 0; i < 16; i++) {
      var mm = new THREE.Mesh(G.sunStar, M.arcaneMote);
      mm.renderOrder = 12;
      root.add(mm);
      var a = (i / 16) * TWO_PI;
      motes.push({
        mesh: mm,
        ang: a,
        rad: 0.7 + (i % 4) * 0.95,
        vy: 2.2 + (i % 3) * 1.15
      });
    }

    return {
      root: root,
      domeMesh: domeMesh,
      domeMat: domeMat,
      ringMesh: ringMesh,
      ringMat: ringMat,
      motes: motes,
      anim: null
    };
  }

  function createAmbushFxGroup(G, M) {
    var root = new THREE.Group();
    root.name = 'ShadowAmbushFx';
    root.visible = false;

    var slashMat = M.ambushSlashMat.clone();
    var slashMesh = new THREE.Mesh(G.ambushSlash, slashMat);
    slashMesh.renderOrder = 12;
    root.add(slashMesh);

    var ringMat = new THREE.MeshBasicMaterial({
      color: 0xFF2442,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });
    var ringMesh = new THREE.Mesh(G.actionRing, ringMat);
    ringMesh.position.y = 0.07;
    ringMesh.renderOrder = 11;
    root.add(ringMesh);

    return {
      root: root,
      slashMesh: slashMesh,
      slashMat: slashMat,
      ringMesh: ringMesh,
      ringMat: ringMat,
      anim: null
    };
  }

  // ============================================================================
  // 6. Grounding, Facing, Lifecycle, Animations & Audit Telemetry
  // ============================================================================

  function sampleGroundY(wx, wz) {
    var worldMod = window.GAME.World;
    if (worldMod && typeof worldMod.getHeightAt === 'function') {
      var h = worldMod.getHeightAt(wx, wz);
      if (typeof h === 'number' && isFinite(h)) {
        return h;
      }
    }
    return 0.0;
  }

  function computeOutlineLocalY(groundY) {
    // Keep the glowing 1.78m x 1.78m rounded-square border cleanly on the Y = 0.022m tile top rim
    // even if a unit stands in a shallow recessed channel (-0.36m..0.0m).
    if (groundY < 0.0 && groundY > -1.0) {
      return 0.022 - groundY;
    }
    return 0.022;
  }

  function heroFacingToYaw(facing, heroType) {
    // Local +Z is character front:
    // 0: N (-Z) -> PI, 1: E (+X) -> +PI/2, 2: S (+Z) -> 0, 3: W (-X) -> -PI/2
    // Isometric readability bias turns Mage slightly toward the (+X,+Z) camera on `facing=1`
    // so her expressive sapphire chibi eyes shine clearly beneath her wizard hat brim!
    var f = ((facing | 0) % 4 + 4) % 4;
    if (f === 0) return heroType === 'mage' ? PI * 0.85 : PI * 0.94;
    if (f === 1) return heroType === 'mage' ? PI * 0.26 : PI * 0.42;
    if (f === 2) return PI * 0.07;
    return heroType === 'mage' ? -PI * 0.34 : -PI * 0.44;
  }

  function gargoyleFacingToYaw(facing) {
    // Stone Gargoyles are decorative directional statues; orienting their crouched
    // 3/4 front scowl toward the sunlit courtyard/viewer matches the Master Reference Image!
    var f = ((facing | 0) % 4 + 4) % 4;
    if (f === 0) return PI * 0.78;
    if (f === 1) return PI * 0.36;
    if (f === 2) return PI * 0.16;
    return PI * 0.24;
  }

  function rebuildPickables() {
    _pickables.length = 0;
    var i, u;
    for (i = 0; i < _activeHeroes.length; i++) {
      u = _activeHeroes[i];
      if (!u.defeated && u.root.visible) {
        u.hitMesh.userData.col = u.col;
        u.hitMesh.userData.row = u.row;
        u.hitMesh.userData.unitId = u.id;
        u.hitMesh.userData.id = u.id;
        _pickables.push(u.hitMesh);
      }
    }
    for (i = 0; i < _activeGargoyles.length; i++) {
      u = _activeGargoyles[i];
      if (!u.defeated && u.root.visible) {
        u.hitMesh.userData.col = u.col;
        u.hitMesh.userData.row = u.row;
        u.hitMesh.userData.unitId = u.id;
        u.hitMesh.userData.id = u.id;
        _pickables.push(u.hitMesh);
      }
    }
    if (_rogueSlot && !_rogueSlot.banished && _rogueSlot.root.visible) {
      _rogueSlot.hitMesh.userData.col = _rogueSlot.col;
      _rogueSlot.hitMesh.userData.row = _rogueSlot.row;
      _pickables.push(_rogueSlot.hitMesh);
    }
  }

  function buildGpuPrewarmGroup(assets) {
    var grp = new THREE.Group();
    grp.name = 'UnitsGpuPrewarm';
    grp.position.set(0.0, -0.25, 0.0);
    grp.scale.set(0.0005, 0.0005, 0.0005);

    var gKeys = Object.keys(assets.geoms);
    var mKeys = Object.keys(assets.mats);
    var lastMesh = null;

    for (var i = 0; i < gKeys.length; i++) {
      var geo = assets.geoms[gKeys[i]];
      var mat = assets.mats[mKeys[i % mKeys.length]];
      if (!geo || !mat) continue;
      var m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      grp.add(m);
      lastMesh = m;
    }

    // Ensure every material in assets.mats is also compiled on Frame 1
    for (var j = 0; j < mKeys.length; j++) {
      var extraMat = assets.mats[mKeys[j]];
      if (!extraMat) continue;
      var em = new THREE.Mesh(assets.geoms.arcaneOrb, extraMat);
      em.frustumCulled = false;
      grp.add(em);
      lastMesh = em;
    }

    if (lastMesh) {
      lastMesh.onAfterRender = function () {
        grp.visible = false;
        lastMesh.onAfterRender = function () {};
      };
    }
    return grp;
  }

  function init(scene) {
    if (!scene || typeof THREE === 'undefined') return;
    if (_initialized && _scene === scene) return;

    _scene = scene;
    _assets = buildCachedAssets();

    // Prevent ACES tone-mapping from washing out pure Cyan (#33F0FF) / Magenta (#FF33CC) outlines
    _rootGroup = new THREE.Group();
    _rootGroup.name = 'UnitsRoot';
    _scene.add(_rootGroup);

    _heroPool.length = 0;
    for (var h = 0; h < MAX_HERO_SLOTS; h++) {
      var hSlot = createHeroSlot(h, _assets.geoms, _assets.mats);
      if ('toneMapped' in hSlot.outlineCoreMat) hSlot.outlineCoreMat.toneMapped = false;
      if ('toneMapped' in hSlot.outlineHaloMat) hSlot.outlineHaloMat.toneMapped = false;
      if ('toneMapped' in hSlot.actionRingMat) hSlot.actionRingMat.toneMapped = false;
      _heroPool.push(hSlot);
      _rootGroup.add(hSlot.root);
    }

    _gargoylePool.length = 0;
    for (var g = 0; g < MAX_GARGOYLE_SLOTS; g++) {
      var gSlot = createGargoyleSlot(g, _assets.geoms, _assets.mats);
      if ('toneMapped' in gSlot.outlineCoreMat) gSlot.outlineCoreMat.toneMapped = false;
      if ('toneMapped' in gSlot.outlineHaloMat) gSlot.outlineHaloMat.toneMapped = false;
      _gargoylePool.push(gSlot);
      _rootGroup.add(gSlot.root);
    }

    _selectedChevron = new THREE.Mesh(_assets.geoms.chevron, _assets.mats.chevronGold);
    _selectedChevron.name = 'SelectedHeroChevron';
    _selectedChevron.visible = false;
    _selectedChevron.castShadow = false;
    _rootGroup.add(_selectedChevron);

    _rogueSlot = createRogueVillainSlot(_assets.geoms, _assets.mats);
    _rootGroup.add(_rogueSlot.root);
    _rootGroup.add(_rogueSlot.intentGroup);

    _astralSummon = createAstralSummonGroup(_assets.geoms, _assets.mats);
    _rootGroup.add(_astralSummon.root);
    _rootGroup.add(_astralSummon.motesGroup);

    _sunBurst = createSunBurstGroup(_assets.geoms, _assets.mats);
    _rootGroup.add(_sunBurst.root);

    _ambushFx = createAmbushFxGroup(_assets.geoms, _assets.mats);
    _rootGroup.add(_ambushFx.root);

    _prewarmGroup = buildGpuPrewarmGroup(_assets);
    _rootGroup.add(_prewarmGroup);

    _initialized = true;
  }

  function resetRogueSlotVisuals(slot) {
    if (!slot) return;
    slot.hopAnim = null;
    slot.glideAnim = null;
    slot.thawAnim = null;
    slot.banishAnim = null;
    slot.ambushAnim = null;
    slot.stridePhase = 0.0;
    slot.legSwingAmp = 0.0;
    slot.freezeScale = 0.0;
    slot.freezeGroup.visible = false;
    slot.thawGroup.visible = false;
    slot.sunBlindGroup.visible = false;
    slot.intentGroup.visible = false;
    slot.poseGroup.position.set(0.0, 0.0, 0.0);
    slot.poseGroup.scale.set(1.0, 1.0, 1.0);
    if (slot.shadowMesh) {
      slot.shadowMesh.visible = true;
      slot.shadowMesh.scale.set(0.72, 1.0, 0.72);
    }
  }

  function resetHeroSlotVisuals(slot) {
    slot.hopAnim = null;
    slot.glideAnim = null;
    slot.actionAnim = null;
    slot.stridePhase = 0.0;
    slot.legSwingAmp = 0.0;
    slot.actionRingMesh.visible = false;
    slot.castBoltMesh.visible = false;
    slot.grappleMesh.visible = false;
    if (slot.shadowMesh) {
      slot.shadowMesh.visible = true;
      slot.shadowMesh.scale.set(0.68, 1.0, 0.68);
    }
    slot.poseGroup.position.set(0.0, 0.0, 0.0);
    slot.poseGroup.scale.set(1.0, 1.0, 1.0);
  }

  function resetGargoyleSlotVisuals(slot) {
    slot.hopAnim = null;
    slot.glideAnim = null;
    slot.defeatAnim = null;
    slot.stridePhase = 0.0;
    slot.legSwingAmp = 0.0;
    slot.statueGroup.visible = true;
    slot.statueGroup.scale.set(GARGOYLE_SCALE_XZ, GARGOYLE_SCALE_Y, GARGOYLE_SCALE_XZ);
    slot.statueGroup.position.set(0.0, 0.0, 0.0);
    slot.shatterGroup.visible = false;
    slot.fissureMesh.visible = false;
    if (slot.shadowMesh) {
      slot.shadowMesh.visible = true;
      slot.shadowMesh.scale.set(0.84, 1.0, 0.82);
    }
    slot.poseGroup.position.set(0.0, 0.0, 0.0);
    slot.poseGroup.scale.set(1.0, 1.0, 1.0);
  }

  function buildLevel(simState) {
    if (!_initialized && window.GAME.scene) {
      init(window.GAME.scene);
    }
    if (!_initialized || !simState) return;

    _activeHeroes.length = 0;
    _activeGargoyles.length = 0;
    _unitById = {};
    _pickables.length = 0;

    _auditMetrics.maxFootDriftM = 0.0;
    _auditMetrics.overlapPairs = 0;
    _auditMetrics.stoppedSkatingFrames = 0;

    var i;
    for (i = 0; i < _heroPool.length; i++) {
      resetHeroSlotVisuals(_heroPool[i]);
      _heroPool[i].root.visible = false;
      _heroPool[i].id = null;
    }
    for (i = 0; i < _gargoylePool.length; i++) {
      resetGargoyleSlotVisuals(_gargoylePool[i]);
      _gargoylePool[i].root.visible = false;
      _gargoylePool[i].id = null;
    }
    if (_rogueSlot) {
      resetRogueSlotVisuals(_rogueSlot);
      _rogueSlot.root.visible = false;
    }
    if (_astralSummon) {
      _astralSummon.anim = null;
      _astralSummon.root.visible = false;
      _astralSummon.motesGroup.visible = false;
    }
    if (_sunBurst) {
      _sunBurst.anim = null;
      _sunBurst.root.visible = false;
    }
    if (_ambushFx) {
      _ambushFx.anim = null;
      _ambushFx.root.visible = false;
    }

    var heroes = Array.isArray(simState.heroes) ? simState.heroes : [];
    for (i = 0; i < heroes.length && i < _heroPool.length; i++) {
      var hData = heroes[i];
      if (!hData) continue;
      var hSlot = _heroPool[i];
      var hType = (hData.type === 'mage' || hData.type === 'rogue') ? hData.type : 'warrior';

      hSlot.id = hData.id || hType;
      hSlot.type = hType;
      hSlot.col = hData.col | 0;
      hSlot.row = hData.row | 0;
      hSlot.defeated = false;
      hSlot.ambushed = Boolean(simState.ambushed || simState.defeated || hData.defeated);
      hSlot.celebrating = Boolean(simState.victory);
      hSlot.facing = (hData.facing !== undefined) ? hData.facing : 1;
      hSlot.yaw = heroFacingToYaw(hSlot.facing, hType);
      hSlot.targetYaw = hSlot.yaw;

      hSlot.variants.warrior.group.visible = (hType === 'warrior');
      hSlot.variants.mage.group.visible = (hType === 'mage');
      hSlot.variants.rogue.group.visible = (hType === 'rogue');
      hSlot.activeRig = hSlot.variants[hType];

      var hWp = gridToWorld(hSlot.col, hSlot.row);
      var hGy = sampleGroundY(hWp.x, hWp.z);
      if (hGy < -2.0) hGy = 0.0;

      hSlot.x = hSlot.prevX = hWp.x;
      hSlot.z = hSlot.prevZ = hWp.z;
      hSlot.y = hGy;

      hSlot.root.position.set(hSlot.x, hSlot.y, hSlot.z);
      hSlot.outlineGroup.position.y = computeOutlineLocalY(hSlot.y);
      hSlot.outlineGroup.visible = !hSlot.defeated;
      hSlot.poseGroup.rotation.set(0.0, hSlot.yaw, 0.0);
      hSlot.root.visible = !hSlot.defeated;

      hSlot.hitMesh.userData.pickType = 'hero';
      hSlot.hitMesh.userData.unitId = hSlot.id;
      hSlot.hitMesh.userData.id = hSlot.id;
      hSlot.hitMesh.userData.col = hSlot.col;
      hSlot.hitMesh.userData.row = hSlot.row;

      _activeHeroes.push(hSlot);
      _unitById[hSlot.id] = hSlot;
    }

    var gargoyles = Array.isArray(simState.gargoyles) ? simState.gargoyles : [];
    for (i = 0; i < gargoyles.length && i < _gargoylePool.length; i++) {
      var gData = gargoyles[i];
      if (!gData) continue;
      var gSlot = _gargoylePool[i];

      gSlot.id = gData.id || ('g' + (i + 1));
      gSlot.col = gData.col | 0;
      gSlot.row = gData.row | 0;
      gSlot.facing = (gData.facing !== undefined) ? gData.facing : 2;
      gSlot.yaw = gargoyleFacingToYaw(gSlot.facing);
      gSlot.targetYaw = gSlot.yaw;
      gSlot.sleeping = (gData.sleeping !== undefined) ? Boolean(gData.sleeping) : !gData.awakened;
      gSlot.awakened = Boolean(gData.awakened);
      gSlot.sunstruck = Boolean(gData.sunstruck);
      gSlot.defeated = Boolean(gData.defeated);
      gSlot.awakeBlend = (gSlot.awakened || gSlot.sunstruck) ? 1.0 : 0.0;

      var gWp = gridToWorld(gSlot.col, gSlot.row);
      var gGy = sampleGroundY(gWp.x, gWp.z);
      if (gGy < -2.0) gGy = 0.0;

      gSlot.x = gSlot.prevX = gWp.x;
      gSlot.z = gSlot.prevZ = gWp.z;
      gSlot.y = gGy;

      gSlot.root.position.set(gSlot.x, gSlot.y, gSlot.z);
      gSlot.outlineGroup.position.y = computeOutlineLocalY(gSlot.y);
      gSlot.outlineGroup.visible = !gSlot.defeated;
      gSlot.poseGroup.rotation.set(0.0, gSlot.yaw, 0.0);
      gSlot.root.visible = !gSlot.defeated;

      gSlot.hitMesh.userData.pickType = 'gargoyle';
      gSlot.hitMesh.userData.unitId = gSlot.id;
      gSlot.hitMesh.userData.id = gSlot.id;
      gSlot.hitMesh.userData.col = gSlot.col;
      gSlot.hitMesh.userData.row = gSlot.row;

      _activeGargoyles.push(gSlot);
      _unitById[gSlot.id] = gSlot;
    }

    // Shadow Rogue Villain Rig (`simState.rogue`)
    if (_rogueSlot && simState.rogue) {
      var rData = simState.rogue;
      _rogueSlot.id = rData.id || 'rogue';
      _rogueSlot.col = rData.col | 0;
      _rogueSlot.row = rData.row | 0;
      _rogueSlot.facing = (rData.facing !== undefined) ? rData.facing : 3;
      _rogueSlot.yaw = heroFacingToYaw(_rogueSlot.facing, 'rogue');
      _rogueSlot.targetYaw = _rogueSlot.yaw;
      _rogueSlot.frozenSteps = rData.frozenSteps | 0;
      _rogueSlot.prevFrozenSteps = _rogueSlot.frozenSteps;
      _rogueSlot.freezeScale = _rogueSlot.frozenSteps > 0 ? 1.0 : 0.0;
      _rogueSlot.sunBlinded = Boolean(rData.sunBlinded);
      _rogueSlot.banished = Boolean(rData.banished || simState.victory);
      _rogueSlot.nextStep = rData.nextStep ? { col: rData.nextStep.col | 0, row: rData.nextStep.row | 0 } : null;

      var rWp = gridToWorld(_rogueSlot.col, _rogueSlot.row);
      var rGy = sampleGroundY(rWp.x, rWp.z);
      if (rGy < -2.0) rGy = 0.0;
      _rogueSlot.x = _rogueSlot.prevX = rWp.x;
      _rogueSlot.z = _rogueSlot.prevZ = rWp.z;
      _rogueSlot.y = rGy;

      _rogueSlot.root.position.set(_rogueSlot.x, _rogueSlot.y, _rogueSlot.z);
      _rogueSlot.outlineGroup.position.y = computeOutlineLocalY(_rogueSlot.y);
      _rogueSlot.outlineGroup.visible = !_rogueSlot.banished;
      _rogueSlot.poseGroup.rotation.set(0.0, _rogueSlot.yaw, 0.0);
      _rogueSlot.root.visible = !_rogueSlot.banished;

      _rogueSlot.hitMesh.userData.pickType = 'rogueVillain';
      _rogueSlot.hitMesh.userData.unitId = 'rogue';
      _rogueSlot.hitMesh.userData.id = 'rogue';
      _rogueSlot.hitMesh.userData.col = _rogueSlot.col;
      _rogueSlot.hitMesh.userData.row = _rogueSlot.row;

      _unitById['rogue'] = _rogueSlot;
    }

    _selectedHeroId = simState.selectedHeroId || (_activeHeroes[0] ? _activeHeroes[0].id : null);
    rebuildPickables();
    update(1.0 / 60.0, _elapsedSec);
  }

  function syncFromState(simState) {
    if (!_initialized || !simState) return;

    _selectedHeroId = simState.selectedHeroId || _selectedHeroId;

    var heroes = Array.isArray(simState.heroes) ? simState.heroes : [];
    var i;
    for (i = 0; i < heroes.length; i++) {
      var hData = heroes[i];
      if (!hData) continue;
      var hSlot = _unitById[hData.id || hData.type];
      if (!hSlot || !hSlot.isHero) continue;

      hSlot.col = hData.col | 0;
      hSlot.row = hData.row | 0;
      hSlot.defeated = false;
      hSlot.ambushed = Boolean(simState.ambushed || simState.defeated || hData.defeated);
      hSlot.celebrating = Boolean(simState.victory);
      if (hData.facing !== undefined) {
        hSlot.facing = hData.facing;
        if (!hSlot.actionAnim) {
          hSlot.targetYaw = heroFacingToYaw(hSlot.facing, hSlot.type);
        }
      }

      hSlot.outlineGroup.visible = !hSlot.defeated;
      hSlot.root.visible = !hSlot.defeated;

      if (!hSlot.defeated && !hSlot.hopAnim && !(hSlot.actionAnim && hSlot.actionAnim.kind === 'rogueSwap')) {
        var hTarget = gridToWorld(hSlot.col, hSlot.row);
        var hDist = Math.hypot(hTarget.x - hSlot.x, hTarget.z - hSlot.z);
        if (hDist > 0.025) {
          if (hDist <= 9.5) {
            hSlot.glideAnim = {
              fromX: hSlot.x,
              fromZ: hSlot.z,
              toX: hTarget.x,
              toZ: hTarget.z,
              elapsed: 0.0,
              duration: 0.34
            };
          } else {
            hSlot.glideAnim = null;
            hSlot.x = hSlot.prevX = hTarget.x;
            hSlot.z = hSlot.prevZ = hTarget.z;
          }
        }
      }
    }

    var gargoyles = Array.isArray(simState.gargoyles) ? simState.gargoyles : [];
    for (i = 0; i < gargoyles.length; i++) {
      var gData = gargoyles[i];
      if (!gData) continue;
      var gSlot = _unitById[gData.id];
      if (!gSlot || gSlot.isHero) continue;

      gSlot.col = gData.col | 0;
      gSlot.row = gData.row | 0;
      if (gData.facing !== undefined) {
        gSlot.facing = gData.facing;
        gSlot.targetYaw = gargoyleFacingToYaw(gSlot.facing);
      }
      gSlot.sleeping = (gData.sleeping !== undefined) ? Boolean(gData.sleeping) : !gData.awakened;
      gSlot.awakened = Boolean(gData.awakened);
      gSlot.sunstruck = Boolean(gData.sunstruck);

      if (gData.defeated) {
        gSlot.defeated = true;
        gSlot.outlineGroup.visible = false;
        if (!gSlot.defeatAnim) {
          gSlot.root.visible = false;
        }
      } else {
        // Alive (including Undo after shatter/tumble!)
        if (gSlot.defeated || gSlot.defeatAnim) {
          resetGargoyleSlotVisuals(gSlot);
        }
        gSlot.defeated = false;
        gSlot.root.visible = true;
        gSlot.outlineGroup.visible = true;

        if (!gSlot.hopAnim) {
          var gTarget = gridToWorld(gSlot.col, gSlot.row);
          var gDist = Math.hypot(gTarget.x - gSlot.x, gTarget.z - gSlot.z);
          if (gDist > 0.025) {
            if (gDist <= 9.5) {
              gSlot.glideAnim = {
                fromX: gSlot.x,
                fromZ: gSlot.z,
                toX: gTarget.x,
                toZ: gTarget.z,
                elapsed: 0.0,
                duration: 0.34
              };
            } else {
              gSlot.glideAnim = null;
              gSlot.x = gSlot.prevX = gTarget.x;
              gSlot.z = gSlot.prevZ = gTarget.z;
            }
          }
        }
      }
    }

    // Sync Shadow Rogue Villain (`simState.rogue`)
    if (_rogueSlot && simState.rogue) {
      var rData = simState.rogue;
      var wasBanished = _rogueSlot.banished;
      var newFrozen = rData.frozenSteps | 0;

      // Trigger crystal shatter burst if Rogue just thawed (`prevFrozen > 0 && newFrozen === 0`)
      if (_rogueSlot.prevFrozenSteps > 0 && newFrozen === 0 && !simState.victory) {
        _rogueSlot.thawAnim = { elapsed: 0.0, duration: 0.48 };
      }
      _rogueSlot.prevFrozenSteps = newFrozen;
      _rogueSlot.frozenSteps = newFrozen;
      _rogueSlot.sunBlinded = Boolean(rData.sunBlinded);
      _rogueSlot.nextStep = rData.nextStep ? { col: rData.nextStep.col | 0, row: rData.nextStep.row | 0 } : null;

      _rogueSlot.col = rData.col | 0;
      _rogueSlot.row = rData.row | 0;
      if (rData.facing !== undefined) {
        _rogueSlot.facing = rData.facing;
        _rogueSlot.targetYaw = heroFacingToYaw(rData.facing, 'rogue');
      }

      var nowBanished = Boolean(rData.banished || simState.victory);
      if (nowBanished) {
        if (!wasBanished && !_rogueSlot.banishAnim) {
          _rogueSlot.banishAnim = { elapsed: 0.0, duration: 0.92 };
        }
        _rogueSlot.banished = true;
        _rogueSlot.outlineGroup.visible = false;
        _rogueSlot.intentGroup.visible = false;
      } else {
        // Alive / Restored via Undo!
        if (wasBanished || _rogueSlot.banishAnim) {
          resetRogueSlotVisuals(_rogueSlot);
          _rogueSlot.freezeScale = newFrozen > 0 ? 1.0 : 0.0;
        }
        _rogueSlot.banished = false;
        _rogueSlot.ambushAnim = simState.ambushed ? _rogueSlot.ambushAnim : null;
        _rogueSlot.root.visible = true;
        _rogueSlot.outlineGroup.visible = true;

        if (!_rogueSlot.hopAnim && !_rogueSlot.ambushAnim) {
          var rTarget = gridToWorld(_rogueSlot.col, _rogueSlot.row);
          var rDist = Math.hypot(rTarget.x - _rogueSlot.x, rTarget.z - _rogueSlot.z);
          if (rDist > 0.025) {
            if (rDist <= 9.5) {
              _rogueSlot.glideAnim = {
                fromX: _rogueSlot.x,
                fromZ: _rogueSlot.z,
                toX: rTarget.x,
                toZ: rTarget.z,
                elapsed: 0.0,
                duration: 0.32
              };
            } else {
              _rogueSlot.glideAnim = null;
              _rogueSlot.x = _rogueSlot.prevX = rTarget.x;
              _rogueSlot.z = _rogueSlot.prevZ = rTarget.z;
            }
          }
        }
      }
    }

    if (!simState.ambushed && _ambushFx) {
      _ambushFx.anim = null;
      _ambushFx.root.visible = false;
    }

    rebuildPickables();
  }

  function animateAstralAid(rogueWorldPos, onComplete) {
    if (!_initialized || !_astralSummon) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    var rx = (rogueWorldPos && typeof rogueWorldPos.x === 'number') ? rogueWorldPos.x : (_rogueSlot ? _rogueSlot.x : 0.0);
    var rz = (rogueWorldPos && typeof rogueWorldPos.z === 'number') ? rogueWorldPos.z : (_rogueSlot ? _rogueSlot.z : 0.0);
    var rGy = Math.max(0.0, sampleGroundY(rx, rz));

    // Summon Mage on an adjacent dramatic camera-side arc (`1.65m` offset, clamped inside courtyard)
    var offsetX = (rx > 3.5) ? -1.65 : 1.65;
    var offsetZ = (rz > 3.5) ? -1.15 : 1.15;
    var mx = clamp(rx + offsetX, -6.4, 6.4);
    var mz = clamp(rz + offsetZ, -6.4, 6.4);
    var mGy = Math.max(0.0, sampleGroundY(mx, mz));

    _astralSummon.root.visible = true;
    _astralSummon.motesGroup.visible = true;
    _astralSummon.root.position.set(mx, mGy, mz);
    _astralSummon.motesGroup.position.set(0.0, 0.0, 0.0);
    _astralSummon.anim = {
      mageX: mx,
      mageY: mGy,
      mageZ: mz,
      rogueX: rx,
      rogueY: rGy,
      rogueZ: rz,
      baseYaw: Math.atan2(rx - mx, rz - mz),
      elapsed: 0.0,
      duration: 1.08,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };

    if (_rogueSlot) {
      _rogueSlot.freezeScale = 0.05;
    }
  }

  function animateRogueAmbush(warriorWorldPos, onComplete) {
    if (!_initialized) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    var wx = (warriorWorldPos && typeof warriorWorldPos.x === 'number') ? warriorWorldPos.x : 0.0;
    var wz = (warriorWorldPos && typeof warriorWorldPos.z === 'number') ? warriorWorldPos.z : 0.0;
    var wGy = Math.max(0.0, sampleGroundY(wx, wz));

    if (_rogueSlot) {
      _rogueSlot.hopAnim = null;
      _rogueSlot.glideAnim = null;
      _rogueSlot.ambushAnim = {
        fromX: _rogueSlot.x,
        fromZ: _rogueSlot.z,
        toX: wx + 0.36,
        toZ: wz - 0.28,
        targetX: wx,
        targetZ: wz,
        elapsed: 0.0,
        duration: 0.44,
        onComplete: typeof onComplete === 'function' ? onComplete : null
      };
    }
    if (_ambushFx) {
      _ambushFx.root.visible = true;
      _ambushFx.root.position.set(wx, wGy, wz);
      _ambushFx.anim = { elapsed: 0.0, duration: 0.72 };
    }
  }

  function animateVictorySunBurst(centerWorldPos) {
    if (!_initialized || !_sunBurst) return;
    var cx = (centerWorldPos && typeof centerWorldPos.x === 'number') ? centerWorldPos.x : 0.0;
    var cz = (centerWorldPos && typeof centerWorldPos.z === 'number') ? centerWorldPos.z : 0.0;
    _sunBurst.root.visible = true;
    _sunBurst.root.position.set(cx, 0.05, cz);
    _sunBurst.anim = { elapsed: 0.0, duration: 1.35 };
    if (_rogueSlot && !_rogueSlot.banishAnim) {
      _rogueSlot.banished = true;
      _rogueSlot.banishAnim = { elapsed: 0.0, duration: 0.95 };
    }
  }

  function animateHop(unitId, pathWorldPoints, onComplete) {
    var u = _unitById[unitId];
    if (!u || !Array.isArray(pathWorldPoints) || pathWorldPoints.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    var waypoints = [{ x: u.x, z: u.z }];
    for (var i = 0; i < pathWorldPoints.length; i++) {
      var pt = pathWorldPoints[i];
      if (!pt) continue;
      var px = +pt.x || 0.0;
      var pz = +pt.z || 0.0;
      var prev = waypoints[waypoints.length - 1];
      if (Math.hypot(px - prev.x, pz - prev.z) > 0.02) {
        waypoints.push({ x: px, z: pz });
      }
    }

    if (waypoints.length < 2) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    u.glideAnim = null;
    u.hopAnim = {
      waypoints: waypoints,
      segIndex: 0,
      segElapsed: 0.0,
      segDuration: waypoints.length > 4 ? 0.135 : 0.175,
      hopHeight: 0.42,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };
  }

  function animateHeroAction(heroId, kind, targetWorldPos, onComplete) {
    var u = _unitById[heroId];
    if (!u || !u.isHero) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    var tx = (targetWorldPos && typeof targetWorldPos.x === 'number') ? targetWorldPos.x : u.x;
    var ty = (targetWorldPos && typeof targetWorldPos.y === 'number') ? targetWorldPos.y : 0.75;
    var tz = (targetWorldPos && typeof targetWorldPos.z === 'number') ? targetWorldPos.z : u.z;

    var dx = tx - u.x;
    var dz = tz - u.z;
    if (Math.hypot(dx, dz) > 0.08) {
      u.targetYaw = Math.atan2(dx, dz);
    }

    var actKind = kind || (u.type === 'mage' ? 'staffCast' : (u.type === 'rogue' ? 'rogueSwap' : 'swordCrank'));
    if (actKind === 'rogueSwap') {
      u.hopAnim = null;
      u.glideAnim = null;
    }

    u.actionAnim = {
      kind: actKind,
      startX: u.x,
      startZ: u.z,
      targetX: tx,
      targetY: ty,
      targetZ: tz,
      elapsed: 0.0,
      duration: actKind === 'rogueSwap' ? 0.40 : 0.46,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };
  }

  function animateGargoyleDefeat(gargoyleId, mode, dirVec, onComplete) {
    var g = _unitById[gargoyleId];
    if (!g || g.isHero) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    var defMode = (mode === 'tumble') ? 'tumble' : 'shatter';
    var dx = (dirVec && typeof dirVec.x === 'number') ? dirVec.x : 0.0;
    var dz = (dirVec && typeof dirVec.z === 'number') ? dirVec.z : 0.0;
    var dLen = Math.hypot(dx, dz);
    if (dLen > 1e-4) {
      dx /= dLen;
      dz /= dLen;
    } else {
      dx = 0.0;
      dz = 1.0;
    }

    var impactX = (dirVec && typeof dirVec.atX === 'number') ? dirVec.atX : g.x;
    var impactZ = (dirVec && typeof dirVec.atZ === 'number') ? dirVec.atZ : g.z;
    var leadDist = Math.hypot(impactX - g.x, impactZ - g.z);
    var leadDuration = (defMode === 'tumble' && leadDist > 0.15) ? 0.26 : 0.0;

    g.defeated = true;
    g.hopAnim = null;
    g.glideAnim = null;
    g.root.visible = true;
    g.outlineGroup.visible = false;
    g.statueGroup.visible = true;
    g.shatterGroup.visible = false;

    g.defeatAnim = {
      mode: defMode,
      fromX: g.x,
      fromZ: g.z,
      startX: impactX,
      startY: g.y,
      startZ: impactZ,
      leadDuration: leadDuration,
      dirX: dx,
      dirZ: dz,
      elapsed: 0.0,
      duration: (defMode === 'tumble' ? 0.68 : 0.66) + leadDuration,
      shatterBurstSpawned: false,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };

    rebuildPickables();
  }

  function updateHeroUnit(u, dt, elapsed) {
    var rig = u.activeRig;
    if (!rig) return;

    u.prevX = u.x;
    u.prevZ = u.z;

    var hopOffsetY = 0.0;
    var squashY = 1.0;
    var squashXZ = 1.0;
    var extraSpinYaw = 0.0;

    // 1. Parabolic Multi-Tile Hop Animation
    if (u.hopAnim) {
      var ha = u.hopAnim;
      ha.segElapsed += dt;
      var s = clamp(ha.segElapsed / ha.segDuration, 0.0, 1.0);
      var p0 = ha.waypoints[ha.segIndex];
      var p1 = ha.waypoints[ha.segIndex + 1];

      var nx = lerp(p0.x, p1.x, s);
      var nz = lerp(p0.z, p1.z, s);
      var segDx = p1.x - p0.x;
      var segDz = p1.z - p0.z;
      if (Math.hypot(segDx, segDz) > 0.01) {
        u.targetYaw = Math.atan2(segDx, segDz);
      }

      hopOffsetY = 4.0 * s * (1.0 - s) * ha.hopHeight;
      var stretch = Math.sin(s * PI) * 0.09;
      squashY = 1.0 + stretch;
      squashXZ = 1.0 - stretch * 0.45;

      // Swept obstacle collision resolution (STRICT parameter order: x, yFeet, z, radius, height)
      var worldMod = window.GAME.World;
      var curGy = sampleGroundY(nx, nz);
      if (worldMod && typeof worldMod.resolveHorizontal === 'function' && hopOffsetY < 0.30) {
        var res = worldMod.resolveHorizontal(nx, Math.max(0.0, curGy) + hopOffsetY, nz, u.radius, u.height);
        nx = res.x;
        nz = res.z;
      }

      u.x = nx;
      u.z = nz;

      if (s >= 1.0) {
        u.x = p1.x;
        u.z = p1.z;
        if (window.GAME.Contraptions && typeof window.GAME.Contraptions.spawnDustPuff === 'function') {
          var landGy = sampleGroundY(u.x, u.z);
          window.GAME.Contraptions.spawnDustPuff(u.x, Math.max(0.0, landGy) + 0.04, u.z);
        }
        ha.segIndex += 1;
        ha.segElapsed = 0.0;
        if (ha.segIndex >= ha.waypoints.length - 1) {
          var hopCb = ha.onComplete;
          u.hopAnim = null;
          hopOffsetY = 0.0;
          squashY = 1.0;
          squashXZ = 1.0;
          if (hopCb) hopCb();
        }
      }
    } else if (u.glideAnim) {
      // 2. Mechanical Row Slide / Ferry Glide (0.34s cubic ease-out)
      var ga = u.glideAnim;
      ga.elapsed += dt;
      var gu = clamp(ga.elapsed / ga.duration, 0.0, 1.0);
      var gEase = 1.0 - Math.pow(1.0 - gu, 3);
      u.x = lerp(ga.fromX, ga.toX, gEase);
      u.z = lerp(ga.fromZ, ga.toZ, gEase);
      if (gu >= 1.0) {
        u.x = ga.toX;
        u.z = ga.toZ;
        u.glideAnim = null;
      }
    }

    // 3. Post-collision horizontal displacement gait (0 skating when stopped!)
    var ds = Math.hypot(u.x - u.prevX, u.z - u.prevZ);
    var activelyStepping = Boolean(u.hopAnim) && ds > 0.0004;
    if (activelyStepping) {
      u.stridePhase += ds * 5.8;
      u.legSwingAmp = Math.min(1.0, u.legSwingAmp + dt * 14.0);
    } else {
      // Snap swing amplitude cleanly to 0 when stationary so stoppedSkatingFrames === 0!
      u.legSwingAmp = 0.0;
    }

    // Smooth shortest-arc yaw turn
    var yawDiff = shortestAngleDelta(u.yaw, u.targetYaw);
    u.yaw += yawDiff * Math.min(1.0, dt * 15.0);

    // Reset articulated joints to neutral grounded baseline before layering idle / action poses
    var strideSin = Math.sin(u.stridePhase);
    rig.hipL.rotation.set(strideSin * 0.58 * u.legSwingAmp, 0.0, 0.0);
    rig.hipR.rotation.set(-strideSin * 0.58 * u.legSwingAmp, 0.0, 0.0);
    rig.kneeL.rotation.set(Math.max(0.0, -strideSin) * 0.52 * u.legSwingAmp, 0.0, 0.0);
    rig.kneeR.rotation.set(Math.max(0.0, strideSin) * 0.52 * u.legSwingAmp, 0.0, 0.0);

    // Subtle upper-body toy-figurine breathing (waist up ONLY — boots stay 100% locked at Y = 0.000m!)
    var phaseSeed = u.slotIdx * 1.9;
    var breathe = Math.sin(elapsed * 2.5 + phaseSeed);
    rig.waist.position.y = 0.40 + (u.hopAnim ? 0.0 : breathe * 0.009);
    rig.waist.rotation.set(breathe * 0.022, 0.0, 0.0);
    rig.head.rotation.set(-breathe * 0.025, Math.sin(elapsed * 1.25 + phaseSeed) * 0.055, 0.0);

    rig.shoulderR.rotation.set(-strideSin * 0.45 * u.legSwingAmp + breathe * 0.03, 0.0, 0.0);
    rig.shoulderL.rotation.set(strideSin * 0.45 * u.legSwingAmp - breathe * 0.025, 0.0, 0.0);

    // Mage spinning Golden Sun-Staff halo & levitating palm arcane orb
    if (rig.staffRing) {
      rig.staffRing.rotation.z = elapsed * 1.45;
    }
    if (rig.staffCrystal) {
      rig.staffCrystal.rotation.y = -elapsed * 2.1;
      var cScale = 0.94 + 0.10 * Math.sin(elapsed * 4.2);
      rig.staffCrystal.scale.set(cScale, cScale, cScale);
    }
    if (rig.palmOrb) {
      var pScale = 0.48 + 0.12 * Math.sin(elapsed * 5.0 + 1.0);
      rig.palmOrb.scale.set(pScale, pScale, pScale);
      rig.palmOrb.rotation.y = elapsed * 2.6;
    }

    // 4. Class Signature Action Animations ('swordCrank' | 'staffCast' | 'rogueSwap')
    u.actionRingMesh.visible = false;
    u.castBoltMesh.visible = false;
    u.grappleMesh.visible = false;

    if (u.actionAnim) {
      var aa = u.actionAnim;
      aa.elapsed += dt;
      var au = clamp(aa.elapsed / aa.duration, 0.0, 1.0);

      if (aa.kind === 'swordCrank') {
        // Heroic wind-up (0..0.32) -> powerful broadsword & shield slam (0.32..0.72) -> settle
        var slashCurve = (au < 0.32)
          ? (-au / 0.32) * 0.65
          : Math.sin(((au - 0.32) / 0.68) * PI) * 1.25;
        rig.waist.rotation.x = slashCurve * 0.24;
        rig.waist.rotation.y = slashCurve * 0.32;
        rig.shoulderR.rotation.x = -slashCurve * 1.05;
        rig.shoulderL.rotation.x = -slashCurve * 0.48;

        u.actionRingMesh.visible = true;
        var ringS = 0.55 + au * 2.25;
        u.actionRingMesh.scale.set(ringS, ringS, 1.0);
        u.actionRingMat.opacity = (1.0 - au) * 0.85;
      } else if (aa.kind === 'staffCast') {
        // Astral Sun-Staff raise + rapid solar ring spin + golden arcane bolt to target mirror!
        var castLift = Math.sin(au * PI);
        hopOffsetY = Math.max(hopOffsetY, castLift * 0.14);
        rig.shoulderR.rotation.x = -castLift * 0.72;
        rig.shoulderL.rotation.x = -castLift * 0.55;
        if (rig.staffRing) {
          rig.staffRing.rotation.z += elapsed * 6.5;
        }

        u.actionRingMesh.visible = true;
        var mRingS = 0.5 + au * 2.0;
        u.actionRingMesh.scale.set(mRingS, mRingS, 1.0);
        u.actionRingMat.opacity = (1.0 - au) * 0.78;

        u.castBoltMesh.visible = true;
        var bx = lerp(0.0, aa.targetX - u.x, au);
        var bz = lerp(0.0, aa.targetZ - u.z, au);
        var by = lerp(1.35, aa.targetY, au) + Math.sin(au * PI) * 0.55;
        u.castBoltMesh.position.set(bx, by, bz);
        var bScale = 1.35 * (1.0 - au * 0.35);
        u.castBoltMesh.scale.set(bScale, bScale, bScale);
      } else if (aa.kind === 'rogueSwap') {
        // Grapple-line zip with acrobatic 360° spin!
        var zipEase = 1.0 - Math.pow(1.0 - au, 2.4);
        u.x = lerp(aa.startX, aa.targetX, zipEase);
        u.z = lerp(aa.startZ, aa.targetZ, zipEase);
        hopOffsetY = Math.sin(au * PI) * 0.54;
        extraSpinYaw = au * TWO_PI;
        rig.shoulderR.rotation.x = -0.75;
        rig.shoulderL.rotation.x = -0.95;

        var remDx = aa.targetX - u.x;
        var remDz = aa.targetZ - u.z;
        var remLen = Math.hypot(remDx, remDz);
        if (remLen > 0.12 && au < 0.85) {
          u.grappleMesh.visible = true;
          u.grappleMesh.position.set(0.0, 0.72, 0.0);
          u.grappleMesh.rotation.set(0.0, Math.atan2(remDx, remDz), 0.0);
          u.grappleMesh.scale.set(1.0, 1.0, remLen);
        }
      }

      if (aa.elapsed >= aa.duration) {
        var actCb = aa.onComplete;
        if (aa.kind === 'rogueSwap') {
          u.x = aa.targetX;
          u.z = aa.targetZ;
        }
        u.actionAnim = null;
        u.actionRingMesh.visible = false;
        u.castBoltMesh.visible = false;
        u.grappleMesh.visible = false;
        if (actCb) actCb();
      }
    } else if (u.ambushed) {
      // Dramatic Fallen Knight Kneel when ambushed by Shadow Rogue (rewindable via Undo!)
      rig.hipL.rotation.set(-0.92, 0.0, 0.0);
      rig.kneeL.rotation.set(1.18, 0.0, 0.0);
      rig.hipR.rotation.set(0.32, 0.0, 0.0);
      rig.kneeR.rotation.set(0.45, 0.0, 0.0);
      rig.waist.position.y = 0.24;
      rig.waist.rotation.set(0.34, 0.0, 0.0);
      rig.head.rotation.set(0.28, 0.0, 0.0);
      rig.shoulderR.rotation.set(0.35, 0.0, -0.25);
      rig.shoulderL.rotation.set(-0.55, 0.0, 0.18);
    } else if (u.celebrating) {
      // Heroic Broadsword-Raised Sanctuary Triumph Pose!
      var vicWave = Math.sin(elapsed * 5.0) * 0.08;
      rig.shoulderR.rotation.set(-2.35 + vicWave, 0.0, -0.18);
      rig.shoulderL.rotation.set(-0.62, 0.0, 0.18);
      rig.waist.rotation.set(-0.08, vicWave * 0.6, 0.0);
    }

    // 5. Exact Vertex-Verified Terrain Grounding & Cyan Rounded-Square Tile Outline Pulse
    var groundY = sampleGroundY(u.x, u.z);
    if (groundY < -2.5) groundY = 0.0;
    u.y = groundY;

    u.root.position.set(u.x, u.y, u.z);
    u.outlineGroup.position.y = computeOutlineLocalY(u.y);
    if (u.shadowMesh) {
      var shScale = 0.68 * Math.max(0.45, 1.0 - hopOffsetY * 0.42);
      u.shadowMesh.position.y = 0.008;
      u.shadowMesh.scale.set(shScale, 1.0, shScale);
      u.shadowMesh.visible = !u.defeated;
    }
    u.poseGroup.position.set(0.0, hopOffsetY, 0.0);
    u.poseGroup.rotation.set(0.0, u.yaw + extraSpinYaw, 0.0);
    u.poseGroup.scale.set(squashXZ, squashY, squashXZ);

    var isSelected = (u.id === _selectedHeroId);
    if (isSelected) {
      var selPulse = 0.5 + 0.5 * Math.sin(elapsed * 5.2);
      u.outlineCoreMat.opacity = 0.98 + 0.02 * selPulse;
      u.outlineHaloMat.opacity = 0.42 + 0.20 * selPulse;
      var oScale = 1.0 + 0.016 * selPulse;
      u.outlineGroup.scale.set(oScale, 1.0, oScale);
    } else {
      u.outlineCoreMat.opacity = 0.94;
      u.outlineHaloMat.opacity = 0.26 + 0.05 * Math.sin(elapsed * 2.8 + phaseSeed);
      u.outlineGroup.scale.set(1.0, 1.0, 1.0);
    }
  }

  function updateGargoyleUnit(g, dt, elapsed) {
    if (!g.root.visible) return;

    g.prevX = g.x;
    g.prevZ = g.z;

    // 1. Shatter or Cliff-Tumble Defeat Animation
    if (g.defeatAnim) {
      var da = g.defeatAnim;
      da.elapsed += dt;
      var leadDur = da.leadDuration || 0.0;
      if (da.mode === 'tumble' && leadDur > 0.0 && da.elapsed < leadDur) {
        var lu = clamp(da.elapsed / leadDur, 0.0, 1.0);
        var lEase = 1.0 - Math.pow(1.0 - lu, 2.5);
        g.x = lerp(da.fromX, da.startX, lEase);
        g.z = lerp(da.fromZ, da.startZ, lEase);
        g.root.position.set(g.x, da.startY, g.z);
        return;
      }
      if (g.shadowMesh) g.shadowMesh.visible = false;
      var effDur = Math.max(0.01, da.duration - leadDur);
      var du = clamp((da.elapsed - leadDur) / effDur, 0.0, 1.0);

      if (da.mode === 'tumble') {
        // Knockback arc over cliff edge into cloud chasm!
        var knockDist = du * 2.55;
        var wx = da.startX + da.dirX * knockDist;
        var wz = da.startZ + da.dirZ * knockDist;
        var wy = da.startY + (0.65 * du - 7.4 * du * du);

        g.x = wx;
        g.z = wz;
        g.root.position.set(wx, wy, wz);
        g.poseGroup.rotation.set(du * 5.2, g.yaw + du * 2.1, -du * 3.4);
        var tScale = du > 0.72 ? Math.max(0.01, 1.0 - (du - 0.72) / 0.28) : 1.0;
        g.poseGroup.scale.set(tScale, tScale, tScale);
      } else {
        // Mode === 'shatter': 0.00..0.22s solar-gold overload -> 0.22..1.00s 12-shard limestone burst!
        if (du < 0.22) {
          var pre = du / 0.22;
          g.statueGroup.visible = true;
          g.fissureMesh.visible = true;
          g.shatterGroup.visible = false;
          var swell = 1.0 + pre * 0.11;
          g.statueGroup.scale.set(GARGOYLE_SCALE_XZ * swell, GARGOYLE_SCALE_Y * swell, GARGOYLE_SCALE_XZ * swell);
          g.statueGroup.position.set(
            Math.sin(elapsed * 65.0) * 0.045,
            pre * 0.06,
            Math.cos(elapsed * 58.0) * 0.045
          );
          g.eyeMat.color.setHex(0xFFD426);
          g.eyeMat.emissive.setHex(0xFF9800);
          g.eyeMat.emissiveIntensity = 1.8;
        } else {
          var bt = (du - 0.22) / 0.78; // 0..1 shard trajectory
          var sec = bt * 0.52;
          g.statueGroup.visible = false;
          g.shatterGroup.visible = true;
          var shrink = Math.max(0.001, 1.0 - Math.pow(bt, 1.6));
          for (var si = 0; si < g.shards.length; si++) {
            var sh = g.shards[si];
            var sx = sh.vx * sec;
            var sz = sh.vz * sec;
            var sy = sh.y0 + sh.vy * sec - 9.2 * sec * sec;
            if (sy < 0.05) {
              sy = 0.05 + Math.abs(sy - 0.05) * 0.28;
            }
            sh.mesh.position.set(sx, sy, sz);
            sh.mesh.rotation.set(sec * sh.rx, sec * 3.0, sec * sh.rz);
            var sc = sh.baseScale * shrink;
            sh.mesh.scale.set(sc, sc, sc);
          }
        }
      }

      if (da.elapsed >= da.duration) {
        var defCb = da.onComplete;
        g.defeatAnim = null;
        g.shatterGroup.visible = false;
        g.root.visible = false;
        if (defCb) defCb();
      }
      return;
    }

    // 2. Mechanical Row Slide / Ferry Glide
    if (g.glideAnim) {
      var ga = g.glideAnim;
      ga.elapsed += dt;
      var gu = clamp(ga.elapsed / ga.duration, 0.0, 1.0);
      var gEase = 1.0 - Math.pow(1.0 - gu, 3);
      g.x = lerp(ga.fromX, ga.toX, gEase);
      g.z = lerp(ga.fromZ, ga.toZ, gEase);
      if (gu >= 1.0) {
        g.x = ga.toX;
        g.z = ga.toZ;
        g.glideAnim = null;
      }
    }

    var yawDiff = shortestAngleDelta(g.yaw, g.targetYaw);
    g.yaw += yawDiff * Math.min(1.0, dt * 10.0);

    // 3. Sleeping vs Awakened vs Sunstruck Pose & Emissive State Machine
    var targetAwake = (g.awakened || g.sunstruck || !g.sleeping) ? 1.0 : 0.0;
    g.awakeBlend += (targetAwake - g.awakeBlend) * Math.min(1.0, dt * 7.5);

    var gSeed = g.slotIdx * 2.1;
    var rumble = g.sunstruck ? Math.sin(elapsed * 38.0 + gSeed) * 0.018 : 0.0;
    var slowBreath = Math.sin(elapsed * (1.5 + g.awakeBlend * 1.4) + gSeed);

    // Head pose: tucked low when sleeping, raised menacingly when awakened/sunstruck
    var headPitch = lerp(0.16, -0.10, g.awakeBlend) + slowBreath * 0.025;
    var headYaw = g.awakeBlend * Math.sin(elapsed * 1.8 + gSeed) * 0.08;
    g.head.rotation.set(headPitch, headYaw, 0.0);

    // Bat-Wings pose: framing broad shoulders when sleeping, flared wide & arched high when awakened/sunstruck!
    var wingFoldY = lerp(0.24, -0.18, g.awakeBlend);
    var wingFlareZ = lerp(-0.08, 0.26, g.awakeBlend) + slowBreath * 0.03 * g.awakeBlend;
    var wingPitchX = lerp(0.06, -0.12, g.awakeBlend);
    g.wingL.rotation.set(wingPitchX, wingFoldY, wingFlareZ);
    g.wingR.rotation.set(wingPitchX, -wingFoldY, -wingFlareZ);

    // Forearms flex slightly outward when awakened
    var armFlex = g.awakeBlend * 0.10;
    g.forearmL.rotation.set(-armFlex, 0.0, armFlex * 0.5);
    g.forearmR.rotation.set(-armFlex, 0.0, -armFlex * 0.5);

    // Eyes & Solar Fissure Veins (dark recessed stone slits `#23262E` when sleeping!)
    if (g.sunstruck) {
      g.fissureMesh.visible = true;
      var sunPulse = 0.5 + 0.5 * Math.sin(elapsed * 10.0 + gSeed);
      g.eyeMat.color.setHex(0xFFD426);
      g.eyeMat.emissive.setHex(0xFF9800);
      g.eyeMat.emissiveIntensity = 1.15 + 0.45 * sunPulse;
      g.eyeMat.roughness = 0.35;
    } else if (g.awakeBlend > 0.35) {
      g.fissureMesh.visible = false;
      var awkPulse = 0.5 + 0.5 * Math.sin(elapsed * 4.5 + gSeed);
      g.eyeMat.color.setHex(0xFF7AE8);
      g.eyeMat.emissive.setHex(0xFF28B8);
      g.eyeMat.emissiveIntensity = (0.85 + 0.45 * awkPulse) * g.awakeBlend;
      g.eyeMat.roughness = 0.38;
    } else {
      g.fissureMesh.visible = false;
      g.eyeMat.color.setHex(0x2B2824);
      g.eyeMat.emissive.setHex(0x000000);
      g.eyeMat.emissiveIntensity = 0.0;
      g.eyeMat.roughness = 0.92;
    }

    // 4. Exact Terrain Grounding, Contact Shadow & Contrast-Rimmed Magenta (#FF26D4) Tile Outline
    var groundY = sampleGroundY(g.x, g.z);
    if (groundY < -2.5) groundY = 0.0;
    g.y = groundY;

    g.root.position.set(g.x + rumble, g.y, g.z);
    g.outlineGroup.position.set(-rumble, computeOutlineLocalY(g.y), 0.0);
    if (g.shadowMesh) {
      g.shadowMesh.visible = !g.defeated;
      g.shadowMesh.position.set(-rumble, 0.008, 0.0);
    }
    g.poseGroup.position.set(0.0, 0.0, 0.0);
    g.poseGroup.rotation.set(0.0, g.yaw, 0.0);
    g.poseGroup.scale.set(1.0, 1.0, 1.0);
    g.statueGroup.scale.set(GARGOYLE_SCALE_XZ, GARGOYLE_SCALE_Y, GARGOYLE_SCALE_XZ);

    var magPulse = 0.5 + 0.5 * Math.sin(elapsed * (g.sunstruck ? 8.5 : 3.4) + gSeed);
    g.outlineCoreMat.opacity = g.sunstruck ? 1.0 : (0.94 + 0.04 * magPulse);
    g.outlineHaloMat.opacity = g.sunstruck ? (0.55 + 0.22 * magPulse) : (0.30 + 0.08 * magPulse);
  }

  function updateAuditTelemetry() {
    var maxDrift = 0.0;
    var liveList = [];
    var i, u;

    for (i = 0; i < _activeHeroes.length; i++) {
      u = _activeHeroes[i];
      if (u.defeated || !u.root.visible) continue;
      liveList.push(u);

      if (!u.hopAnim && !u.actionAnim) {
        var hFootY = u.root.position.y + u.poseGroup.position.y + u.minLocalY;
        var hGy = sampleGroundY(u.x, u.z);
        if (hGy > -2.5) {
          var hDrift = Math.abs(hFootY - hGy);
          if (hDrift > maxDrift) maxDrift = hDrift;
        }
      }
      var ds = Math.hypot(u.x - u.prevX, u.z - u.prevZ);
      if (ds < 0.0005 && u.legSwingAmp > 0.05) {
        _auditMetrics.stoppedSkatingFrames += 1;
      }
    }

    for (i = 0; i < _activeGargoyles.length; i++) {
      u = _activeGargoyles[i];
      if (u.defeated || u.defeatAnim || !u.root.visible) continue;
      liveList.push(u);

      if (!u.hopAnim) {
        var gFootY = u.root.position.y + u.poseGroup.position.y + u.minLocalY;
        var gGy = sampleGroundY(u.x, u.z);
        if (gGy > -2.5) {
          var gDrift = Math.abs(gFootY - gGy);
          if (gDrift > maxDrift) maxDrift = gDrift;
        }
      }
    }

    var overlaps = 0;
    for (i = 0; i < liveList.length; i++) {
      for (var j = i + 1; j < liveList.length; j++) {
        var a = liveList[i];
        var b = liveList[j];
        var minSep = (a.radius + b.radius) * 0.85;
        if (Math.hypot(a.x - b.x, a.z - b.z) < minSep) {
          overlaps += 1;
        }
      }
    }

    _auditMetrics.maxFootDriftM = maxDrift;
    _auditMetrics.overlapPairs = overlaps;
  }

  function update(dt, elapsed) {
    if (!_initialized) return;
    var stepDt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.1) : (1.0 / 60.0);
    _elapsedSec = (typeof elapsed === 'number') ? elapsed : (_elapsedSec + stepDt);

    var i;
    var selectedHeroSlot = null;
    for (i = 0; i < _activeHeroes.length; i++) {
      var h = _activeHeroes[i];
      if (!h.defeated && h.root.visible) {
        updateHeroUnit(h, stepDt, _elapsedSec);
        if (h.id === _selectedHeroId) {
          selectedHeroSlot = h;
        }
      }
    }

    for (i = 0; i < _activeGargoyles.length; i++) {
      updateGargoyleUnit(_activeGargoyles[i], stepDt, _elapsedSec);
    }

    if (_rogueSlot) {
      updateRogueVillainUnit(_rogueSlot, stepDt, _elapsedSec);
    }
    updateAstralAndBurstEffects(stepDt, _elapsedSec);

    // Floating Golden Selection Chevron above currently selected Hero
    if (_selectedChevron) {
      if (selectedHeroSlot) {
        var topBaseY = (selectedHeroSlot.type === 'mage') ? 2.34 : 2.14;
        var bob = Math.sin(_elapsedSec * 4.4) * 0.065;
        _selectedChevron.visible = true;
        _selectedChevron.position.set(
          selectedHeroSlot.x,
          selectedHeroSlot.y + selectedHeroSlot.poseGroup.position.y + topBaseY + bob,
          selectedHeroSlot.z
        );
        _selectedChevron.rotation.y = _elapsedSec * 2.1;
      } else {
        _selectedChevron.visible = false;
      }
    }

    updateAuditTelemetry();
  }

  function updateRogueVillainUnit(r, dt, elapsed) {
    var rig = r.activeRig;
    if (!rig) return;

    // 1. Victory Sun-Burst Banishment Spin & Golden Dissolve
    if (r.banishAnim) {
      r.banishAnim.elapsed += dt;
      var bu = clamp(r.banishAnim.elapsed / r.banishAnim.duration, 0.0, 1.0);
      r.root.visible = true;
      r.outlineGroup.visible = false;
      r.intentGroup.visible = false;
      r.freezeGroup.visible = false;
      r.sunBlindGroup.visible = false;
      if (r.shadowMesh) r.shadowMesh.visible = false;

      var liftY = Math.pow(bu, 1.25) * 2.85;
      var shrink = Math.max(0.001, 1.0 - Math.pow(bu, 1.4));
      r.poseGroup.position.set(0.0, liftY, 0.0);
      r.poseGroup.rotation.set(-bu * 0.45, r.yaw + bu * TWO_PI * 2.5, 0.0);
      r.poseGroup.scale.set(shrink, shrink * (1.0 + bu * 0.55), shrink);
      rig.shoulderL.rotation.set(-1.5, 0.0, 0.3);
      rig.shoulderR.rotation.set(-1.5, 0.0, -0.3);

      if (bu >= 1.0) {
        r.banishAnim = null;
        r.root.visible = false;
      }
      return;
    }

    if (!r.root.visible) {
      r.intentGroup.visible = false;
      return;
    }

    r.prevX = r.x;
    r.prevZ = r.z;

    var hopOffsetY = 0.0;
    var squashY = 1.0;
    var squashXZ = 1.0;
    var extraSpinYaw = 0.0;

    if (r.ambushAnim) {
      var am = r.ambushAnim;
      am.elapsed += dt;
      var au = clamp(am.elapsed / am.duration, 0.0, 1.0);
      var aEase = 1.0 - Math.pow(1.0 - au, 2.6);
      r.x = lerp(am.fromX, am.toX, aEase);
      r.z = lerp(am.fromZ, am.toZ, aEase);
      hopOffsetY = Math.sin(au * PI) * 0.68;
      extraSpinYaw = au * TWO_PI;
      r.targetYaw = Math.atan2(am.targetX - r.x, am.targetZ - r.z);
      if (au >= 1.0) {
        var amCb = am.onComplete;
        r.ambushAnim = null;
        if (amCb) amCb();
      }
    } else if (r.hopAnim) {
      var ha = r.hopAnim;
      ha.segElapsed += dt;
      var s = clamp(ha.segElapsed / ha.segDuration, 0.0, 1.0);
      var p0 = ha.waypoints[ha.segIndex];
      var p1 = ha.waypoints[ha.segIndex + 1];
      r.x = lerp(p0.x, p1.x, s);
      r.z = lerp(p0.z, p1.z, s);
      var segDx = p1.x - p0.x;
      var segDz = p1.z - p0.z;
      if (Math.hypot(segDx, segDz) > 0.01) {
        r.targetYaw = Math.atan2(segDx, segDz);
      }
      hopOffsetY = 4.0 * s * (1.0 - s) * 0.44;
      var stretch = Math.sin(s * PI) * 0.10;
      squashY = 1.0 + stretch;
      squashXZ = 1.0 - stretch * 0.45;
      if (s >= 1.0) {
        r.x = p1.x;
        r.z = p1.z;
        ha.segIndex += 1;
        ha.segElapsed = 0.0;
        if (ha.segIndex >= ha.waypoints.length - 1) {
          var hopCb = ha.onComplete;
          r.hopAnim = null;
          hopOffsetY = 0.0;
          if (hopCb) hopCb();
        }
      }
    } else if (r.glideAnim) {
      var ga = r.glideAnim;
      ga.elapsed += dt;
      var gu = clamp(ga.elapsed / ga.duration, 0.0, 1.0);
      var gEase = 1.0 - Math.pow(1.0 - gu, 3);
      r.x = lerp(ga.fromX, ga.toX, gEase);
      r.z = lerp(ga.fromZ, ga.toZ, gEase);
      if (gu >= 1.0) {
        r.x = ga.toX;
        r.z = ga.toZ;
        r.glideAnim = null;
      }
    }

    var ds = Math.hypot(r.x - r.prevX, r.z - r.prevZ);
    if (r.hopAnim && ds > 0.0004) {
      r.stridePhase += ds * 6.2;
      r.legSwingAmp = Math.min(1.0, r.legSwingAmp + dt * 15.0);
    } else {
      r.legSwingAmp = 0.0;
    }

    // Aim Rogue toward his nextStep when hunting
    if (!r.hopAnim && !r.ambushAnim && r.nextStep) {
      var nWp = gridToWorld(r.nextStep.col, r.nextStep.row);
      var ndx = nWp.x - r.x;
      var ndz = nWp.z - r.z;
      if (Math.hypot(ndx, ndz) > 0.12) {
        r.targetYaw = Math.atan2(ndx, ndz);
      }
    }

    var yawDiff = shortestAngleDelta(r.yaw, r.targetYaw);
    r.yaw += yawDiff * Math.min(1.0, dt * 14.0);

    var strideSin = Math.sin(r.stridePhase);
    rig.hipL.rotation.set(strideSin * 0.62 * r.legSwingAmp, 0.0, 0.0);
    rig.hipR.rotation.set(-strideSin * 0.62 * r.legSwingAmp, 0.0, 0.0);
    rig.kneeL.rotation.set(Math.max(0.0, -strideSin) * 0.55 * r.legSwingAmp, 0.0, 0.0);
    rig.kneeR.rotation.set(Math.max(0.0, strideSin) * 0.55 * r.legSwingAmp, 0.0, 0.0);

    if (r.frozenSteps > 0) {
      // Frozen motionless inside the 3D Time-Crystal Prison!
      rig.waist.position.y = 0.40;
      rig.waist.rotation.set(-0.08, 0.0, 0.0);
      rig.head.rotation.set(-0.10, 0.0, 0.0);
      rig.shoulderR.rotation.set(-0.52, 0.0, -0.22);
      rig.shoulderL.rotation.set(-0.52, 0.0, 0.22);
    } else if (r.sunBlinded) {
      // Dazzled by golden sunbeam — raises both arms across hood!
      var dazzleSway = Math.sin(elapsed * 7.5) * 0.10;
      rig.waist.position.y = 0.40;
      rig.waist.rotation.set(-0.14, dazzleSway, 0.0);
      rig.head.rotation.set(0.18, dazzleSway * 1.4, 0.0);
      rig.shoulderR.rotation.set(-1.42, -0.30, -0.15);
      rig.shoulderL.rotation.set(-1.48, 0.30, 0.15);
    } else {
      // Stealthy forward-leaning assassin prowl stance
      var prowl = Math.sin(elapsed * 3.1);
      rig.waist.position.y = 0.39 + (r.hopAnim ? 0.0 : prowl * 0.010);
      rig.waist.rotation.set(0.14 + prowl * 0.02, 0.0, 0.0);
      rig.head.rotation.set(-0.08, Math.sin(elapsed * 1.6) * 0.07, 0.0);
      rig.shoulderR.rotation.set(-0.32 - strideSin * 0.48 * r.legSwingAmp, 0.0, -0.12);
      rig.shoulderL.rotation.set(-0.28 + strideSin * 0.48 * r.legSwingAmp, 0.0, 0.12);
    }

    // 2. 3D Faceted Time-Crystal Prison (`frozenSteps > 0`) & Thaw Burst
    var targetFreeze = (r.frozenSteps > 0) ? 1.0 : 0.0;
    r.freezeScale += (targetFreeze - r.freezeScale) * Math.min(1.0, dt * 9.5);
    if (r.freezeScale > 0.02) {
      r.freezeGroup.visible = true;
      var fPulse = 1.0 + Math.sin(elapsed * (r.frozenSteps === 1 ? 9.5 : 4.2)) * 0.035;
      r.freezeGroup.scale.set(r.freezeScale * fPulse, r.freezeScale, r.freezeScale * fPulse);
      r.astroRingLow.rotation.y = elapsed * 1.85;
      r.astroRingHigh.rotation.y = -elapsed * 2.35;
      r.freezeSigil.rotation.y = elapsed * 1.1;
      r.cageMat.opacity = (r.frozenSteps === 1 ? (0.48 + 0.18 * Math.sin(elapsed * 11.0)) : 0.68) * r.freezeScale;
    } else {
      r.freezeGroup.visible = false;
    }

    if (r.thawAnim) {
      r.thawAnim.elapsed += dt;
      var tu = clamp(r.thawAnim.elapsed / r.thawAnim.duration, 0.0, 1.0);
      r.thawGroup.visible = true;
      var tSec = tu * 0.45;
      var tScale = Math.max(0.01, (1.0 - tu) * 1.15);
      for (var ti = 0; ti < r.thawShards.length; ti++) {
        var ts = r.thawShards[ti];
        ts.mesh.position.set(
          ts.vx * tSec,
          Math.max(0.06, ts.y0 + ts.vy * tSec - 8.5 * tSec * tSec),
          ts.vz * tSec
        );
        ts.mesh.rotation.set(elapsed * 5.0, elapsed * 4.0, 0.0);
        ts.mesh.scale.set(tScale, tScale, tScale);
      }
      if (tu >= 1.0) {
        r.thawAnim = null;
        r.thawGroup.visible = false;
      }
    } else {
      r.thawGroup.visible = false;
    }

    // 3. Orbiting Golden Sun-Stars (`sunBlinded === true`)
    if (r.sunBlinded && r.frozenSteps <= 0) {
      r.sunBlindGroup.visible = true;
      for (var si = 0; si < r.sunStars.length; si++) {
        var stAng = elapsed * 4.2 + (si / r.sunStars.length) * TWO_PI;
        var stMesh = r.sunStars[si];
        stMesh.position.set(
          Math.cos(stAng) * 0.46,
          1.76 + Math.sin(elapsed * 6.0 + si) * 0.06,
          Math.sin(stAng) * 0.46
        );
        stMesh.rotation.y = -stAng * 1.5;
        var sp = 0.85 + 0.25 * Math.sin(elapsed * 8.0 + si);
        stMesh.scale.set(sp, sp, sp);
      }
    } else {
      r.sunBlindGroup.visible = false;
    }

    // 4. Grounding & Vivid Pulsing Crimson Base Square
    var groundY = sampleGroundY(r.x, r.z);
    if (groundY < -2.5) groundY = 0.0;
    r.y = groundY;

    r.root.position.set(r.x, r.y, r.z);
    r.outlineGroup.position.y = computeOutlineLocalY(r.y);
    if (r.shadowMesh) {
      var shS = 0.72 * Math.max(0.45, 1.0 - hopOffsetY * 0.42);
      r.shadowMesh.position.y = 0.008;
      r.shadowMesh.scale.set(shS, 1.0, shS);
      r.shadowMesh.visible = true;
    }
    r.poseGroup.position.set(0.0, hopOffsetY, 0.0);
    r.poseGroup.rotation.set(0.0, r.yaw + extraSpinYaw, 0.0);
    r.poseGroup.scale.set(squashXZ, squashY, squashXZ);

    var crimPulse = 0.5 + 0.5 * Math.sin(elapsed * 5.4);
    r.outlineCoreMat.opacity = 0.96 + 0.04 * crimPulse;
    r.outlineHaloMat.opacity = (r.frozenSteps > 0 ? 0.18 : 0.42) + 0.22 * crimPulse;

    // 5. World-Space 3D Hitman GO Next-Step Intention Arrow + Target Tile Danger Reticle
    var showIntent = Boolean(r.nextStep && !r.banished && r.frozenSteps <= 0 && !r.sunBlinded && !r.ambushAnim);
    if (showIntent) {
      var nxtWp = gridToWorld(r.nextStep.col, r.nextStep.row);
      var nxtGy = sampleGroundY(nxtWp.x, nxtWp.z);
      if (nxtGy < -1.0) nxtGy = 0.0;
      var dirX = nxtWp.x - r.x;
      var dirZ = nxtWp.z - r.z;
      var dirLen = Math.hypot(dirX, dirZ);
      if (dirLen > 0.25) {
        r.intentGroup.visible = true;
        var arrowYaw = Math.atan2(dirX, dirZ);
        var slideCycle = (elapsed * 1.75) % 1.0;
        var arrowFrac = 0.44 + Math.sin(slideCycle * PI) * 0.16;
        var ax = lerp(r.x, nxtWp.x, arrowFrac);
        var az = lerp(r.z, nxtWp.z, arrowFrac);
        var ay = Math.max(0.0, r.y, nxtGy) + 0.045 + Math.sin(elapsed * 5.2) * 0.018;

        r.intentArrowMesh.position.set(ax, ay, az);
        r.intentArrowMesh.rotation.set(0.0, arrowYaw, 0.0);
        var aScale = 1.06 + 0.08 * crimPulse;
        r.intentArrowMesh.scale.set(aScale, aScale, aScale);
        r.intentArrowMat.opacity = 0.88 + 0.12 * crimPulse;

        r.intentTargetMesh.position.set(nxtWp.x, Math.max(0.0, nxtGy) + 0.028, nxtWp.z);
        var tPulse = 0.94 + 0.09 * crimPulse;
        r.intentTargetMesh.scale.set(tPulse, 1.0, tPulse);
        r.intentTargetMat.opacity = 0.58 + 0.30 * crimPulse;
      } else {
        r.intentGroup.visible = false;
      }
    } else {
      r.intentGroup.visible = false;
    }
  }

  function updateAstralAndBurstEffects(dt, elapsed) {
    // 1. Mage's "Astral Aid" Starlight Summon Choreography (`1.08s`)
    if (_astralSummon && _astralSummon.anim) {
      var sa = _astralSummon.anim;
      sa.elapsed += dt;
      var u = clamp(sa.elapsed / sa.duration, 0.0, 1.0);
      var rig = _astralSummon.mageRig;

      // Phase envelope: 0..0.24 descend, 0.24..0.72 hover & cast volley, 0.72..1.00 ascend & vanish
      var visAlpha = (u < 0.20) ? (u / 0.20) : ((u > 0.74) ? ((1.0 - u) / 0.26) : 1.0);
      var hoverY = (u < 0.24)
        ? lerp(2.6, 0.36, 1.0 - Math.pow(1.0 - u / 0.24, 2.5))
        : ((u < 0.74)
            ? (0.36 + Math.sin((u - 0.24) * PI * 2.0) * 0.08)
            : lerp(0.36, 2.8, Math.pow((u - 0.74) / 0.26, 2.2)));

      var spinYaw = (u < 0.24)
        ? sa.baseYaw + (1.0 - u / 0.24) * TWO_PI
        : ((u > 0.74) ? sa.baseYaw - ((u - 0.74) / 0.26) * TWO_PI : sa.baseYaw);

      var mScale = clamp(visAlpha * 1.08, 0.001, 1.08);
      _astralSummon.magePose.position.set(0.0, hoverY, 0.0);
      _astralSummon.magePose.rotation.set(0.0, spinYaw, 0.0);
      _astralSummon.magePose.scale.set(mScale, mScale, mScale);

      // Dramatic staff-raised casting pose + rapid solar halo spin
      rig.shoulderR.rotation.set(-1.18, 0.0, -0.15);
      rig.shoulderL.rotation.set(-0.92, 0.0, 0.22);
      if (rig.staffRing) rig.staffRing.rotation.z = elapsed * 10.5;
      if (rig.staffCrystal) rig.staffCrystal.rotation.y = -elapsed * 8.0;

      // Celestial Beam Pillar & Floor Sun-Rune Sigil
      var beamScaleXZ = 0.65 + 0.45 * Math.sin(u * PI);
      _astralSummon.beamMesh.scale.set(beamScaleXZ, 1.0, beamScaleXZ);
      _astralSummon.beamMat.opacity = visAlpha * 0.76;
      _astralSummon.sigilMesh.rotation.y = elapsed * 2.8;
      var sigScale = 0.55 + Math.sin(Math.min(1.0, u * 1.4) * PI * 0.5) * 0.68;
      _astralSummon.sigilMesh.scale.set(sigScale, 1.0, sigScale);
      _astralSummon.sigilMat.opacity = visAlpha * 0.92;

      // 12 Double-Helix Starlight-Frost Motes flying from Mage's Staff into Rogue (`u = 0.16..0.78`)
      var staffX = sa.mageX + Math.sin(sa.baseYaw) * 0.35;
      var staffY = sa.mageY + hoverY + 1.45;
      var staffZ = sa.mageZ + Math.cos(sa.baseYaw) * 0.35;

      for (var mi = 0; mi < _astralSummon.motes.length; mi++) {
        var mote = _astralSummon.motes[mi];
        var delay = (mi / _astralSummon.motes.length) * 0.28;
        var mu = clamp((u - 0.14 - delay) / 0.44, 0.0, 1.0);
        if (mu <= 0.0 || mu >= 1.0) {
          mote.visible = false;
        } else {
          mote.visible = true;
          var helixAng = mu * TWO_PI * 2.0 + (mi % 2) * PI;
          var helixR = Math.sin(mu * PI) * 0.42;
          var px = lerp(staffX, sa.rogueX, mu) + Math.cos(helixAng) * helixR;
          var pz = lerp(staffZ, sa.rogueZ, mu) + Math.sin(helixAng) * helixR;
          var py = lerp(staffY, sa.rogueY + 0.92, mu) + Math.sin(mu * PI) * 0.65;
          mote.position.set(px, py, pz);
          mote.rotation.set(elapsed * 6.0, elapsed * 5.0, 0.0);
          var ms = 1.25 * Math.sin(mu * PI);
          mote.scale.set(ms, ms, ms);
        }
      }

      // Frost Lock Shockwave Ring at Rogue's feet (`u = 0.32..0.88`)
      if (u > 0.30 && u < 0.90) {
        var wu = (u - 0.30) / 0.60;
        _astralSummon.waveMesh.visible = true;
        _astralSummon.waveMesh.position.set(sa.rogueX, sa.rogueY + 0.06, sa.rogueZ);
        var wScale = 0.6 + wu * 3.4;
        _astralSummon.waveMesh.scale.set(wScale, wScale, 1.0);
        _astralSummon.waveMat.opacity = (1.0 - wu) * 0.88;
      } else {
        _astralSummon.waveMesh.visible = false;
      }

      if (u >= 1.0) {
        var cb = sa.onComplete;
        _astralSummon.anim = null;
        _astralSummon.root.visible = false;
        _astralSummon.motesGroup.visible = false;
        if (cb) cb();
      }
    }

    // 2. Sanctuary Sun-Burst Finale (`1.35s`)
    if (_sunBurst && _sunBurst.anim) {
      var ba = _sunBurst.anim;
      ba.elapsed += dt;
      var su = clamp(ba.elapsed / ba.duration, 0.0, 1.0);
      var sEase = 1.0 - Math.pow(1.0 - su, 2.4);

      var dScale = 0.8 + sEase * 9.5;
      _sunBurst.domeMesh.scale.set(dScale, dScale * 0.65, dScale);
      _sunBurst.domeMat.opacity = (1.0 - su) * 0.38;

      var rScale = 0.8 + sEase * 14.5;
      _sunBurst.ringMesh.scale.set(rScale, rScale, 1.0);
      _sunBurst.ringMat.opacity = (1.0 - su) * 0.92;

      for (var bi = 0; bi < _sunBurst.motes.length; bi++) {
        var bm = _sunBurst.motes[bi];
        var bAng = bm.ang + su * 2.4;
        var bRad = bm.rad + sEase * 5.2;
        bm.mesh.position.set(
          Math.cos(bAng) * bRad,
          0.35 + su * bm.vy,
          Math.sin(bAng) * bRad
        );
        bm.mesh.rotation.y = elapsed * 5.0 + bi;
        var bSc = Math.max(0.01, (1.0 - su) * 1.45);
        bm.mesh.scale.set(bSc, bSc, bSc);
      }

      if (su >= 1.0) {
        _sunBurst.anim = null;
        _sunBurst.root.visible = false;
      }
    }

    // 3. Shadow Ambush X-Slash FX (`0.72s`)
    if (_ambushFx && _ambushFx.anim) {
      var fx = _ambushFx.anim;
      fx.elapsed += dt;
      var fu = clamp(fx.elapsed / fx.duration, 0.0, 1.0);
      var slashPop = (fu < 0.25) ? (fu / 0.25) : 1.0;
      _ambushFx.slashMesh.scale.set(slashPop * 1.35, slashPop * 1.35, slashPop * 1.35);
      _ambushFx.slashMesh.rotation.y = fu * 0.55;
      _ambushFx.slashMat.opacity = (1.0 - Math.pow(fu, 1.5)) * 0.96;

      var fRing = 0.55 + fu * 3.2;
      _ambushFx.ringMesh.scale.set(fRing, fRing, 1.0);
      _ambushFx.ringMat.opacity = (1.0 - fu) * 0.88;

      if (fu >= 1.0) {
        _ambushFx.anim = null;
        _ambushFx.root.visible = false;
      }
    }
  }

  function getInteractivePickables() {
    return _pickables;
  }

  function getAuditMetrics() {
    return {
      maxFootDriftM: _auditMetrics.maxFootDriftM,
      overlapPairs: _auditMetrics.overlapPairs,
      stoppedSkatingFrames: _auditMetrics.stoppedSkatingFrames
    };
  }

  window.GAME.Units = {
    init: init,
    buildLevel: buildLevel,
    syncFromState: syncFromState,
    animateHop: animateHop,
    animateHeroAction: animateHeroAction,
    animateGargoyleDefeat: animateGargoyleDefeat,
    animateAstralAid: animateAstralAid,
    animateRogueAmbush: animateRogueAmbush,
    animateVictorySunBurst: animateVictorySunBurst,
    getInteractivePickables: getInteractivePickables,
    getAuditMetrics: getAuditMetrics,
    update: update
  };
})();

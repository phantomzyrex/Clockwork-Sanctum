(function () {
  'use strict';

  window.GAME = window.GAME || {};

  // ============================================================================
  // Clockwork Sanctum: The Living Board — Floating Sky-Island Diorama (`World`)
  // Strictly Aesthetic 1 (Ankama / Krosmaster Sunlit Toy-Box) across ALL 4 levels
  // ============================================================================

  var GRID_SIZE = 8;
  var TILE_SIZE = 2.0;
  var HALF_GRID = 3.5;
  var TILE_DEPTH = 0.58;
  var CHANNEL_BED_Y = -0.22;
  var WATER_SURFACE_Y = -0.06;
  var CHASM_FLOOR_Y = -20.0;

  // Exact analytical aqueduct profile across lateral coordinate u = |lx| or |lz|
  // Used by BOTH mesh vertex generation and World.getHeightAt() -> 0.0000m drift!
  function channelProfileY(u) {
    var au = Math.abs(u);
    if (au <= 0.52) return CHANNEL_BED_Y;
    if (au >= 0.62) return 0.0;
    var t = (au - 0.52) / 0.10;
    return CHANNEL_BED_Y * (1.0 - t);
  }

  function channelEndCapY(v) {
    if (v <= 0.52) return CHANNEL_BED_Y;
    if (v >= 0.62) return 0.0;
    return CHANNEL_BED_Y * (1.0 - (v - 0.52) / 0.10);
  }

  // Canonical 90° L-bend channel profile (open on North -Z and West -X mouths; rotated via cornerRotY)
  function channelCornerProfileY(lx, lz) {
    var yN = Math.max(channelProfileY(lx), channelEndCapY(lz));
    var yW = Math.max(channelProfileY(lz), channelEndCapY(lx));
    return Math.min(yN, yW);
  }

  function gridToWorld(col, row) {
    var cfg = window.GAME.CONFIG;
    if (cfg && typeof cfg.gridToWorld === 'function') {
      return cfg.gridToWorld(col, row);
    }
    return {
      x: (col - HALF_GRID) * TILE_SIZE,
      z: (row - HALF_GRID) * TILE_SIZE
    };
  }

  function worldToGrid(wx, wz) {
    var cfg = window.GAME.CONFIG;
    if (cfg && typeof cfg.worldToGrid === 'function') {
      return cfg.worldToGrid(wx, wz);
    }
    return {
      col: Math.round(wx / TILE_SIZE + HALF_GRID),
      row: Math.round(wz / TILE_SIZE + HALF_GRID)
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  // ============================================================================
  // Smooth Normal Welding & Zero-Leak Static Part Merger
  // ============================================================================
  function weldSmoothNormals(geom, creaseAngleDeg) {
    if (!geom) return geom;
    geom.computeVertexNormals();
    var pos = geom.getAttribute('position');
    var norm = geom.getAttribute('normal');
    if (!pos || !norm) return geom;

    var cosThresh = Math.cos(((creaseAngleDeg !== undefined ? creaseAngleDeg : 70) * Math.PI) / 180.0);
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

  function hexToRgb01(hex) {
    return [
      ((hex >> 16) & 255) / 255.0,
      ((hex >> 8) & 255) / 255.0,
      (hex & 255) / 255.0
    ];
  }

  /**
   * Transforms a BufferGeometry, applies optional normal welding, box-UVs, and
   * rich vertex-color shading, returning a clean non-indexed BufferGeometry and
   * disposing any temporary source geometry so 0 orphan geometries remain.
   */
  function bakePart(srcGeom, opts) {
    opts = opts || {};
    var g = srcGeom.index ? srcGeom.toNonIndexed() : srcGeom.clone();
    if (opts.disposeSrc !== false && srcGeom !== g && typeof srcGeom.dispose === 'function') {
      srcGeom.dispose();
    }

    if (opts.sx !== undefined || opts.sy !== undefined || opts.sz !== undefined) {
      g.scale(
        opts.sx !== undefined ? opts.sx : 1,
        opts.sy !== undefined ? opts.sy : 1,
        opts.sz !== undefined ? opts.sz : 1
      );
    }
    if (opts.rx) g.rotateX(opts.rx);
    if (opts.ry) g.rotateY(opts.ry);
    if (opts.rz) g.rotateZ(opts.rz);
    if (opts.tx || opts.ty || opts.tz) {
      g.translate(opts.tx || 0, opts.ty || 0, opts.tz || 0);
    }

    if (opts.smoothAngle) {
      weldSmoothNormals(g, opts.smoothAngle);
    } else {
      g.computeVertexNormals();
    }

    var pos = g.getAttribute('position');
    var norm = g.getAttribute('normal');
    var count = pos.count;

    // Ensure clean UVs exist (polar/cylindrical rim UVs or triplanar/box fallback)
    var uv = g.getAttribute('uv');
    if (opts.polarUv) {
      var pUvs = new Float32Array(count * 2);
      var inR = opts.polarUv.innerR || 0.5;
      var spanR = Math.max(0.05, (opts.polarUv.outerR || 1.0) - inR);
      var repC = opts.polarUv.circumRepeats || 6.0;
      for (var pu = 0; pu < count; pu++) {
        var pvx = pos.getX(pu), pvy = pos.getY(pu);
        var rad = Math.hypot(pvx, pvy);
        var ang = Math.atan2(pvy, pvx) / (Math.PI * 2.0) + 0.5;
        // Map u along wheel circumference, v radially across plank width (zero stair-stepping!)
        pUvs[pu * 2]     = ang * repC;
        pUvs[pu * 2 + 1] = clamp((rad - inR) / spanR, 0.02, 0.98);
      }
      // Unwrap per-triangle +-PI atan2 seam so zero mipmap derivative spike occurs at 400% zoom!
      for (var pt = 0; pt + 2 < count; pt += 3) {
        var u0 = pUvs[pt * 2];
        for (var pk = 1; pk <= 2; pk++) {
          var uk = pUvs[(pt + pk) * 2];
          if (uk - u0 > repC * 0.5) pUvs[(pt + pk) * 2] = uk - repC;
          else if (u0 - uk > repC * 0.5) pUvs[(pt + pk) * 2] = uk + repC;
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(pUvs, 2));
    } else if (!uv || opts.boxUvScale) {
      var uvs = new Float32Array(count * 2);
      var sc = opts.boxUvScale || 0.5;
      for (var u = 0; u < count; u++) {
        var vx = pos.getX(u), vy = pos.getY(u), vz = pos.getZ(u);
        var nx = Math.abs(norm.getX(u)), ny = Math.abs(norm.getY(u)), nz = Math.abs(norm.getZ(u));
        if (ny >= nx && ny >= nz) {
          uvs[u * 2] = vx * sc + 0.5;
          uvs[u * 2 + 1] = vz * sc + 0.5;
        } else if (nx >= nz) {
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
          cr *= mod;
          cg *= mod;
          cb *= mod;
        } else if (mod) {
          cr *= mod[0];
          cg *= mod[1];
          cb *= mod[2];
        }
      }
      cols[i * 3] = clamp(cr, 0.0, 1.0);
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

  // ============================================================================
  // 1. Beveled Rounded-Square Tile Geometries (Y = 0.0000m Exact Grounding)
  // ============================================================================
  function sampleRoundedRectPerimeter(halfW, halfD, cornerR, segsPerCorner) {
    var r = Math.min(cornerR, halfW * 0.9, halfD * 0.9);
    var cx = halfW - r;
    var cz = halfD - r;
    var pts = [];
    // 4 corners in CCW order on XZ so outward side normals face outward when lofted bottom->top
    var corners = [
      { ox:  cx, oz:  cz, a0: 0.0,           a1: Math.PI * 0.5 },
      { ox: -cx, oz:  cz, a0: Math.PI * 0.5, a1: Math.PI },
      { ox: -cx, oz: -cz, a0: Math.PI,       a1: Math.PI * 1.5 },
      { ox:  cx, oz: -cz, a0: Math.PI * 1.5, a1: Math.PI * 2.0 }
    ];
    for (var c = 0; c < 4; c++) {
      var kc = corners[c];
      for (var s = 0; s <= segsPerCorner; s++) {
        // Avoid duplicating exact endpoint unless closing ring separately
        var ang = kc.a0 + (kc.a1 - kc.a0) * (s / segsPerCorner);
        pts.push([kc.ox + Math.cos(ang) * r, kc.oz + Math.sin(ang) * r]);
      }
    }
    return pts;
  }

  function buildLoftedRoundedBlock(rings, topPlateauY, uvScale, colorShadeFn) {
    // rings: [{ halfW, halfD, cornerR, y }] from bottom to top plateau rim
    var segs = 4;
    var ringPts = rings.map(function (rg) {
      return sampleRoundedRectPerimeter(rg.halfW, rg.halfD, rg.cornerR, segs);
    });
    var N = ringPts[0].length;
    var posList = [];
    var uvList = [];

    function pushTri(ax, ay, az, bx, by, bz, cx, cy, cz) {
      posList.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      // Planar/side UV
      var dyMax = Math.max(Math.abs(ay - by), Math.abs(by - cy), Math.abs(ay - cz * 0));
      if (Math.abs(ay - by) < 1e-4 && Math.abs(by - cy) < 1e-4) {
        uvList.push(ax * uvScale + 0.5, az * uvScale + 0.5);
        uvList.push(bx * uvScale + 0.5, bz * uvScale + 0.5);
        uvList.push(cx * uvScale + 0.5, cz * uvScale + 0.5);
      } else {
        var useX = Math.abs(ax - bx) + Math.abs(bx - cx) >= Math.abs(az - bz) + Math.abs(bz - cz);
        uvList.push((useX ? ax : az) * uvScale + 0.5, ay * uvScale + 0.65);
        uvList.push((useX ? bx : bz) * uvScale + 0.5, by * uvScale + 0.65);
        uvList.push((useX ? cx : cz) * uvScale + 0.5, cy * uvScale + 0.65);
      }
      return dyMax;
    }

    // Side & bevel bands
    for (var r = 0; r < rings.length - 1; r++) {
      var p0 = ringPts[r];
      var p1 = ringPts[r + 1];
      var y0 = rings[r].y;
      var y1 = rings[r + 1].y;
      for (var i = 0; i < N; i++) {
        var j = (i + 1) % N;
        var a0 = p0[i], b0 = p0[j];
        var a1 = p1[i], b1 = p1[j];
        pushTri(a0[0], y0, a0[1], a1[0], y1, a1[1], b1[0], y1, b1[1]);
        pushTri(a0[0], y0, a0[1], b1[0], y1, b1[1], b0[0], y0, b0[1]);
      }
    }

    // Top flat walkable plateau strictly at topPlateauY === 0.0000m!
    var topRing = ringPts[rings.length - 1];
    for (var k = 0; k < N; k++) {
      var kn = (k + 1) % N;
      var tA = topRing[k];
      var tB = topRing[kn];
      pushTri(0.0, topPlateauY, 0.0, tB[0], topPlateauY, tB[1], tA[0], topPlateauY, tA[1]);
    }

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posList), 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvList), 2));
    weldSmoothNormals(geom, 46);

    return bakePart(geom, {
      color: 0xFFFFFF,
      smoothAngle: 46,
      shadeFn: colorShadeFn
    });
  }

  function buildPerTileMortarCollar() {
    // Deep chocolate-umber (#1E1108) recessed mortar collar filling the 2.00m x 2.00m cell at Y = -0.14m
    // so every 15.2cm inter-tile seam has bold dark Ankama mortar separation without clipping channels!
    return bakePart(new THREE.BoxGeometry(2.002, 0.44, 2.002), {
      ty: -0.36,
      color: 0x221208,
      boxUvScale: 0.25
    });
  }

  function buildSandstoneTileGeometry() {
    var rings = [
      { halfW: 0.895, halfD: 0.895, cornerR: 0.14, y: -TILE_DEPTH },
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.14 },
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.072 },
      { halfW: 0.892, halfD: 0.892, cornerR: 0.14, y: -0.020 },
      { halfW: 0.852, halfD: 0.852, cornerR: 0.12, y: 0.0 }
    ];
    var block = buildLoftedRoundedBlock(rings, 0.0, 0.48, function (px, py, pz, nx, ny) {
      // Deep toasted-umber bevel & side walls (#4A2B13 -> #261408) for crisp Ankama tile separation!
      if (py < -0.045) {
        var ao = clamp((py + TILE_DEPTH) / 0.535, 0.0, 1.0);
        var s = 0.22 + 0.34 * ao;
        return [s, s * 0.72, s * 0.46];
      }
      if (ny > 0.28 && ny < 0.96 && py > -0.06) {
        // Warm sunlit chamfer bevel vs toasted shadow bevel
        var sunRim = (-nx * 0.42 - pz * 0.12 > 0) ? 1.0 : 0.80;
        return [sunRim, sunRim * 0.92, sunRim * 0.78];
      }
      return [0.97, 0.94, 0.90];
    });
    return mergeBufferGeometries([buildPerTileMortarCollar(), block]);
  }

  function buildExitTileGeometry() {
    var base = buildSandstoneTileGeometry();
    // Flush inlaid golden-bronze octagonal border at Y = 0.0015m (zero height bump!)
    var frameRing = new THREE.RingGeometry(0.62, 0.78, 8);
    var inlaid = bakePart(frameRing, {
      rx: -Math.PI / 2,
      ry: Math.PI / 8,
      ty: 0.0015,
      color: 0xF2B844
    });
    return mergeBufferGeometries([base, inlaid]);
  }

  function buildBridgeTileGeometry() {
    var parts = [];
    parts.push(buildSandstoneTileGeometry());
    // Decorative bronze corner brackets & side keystone arches below Y = -0.04m
    var corners = [[-0.86, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86]];
    for (var i = 0; i < 4; i++) {
      parts.push(bakePart(new THREE.BoxGeometry(0.22, 0.38, 0.22), {
        tx: corners[i][0],
        ty: -0.26,
        tz: corners[i][1],
        color: 0xB87D32,
        boxUvScale: 0.8
      }));
    }
    // Side arch dark shadow reliefs so bridge block reads unmistakably over aqueduct channels
    parts.push(bakePart(new THREE.CylinderGeometry(0.36, 0.36, 1.93, 12), {
      rx: Math.PI / 2,
      ty: -0.44,
      color: 0x5A3F24,
      smoothAngle: 60
    }));
    return mergeBufferGeometries(parts);
  }

  function buildRollerTileGeometry() {
    // True recessed Y = -0.098m stone & bronze conveyor slot with the EXACT same rounded-square
    // chamfered outer perimeter (halfW = 0.924, cornerR = 0.16) as buildSandstoneTileGeometry()!
    var parts = [];
    parts.push(buildPerTileMortarCollar());

    // Lower solid sandstone foundation up to recessed roller bed Y = -0.098m
    var slotRings = [
      { halfW: 0.895, halfD: 0.895, cornerR: 0.14, y: -TILE_DEPTH },
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.14 },
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.098 }
    ];
    parts.push(buildLoftedRoundedBlock(slotRings, -0.098, 0.48, function (px, py, pz) {
      if (Math.abs(px) < 0.73 && Math.abs(pz) < 0.73 && py >= -0.105) {
        // Dark oiled-bronze & umber recessed conveyor pit floor
        return [0.20, 0.13, 0.07];
      }
      return [0.34, 0.24, 0.14];
    }));

    // Annular beveled rounded-square sandstone rim (outer chamfer -> Y=0.0000m frame -> inner pit wall)
    var rimRings = [
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.098 },
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.072 },
      { halfW: 0.892, halfD: 0.892, cornerR: 0.14, y: -0.020 },
      { halfW: 0.852, halfD: 0.852, cornerR: 0.12, y:  0.000 },
      { halfW: 0.725, halfD: 0.725, cornerR: 0.06, y:  0.000 },
      { halfW: 0.700, halfD: 0.700, cornerR: 0.05, y: -0.098 }
    ];
    var rimPts = rimRings.map(function (rg) {
      return sampleRoundedRectPerimeter(rg.halfW, rg.halfD, rg.cornerR, 4);
    });
    var N = rimPts[0].length;
    var rPos = [];
    var rUv = [];
    function pushRimTri(ax, ay, az, bx, by, bz, cx, cy, cz) {
      rPos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      if (Math.abs(ay - by) < 1e-4 && Math.abs(by - cy) < 1e-4) {
        rUv.push(ax * 0.48 + 0.5, az * 0.48 + 0.5, bx * 0.48 + 0.5, bz * 0.48 + 0.5, cx * 0.48 + 0.5, cz * 0.48 + 0.5);
      } else {
        var useX = Math.abs(ax - bx) + Math.abs(bx - cx) >= Math.abs(az - bz) + Math.abs(bz - cz);
        rUv.push((useX ? ax : az) * 0.48 + 0.5, ay * 0.48 + 0.65);
        rUv.push((useX ? bx : bz) * 0.48 + 0.5, by * 0.48 + 0.65);
        rUv.push((useX ? cx : cz) * 0.48 + 0.5, cy * 0.48 + 0.65);
      }
    }
    for (var rb = 0; rb < rimRings.length - 1; rb++) {
      var p0 = rimPts[rb], p1 = rimPts[rb + 1];
      var y0 = rimRings[rb].y, y1 = rimRings[rb + 1].y;
      for (var ri = 0; ri < N; ri++) {
        var rj = (ri + 1) % N;
        pushRimTri(p0[ri][0], y0, p0[ri][1], p1[ri][0], y1, p1[ri][1], p1[rj][0], y1, p1[rj][1]);
        pushRimTri(p0[ri][0], y0, p0[ri][1], p1[rj][0], y1, p1[rj][1], p0[rj][0], y0, p0[rj][1]);
      }
    }
    var rimGeo = new THREE.BufferGeometry();
    rimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rPos), 3));
    rimGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(rUv), 2));
    parts.push(bakePart(rimGeo, {
      color: 0xFFFFFF,
      smoothAngle: 44,
      shadeFn: function (px, py, pz, nx, ny) {
        if (Math.abs(px) < 0.722 && Math.abs(pz) < 0.722 && py < -0.015) {
          return [0.46, 0.34, 0.22];
        }
        if (py < -0.045) {
          return [0.34, 0.24, 0.15];
        }
        if (ny > 0.28 && ny < 0.96 && py > -0.06) {
          var sunRim = (-nx * 0.42 - pz * 0.12 > 0) ? 1.0 : 0.80;
          return [sunRim, sunRim * 0.92, sunRim * 0.78];
        }
        return [0.97, 0.94, 0.90];
      }
    }));

    // Burnished bronze inner track guide-rails framing the recessed roller pit
    parts.push(bakePart(new THREE.BoxGeometry(1.36, 0.082, 0.055), {
      ty: -0.054, tz: -0.675, color: 0x8F5E24, boxUvScale: 0.7
    }));
    parts.push(bakePart(new THREE.BoxGeometry(1.36, 0.082, 0.055), {
      ty: -0.054, tz:  0.675, color: 0x8F5E24, boxUvScale: 0.7
    }));
    return mergeBufferGeometries(parts);
  }

  function buildPillarGeometry() {
    var parts = [];
    parts.push(buildSandstoneTileGeometry());
    // Stepped octagonal stone plinth + chiseled sandstone obelisk + bronze band
    parts.push(bakePart(new THREE.CylinderGeometry(0.60, 0.68, 0.28, 8), {
      ty: 0.14,
      ry: Math.PI / 8,
      color: 0xE2AF63,
      boxUvScale: 0.5
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(0.46, 0.56, 1.12, 8), {
      ty: 0.84,
      ry: Math.PI / 8,
      color: 0xE8B86D,
      boxUvScale: 0.5
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(0.52, 0.52, 0.14, 8), {
      ty: 1.08,
      ry: Math.PI / 8,
      color: 0xB87D32,
      boxUvScale: 0.8
    }));
    parts.push(bakePart(new THREE.ConeGeometry(0.52, 0.34, 8), {
      ty: 1.57,
      ry: Math.PI / 8,
      color: 0xF2C982,
      boxUvScale: 0.5
    }));
    return mergeBufferGeometries(parts);
  }

  /**
   * Carved Sandstone Aqueduct Channel Tile (default oriented along N-S `col` axis;
   * rotated 90° around Y for E-W `row` axis). Top surface vertices strictly equal
   * channelProfileY(lx) for 100.0% analytical grounding parity!
   */
  function buildChannelTileGeometry() {
    var parts = [];
    // Lower solid sandstone foundation block (Y = -0.58m .. -0.22m)
    var baseRings = [
      { halfW: 0.90,  halfD: 0.90,  cornerR: 0.16, y: -TILE_DEPTH },
      { halfW: 0.955, halfD: 0.955, cornerR: 0.19, y: -TILE_DEPTH + 0.04 },
      { halfW: 0.955, halfD: 0.955, cornerR: 0.19, y: CHANNEL_BED_Y }
    ];
    parts.push(buildLoftedRoundedBlock(baseRings, CHANNEL_BED_Y, 0.48, function (px, py) {
      if (Math.abs(px) < 0.56 && py >= CHANNEL_BED_Y - 0.01) {
        // Deep damp darkened stone aqueduct trough bed for bold architectural contrast
        return [0.44, 0.39, 0.32];
      }
      var ao = clamp((py + TILE_DEPTH) / 0.38, 0.0, 1.0);
      return [0.58 + 0.28 * ao, 0.52 + 0.28 * ao, 0.44 + 0.28 * ao];
    }));

    // Left (-X) and Right (+X) raised beveled sandstone curbs (|lx| in [0.52..0.955], Y up to 0.0000m!)
    var xStops = [-0.955, -0.915, -0.62, -0.52, 0.52, 0.62, 0.915, 0.955];
    var yTops  = [-0.055,  0.0,    0.0,  CHANNEL_BED_Y, CHANNEL_BED_Y, 0.0, 0.0, -0.055];
    var zMin = -0.955, zMax = 0.955;

    function buildCurbStrip(iStart, iEnd) {
      var pArr = [];
      var uArr = [];
      function addQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
        pArr.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
        pArr.push(x0, y0, z0, x2, y2, z2, x3, y3, z3);
        uArr.push(x0 * 0.48 + 0.5, z0 * 0.48 + 0.5, x1 * 0.48 + 0.5, z1 * 0.48 + 0.5, x2 * 0.48 + 0.5, z2 * 0.48 + 0.5);
        uArr.push(x0 * 0.48 + 0.5, z0 * 0.48 + 0.5, x2 * 0.48 + 0.5, z2 * 0.48 + 0.5, x3 * 0.48 + 0.5, z3 * 0.48 + 0.5);
      }
      for (var s = iStart; s < iEnd; s++) {
        var xa = xStops[s], xb = xStops[s + 1];
        var ya = yTops[s],  yb = yTops[s + 1];
        // Top / inner sloped wall
        addQuad(xa, ya, zMax, xb, yb, zMax, xb, yb, zMin, xa, ya, zMin);
        // Front (+Z) cap down to CHANNEL_BED_Y
        addQuad(xa, CHANNEL_BED_Y, zMax, xb, CHANNEL_BED_Y, zMax, xb, yb, zMax, xa, ya, zMax);
        // Back (-Z) cap down to CHANNEL_BED_Y
        addQuad(xb, CHANNEL_BED_Y, zMin, xa, CHANNEL_BED_Y, zMin, xa, ya, zMin, xb, yb, zMin);
      }
      // Outer vertical side wall
      var xOut = iStart === 0 ? xStops[0] : xStops[iEnd];
      var yOut = iStart === 0 ? yTops[0] : yTops[iEnd];
      if (iStart === 0) {
        addQuad(xOut, CHANNEL_BED_Y, zMin, xOut, CHANNEL_BED_Y, zMax, xOut, yOut, zMax, xOut, yOut, zMin);
      } else {
        addQuad(xOut, CHANNEL_BED_Y, zMax, xOut, CHANNEL_BED_Y, zMin, xOut, yOut, zMin, xOut, yOut, zMax);
      }

      var cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pArr), 3));
      cg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uArr), 2));
      return bakePart(cg, {
        color: 0xFFFFFF,
        smoothAngle: 35,
        shadeFn: function (px, py) {
          return py < -0.08 ? [0.64, 0.58, 0.50] : [0.99, 0.97, 0.94];
        }
      });
    }

    parts.push(buildCurbStrip(0, 3));
    parts.push(buildCurbStrip(4, 7));

    // Side dark-umber mortar collars strictly under outer curbs (|lx| in [0.85..1.001], never in channel trough!)
    parts.push(bakePart(new THREE.BoxGeometry(0.15, 0.44, 2.002), {
      tx: -0.926, ty: -0.36, color: 0x221208, boxUvScale: 0.25
    }));
    parts.push(bakePart(new THREE.BoxGeometry(0.15, 0.44, 2.002), {
      tx:  0.926, ty: -0.36, color: 0x221208, boxUvScale: 0.25
    }));
    return mergeBufferGeometries(parts);
  }

  /**
   * 90-Degree L-Bend Sandstone Aqueduct Elbow Tile (canonical NW open on -Z and -X;
   * rotated around Y for NE/SE/SW corners so e.g. Level 2's (5,0)->(5,1)->(4,1) turn has
   * zero stone curb damming the water while keeping its East curb separating (5,1) & (6,1)!).
   */
  function buildChannelCornerGeometry() {
    var parts = [];
    var baseRings = [
      { halfW: 0.90,  halfD: 0.90,  cornerR: 0.16, y: -TILE_DEPTH },
      { halfW: 0.955, halfD: 0.955, cornerR: 0.19, y: -TILE_DEPTH + 0.04 },
      { halfW: 0.955, halfD: 0.955, cornerR: 0.19, y: CHANNEL_BED_Y }
    ];
    parts.push(buildLoftedRoundedBlock(baseRings, CHANNEL_BED_Y, 0.48, function (px, py, pz) {
      if (channelCornerProfileY(px, pz) <= CHANNEL_BED_Y + 0.02 && py >= CHANNEL_BED_Y - 0.01) {
        return [0.44, 0.39, 0.32];
      }
      var ao = clamp((py + TILE_DEPTH) / 0.38, 0.0, 1.0);
      return [0.58 + 0.28 * ao, 0.52 + 0.28 * ao, 0.44 + 0.28 * ao];
    }));

    var stops = [-0.955, -0.915, -0.62, -0.52, 0.52, 0.62, 0.915, 0.955];
    var N = stops.length;
    function topY(x, z) {
      var h = channelCornerProfileY(x, z);
      if (Math.abs(x) >= 0.954 || Math.abs(z) >= 0.954) {
        return Math.min(h, -0.055);
      }
      return h;
    }

    var pArr = [];
    var uArr = [];
    function addQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
      pArr.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
      pArr.push(x0, y0, z0, x2, y2, z2, x3, y3, z3);
      uArr.push(x0 * 0.48 + 0.5, z0 * 0.48 + 0.5, x1 * 0.48 + 0.5, z1 * 0.48 + 0.5, x2 * 0.48 + 0.5, z2 * 0.48 + 0.5);
      uArr.push(x0 * 0.48 + 0.5, z0 * 0.48 + 0.5, x2 * 0.48 + 0.5, z2 * 0.48 + 0.5, x3 * 0.48 + 0.5, z3 * 0.48 + 0.5);
    }

    for (var iz = 0; iz < N - 1; iz++) {
      var z0 = stops[iz], z1 = stops[iz + 1];
      for (var ix = 0; ix < N - 1; ix++) {
        var x0 = stops[ix], x1 = stops[ix + 1];
        addQuad(
          x0, topY(x0, z1), z1,
          x1, topY(x1, z1), z1,
          x1, topY(x1, z0), z0,
          x0, topY(x0, z0), z0
        );
      }
    }

    // Perimeter vertical skirts down to CHANNEL_BED_Y along all 4 outer sides
    var lim = 0.955;
    for (var k = 0; k < N - 1; k++) {
      var a = stops[k], b = stops[k + 1];
      // +Z front skirt
      addQuad(a, CHANNEL_BED_Y, lim, b, CHANNEL_BED_Y, lim, b, topY(b, lim), lim, a, topY(a, lim), lim);
      // -Z back skirt
      addQuad(b, CHANNEL_BED_Y, -lim, a, CHANNEL_BED_Y, -lim, a, topY(a, -lim), -lim, b, topY(b, -lim), -lim);
      // -X left skirt
      addQuad(-lim, CHANNEL_BED_Y, a, -lim, CHANNEL_BED_Y, b, -lim, topY(-lim, b), b, -lim, topY(-lim, a), a);
      // +X right skirt
      addQuad(lim, CHANNEL_BED_Y, b, lim, CHANNEL_BED_Y, a, lim, topY(lim, a), a, lim, topY(lim, b), b);
    }

    var cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pArr), 3));
    cg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uArr), 2));
    parts.push(bakePart(cg, {
      color: 0xFFFFFF,
      smoothAngle: 35,
      shadeFn: function (px, py) {
        return py < -0.08 ? [0.64, 0.58, 0.50] : [0.99, 0.97, 0.94];
      }
    }));

    // Dark-umber mortar collars strictly under the solid East (+X) and South (+Z) curbs!
    parts.push(bakePart(new THREE.BoxGeometry(0.15, 0.44, 2.002), {
      tx:  0.926, ty: -0.36, color: 0x221208, boxUvScale: 0.25
    }));
    parts.push(bakePart(new THREE.BoxGeometry(2.002, 0.44, 0.15), {
      tz:  0.926, ty: -0.36, color: 0x221208, boxUvScale: 0.25
    }));
    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 2. Plump Chartreuse Moss Cushions & Perimeter Cliff Overhang Lobes
  // ============================================================================
  function buildMossBaseGeometry() {
    var rings = [
      { halfW: 0.895, halfD: 0.895, cornerR: 0.14, y: -TILE_DEPTH },
      { halfW: 0.924, halfD: 0.924, cornerR: 0.16, y: -0.15 }
    ];
    var baseBlock = buildLoftedRoundedBlock(rings, -0.15, 0.48, function (px, py) {
      var ao = clamp((py + TILE_DEPTH) / 0.43, 0.0, 1.0);
      var s = 0.24 + 0.36 * ao;
      return [s, s * 0.74, s * 0.48];
    });
    return mergeBufferGeometries([buildPerTileMortarCollar(), baseBlock]);
  }

  function buildMossCushionGeometry() {
    // Individual rounded chartreuse moss cushion (halfW <= 0.914m so 17.2cm dark seams stay crisp!)
    var parts = [];
    var rings = [
      { halfW: 0.875, halfD: 0.875, cornerR: 0.18, y: -0.20 },
      { halfW: 0.914, halfD: 0.914, cornerR: 0.21, y: -0.108 },
      { halfW: 0.890, halfD: 0.890, cornerR: 0.19, y: -0.036 },
      { halfW: 0.826, halfD: 0.826, cornerR: 0.16, y: 0.0 }
    ];
    parts.push(buildLoftedRoundedBlock(rings, 0.0, 0.48, function (px, py, pz, nx, ny) {
      if (py < -0.082) {
        // Deep olive-emerald moss cushion rim (#2D5C06) for bold individual block separation!
        return [0.36, 0.50, 0.22];
      }
      if (ny > 0.35 && py > -0.05) {
        var sunBias = clamp((-px - pz) * 0.07 + 0.99, 0.90, 1.0);
        return [sunBias, sunBias, 0.84];
      }
      return [0.74, 0.84, 0.58];
    }));

    // Subtle organic botanical tuft pillows tucked strictly inside <= 0.92m so neighboring moss tiles NEVER merge!
    var tuftCoords = [
      [-0.52, -0.11, -0.81, 0.23, 0.085, 0.11],
      [ 0.44, -0.11, -0.81, 0.21, 0.085, 0.11],
      [-0.44, -0.11,  0.81, 0.22, 0.085, 0.11],
      [ 0.50, -0.11,  0.81, 0.23, 0.085, 0.11],
      [-0.81, -0.11, -0.48, 0.11, 0.085, 0.22],
      [-0.81, -0.11,  0.50, 0.11, 0.085, 0.22],
      [ 0.81, -0.11, -0.50, 0.11, 0.085, 0.22],
      [ 0.81, -0.11,  0.46, 0.11, 0.085, 0.22]
    ];
    for (var tc = 0; tc < tuftCoords.length; tc++) {
      var tf = tuftCoords[tc];
      parts.push(bakePart(new THREE.SphereGeometry(1.0, 10, 8), {
        sx: tf[3], sy: tf[4], sz: tf[5],
        tx: tf[0], ty: tf[1], tz: tf[2],
        smoothAngle: 75,
        boxUvScale: 0.50,
        color: 0xFFFFFF,
        shadeFn: function (px, py) {
          return py < -0.11 ? [0.40, 0.54, 0.26] : [0.88, 0.94, 0.72];
        }
      }));
    }
    return mergeBufferGeometries(parts);
  }

  /**
   * Organic bulbous chartreuse moss overhang lobes along the local North (-Z) cliff rim.
   * Instanced with 0°, 90°, 180°, 270° Y-rotations on every exposed cliff/chasm edge!
   */
  function buildMossOverhangGeometry() {
    var parts = [];
    var lobes = [
      { x: -0.64, y: -0.17, z: -0.94, sx: 0.38, sy: 0.28, sz: 0.26 },
      { x: -0.22, y: -0.26, z: -0.99, sx: 0.46, sy: 0.38, sz: 0.29 },
      { x:  0.26, y: -0.22, z: -0.97, sx: 0.42, sy: 0.34, sz: 0.27 },
      { x:  0.66, y: -0.16, z: -0.93, sx: 0.32, sy: 0.25, sz: 0.23 },
      // Cascading emerald-chartreuse moss drips draping down the chiseled cliff wall!
      { x: -0.46, y: -0.48, z: -0.98, sx: 0.24, sy: 0.30, sz: 0.20 },
      { x: -0.14, y: -0.58, z: -1.01, sx: 0.27, sy: 0.38, sz: 0.21 },
      { x:  0.32, y: -0.50, z: -0.99, sx: 0.23, sy: 0.32, sz: 0.19 }
    ];
    for (var i = 0; i < lobes.length; i++) {
      var lb = lobes[i];
      parts.push(bakePart(new THREE.SphereGeometry(1.0, 14, 10), {
        sx: lb.sx,
        sy: lb.sy,
        sz: lb.sz,
        tx: lb.x,
        ty: lb.y,
        tz: lb.z,
        smoothAngle: 78,
        boxUvScale: 0.50,
        color: 0xFFFFFF,
        shadeFn: function (px, py) {
          // Warm sunlit chartreuse shoulder -> deep olive-emerald drip tip
          var t = clamp((py + 0.92) / 0.92, 0.0, 1.0);
          return [0.54 + 0.46 * t, 0.68 + 0.32 * t, 0.36 + 0.46 * t];
        }
      }));
    }
    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 3. Recessed Mortar Sub-Deck & Chunky Chiseled Cliff Under-Structure
  // ============================================================================
  function buildMortarBedGeometry(isSplit) {
    var parts = [];
    // Deep chocolate-umber (#1E1108) mortar sub-deck beneath the 8x8 board
    if (!isSplit) {
      parts.push(bakePart(new THREE.BoxGeometry(15.72, 0.34, 15.72), {
        ty: -0.41,
        color: 0x1E1108,
        boxUvScale: 0.2
      }));
    } else {
      parts.push(bakePart(new THREE.BoxGeometry(15.72, 0.34, 5.76), {
        ty: -0.41,
        tz: -5.0,
        color: 0x1E1108,
        boxUvScale: 0.2
      }));
      parts.push(bakePart(new THREE.BoxGeometry(15.72, 0.34, 5.76), {
        ty: -0.41,
        tz: 5.0,
        color: 0x1E1108,
        boxUvScale: 0.2
      }));
    }
    return mergeBufferGeometries(parts);
  }

  /**
   * Builds a chunky, steep-walled chiseled Ankama floating cliff crag mass strictly bounded
   * inside [cx - halfW .. cx + halfW] x [cz - halfD .. cz + halfD], boldly visible under
   * the front-left (+Z) & front-right (+X) flanks while clearing the bottom HUD bar cleanly!
   */
  function appendSculptedCliffMass(parts, cx, cz, halfW, halfD, apexY, seedBase) {
    var baseRing = sampleRoundedRectPerimeter(halfW, halfD, Math.min(0.66, halfW * 0.22), 3);
    var N = baseRing.length;

    // 7 steep metric-inset chiseled rock tiers so BOTH full (7.88m) & split (2.92m) islands show a
    // bold, chunky ~48px-tall sculpted Ankama cliff mass below the front rim while clearing .cs-action-bar (675px)!
    var tiers = [
      { yFrac: 0.00, insetM: 0.02, jitM: 0.05 },
      { yFrac: 0.18, insetM: 0.06, jitM: 0.12 },
      { yFrac: 0.38, insetM: 0.14, jitM: 0.18 },
      { yFrac: 0.58, insetM: 0.28, jitM: 0.24 },
      { yFrac: 0.76, insetM: 0.65, jitM: 0.28 },
      { yFrac: 0.90, insetM: 1.45, jitM: 0.22 },
      { yFrac: 1.00, insetM: 2.80, jitM: 0.12 }
    ];

    var tierRings = [];
    for (var t = 0; t < tiers.length; t++) {
      var tr = tiers[t];
      var yVal = -0.48 + tr.yFrac * (apexY - (-0.48));
      var pts = [];
      for (var i = 0; i < N; i++) {
        // Deterministic inward-only metric rock cleavage (strictly inside halfW x halfD!)
        var h1 = Math.sin(i * 2.37 + t * 1.61 + seedBase) * 0.5 + 0.5;
        var h2 = Math.cos(i * 4.13 - t * 0.93 + seedBase * 1.7) * 0.5 + 0.5;
        var dropM = tr.insetM + tr.jitM * (0.55 * h1 + 0.45 * h2);
        var scX = Math.max(0.14, (halfW - dropM) / halfW);
        var scZ = Math.max(0.14, (halfD - dropM) / halfD);
        pts.push([cx + baseRing[i][0] * scX, yVal, cz + baseRing[i][1] * scZ]);
      }
      tierRings.push(pts);
    }

    var posArr = [];
    var uvArr = [];
    function emitTri(a, b, c) {
      posArr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      var spanX = Math.abs(a[0] - b[0]) + Math.abs(b[0] - c[0]);
      var spanZ = Math.abs(a[2] - b[2]) + Math.abs(b[2] - c[2]);
      var useX = spanX >= spanZ;
      uvArr.push((useX ? a[0] : a[2]) * 0.14 + 0.5, a[1] * 0.14 + 0.5);
      uvArr.push((useX ? b[0] : b[2]) * 0.14 + 0.5, b[1] * 0.14 + 0.5);
      uvArr.push((useX ? c[0] : c[2]) * 0.14 + 0.5, c[1] * 0.14 + 0.5);
    }

    for (var band = 0; band < tierRings.length - 1; band++) {
      var rA = tierRings[band];
      var rB = tierRings[band + 1];
      for (var k = 0; k < N; k++) {
        var kn = (k + 1) % N;
        if ((k + band) & 1) {
          emitTri(rA[k], rA[kn], rB[kn]);
          emitTri(rA[k], rB[kn], rB[k]);
        } else {
          emitTri(rA[k], rA[kn], rB[k]);
          emitTri(rA[kn], rB[kn], rB[k]);
        }
      }
    }

    // Bottom crag tip cap at apexY
    var botRing = tierRings[tierRings.length - 1];
    var apexPt = [cx, apexY - 0.18, cz];
    for (var bIdx = 0; bIdx < N; bIdx++) {
      var bn = (bIdx + 1) % N;
      emitTri(botRing[bIdx], botRing[bn], apexPt);
    }

    var mainCliffGeo = new THREE.BufferGeometry();
    mainCliffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
    mainCliffGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvArr), 2));

    function cliffFacetShade(px, py, pz, nx, ny, nz) {
      var hNorm = clamp((py - apexY) / (-0.48 - apexY), 0.0, 1.0);
      // Screen-left (+Z / -X) sunlit warm limestone-buff vs screen-right (+X / -Z) cool cerulean-slate!
      var leftSun = clamp((nz * 0.72 - nx * 0.72 + 0.35) * 0.72, 0.0, 1.0);
      var upTilt = clamp(ny * 0.45 + 0.18, -0.25, 0.35);
      var vertGrad = 0.68 + 0.32 * hNorm;
      var r = (0.50 + 0.48 * leftSun + upTilt * 0.22) * vertGrad;
      var g = (0.58 + 0.37 * leftSun + upTilt * 0.20) * vertGrad;
      var b = (0.74 + 0.18 * leftSun + upTilt * 0.16) * (0.78 + 0.22 * hNorm);
      return [clamp(r, 0.34, 1.0), clamp(g, 0.40, 1.0), clamp(b, 0.50, 1.0)];
    }

    parts.push(bakePart(mainCliffGeo, {
      smoothAngle: 16, // Bold planar Ankama chiseled rock facets!
      color: 0xFFFFFF,
      shadeFn: cliffFacetShade
    }));

    // Prominent chiseled vertical corner & flank rock buttresses matching Master Reference Image!
    var buttressSpots = [
      [-0.78, -0.78, 0.20, 0.20, 0.68],
      [ 0.78, -0.78, 0.20, 0.20, 0.68],
      [ 0.78,  0.78, 0.21, 0.21, 0.56],
      [-0.78,  0.78, 0.21, 0.21, 0.68],
      [-0.22,  0.80, 0.26, 0.19, 0.64],
      [ 0.34,  0.80, 0.24, 0.19, 0.60],
      [-0.79,  0.00, 0.18, 0.28, 0.68],
      [ 0.80,  0.34, 0.19, 0.24, 0.60],
      [ 0.80, -0.20, 0.19, 0.26, 0.64],
      [ 0.05, -0.79, 0.28, 0.18, 0.66]
    ];
    for (var bp = 0; bp < buttressSpots.length; bp++) {
      var bs = buttressSpots[bp];
      var bH = Math.max(0.95, Math.abs(apexY * bs[4]) - 0.50);
      var boxG = new THREE.BoxGeometry(halfW * bs[2] * 2.0, bH, halfD * bs[3] * 2.0, 1, 2, 1);
      var bPos = boxG.getAttribute('position');
      for (var vi = 0; vi < bPos.count; vi++) {
        var vy = bPos.getY(vi);
        var uBot = clamp((vy + bH * 0.5) / bH, 0.0, 1.0);
        var tap = 0.36 + 0.64 * Math.pow(uBot, 0.55);
        bPos.setX(vi, bPos.getX(vi) * tap);
        bPos.setZ(vi, bPos.getZ(vi) * tap);
      }
      parts.push(bakePart(boxG, {
        tx: cx + bs[0] * halfW,
        ty: -0.50 - bH * 0.5,
        tz: cz + bs[1] * halfD,
        ry: (bp % 2 === 0 ? 0.08 : -0.08),
        smoothAngle: 16,
        boxUvScale: 0.16,
        color: 0xFFFFFF,
        shadeFn: cliffFacetShade
      }));
    }
  }

  function buildCliffGeometry(isSplit) {
    var parts = [];
    if (!isSplit) {
      appendSculptedCliffMass(parts, 0.0, 0.0, 7.88, 7.88, -4.92, 1.3);
    } else {
      // Level 4: Two separate sculpted floating cliff halves on North & South of the Sky Chasm!
      appendSculptedCliffMass(parts, 0.0, -5.0, 7.88, 2.92, -4.55, 4.7);
      appendSculptedCliffMass(parts, 0.0,  5.0, 7.88, 2.92, -4.55, 9.2);

      // Heavy antique-bronze toothed ferry guide-rails spanning the chasm walls at z = -1.96 & z = +1.96
      parts.push(bakePart(new THREE.BoxGeometry(15.72, 0.24, 0.22), {
        ty: -0.34,
        tz: -1.96,
        color: 0x9C6928,
        boxUvScale: 0.6
      }));
      parts.push(bakePart(new THREE.BoxGeometry(15.72, 0.24, 0.22), {
        ty: -0.34,
        tz: 1.96,
        color: 0x9C6928,
        boxUvScale: 0.6
      }));
    }
    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 4. Giant Interlocking Bronze Cogwheels & Rustic Wooden Paddle-Waterwheels
  // ============================================================================

  /**
   * Sculpted Toothed Burnished Antique Bronze Cogwheel lying in the local XY plane (axle along local Z).
   */
  function buildCogwheelGeometry(outerR, thickness, numTeeth, numSpokes) {
    var parts = [];
    var rimOuter = outerR * 0.84;
    var rimInner = outerR * 0.63;
    var hubR = outerR * 0.26;

    // 1. Outer Ring Rim (#C9903E gleaming antique gold-bronze with polar UVs — zero stripes!)
    var rimShape = new THREE.Shape();
    rimShape.absarc(0, 0, rimOuter, 0, Math.PI * 2, false);
    var rimHole = new THREE.Path();
    rimHole.absarc(0, 0, rimInner, 0, Math.PI * 2, true);
    rimShape.holes.push(rimHole);

    var rimGeo = new THREE.ExtrudeGeometry(rimShape, {
      depth: thickness * 0.84,
      bevelEnabled: true,
      bevelThickness: thickness * 0.09,
      bevelSize: outerR * 0.025,
      bevelSegments: 2,
      curveSegments: 32
    });
    parts.push(bakePart(rimGeo, {
      tz: -thickness * 0.42,
      smoothAngle: 42,
      polarUv: { innerR: rimInner, outerR: rimOuter, circumRepeats: 4.0 },
      color: 0xD29E48,
      shadeFn: function (px, py, pz, nx, ny, nz) {
        return Math.abs(nz) < 0.7 ? [1.14, 1.08, 0.96] : [0.94, 0.90, 0.84];
      }
    }));

    // 2. Deep Recessed Dark Patina Web Ring (#583512)
    var webShape = new THREE.Shape();
    webShape.absarc(0, 0, rimInner * 1.02, 0, Math.PI * 2, false);
    var webHole = new THREE.Path();
    webHole.absarc(0, 0, rimInner * 0.84, 0, Math.PI * 2, true);
    webShape.holes.push(webHole);
    parts.push(bakePart(new THREE.ExtrudeGeometry(webShape, {
      depth: thickness * 0.48,
      bevelEnabled: false,
      curveSegments: 28
    }), {
      tz: -thickness * 0.24,
      color: 0x5E3914,
      polarUv: { innerR: rimInner * 0.84, outerR: rimInner * 1.02, circumRepeats: 3.0 }
    }));

    // 3. Heavy Beveled Radial Bronze Spokes
    var spokeLen = rimInner - hubR * 0.65;
    var spokeMid = hubR * 0.65 + spokeLen * 0.5;
    for (var s = 0; s < numSpokes; s++) {
      var sAng = (s / numSpokes) * Math.PI * 2;
      parts.push(bakePart(new THREE.BoxGeometry(spokeLen, outerR * 0.125, thickness * 0.64), {
        rz: sAng,
        tx: Math.cos(sAng) * spokeMid,
        ty: Math.sin(sAng) * spokeMid,
        color: 0xC28B3B,
        boxUvScale: 0.45
      }));
    }

    // 4. Chunky Beveled Trapezoidal Gear Teeth (#E6B458 warm sunlit bevels)
    var toothBaseW = (2 * Math.PI * rimOuter) / (numTeeth * 1.80);
    var toothTipW = toothBaseW * 0.68;
    var toothH = outerR - rimOuter + outerR * 0.032;

    var tShape = new THREE.Shape();
    tShape.moveTo(-toothBaseW * 0.5, 0);
    tShape.lineTo( toothBaseW * 0.5, 0);
    tShape.lineTo( toothTipW * 0.5, toothH);
    tShape.lineTo(-toothTipW * 0.5, toothH);
    tShape.closePath();

    for (var t = 0; t < numTeeth; t++) {
      var tAng = (t / numTeeth) * Math.PI * 2;
      var tg = new THREE.ExtrudeGeometry(tShape, {
        depth: thickness * 0.78,
        bevelEnabled: true,
        bevelThickness: thickness * 0.075,
        bevelSize: toothBaseW * 0.085,
        bevelSegments: 1
      });
      tg.translate(0, rimOuter - outerR * 0.025, -thickness * 0.39);
      parts.push(bakePart(tg, {
        rz: tAng - Math.PI * 0.5,
        smoothAngle: 35,
        color: 0xE6B458,
        boxUvScale: 0.45
      }));
    }

    // 5. Proud Sculpted Bronze Axle Boss + Octagonal Brass Cap
    parts.push(bakePart(new THREE.CylinderGeometry(hubR, hubR * 1.10, thickness * 1.24, 20), {
      rx: Math.PI / 2,
      smoothAngle: 55,
      color: 0xCC9642,
      boxUvScale: 0.5
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(hubR * 0.64, hubR * 0.70, thickness * 1.54, 8), {
      rx: Math.PI / 2,
      smoothAngle: 25,
      color: 0x6E4418,
      boxUvScale: 0.5
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(hubR * 0.34, hubR * 0.38, thickness * 1.72, 6), {
      rx: Math.PI / 2,
      smoothAngle: 25,
      color: 0xF0BE62,
      boxUvScale: 0.5
    }));

    var numRivets = Math.min(12, numSpokes * 2);
    var rivetR = (rimOuter + rimInner) * 0.5;
    for (var rv = 0; rv < numRivets; rv++) {
      var rAng = (rv / numRivets) * Math.PI * 2 + 0.14;
      var rxPos = Math.cos(rAng) * rivetR;
      var ryPos = Math.sin(rAng) * rivetR;
      parts.push(bakePart(new THREE.SphereGeometry(outerR * 0.038, 8, 6), {
        tx: rxPos, ty: ryPos, tz: thickness * 0.50,
        smoothAngle: 70, color: 0xF5C86E
      }));
      parts.push(bakePart(new THREE.SphereGeometry(outerR * 0.038, 8, 6), {
        tx: rxPos, ty: ryPos, tz: -thickness * 0.50,
        smoothAngle: 70, color: 0xF5C86E
      }));
    }

    return mergeBufferGeometries(parts);
  }

  /**
   * Giant Chunky 12-Paddle Aged Walnut/Oak Waterwheel with Smooth Painterly Polar Rim UVs.
   */
  function buildWaterwheelGeometry(outerR, wheelWidth, numPaddles, numSpokes) {
    var parts = [];
    // Thick chunky 0.23 * outerR oak rims matching Master Reference Image!
    var rimOuter = outerR * 0.95;
    var rimInner = outerR * 0.72;
    var innerBandR = outerR * 0.52;
    var hubR = outerR * 0.22;
    var sideZ = wheelWidth * 0.44;

    for (var side = -1; side <= 1; side += 2) {
      var zOff = side * sideZ;

      var rShape = new THREE.Shape();
      rShape.absarc(0, 0, rimOuter, 0, Math.PI * 2, false);
      var rHole = new THREE.Path();
      rHole.absarc(0, 0, rimInner, 0, Math.PI * 2, true);
      rShape.holes.push(rHole);

      parts.push(bakePart(new THREE.ExtrudeGeometry(rShape, {
        depth: 0.19,
        bevelEnabled: true,
        bevelThickness: 0.032,
        bevelSize: 0.032,
        bevelSegments: 2,
        curveSegments: 36
      }), {
        tz: zOff - 0.095,
        smoothAngle: 38,
        polarUv: { innerR: rimInner, outerR: rimOuter, circumRepeats: 3.0 },
        color: 0xBE804A
      }));

      // Wrought-iron bolt studs around the chunky wooden rim
      var rimMidR = (rimOuter + rimInner) * 0.5;
      for (var rb = 0; rb < numPaddles; rb++) {
        var bAng = (rb / numPaddles) * Math.PI * 2;
        parts.push(bakePart(new THREE.SphereGeometry(0.052, 7, 5), {
          tx: Math.cos(bAng) * rimMidR,
          ty: Math.sin(bAng) * rimMidR,
          tz: zOff + side * 0.11,
          smoothAngle: 65,
          color: 0x483222
        }));
      }

      // Inner structural walnut brace ring (smooth polar UV mapped!)
      var bShape = new THREE.Shape();
      bShape.absarc(0, 0, innerBandR, 0, Math.PI * 2, false);
      var bHole = new THREE.Path();
      bHole.absarc(0, 0, innerBandR - 0.14, 0, Math.PI * 2, true);
      bShape.holes.push(bHole);
      parts.push(bakePart(new THREE.ExtrudeGeometry(bShape, {
        depth: 0.13,
        bevelEnabled: false,
        curveSegments: 28
      }), {
        tz: zOff - 0.065,
        polarUv: { innerR: innerBandR - 0.14, outerR: innerBandR, circumRepeats: 3.0 },
        color: 0x9A6132
      }));

      // Thick radial walnut timber spokes per side
      var sLen = rimInner - hubR * 0.55;
      var sMid = hubR * 0.55 + sLen * 0.5;
      for (var sp = 0; sp < numSpokes; sp++) {
        var spAng = (sp / numSpokes) * Math.PI * 2;
        parts.push(bakePart(new THREE.BoxGeometry(sLen, 0.19, 0.14), {
          rz: spAng,
          tx: Math.cos(spAng) * sMid,
          ty: Math.sin(spAng) * sMid,
          tz: zOff,
          color: 0xAC6E3C,
          boxUvScale: 0.35
        }));
      }
    }

    // 12 Wide, chunky sunlit-walnut & honey-oak water-paddles spanning between front & back rims
    var paddleRadMid = (rimInner * 0.94 + outerR * 1.03) * 0.5;
    var paddleRadH = outerR * 1.04 - rimInner * 0.92;
    for (var p = 0; p < numPaddles; p++) {
      var pAng = (p / numPaddles) * Math.PI * 2;
      var px = Math.cos(pAng) * paddleRadMid;
      var py = Math.sin(pAng) * paddleRadMid;
      parts.push(bakePart(new THREE.BoxGeometry(paddleRadH, 0.125, wheelWidth * 0.98), {
        rz: pAng + 0.16,
        tx: px,
        ty: py,
        color: 0xBA7A44,
        boxUvScale: 0.35
      }));
      // Shadowed inner bucket backing board
      var backR = rimInner * 0.94;
      parts.push(bakePart(new THREE.BoxGeometry(0.095, 0.42, wheelWidth * 0.80), {
        rz: pAng,
        tx: Math.cos(pAng) * backR,
        ty: Math.sin(pAng) * backR,
        color: 0x623A1C,
        boxUvScale: 0.35
      }));
    }

    // Heavy walnut + dark iron-banded central axle barrel
    parts.push(bakePart(new THREE.CylinderGeometry(hubR, hubR, wheelWidth * 1.28, 16), {
      rx: Math.PI / 2,
      smoothAngle: 55,
      color: 0x9A6132,
      boxUvScale: 0.4
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(hubR * 1.15, hubR * 1.15, 0.14, 16), {
      rx: Math.PI / 2,
      tz: sideZ,
      smoothAngle: 55,
      color: 0x4A2E1C
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(hubR * 1.15, hubR * 1.15, 0.14, 16), {
      rx: Math.PI / 2,
      tz: -sideZ,
      smoothAngle: 55,
      color: 0x4A2E1C
    }));

    return mergeBufferGeometries(parts);
  }

  function buildAxleBracketGeometry() {
    var parts = [];
    // Recessed stone mount block strictly behind the wheel (tz <= 0.12 so NEVER pokes through wheel hub!)
    parts.push(bakePart(new THREE.BoxGeometry(0.82, 0.74, 0.72), {
      tz: -0.22,
      color: 0x6D7584,
      boxUvScale: 0.4
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(0.18, 0.22, 0.52, 12), {
      rx: Math.PI / 2,
      tz: 0.05,
      color: 0x4A2E14,
      smoothAngle: 50
    }));
    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 5. Four Corner Stone-Bowl Fire Braziers & Flickering 3D Flame Tongues
  // ============================================================================
  var CORNER_BRAZIER_SPOTS = [
    { col: 0, row: 0, x: -7.0, z: -7.0, phase: 0.0 },
    { col: 7, row: 0, x:  7.0, z: -7.0, phase: 1.73 },
    { col: 7, row: 7, x:  7.0, z:  7.0, phase: 3.41 },
    { col: 0, row: 7, x: -7.0, z:  7.0, phase: 5.09 }
  ];

  function buildBrazierShadowsGeometry() {
    var parts = [];
    for (var b = 0; b < CORNER_BRAZIER_SPOTS.length; b++) {
      var bx = CORNER_BRAZIER_SPOTS[b].x;
      var bz = CORNER_BRAZIER_SPOTS[b].z;
      var srcDisc = new THREE.PlaneGeometry(1.66, 1.66);
      var disc = srcDisc.toNonIndexed();
      srcDisc.dispose();
      disc.rotateX(-Math.PI * 0.5);
      disc.translate(bx, 0.005, bz);
      parts.push(disc);
    }
    return mergeBufferGeometries(parts);
  }

  function buildAllCornerBraziersGeometry() {
    var parts = [];
    for (var b = 0; b < CORNER_BRAZIER_SPOTS.length; b++) {
      var bx = CORNER_BRAZIER_SPOTS[b].x;
      var bz = CORNER_BRAZIER_SPOTS[b].z;

      // 1. Stepped octagonal dark-terracotta plinth (planted flush at Y = 0.000m with base contact darkening!)
      parts.push(bakePart(new THREE.CylinderGeometry(0.46, 0.56, 0.14, 8), {
        tx: bx, ty: 0.07, tz: bz, ry: Math.PI / 8,
        color: 0x7A3D1D,
        boxUvScale: 0.65,
        shadeFn: function (px, py) {
          return py < 0.04 ? [0.58, 0.50, 0.45] : [1.0, 0.94, 0.88];
        }
      }));

      // 2. Carved pedestal column + 4 sculpted buttress legs (matching Reference Image!)
      parts.push(bakePart(new THREE.CylinderGeometry(0.23, 0.34, 0.44, 12), {
        tx: bx, ty: 0.34, tz: bz,
        smoothAngle: 55,
        color: 0x75381A,
        boxUvScale: 0.7
      }));
      for (var leg = 0; leg < 4; leg++) {
        var lAng = leg * (Math.PI * 0.5) + Math.PI * 0.25;
        parts.push(bakePart(new THREE.BoxGeometry(0.12, 0.42, 0.20), {
          rz: 0.18 * Math.cos(lAng),
          rx: -0.18 * Math.sin(lAng),
          ry: lAng,
          tx: bx + Math.cos(lAng) * 0.27,
          ty: 0.30,
          tz: bz + Math.sin(lAng) * 0.27,
          color: 0x5E2A11,
          boxUvScale: 0.8
        }));
      }

      // 3. Sculpted wide terracotta-stone fire basin & rolled rim
      var lathePts = [
        new THREE.Vector2(0.00, 0.50),
        new THREE.Vector2(0.25, 0.52),
        new THREE.Vector2(0.51, 0.66),
        new THREE.Vector2(0.60, 0.80),
        new THREE.Vector2(0.62, 0.88),
        new THREE.Vector2(0.51, 0.91),
        new THREE.Vector2(0.44, 0.76),
        new THREE.Vector2(0.00, 0.72)
      ];
      parts.push(bakePart(new THREE.LatheGeometry(lathePts, 18), {
        tx: bx, tz: bz,
        smoothAngle: 55,
        color: 0xA2542A,
        boxUvScale: 0.65,
        shadeFn: function (px, py) {
          return py < 0.64 ? [0.68, 0.60, 0.55] : [1.0, 0.92, 0.84];
        }
      }));

      // 4. Glowing crimson-amber ember & charcoal mound inside bowl (Y = 0.74m..0.86m)
      parts.push(bakePart(new THREE.SphereGeometry(0.43, 14, 8), {
        sx: 1.0, sy: 0.32, sz: 1.0,
        tx: bx, ty: 0.76, tz: bz,
        smoothAngle: 70,
        color: 0xFF6210,
        shadeFn: function (px, py, pz) {
          var rad = Math.hypot(px - bx, pz - bz) / 0.43;
          var glow = clamp(1.22 - rad * 0.82, 0.24, 1.0);
          return [glow, glow * 0.50, glow * 0.14];
        }
      }));
    }
    return mergeBufferGeometries(parts);
  }

  function makeFlameTongueGeometry(radius, height, leanX, leanZ, twistPhase, ox, oz) {
    var src = new THREE.SphereGeometry(radius, 12, 12);
    var geo = src.toNonIndexed();
    src.dispose();
    var pos = geo.getAttribute('position');
    var cols = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var y = pos.getY(i);
      var z = pos.getZ(i);
      var u = clamp((y + radius) / (2.0 * radius), 0.0, 1.0);
      var ang = Math.atan2(z, x);
      // Fluted flame cross-section tapering cleanly to a sharp dancing lick
      var flute = 1.0 + 0.15 * Math.sin(ang * 3.0 + u * 4.5 + twistPhase);
      var env = Math.sin(Math.pow(u, 0.46) * Math.PI) * (1.22 - 0.78 * u) * flute;
      var sCurveX = leanX * Math.pow(u, 1.35) + 0.055 * Math.sin(u * 6.4 + twistPhase);
      var sCurveZ = leanZ * Math.pow(u, 1.35) + 0.055 * Math.cos(u * 5.8 + twistPhase);
      pos.setXYZ(i, ox + x * env + sCurveX, u * height, oz + z * env + sCurveZ);

      // Linearized sRGB fire gradient: golden-cream base (#FFF08A) -> rich amber (#FF9418) -> fiery tangerine tip (#F44808)
      var sr = clamp(1.00 - 0.04 * u * u, 0.90, 1.0);
      var sg = clamp(0.93 - 0.65 * Math.pow(u, 0.88), 0.22, 0.95);
      var sb = clamp(0.52 - 0.49 * Math.pow(u, 0.62), 0.02, 0.54);
      cols[i * 3]     = Math.pow(sr, 2.2);
      cols[i * 3 + 1] = Math.pow(sg, 2.2);
      cols[i * 3 + 2] = Math.pow(sb, 2.2);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    weldSmoothNormals(geo, 80);
    return geo;
  }

  function buildStylizedFlameGeometry() {
    // 5-tongue sculpted Ankama dancing fire cluster (non-indexed for clean merge!)
    var tongues = [
      makeFlameTongueGeometry(0.32, 1.12,  0.03, -0.02, 0.0,   0.00,  0.00),
      makeFlameTongueGeometry(0.23, 0.84,  0.15,  0.06, 1.4,   0.13,  0.05),
      makeFlameTongueGeometry(0.22, 0.78, -0.14,  0.10, 2.8,  -0.12,  0.08),
      makeFlameTongueGeometry(0.23, 0.82, -0.06, -0.15, 4.1,  -0.05, -0.13),
      makeFlameTongueGeometry(0.21, 0.72,  0.10, -0.12, 5.3,   0.10, -0.10)
    ];
    return mergeBufferGeometries(tongues);
  }

  // ============================================================================
  // 6. Sunlit Cerulean Sky Dome & Sculpted 3D Cumulus Cloud Sea
  // ============================================================================
  function buildSkyDomeGeometry() {
    var geo = new THREE.SphereGeometry(138.0, 32, 24);
    var pos = geo.getAttribute('position');
    var cols = new Float32Array(pos.count * 3);

    // Isometric camera at (18.0, 20.2, 21.8) looks toward (0.0, -1.45, 0.0) along (-0.51, -0.61, -0.61),
    // hitting the far sky sphere across ny in [-0.79 .. -0.32] (and up to +0.5 when orbiting low).
    for (var i = 0; i < pos.count; i++) {
      var vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
      var len = Math.hypot(vx, vy, vz) || 1.0;
      var nx = vx / len, ny = vy / len, nz = vz / len;

      // Map ny in [-0.78 (screen bottom) .. -0.30 (screen top)] smoothly from
      // luminous cyan-horizon (#7CC8FA) to saturated Ankama sunlit cerulean (#3290E6)!
      var uScreen = clamp((ny + 0.78) / 0.48, 0.0, 1.0);
      var sr = 0.48 - 0.29 * uScreen;
      var sg = 0.79 - 0.23 * uScreen;
      var sb = 0.98 - 0.08 * uScreen;

      var sunSide = clamp((-nx * 0.65 - nz * 0.35 + 0.22) * 0.5, 0.0, 1.0);
      var glow = sunSide * sunSide * 0.05 * (1.0 - 0.45 * uScreen);
      cols[i * 3]     = Math.pow(clamp(sr + glow, 0.0, 1.0), 2.2);
      cols[i * 3 + 1] = Math.pow(clamp(sg + glow * 0.9, 0.0, 1.0), 2.2);
      cols[i * 3 + 2] = Math.pow(clamp(sb + glow * 0.4, 0.0, 1.0), 2.2);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  // Exact isometric frustum projection matching Round 3 camera [18.0, 20.2, 21.8] -> [0.0, -1.45, 0.0], FOV 34.0°
  // while sitting at depthD >= 52m (strictly behind every cliff/island vertex)!
  function projectFrustumCloud(ndcX, ndcY, depthD) {
    var camX = 18.0, camY = 20.2, camZ = 21.8;
    var dx = 0.0 - camX, dy = -1.45 - camY, dz = 0.0 - camZ;
    var fLen = Math.hypot(dx, dy, dz) || 1.0;
    var fx = dx / fLen, fy = dy / fLen, fz = dz / fLen;
    // R = normalize(F x (0, 1, 0)) = normalize((-fz, 0, fx))
    var rLen = Math.hypot(-fz, fx) || 1.0;
    var rx = -fz / rLen, ry = 0.0, rz = fx / rLen;
    // U = R x F
    var ux = ry * fz - rz * fy;
    var uy = rz * fx - rx * fz;
    var uz = rx * fy - ry * fx;

    var halfH = depthD * Math.tan(34.0 * 0.5 * Math.PI / 180.0);
    var halfW = halfH * (16.0 / 9.0);
    var xOff = ndcX * halfW;
    var yOff = ndcY * halfH;

    return [
      camX + fx * depthD + rx * xOff + ux * yOff,
      camY + fy * depthD + ry * xOff + uy * yOff,
      camZ + fz * depthD + rz * xOff + uz * yOff
    ];
  }

  function appendCumulusCluster(parts, cx, cy, cz, scaleVal, rotY, seed) {
    // 13-sphere voluptuous Ankama toy-box cumulus cloud bank (#FFFFFF crisp sunlit crown, #A8D8FA cool sky belly)
    var puffs = [
      [ 0.00,  0.42,  0.00, 1.56, 1.28, 1.44],
      [-1.18,  0.16,  0.22, 1.28, 1.08, 1.20],
      [ 1.22,  0.18, -0.18, 1.30, 1.10, 1.18],
      [-0.56,  0.74, -0.30, 1.16, 1.12, 1.08],
      [ 0.62,  0.68,  0.28, 1.14, 1.06, 1.06],
      [ 0.04,  0.92,  0.06, 0.96, 0.92, 0.94],
      [-2.05, -0.12, -0.08, 0.98, 0.84, 0.96],
      [ 2.10, -0.10,  0.16, 1.02, 0.86, 0.98],
      [-1.58,  0.42, -0.34, 0.88, 0.84, 0.86],
      [ 1.62,  0.40,  0.30, 0.90, 0.82, 0.86],
      [ 0.10, -0.08,  1.02, 1.12, 0.90, 1.02],
      [-0.78, -0.16,  0.86, 0.94, 0.78, 0.90],
      [ 0.84, -0.14, -0.88, 0.96, 0.80, 0.92]
    ];
    var cosR = Math.cos(rotY), sinR = Math.sin(rotY);
    var yMin = cy - 0.92 * scaleVal;
    var ySpan = 2.68 * scaleVal;

    for (var i = 0; i < puffs.length; i++) {
      var pf = puffs[i];
      var lx = pf[0] * scaleVal;
      var ly = pf[1] * scaleVal;
      var lz = pf[2] * scaleVal;
      var wx = cx + lx * cosR - lz * sinR;
      var wy = cy + ly;
      var wz = cz + lx * sinR + lz * cosR;

      parts.push(bakePart(new THREE.SphereGeometry(1.0, 14, 10), {
        sx: pf[3] * scaleVal * (0.95 + 0.10 * Math.sin(seed + i * 1.3)),
        sy: pf[4] * scaleVal * (0.96 + 0.08 * Math.cos(seed * 0.7 + i)),
        sz: pf[5] * scaleVal,
        tx: wx,
        ty: wy,
        tz: wz,
        smoothAngle: 82,
        boxUvScale: 0.08,
        color: 0xFFFFFF,
        shadeFn: function (px, py, pz, nx, ny, nz) {
          var h = clamp((py - yMin) / ySpan, 0.0, 1.0);
          // Per-puff spherical normal shading from upper-left sun (-X, +Y, +Z) with generous pure-white sunlit crowns!
          var sunDot = clamp(ny * 0.70 - nx * 0.36 + nz * 0.22 + 0.34, 0.0, 1.0);
          var raw = clamp((0.34 * h + 0.66 * sunDot - 0.12) / 0.74, 0.0, 1.0);
          var crown = raw * raw * (3.0 - 2.0 * raw);
          // Un-tonemapped sRGB: soft sky-blue crescent (#9CD0F8) -> crisp sunlit pure white crown (#FFFFFF)!
          var sr = 0.61 + 0.39 * crown;
          var sg = 0.82 + 0.18 * crown;
          var sb = 0.97 + 0.03 * crown;
          return [
            Math.pow(clamp(sr, 0.0, 1.0), 2.2),
            Math.pow(clamp(sg, 0.0, 1.0), 2.2),
            Math.pow(clamp(sb, 0.0, 1.0), 2.2)
          ];
        }
      }));
    }
  }

  function buildCloudRingGeometry(isUpperRing) {
    var parts = [];
    // Frustum-projected specs: [ndcX, ndcY, depthD, scaleVal, rotY]
    // Balanced ~62% vivid cerulean blue sky / ~38% crisp #FFFFFF cumulus framing!
    var frustumSpecs = isUpperRing
      ? [
          // Upper-Left corner cumulus bank (behind Warrior medallion & cogs)
          [-0.88,  0.74, 55.0, 2.35, 0.35],
          [-0.54,  0.90, 58.0, 2.00, 1.15],
          [-0.96,  0.22, 54.0, 2.00, 2.05],
          // Upper-Right cumulus bank (leaving open cerulean sky channel above the top brazier!)
          [ 0.48,  0.80, 56.5, 2.30, 1.65],
          [ 0.88,  0.52, 54.5, 2.35, 0.55],
          // Right edge cumulus puff (behind right brazier)
          [ 0.95, -0.08, 53.5, 2.15, 1.90]
        ]
      : [
          // Lower-Left, Bottom Cliff-Base & Lower-Right cumulus framing
          [-0.84, -0.64, 52.5, 2.30, 0.45],
          [-0.30, -0.84, 53.5, 2.40, 1.35],
          [ 0.30, -0.84, 53.5, 2.35, 2.25],
          [ 0.84, -0.62, 52.5, 2.25, 0.95],
          // Compact Central Under-Island Cloud Sea (hidden in Lv1-3, revealed inside Level 4's Sky Chasm!)
          [-0.20,  0.06, 59.0, 1.95, 0.60],
          [ 0.06,  0.01, 60.5, 2.10, 1.85],
          [ 0.24, -0.05, 58.5, 1.90, 2.65]
        ];

    for (var i = 0; i < frustumSpecs.length; i++) {
      var fs = frustumSpecs[i];
      var wp = projectFrustumCloud(fs[0], fs[1], fs[2]);
      appendCumulusCluster(parts, wp[0], wp[1], wp[2], fs[3], fs[4], i * 3.1 + (isUpperRing ? 0 : 17));
    }

    // Extra side/rear horizon clouds so orbiting the camera in 360 deg always sees clouds!
    var orbitExtras = isUpperRing
      ? [
          [ 26.0,  2.5,  24.0, 2.25, 0.7],
          [-26.0,  1.5,  24.0, 2.20, 1.9],
          [ 27.0,  2.0, -22.0, 2.25, 2.5]
        ]
      : [
          [  4.0, -9.5,  28.0, 2.30, 1.2],
          [ 24.0, -8.5,   4.0, 2.25, 2.1]
        ];
    for (var j = 0; j < orbitExtras.length; j++) {
      var oe = orbitExtras[j];
      appendCumulusCluster(parts, oe[0], oe[1], oe[2], oe[3], oe[4], 41 + j * 2.7);
    }

    return mergeBufferGeometries(parts);
  }

  // ============================================================================
  // 7. Interactive Brass Crank-Wheel Gear Knobs & Tile Highlight Ring
  // ============================================================================
  function buildGearKnobCapstanGeometry() {
    var parts = [];
    // Mounting bracket + toothed stem + gleaming 4-spoke brass handwheel
    parts.push(bakePart(new THREE.BoxGeometry(0.46, 0.32, 0.46), {
      ty: -0.20,
      color: 0x7D511B,
      boxUvScale: 0.8
    }));
    parts.push(bakePart(new THREE.CylinderGeometry(0.10, 0.12, 0.42, 12), {
      ty: 0.08,
      color: 0xB87D32,
      smoothAngle: 55
    }));
    parts.push(bakePart(new THREE.TorusGeometry(0.34, 0.058, 10, 20), {
      rx: Math.PI / 2,
      ty: 0.28,
      color: 0xF5BE4F,
      smoothAngle: 65
    }));
    parts.push(bakePart(new THREE.BoxGeometry(0.66, 0.055, 0.07), {
      ty: 0.28,
      color: 0xE5A832
    }));
    parts.push(bakePart(new THREE.BoxGeometry(0.07, 0.055, 0.66), {
      ty: 0.28,
      color: 0xE5A832
    }));
    // Tall brass crank handle knob for crisp visual silhouette & easy clicking
    parts.push(bakePart(new THREE.CylinderGeometry(0.055, 0.045, 0.22, 10), {
      tx: 0.28,
      ty: 0.40,
      color: 0xFFE082,
      smoothAngle: 55
    }));
    return mergeBufferGeometries(parts);
  }

  function buildHighlightRingGeometry() {
    var outerH = 0.86;
    var innerH = 0.72;
    var rOut = 0.17;
    var rIn = 0.12;

    function traceRounded(path, h, r) {
      path.moveTo(-h + r, -h);
      path.lineTo( h - r, -h);
      path.quadraticCurveTo( h, -h,  h, -h + r);
      path.lineTo( h,  h - r);
      path.quadraticCurveTo( h,  h,  h - r,  h);
      path.lineTo(-h + r,  h);
      path.quadraticCurveTo(-h,  h, -h,  h - r);
      path.lineTo(-h, -h + r);
      path.quadraticCurveTo(-h, -h, -h + r, -h);
    }

    var shape = new THREE.Shape();
    traceRounded(shape, outerH, rOut);
    var hole = new THREE.Path();
    traceRounded(hole, innerH, rIn);
    shape.holes.push(hole);

    var geo = new THREE.ShapeGeometry(shape, 6);
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingSphere();
    return geo;
  }

  // ============================================================================
  // 8. World Singleton State, Zero-GC Temporaries & Public API
  // ============================================================================
  var _scene = null;
  var _rootGroup = null;
  var _initialized = false;
  var _cache = null;
  var _gpuPrewarmGroup = null;

  // Reusable zero-GC math objects for per-frame updates & raycasting
  var _mat4 = null;
  var _posV = null;
  var _quat = null;
  var _euler = null;
  var _scaleV = null;
  var _colorTmp = null;
  var _raycaster = null;
  var _rayHits = [];

  // Scene meshes & InstancedMeshes
  var _skyMesh = null;
  var _cloudUpperGroup = null;
  var _cloudLowerGroup = null;
  var _cloudMistPoints = null;

  var _mortarFullMesh = null;
  var _mortarSplitMesh = null;
  var _cliffFullMesh = null;
  var _cliffSplitMesh = null;

  var _cogMeshes = [];     // 4 giant left-flank interlocking bronze cogwheels
  var _waterMeshes = [];   // 2 giant right-flank wooden paddle-waterwheels
  var _bracketMeshes = []; // Stone/iron cliff axle brackets

  var _braziersMesh = null;
  var _brazierShadowMesh = null;
  var _brazierHaloPoints = null;
  var _flameOuterInst = null;
  var _flameInnerInst = null;
  var _sparkPoints = null;
  var _sparkPosAttr = null;
  var _sparkSeeds = null;
  var SPARKS_PER_BRAZIER = 7;

  // 64-tile board InstancedMeshes (all 64 movable blocks drawn in <= 9 draw calls!)
  var _instSandstone = null;
  var _instMossBase = null;
  var _instMossCushion = null;
  var _instMossOverhang = null;
  var _instChannel = null;
  var _instChannelCorner = null;
  var _instBridge = null;
  var _instRoller = null;
  var _instRollerHit = null;
  var _instExit = null;
  var _instPillar = null;
  var _instHighlight = null;

  // Pooled interactive Gear Knobs & Ferry Call Levers
  var MAX_GEAR_KNOBS = 6;
  var _gearKnobPool = [];
  var _ferryLeverPool = [];

  // Cached board state for analytical grounding, water checks & collisions
  var _hasChasm = false;
  var _levelId = 1;
  var _boardCells = []; // [row][col] -> { type, channelAxis, rollerDir, isExit, blockedByBridge }
  var _waterActiveMap = {};
  var _ferryState = null;
  var _ferryVisualCol = 2.0;
  var _obstacles = [];
  var _pickables = [];
  var _raycastTargets = [];
  var _activeHighlights = [];

  // Active smooth mechanical animations
  var _rowSlideAnim = null; // { axis, index, delta, elapsed, duration, onComplete }
  var _ferryAnim = null;    // { fromCol, toCol, elapsed, duration, onComplete }
  var _cogSpinBoost = 0.0;
  var _cogPhase = 0.0;
  var _waterPhase = 0.0;

  // Ensure blank 8x8 board table exists before first buildLevel
  function initEmptyBoardTable() {
    _boardCells = new Array(GRID_SIZE);
    for (var r = 0; r < GRID_SIZE; r++) {
      _boardCells[r] = new Array(GRID_SIZE);
      for (var c = 0; c < GRID_SIZE; c++) {
        _boardCells[r][c] = {
          type: 'sandstone',
          channelAxis: 'col',
          flowDir: -1,
          isCornerChannel: false,
          cornerRotY: 0.0,
          rollerDir: 1,
          isExit: false,
          hasBridge: false
        };
      }
    }
  }
  initEmptyBoardTable();

  function buildCachedAssets() {
    var Tex = window.GAME.Textures;
    var maps = (Tex && typeof Tex.init === 'function') ? Tex.init() : {};

    var matSandstone = new THREE.MeshStandardMaterial({
      map: maps.sandstone || null,
      bumpMap: maps.sandstoneBump || null,
      bumpScale: 0.036,
      roughness: 0.78,
      metalness: 0.03,
      envMapIntensity: 0.34,
      vertexColors: true
    });

    var matMoss = new THREE.MeshStandardMaterial({
      map: maps.moss || null,
      bumpMap: maps.mossBump || null,
      bumpScale: 0.009,
      roughness: 0.84,
      metalness: 0.01,
      envMapIntensity: 0.28,
      vertexColors: true
    });

    var matCliff = new THREE.MeshStandardMaterial({
      map: maps.cliffStone || null,
      bumpMap: maps.cliffBump || null,
      bumpScale: 0.024,
      roughness: 0.78,
      metalness: 0.03,
      emissive: 0x2B323D,
      emissiveIntensity: 0.34,
      envMapIntensity: 0.54,
      vertexColors: true
    });

    var matMortar = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.96,
      metalness: 0.01,
      envMapIntensity: 0.08,
      vertexColors: true
    });

    var matBronze = new THREE.MeshStandardMaterial({
      map: maps.bronze || null,
      bumpMap: maps.bronzeBump || null,
      bumpScale: 0.014,
      roughness: 0.33,
      metalness: 0.44,
      emissive: 0x2A1704,
      emissiveIntensity: 0.14,
      envMapIntensity: 0.56,
      vertexColors: true
    });

    var matOak = new THREE.MeshStandardMaterial({
      map: maps.oakWood || null,
      bumpMap: maps.oakBump || null,
      bumpScale: 0.006,
      roughness: 0.70,
      metalness: 0.03,
      envMapIntensity: 0.36,
      vertexColors: true
    });

    var matBrazier = new THREE.MeshStandardMaterial({
      map: maps.sandstone || null,
      bumpMap: maps.sandstoneBump || null,
      bumpScale: 0.024,
      roughness: 0.68,
      metalness: 0.07,
      envMapIntensity: 0.34,
      vertexColors: true
    });

    var matBrazierShadow = new THREE.MeshBasicMaterial({
      map: maps.aoShadow || null,
      transparent: true,
      opacity: 0.62,
      depthWrite: false
    });

    // Unlit & un-tonemapped sRGB cumulus cloud material so crowns hit crisp sunlit #FFFFFF!
    var matCloud = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      fog: false
    });

    var matSky = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      fog: false
    });

    var matFlameOuter = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      toneMapped: false,
      depthWrite: false
    });

    var matFlameInner = new THREE.MeshBasicMaterial({
      color: 0xFFF098,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false
    });

    var matFireHalo = new THREE.PointsMaterial({
      size: 3.30,
      map: maps.fireGlow || null,
      color: 0xFFA234,
      transparent: true,
      opacity: 0.70,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
      sizeAttenuation: true
    });

    var matSpark = new THREE.PointsMaterial({
      size: 0.40,
      map: maps.fireGlow || null,
      color: 0xFFD874,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      depthWrite: false,
      sizeAttenuation: true
    });

    var matCloudMist = new THREE.PointsMaterial({
      size: 24.0,
      map: maps.cloudPuff || null,
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.18,
      toneMapped: false,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false
    });

    var matHighlight = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.30,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    var matHitProxy = new THREE.MeshBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      colorWrite: false
    });

    var geoms = {
      sandstone: buildSandstoneTileGeometry(),
      exit: buildExitTileGeometry(),
      bridge: buildBridgeTileGeometry(),
      roller: buildRollerTileGeometry(),
      rollerHitPlane: (function () {
        var pg = new THREE.PlaneGeometry(1.88, 1.88);
        pg.rotateX(-Math.PI * 0.5);
        pg.computeBoundingSphere();
        return pg;
      })(),
      pillar: buildPillarGeometry(),
      channel: buildChannelTileGeometry(),
      channelCorner: buildChannelCornerGeometry(),
      mossBase: buildMossBaseGeometry(),
      mossCushion: buildMossCushionGeometry(),
      mossOverhang: buildMossOverhangGeometry(),
      mortarFull: buildMortarBedGeometry(false),
      mortarSplit: buildMortarBedGeometry(true),
      cliffFull: buildCliffGeometry(false),
      cliffSplit: buildCliffGeometry(true),
      cogLarge: buildCogwheelGeometry(2.50, 0.42, 16, 6),
      cogMedium: buildCogwheelGeometry(2.08, 0.40, 13, 5),
      waterTR: buildWaterwheelGeometry(2.55, 0.88, 12, 8),
      waterBR: buildWaterwheelGeometry(2.75, 0.94, 12, 8),
      bracket: buildAxleBracketGeometry(),
      braziers: buildAllCornerBraziersGeometry(),
      brazierShadows: buildBrazierShadowsGeometry(),
      flame: buildStylizedFlameGeometry(),
      sky: buildSkyDomeGeometry(),
      cloudUpper: buildCloudRingGeometry(true),
      cloudLower: buildCloudRingGeometry(false),
      gearKnob: buildGearKnobCapstanGeometry(),
      knobHit: new THREE.SphereGeometry(0.62, 8, 6),
      highlight: buildHighlightRingGeometry()
    };
    geoms.knobHit.computeBoundingSphere();

    var mats = {
      sandstone: matSandstone,
      moss: matMoss,
      cliff: matCliff,
      mortar: matMortar,
      bronze: matBronze,
      oak: matOak,
      brazier: matBrazier,
      brazierShadow: matBrazierShadow,
      cloud: matCloud,
      sky: matSky,
      flameOuter: matFlameOuter,
      flameInner: matFlameInner,
      fireHalo: matFireHalo,
      spark: matSpark,
      cloudMist: matCloudMist,
      highlight: matHighlight,
      hitProxy: matHitProxy
    };

    return { geoms: geoms, mats: mats };
  }

  function makeInstanced(geom, mat, maxCount, castShad, recvShad, withColor) {
    var inst = new THREE.InstancedMesh(geom, mat, maxCount);
    inst.castShadow = Boolean(castShad);
    inst.receiveShadow = Boolean(recvShad);
    inst.frustumCulled = false;
    var c = new THREE.Color(1, 1, 1);
    var m = new THREE.Matrix4();
    for (var i = 0; i < maxCount; i++) {
      inst.setMatrixAt(i, m);
      if (withColor) {
        inst.setColorAt(i, c);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.count = 0;
    return inst;
  }

  function init(scene) {
    if (typeof THREE === 'undefined') return;
    _scene = scene || _scene;

    if (_initialized) {
      if (_scene && _rootGroup && _rootGroup.parent !== _scene) {
        _scene.add(_rootGroup);
      }
      return;
    }

    _mat4 = new THREE.Matrix4();
    _posV = new THREE.Vector3();
    _quat = new THREE.Quaternion();
    _euler = new THREE.Euler();
    _scaleV = new THREE.Vector3(1, 1, 1);
    _colorTmp = new THREE.Color();
    _raycaster = new THREE.Raycaster();

    _cache = buildCachedAssets();
    var G = _cache.geoms;
    var M = _cache.mats;

    _rootGroup = new THREE.Group();
    _rootGroup.name = 'ClockworkSanctumWorld';

    // 1. Cerulean Sky Dome & Drifting 3D Cumulus Cloud Sea
    _skyMesh = new THREE.Mesh(G.sky, M.sky);
    _skyMesh.name = 'CeruleanSkyDome';
    _skyMesh.frustumCulled = false;
    _skyMesh.renderOrder = -10;
    _rootGroup.add(_skyMesh);

    _cloudUpperGroup = new THREE.Group();
    var upperMesh = new THREE.Mesh(G.cloudUpper, M.cloud);
    upperMesh.frustumCulled = false;
    _cloudUpperGroup.add(upperMesh);
    _rootGroup.add(_cloudUpperGroup);

    _cloudLowerGroup = new THREE.Group();
    var lowerMesh = new THREE.Mesh(G.cloudLower, M.cloud);
    lowerMesh.frustumCulled = false;
    _cloudLowerGroup.add(lowerMesh);
    _rootGroup.add(_cloudLowerGroup);

    // Soft airy cloud-puff mist sprites strictly inside cumulus cloud cluster centers (zero stray sky dots!)
    var mistNdcSpecs = [
      [-0.88,  0.74, 54.5], [-0.96,  0.22, 53.5], [ 0.48,  0.80, 56.0],
      [ 0.88,  0.52, 54.0], [-0.84, -0.64, 52.0], [-0.30, -0.84, 53.0],
      [ 0.30, -0.84, 53.0], [ 0.84, -0.62, 52.0]
    ];
    var mistCoords = [];
    for (var mn = 0; mn < mistNdcSpecs.length; mn++) {
      mistCoords.push(projectFrustumCloud(mistNdcSpecs[mn][0], mistNdcSpecs[mn][1], mistNdcSpecs[mn][2]));
    }
    var mistGeo = new THREE.BufferGeometry();
    var mistPos = new Float32Array(mistCoords.length * 3);
    for (var mc = 0; mc < mistCoords.length; mc++) {
      mistPos[mc * 3]     = mistCoords[mc][0];
      mistPos[mc * 3 + 1] = mistCoords[mc][1];
      mistPos[mc * 3 + 2] = mistCoords[mc][2];
    }
    mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    mistGeo.computeBoundingSphere();
    G.cloudMist = mistGeo;
    _cloudMistPoints = new THREE.Points(mistGeo, M.cloudMist);
    _cloudMistPoints.frustumCulled = false;
    _rootGroup.add(_cloudMistPoints);

    // 2. Mortar Sub-Decks & Chiseled Stone Cliff Under-Structures
    _mortarFullMesh = new THREE.Mesh(G.mortarFull, M.mortar);
    _mortarFullMesh.receiveShadow = true;
    _rootGroup.add(_mortarFullMesh);

    _mortarSplitMesh = new THREE.Mesh(G.mortarSplit, M.mortar);
    _mortarSplitMesh.receiveShadow = true;
    _mortarSplitMesh.visible = false;
    _rootGroup.add(_mortarSplitMesh);

    _cliffFullMesh = new THREE.Mesh(G.cliffFull, M.cliff);
    _cliffFullMesh.castShadow = true;
    _cliffFullMesh.receiveShadow = true;
    _rootGroup.add(_cliffFullMesh);

    _cliffSplitMesh = new THREE.Mesh(G.cliffSplit, M.cliff);
    _cliffSplitMesh.castShadow = true;
    _cliffSplitMesh.receiveShadow = true;
    _cliffSplitMesh.visible = false;
    _rootGroup.add(_cliffSplitMesh);

    // 3. Flank Machinery — 4 Interlocking Bronze Cogwheels (Left) & 2 Wooden Waterwheels (Right)
    // Exact Master Reference Image Placement + Clean Bottom-HUD Clearance!
    var cogDefs = [
      // Top-Left Flank (-X cliff wall, wx = -8.46m, wheel plane in YZ -> ry = PI/2, boldly rising above mossy edge!)
      { geom: G.cogLarge,  x: -8.46, y: -0.14, z: -2.95, zSplit: -4.85, plane: 'YZ', ratio:  1.0,   phase0: 0.12 },
      { geom: G.cogMedium, x: -8.54, y: -0.52, z:  1.22, zSplit:  4.85, plane: 'YZ', ratio: -16/13, phase0: 0.36 },
      // Bottom-Left Flank (+Z front-left cliff wall, wz = +8.44m, wheel plane in XY -> ry = 0, interlocking & clearing bottom HUD!)
      { geom: G.cogMedium, x: -4.55, y: -1.62, z:  8.44, zSplit:  8.44, plane: 'XY', ratio:  16/13, phase0: 0.08 },
      { geom: G.cogLarge,  x: -0.42, y: -2.04, z:  8.52, zSplit:  8.52, plane: 'XY', ratio: -1.0,   phase0: 0.28 }
    ];
    for (var cg = 0; cg < cogDefs.length; cg++) {
      var cd = cogDefs[cg];
      var cMesh = new THREE.Mesh(cd.geom, M.bronze);
      cMesh.castShadow = true;
      cMesh.receiveShadow = true;
      cMesh.position.set(cd.x, cd.y, cd.z);
      if (cd.plane === 'YZ') cMesh.rotation.y = Math.PI * 0.5;
      _rootGroup.add(cMesh);
      _cogMeshes.push({ mesh: cMesh, def: cd });

      var brk = new THREE.Mesh(G.bracket, M.cliff);
      brk.position.set(
        cd.plane === 'YZ' ? cd.x + 0.50 : cd.x,
        Math.min(cd.y, -0.72),
        cd.plane === 'XY' ? cd.z - 0.50 : cd.z
      );
      if (cd.plane === 'YZ') brk.rotation.y = -Math.PI * 0.5;
      _rootGroup.add(brk);
      _bracketMeshes.push({ mesh: brk, def: cd });
    }

    var waterDefs = [
      // Top-Right Flank (-Z cliff wall, wz = -8.48m, feeding headwaters (5,0)&(6,0) & rising above mossy edge!)
      { geom: G.waterTR, x:  3.45, y: -0.18, z: -8.48, zSplit: -8.48, plane: 'XY', speed: -0.52 },
      // Bottom-Right Flank (+X front-right cliff wall, wx = +8.52m, prominent front-right paddlewheel clearing bottom HUD!)
      { geom: G.waterBR, x:  8.52, y: -1.32, z:  3.30, zSplit:  4.85, plane: 'YZ', speed:  0.46 }
    ];
    for (var wd = 0; wd < waterDefs.length; wd++) {
      var wDef = waterDefs[wd];
      var wMesh = new THREE.Mesh(wDef.geom, M.oak);
      wMesh.castShadow = true;
      wMesh.receiveShadow = true;
      wMesh.position.set(wDef.x, wDef.y, wDef.z);
      if (wDef.plane === 'YZ') wMesh.rotation.y = Math.PI * 0.5;
      _rootGroup.add(wMesh);
      _waterMeshes.push({ mesh: wMesh, def: wDef });

      var wBrk = new THREE.Mesh(G.bracket, M.cliff);
      wBrk.position.set(
        wDef.plane === 'YZ' ? wDef.x - 0.56 : wDef.x,
        Math.min(wDef.y, -0.72),
        wDef.plane === 'XY' ? wDef.z + 0.56 : wDef.z
      );
      if (wDef.plane === 'YZ') wBrk.rotation.y = Math.PI * 0.5;
      else wBrk.rotation.y = Math.PI;
      _rootGroup.add(wBrk);
      _bracketMeshes.push({ mesh: wBrk, def: wDef, isWater: true });
    }

    // 4. Four Corner Stone-Bowl Fire Braziers + Feathered Contact AO Shadows + Dancing 5-Tongue Flames + Halos
    _brazierShadowMesh = new THREE.Mesh(G.brazierShadows, M.brazierShadow);
    _brazierShadowMesh.renderOrder = 1;
    _rootGroup.add(_brazierShadowMesh);

    _braziersMesh = new THREE.Mesh(G.braziers, M.brazier);
    _braziersMesh.castShadow = true;
    _braziersMesh.receiveShadow = true;
    _rootGroup.add(_braziersMesh);

    _flameOuterInst = makeInstanced(G.flame, M.flameOuter, 4, false, false, false);
    _flameOuterInst.count = 4;
    _flameOuterInst.renderOrder = 4;
    _rootGroup.add(_flameOuterInst);

    _flameInnerInst = makeInstanced(G.flame, M.flameInner, 4, false, false, false);
    _flameInnerInst.count = 4;
    _flameInnerInst.renderOrder = 5;
    _rootGroup.add(_flameInnerInst);

    var haloGeo = new THREE.BufferGeometry();
    var haloPos = new Float32Array(CORNER_BRAZIER_SPOTS.length * 3);
    for (var hb = 0; hb < CORNER_BRAZIER_SPOTS.length; hb++) {
      haloPos[hb * 3]     = CORNER_BRAZIER_SPOTS[hb].x;
      haloPos[hb * 3 + 1] = 1.06;
      haloPos[hb * 3 + 2] = CORNER_BRAZIER_SPOTS[hb].z;
    }
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
    haloGeo.computeBoundingSphere();
    G.fireHalo = haloGeo;
    _brazierHaloPoints = new THREE.Points(haloGeo, M.fireHalo);
    _brazierHaloPoints.frustumCulled = false;
    _brazierHaloPoints.renderOrder = 5;
    _rootGroup.add(_brazierHaloPoints);

    var totalSparks = 4 * SPARKS_PER_BRAZIER;
    var sparkGeo = new THREE.BufferGeometry();
    var sparkPositions = new Float32Array(totalSparks * 3);
    _sparkSeeds = new Float32Array(totalSparks * 3);
    for (var sp = 0; sp < totalSparks; sp++) {
      var bIdx = Math.floor(sp / SPARKS_PER_BRAZIER);
      var spot = CORNER_BRAZIER_SPOTS[bIdx];
      _sparkSeeds[sp * 3]     = (sp % SPARKS_PER_BRAZIER) / SPARKS_PER_BRAZIER;
      _sparkSeeds[sp * 3 + 1] = 0.65 + (sp % 3) * 0.22;
      _sparkSeeds[sp * 3 + 2] = sp * 1.91;
      sparkPositions[sp * 3]     = spot.x;
      sparkPositions[sp * 3 + 1] = 1.05;
      sparkPositions[sp * 3 + 2] = spot.z;
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    sparkGeo.computeBoundingSphere();
    G.sparks = sparkGeo;
    _sparkPosAttr = sparkGeo.getAttribute('position');
    _sparkPoints = new THREE.Points(sparkGeo, M.spark);
    _sparkPoints.frustumCulled = false;
    _sparkPoints.renderOrder = 6;
    _rootGroup.add(_sparkPoints);

    // 5. 64-Tile Board InstancedMeshes (all initialized withColor=true so shared M.sandstone/M.moss shaders stay consistent!)
    var tileUd = { pickType: 'tile', col: null, row: null };
    _instSandstone     = makeInstanced(G.sandstone,     M.sandstone, 64,  true,  true,  true);
    _instMossBase      = makeInstanced(G.mossBase,      M.sandstone, 64,  true,  true,  true);
    _instMossCushion   = makeInstanced(G.mossCushion,   M.moss,      64,  true,  true,  true);
    _instMossOverhang  = makeInstanced(G.mossOverhang,  M.moss,      144, true,  true,  true);
    _instChannel       = makeInstanced(G.channel,       M.sandstone, 32,  true,  true,  true);
    _instChannelCorner = makeInstanced(G.channelCorner, M.sandstone, 8,   true,  true,  true);
    _instBridge        = makeInstanced(G.bridge,        M.sandstone, 16,  true,  true,  true);
    _instRoller        = makeInstanced(G.roller,        M.sandstone, 16,  true,  true,  true);
    _instRollerHit     = makeInstanced(G.rollerHitPlane, M.hitProxy, 16,  false, false, false);
    _instExit          = makeInstanced(G.exit,          M.sandstone, 8,   true,  true,  true);
    _instPillar        = makeInstanced(G.pillar,        M.sandstone, 16,  true,  true,  true);

    var pickableTileInsts = [
      _instSandstone, _instMossBase, _instMossCushion,
      _instChannel, _instChannelCorner, _instBridge, _instRoller, _instRollerHit, _instExit, _instPillar
    ];
    for (var pt = 0; pt < pickableTileInsts.length; pt++) {
      pickableTileInsts[pt].userData = tileUd;
      _rootGroup.add(pickableTileInsts[pt]);
      _raycastTargets.push(pickableTileInsts[pt]);
    }
    _rootGroup.add(_instMossOverhang);
    _raycastTargets.push(_cliffFullMesh, _cliffSplitMesh);

    // 6. Tactical Tile Highlight Ring InstancedMesh
    _instHighlight = makeInstanced(G.highlight, M.highlight, 64, false, false, true);
    _instHighlight.renderOrder = 5;
    _rootGroup.add(_instHighlight);

    // 7. Pooled Interactive Brass Crank-Wheel Gear Knobs & Ferry Call Levers
    for (var gk = 0; gk < MAX_GEAR_KNOBS; gk++) {
      var knobGrp = new THREE.Group();
      knobGrp.visible = false;
      var visWheel = new THREE.Mesh(G.gearKnob, M.bronze);
      visWheel.castShadow = true;
      var hitBall = new THREE.Mesh(G.knobHit, M.hitProxy);
      hitBall.position.y = 0.22;
      knobGrp.add(visWheel);
      knobGrp.add(hitBall);
      _rootGroup.add(knobGrp);
      _gearKnobPool.push({ group: knobGrp, wheel: visWheel, hit: hitBall });
    }

    for (var fl = 0; fl < 2; fl++) {
      var fGrp = new THREE.Group();
      fGrp.visible = false;
      var fWheel = new THREE.Mesh(G.gearKnob, M.bronze);
      fWheel.scale.set(0.85, 0.85, 0.85);
      var fHit = new THREE.Mesh(G.knobHit, M.hitProxy);
      fHit.position.y = 0.22;
      fGrp.add(fWheel);
      fGrp.add(fHit);
      _rootGroup.add(fGrp);
      _ferryLeverPool.push({ group: fGrp, wheel: fWheel, hit: fHit });
    }

    // 8. Frame-1 GPU Buffer Pre-Warm (guarantees deltaGeometries === 0 & deltaTextures === 0 across 8x level reloads!)
    _gpuPrewarmGroup = new THREE.Group();
    _gpuPrewarmGroup.position.set(0, -3.2, 0);
    _gpuPrewarmGroup.scale.set(0.0001, 0.0001, 0.0001);
    var prewarmPairs = [
      [G.sandstone, M.sandstone], [G.exit, M.sandstone], [G.bridge, M.sandstone],
      [G.roller, M.sandstone], [G.rollerHitPlane, M.hitProxy], [G.pillar, M.sandstone],
      [G.channel, M.sandstone], [G.channelCorner, M.sandstone],
      [G.mossBase, M.sandstone], [G.mossCushion, M.moss], [G.mossOverhang, M.moss],
      [G.mortarFull, M.mortar], [G.mortarSplit, M.mortar],
      [G.cliffFull, M.cliff], [G.cliffSplit, M.cliff],
      [G.cogLarge, M.bronze], [G.cogMedium, M.bronze],
      [G.waterTR, M.oak], [G.waterBR, M.oak], [G.bracket, M.cliff],
      [G.braziers, M.brazier], [G.brazierShadows, M.brazierShadow],
      [G.flame, M.flameOuter], [G.flame, M.flameInner],
      [G.gearKnob, M.bronze], [G.knobHit, M.hitProxy], [G.highlight, M.highlight]
    ];
    for (var pw = 0; pw < prewarmPairs.length; pw++) {
      var pm = new THREE.Mesh(prewarmPairs[pw][0], prewarmPairs[pw][1]);
      pm.frustumCulled = false;
      if (pw === prewarmPairs.length - 1) {
        pm.onAfterRender = function () {
          if (_gpuPrewarmGroup) _gpuPrewarmGroup.visible = false;
        };
      }
      _gpuPrewarmGroup.add(pm);
    }
    _rootGroup.add(_gpuPrewarmGroup);

    if (_scene) {
      _scene.add(_rootGroup);
    }

    // Boot-time parameter-order self-assertion for resolveHorizontal(x, yFeet, z, radius, height)
    _obstacles = [{ x: 2.0, z: 4.0, radius: 0.6, kind: 'test', id: 'assert', minX: 1.4, maxX: 2.6, minY: 0.0, maxY: 1.6, minZ: 3.4, maxZ: 4.6 }];
    var testRes = resolveHorizontal(2.1, 0.0, 4.0, 0.4, 1.5);
    if (!testRes.hit || testRes.x <= 2.5) {
      throw new Error('World.resolveHorizontal parameter-order assertion failed');
    }
    _obstacles = [];

    // Populate initial default 8x8 sandstone-moss board so even pre-Simulation renders look complete
    updateFlankPositionsAndFlames(0.0);
    repackBoardInstances();

    _initialized = true;
  }

  // ============================================================================
  // Board State Extraction & Instance Matrix Repacking
  // ============================================================================
  function extractTileAt(simState, col, row) {
    if (!simState) return null;
    if (simState.tileGrid && simState.tileGrid[row] && simState.tileGrid[row][col]) {
      return simState.tileGrid[row][col];
    }
    if (Array.isArray(simState.tiles)) {
      if (Array.isArray(simState.tiles[0])) {
        return simState.tiles[row] ? simState.tiles[row][col] : null;
      }
      for (var i = 0; i < simState.tiles.length; i++) {
        var t = simState.tiles[i];
        if (t && t.col === col && t.row === row) return t;
      }
    }
    return null;
  }

  function hasDynamicBridgeAt(simState, col, row) {
    if (!simState || !Array.isArray(simState.bridges)) return false;
    var key = col + ',' + row;
    for (var i = 0; i < simState.bridges.length; i++) {
      var b = simState.bridges[i];
      if (!b || b.collapsed) continue;
      if (typeof b === 'string' && b === key) return true;
      if (b.col === col && b.row === row) return true;
    }
    return false;
  }

  function refreshBoardMetadata(simState) {
    _hasChasm = false;
    _obstacles.length = 0;
    _waterActiveMap = {};

    if (simState) {
      _levelId = simState.levelId || simState.id || _levelId;
      if (Array.isArray(simState.waterCells)) {
        for (var w = 0; w < simState.waterCells.length; w++) {
          var wc = simState.waterCells[w];
          if (typeof wc === 'string') {
            _waterActiveMap[wc] = true;
          } else if (wc && wc.col !== undefined && wc.row !== undefined) {
            _waterActiveMap[wc.col + ',' + wc.row] = true;
          }
        }
      }
      _ferryState = simState.ferry || null;
      if (_ferryState && !_ferryAnim) {
        _ferryVisualCol = _ferryState.col;
      }
    } else {
      _ferryState = null;
    }

    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var raw = extractTileAt(simState, c, r);
        var cell = _boardCells[r][c];
        var tType = (raw && (raw.type || raw.kind)) || 'sandstone';
        var dynBridge = hasDynamicBridgeAt(simState, c, r);
        if (dynBridge && tType === 'channel') {
          tType = 'bridge';
        }
        if (tType === 'chasm') _hasChasm = true;

        cell.type = tType;
        cell.hasBridge = dynBridge || tType === 'bridge';
        cell.isExit = Boolean(
          (raw && raw.isExit) ||
          (simState && simState.exit && simState.exit.col === c && simState.exit.row === r)
        );
        cell.rollerDir = (raw && raw.rollerDir !== undefined) ? raw.rollerDir : ((raw && raw.dir !== undefined) ? raw.dir : 1);

        cell.flowDir = (raw && raw.flowDir !== undefined) ? raw.flowDir : -1;
        cell.isCornerChannel = false;
        cell.cornerRotY = 0.0;

        // Determine channel axis ('row' E-W vs 'col' N-S)
        if (raw && raw.channelAxis) {
          cell.channelAxis = raw.channelAxis;
        } else if (raw && raw.flowDir !== undefined) {
          cell.channelAxis = (raw.flowDir === 1 || raw.flowDir === 3) ? 'row' : 'col';
        } else {
          cell.channelAxis = 'col';
        }

        if (tType === 'pillar' || (raw && raw.obstacle === 'pillar')) {
          var pwp = gridToWorld(c, r);
          _obstacles.push({
            x: pwp.x,
            z: pwp.z,
            radius: 0.62,
            kind: 'pillar',
            id: 'pillar_' + c + '_' + r,
            minX: pwp.x - 0.62,
            maxX: pwp.x + 0.62,
            minY: 0.0,
            maxY: 1.65,
            minZ: pwp.z - 0.62,
            maxZ: pwp.z + 0.62
          });
        }
      }
    }

    // Detect 90° L-bend channel corners (e.g. Level 2's (5,0)->(5,1)->(4,1)) where an upstream
    // channel flows perpendicularly into this channel without merging parallel neighbors like (6,1)!
    var inChecks = [
      { dc: 0,  dr: -1, reqFlow: 2, side: 0 }, // North neighbor flowing South (2)
      { dc: 1,  dr:  0, reqFlow: 3, side: 1 }, // East neighbor flowing West (3)
      { dc: 0,  dr:  1, reqFlow: 0, side: 2 }, // South neighbor flowing North (0)
      { dc: -1, dr:  0, reqFlow: 1, side: 3 }  // West neighbor flowing East (1)
    ];
    for (var cr = 0; cr < GRID_SIZE; cr++) {
      for (var cc = 0; cc < GRID_SIZE; cc++) {
        var cCell = _boardCells[cr][cc];
        if ((cCell.type !== 'channel' && cCell.type !== 'waterLock') || cCell.hasBridge) continue;
        var outDir = cCell.flowDir;
        if (outDir < 0) continue;
        for (var d = 0; d < 4; d++) {
          var chk = inChecks[d];
          if ((chk.side % 2) === (outDir % 2)) continue;
          var nc = cc + chk.dc, nr = cr + chk.dr;
          if (nc < 0 || nc >= GRID_SIZE || nr < 0 || nr >= GRID_SIZE) continue;
          var nCell = _boardCells[nr][nc];
          if ((nCell.type === 'channel' || nCell.type === 'waterLock') && nCell.flowDir === chk.reqFlow) {
            var openN = (chk.side === 0 || outDir === 0);
            var openE = (chk.side === 1 || outDir === 1);
            var openS = (chk.side === 2 || outDir === 2);
            var openW = (chk.side === 3 || outDir === 3);
            cCell.isCornerChannel = true;
            if (openN && openW) cCell.cornerRotY = 0.0;
            else if (openN && openE) cCell.cornerRotY = -Math.PI * 0.5;
            else if (openS && openE) cCell.cornerRotY = Math.PI;
            else if (openS && openW) cCell.cornerRotY = Math.PI * 0.5;
            break;
          }
        }
      }
    }

    // Register the 4 Corner Stone-Bowl Fire Braziers in obstacle registry
    for (var b = 0; b < CORNER_BRAZIER_SPOTS.length; b++) {
      var bs = CORNER_BRAZIER_SPOTS[b];
      _obstacles.push({
        x: bs.x,
        z: bs.z,
        radius: 0.50,
        kind: 'brazier',
        id: 'brazier_' + b,
        minX: bs.x - 0.50,
        maxX: bs.x + 0.50,
        minY: 0.0,
        maxY: 1.15,
        minZ: bs.z - 0.50,
        maxZ: bs.z + 0.50
      });
    }
  }

  function isExposedCliffOrChasm(col, row) {
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return true;
    return _boardCells[row][col].type === 'chasm';
  }

  function getActiveSlideOffsetForCell(col, row) {
    if (!_rowSlideAnim) return { dx: 0.0, dz: 0.0 };
    var u = clamp(_rowSlideAnim.elapsed / _rowSlideAnim.duration, 0.0, 1.0);
    var ease = 1.0 - Math.pow(1.0 - u, 3);
    var rem = -(1.0 - ease) * _rowSlideAnim.delta * TILE_SIZE;
    if (_rowSlideAnim.axis === 'row' && row === _rowSlideAnim.index) {
      return { dx: rem, dz: 0.0 };
    }
    if (_rowSlideAnim.axis === 'col' && col === _rowSlideAnim.index) {
      return { dx: 0.0, dz: rem };
    }
    return { dx: 0.0, dz: 0.0 };
  }

  function composeTileMatrix(wx, wy, wz, rotY) {
    _posV.set(wx, wy, wz);
    _euler.set(0, rotY || 0, 0);
    _quat.setFromEuler(_euler);
    _scaleV.set(1, 1, 1);
    _mat4.compose(_posV, _quat, _scaleV);
    return _mat4;
  }

  function repackBoardInstances() {
    if (!_instSandstone) return;

    var nSand = 0, nMossB = 0, nMossC = 0, nMossO = 0;
    var nChan = 0, nChanC = 0, nBrid = 0, nRoll = 0, nExit = 0, nPil = 0;

    for (var r = 0; r < GRID_SIZE; r++) {
      for (var c = 0; c < GRID_SIZE; c++) {
        var cell = _boardCells[r][c];
        var t = cell.type;
        if (t === 'chasm') continue;

        var wp = gridToWorld(c, r);
        var slide = getActiveSlideOffsetForCell(c, r);
        var wx = wp.x + slide.dx;
        var wz = wp.z + slide.dz;

        if (cell.isExit && t === 'sandstone') {
          _instExit.setMatrixAt(nExit++, composeTileMatrix(wx, 0.0, wz, 0.0));
          continue;
        }

        if (t === 'moss') {
          _instMossBase.setMatrixAt(nMossB++, composeTileMatrix(wx, 0.0, wz, 0.0));
          _instMossCushion.setMatrixAt(nMossC, composeTileMatrix(wx, 0.0, wz, 0.0));
          var mossVar = ((c * 11 + r * 7) % 5 - 2) * 0.025;
          _colorTmp.setRGB(
            clamp(0.98 + mossVar * 1.1, 0.90, 1.0),
            clamp(0.99 + mossVar * 0.6, 0.92, 1.0),
            clamp(0.95 - mossVar * 0.8, 0.86, 1.0)
          );
          _instMossCushion.setColorAt(nMossC, _colorTmp);
          nMossC++;

          // Drape bulbous chartreuse moss overhang lobes over every exposed cliff or chasm edge!
          if (isExposedCliffOrChasm(c, r - 1) && nMossO < 144) {
            _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx, 0.0, wz, 0.0));
            _instMossOverhang.setColorAt(nMossO++, _colorTmp);
          }
          if (isExposedCliffOrChasm(c + 1, r) && nMossO < 144) {
            _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx, 0.0, wz, -Math.PI * 0.5));
            _instMossOverhang.setColorAt(nMossO++, _colorTmp);
          }
          if (isExposedCliffOrChasm(c, r + 1) && nMossO < 144) {
            _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx, 0.0, wz, Math.PI));
            _instMossOverhang.setColorAt(nMossO++, _colorTmp);
          }
          if (isExposedCliffOrChasm(c - 1, r) && nMossO < 144) {
            _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx, 0.0, wz, Math.PI * 0.5));
            _instMossOverhang.setColorAt(nMossO++, _colorTmp);
          }
        } else if (t === 'channel' || t === 'waterLock') {
          if (cell.isCornerChannel) {
            _instChannelCorner.setMatrixAt(nChanC++, composeTileMatrix(wx, 0.0, wz, cell.cornerRotY));
          } else {
            var chanRot = (cell.channelAxis === 'row') ? (Math.PI * 0.5) : 0.0;
            _instChannel.setMatrixAt(nChan++, composeTileMatrix(wx, 0.0, wz, chanRot));
          }
        } else if (t === 'bridge') {
          _instBridge.setMatrixAt(nBrid++, composeTileMatrix(wx, 0.0, wz, 0.0));
        } else if (t === 'roller') {
          var rRot = (cell.rollerDir === 0 || cell.rollerDir === 2) ? (Math.PI * 0.5) : 0.0;
          _instRoller.setMatrixAt(nRoll, composeTileMatrix(wx, 0.0, wz, rRot));
          _instRollerHit.setMatrixAt(nRoll, composeTileMatrix(wx, 0.0, wz, 0.0));
          nRoll++;
        } else if (t === 'pillar') {
          _instPillar.setMatrixAt(nPil++, composeTileMatrix(wx, 0.0, wz, 0.0));
        } else {
          // Warm hand-carved sandstone block with subtle per-tile sunlit golden tint variation
          var rotQ = ((c * 3 + r * 5) & 3) * (Math.PI * 0.5);
          _instSandstone.setMatrixAt(nSand, composeTileMatrix(wx, 0.0, wz, rotQ));
          var warmJitter = ((c * 7 + r * 13) % 5 - 2) * 0.024;
          _colorTmp.setRGB(
            clamp(0.98 + warmJitter, 0.91, 1.0),
            clamp(0.97 + warmJitter * 0.85, 0.90, 1.0),
            clamp(0.95 + warmJitter * 0.65, 0.88, 1.0)
          );
          _instSandstone.setColorAt(nSand, _colorTmp);
          nSand++;

          // Tucked cliff-ledge moss tufts under the 4 corner brazier blocks (matching Master Reference Image!)
          var isCornerBlock = (c === 0 || c === 7) && (r === 0 || r === 7);
          if (isCornerBlock && nMossO + 2 <= 144) {
            _colorTmp.setRGB(0.88, 0.94, 0.82);
            var yCornerLedge = -0.34;
            if (r === 0) {
              _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx, yCornerLedge, wz + 0.06, 0.0));
              _instMossOverhang.setColorAt(nMossO++, _colorTmp);
            } else {
              _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx, yCornerLedge, wz - 0.06, Math.PI));
              _instMossOverhang.setColorAt(nMossO++, _colorTmp);
            }
            if (c === 0) {
              _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx + 0.06, yCornerLedge, wz, Math.PI * 0.5));
              _instMossOverhang.setColorAt(nMossO++, _colorTmp);
            } else {
              _instMossOverhang.setMatrixAt(nMossO, composeTileMatrix(wx - 0.06, yCornerLedge, wz, -Math.PI * 0.5));
              _instMossOverhang.setColorAt(nMossO++, _colorTmp);
            }
          }
        }
      }
    }

    function commitInst(inst, cnt, updateCol) {
      inst.count = cnt;
      inst.instanceMatrix.needsUpdate = true;
      if (updateCol && inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    commitInst(_instSandstone, nSand, true);
    commitInst(_instMossBase, nMossB, false);
    commitInst(_instMossCushion, nMossC, true);
    commitInst(_instMossOverhang, nMossO, true);
    commitInst(_instChannel, nChan, false);
    commitInst(_instChannelCorner, nChanC, false);
    commitInst(_instBridge, nBrid, false);
    commitInst(_instRoller, nRoll, false);
    commitInst(_instRollerHit, nRoll, false);
    commitInst(_instExit, nExit, false);
    commitInst(_instPillar, nPil, false);
  }

  function syncGearKnobsAndPickables(simState) {
    _pickables.length = 0;

    // 1. Configure Interactive Brass Crank-Wheels for each gearRow
    var gears = (simState && Array.isArray(simState.gearRows)) ? simState.gearRows : [];
    for (var i = 0; i < MAX_GEAR_KNOBS; i++) {
      var slot = _gearKnobPool[i];
      if (i < gears.length) {
        var gr = gears[i];
        var side = gr.knobSide || (gr.axis === 'row' ? 'W' : 'S');
        var kCol = gr.knobCol !== undefined ? gr.knobCol : (gr.axis === 'row' ? (side === 'E' ? 7 : 0) : gr.index);
        var kRow = gr.knobRow !== undefined ? gr.knobRow : (gr.axis === 'row' ? gr.index : (side === 'N' ? 0 : 7));
        var anchor = gridToWorld(kCol, kRow);

        var kx = anchor.x, kz = anchor.z;
        if (side === 'W') kx = -8.38;
        else if (side === 'E') kx = 8.38;
        else if (side === 'N') kz = -8.38;
        else if (side === 'S') kz = 8.38;

        slot.group.position.set(kx, -0.02, kz);
        slot.wheel.rotation.y = (gr.offset || 0) * (Math.PI * 0.5);
        slot.group.visible = true;

        var ud = {
          pickType: 'gearKnob',
          gearId: gr.id,
          axis: gr.axis,
          index: gr.index,
          col: kCol,
          row: kRow
        };
        slot.group.userData = ud;
        slot.wheel.userData = ud;
        slot.hit.userData = ud;
        _pickables.push(slot.group);
      } else {
        slot.group.visible = false;
      }
    }

    // 2. Configure Chasm-Bank Ferry Call Levers mounted flush onto North & South chasm stone lips!
    var hasFerry = Boolean(simState && simState.ferry);
    var dockAnchors = [
      { x: -3.0, z:  1.96, col: 2, row: 5 },
      { x:  3.0, z: -1.96, col: 5, row: 2 }
    ];
    for (var f = 0; f < _ferryLeverPool.length; f++) {
      var fSlot = _ferryLeverPool[f];
      if (hasFerry) {
        var da = dockAnchors[f];
        fSlot.group.position.set(da.x, -0.04, da.z);
        fSlot.group.visible = true;
        var fud = {
          pickType: 'ferryLever',
          col: da.col,
          row: da.row
        };
        fSlot.group.userData = fud;
        fSlot.wheel.userData = fud;
        fSlot.hit.userData = fud;
        _pickables.push(fSlot.group);
      } else {
        fSlot.group.visible = false;
      }
    }

    // 3. Append active tile InstancedMeshes
    var tileInsts = [
      _instSandstone, _instMossBase, _instMossCushion,
      _instChannel, _instChannelCorner, _instBridge, _instRoller, _instRollerHit, _instExit, _instPillar
    ];
    for (var ti = 0; ti < tileInsts.length; ti++) {
      if (tileInsts[ti] && tileInsts[ti].count > 0) {
        _pickables.push(tileInsts[ti]);
      }
    }
  }

  function updateSplitCliffMode() {
    if (!_cliffFullMesh) return;
    _cliffFullMesh.visible = !_hasChasm;
    _mortarFullMesh.visible = !_hasChasm;
    _cliffSplitMesh.visible = _hasChasm;
    _mortarSplitMesh.visible = _hasChasm;

    // Anchor flank cogs & waterwheels onto the solid North/South cliff halves in Level 4!
    for (var i = 0; i < _cogMeshes.length; i++) {
      var cm = _cogMeshes[i];
      cm.mesh.position.z = _hasChasm ? cm.def.zSplit : cm.def.z;
    }
    for (var j = 0; j < _waterMeshes.length; j++) {
      var wm = _waterMeshes[j];
      wm.mesh.position.z = _hasChasm ? wm.def.zSplit : wm.def.z;
    }
    for (var k = 0; k < _bracketMeshes.length; k++) {
      var bm = _bracketMeshes[k];
      var baseZ = _hasChasm ? bm.def.zSplit : bm.def.z;
      bm.mesh.position.z = bm.def.plane === 'XY'
        ? (bm.isWater ? baseZ + 0.56 : baseZ - 0.50)
        : baseZ;
    }
  }

  function updateFlankPositionsAndFlames(elapsed) {
    if (!_flameOuterInst) return;

    // 1. Interlocking Bronze Cogwheels & Wooden Paddle-Waterwheels
    for (var c = 0; c < _cogMeshes.length; c++) {
      var cm = _cogMeshes[c];
      cm.mesh.rotation.z = cm.def.phase0 + _cogPhase * cm.def.ratio;
    }
    for (var w = 0; w < _waterMeshes.length; w++) {
      var wm = _waterMeshes[w];
      wm.mesh.rotation.z = _waterPhase * wm.def.speed;
    }

    // 2. Corner Brazier 5-Tongue Dancing Flames & Rising Sparks
    for (var b = 0; b < 4; b++) {
      var spot = CORNER_BRAZIER_SPOTS[b];
      var t = elapsed * 6.4 + spot.phase;
      var flickY = 1.0 + 0.17 * Math.sin(t) + 0.08 * Math.cos(t * 2.3);
      var flickXZ = 1.0 - 0.06 * Math.sin(t * 1.7);
      var swayX = 0.032 * Math.sin(t * 1.3);
      var swayZ = 0.032 * Math.cos(t * 1.1);

      _posV.set(spot.x + swayX, 0.77, spot.z + swayZ);
      _euler.set(swayZ * 1.3, elapsed * 1.6 + spot.phase, -swayX * 1.3);
      _quat.setFromEuler(_euler);
      _scaleV.set(0.96 * flickXZ, 0.96 * flickY, 0.96 * flickXZ);
      _mat4.compose(_posV, _quat, _scaleV);
      _flameOuterInst.setMatrixAt(b, _mat4);

      _posV.set(spot.x + swayX * 0.5, 0.80, spot.z + swayZ * 0.5);
      _euler.set(-swayZ * 1.1, -elapsed * 2.1 + spot.phase + 0.8, swayX * 1.1);
      _quat.setFromEuler(_euler);
      _scaleV.set(0.62 * flickXZ, 0.72 * flickY, 0.62 * flickXZ);
      _mat4.compose(_posV, _quat, _scaleV);
      _flameInnerInst.setMatrixAt(b, _mat4);
    }
    _flameOuterInst.instanceMatrix.needsUpdate = true;
    _flameInnerInst.instanceMatrix.needsUpdate = true;

    if (_cache && _cache.mats.fireHalo) {
      _cache.mats.fireHalo.opacity = 0.66 + 0.12 * Math.sin(elapsed * 7.5);
    }

    if (_sparkPosAttr && _sparkSeeds) {
      var total = 4 * SPARKS_PER_BRAZIER;
      for (var s = 0; s < total; s++) {
        var bIdx = Math.floor(s / SPARKS_PER_BRAZIER);
        var spSpot = CORNER_BRAZIER_SPOTS[bIdx];
        var phase0 = _sparkSeeds[s * 3];
        var spd = _sparkSeeds[s * 3 + 1];
        var seed = _sparkSeeds[s * 3 + 2];
        var cyc = (phase0 + elapsed * spd * 0.55) % 1.0;
        var sx = spSpot.x + Math.sin(cyc * 5.5 + seed) * (0.14 + cyc * 0.16);
        var sy = 0.92 + cyc * 1.35;
        var sz = spSpot.z + Math.cos(cyc * 4.8 + seed) * (0.14 + cyc * 0.16);
        _sparkPosAttr.setXYZ(s, sx, sy, sz);
      }
      _sparkPosAttr.needsUpdate = true;
    }
  }

  // ============================================================================
  // Public CONTRACT.md World Methods
  // ============================================================================
  function buildLevel(simState) {
    if (!_initialized && typeof THREE !== 'undefined' && window.GAME.scene) {
      init(window.GAME.scene);
    }
    _rowSlideAnim = null;
    _ferryAnim = null;
    refreshBoardMetadata(simState);
    updateSplitCliffMode();
    repackBoardInstances();
    syncGearKnobsAndPickables(simState);
    if (simState && simState.validHighlights) {
      setTileHighlights(simState.validHighlights);
    } else {
      setTileHighlights([]);
    }
  }

  function syncTiles(simState) {
    refreshBoardMetadata(simState);
    updateSplitCliffMode();
    repackBoardInstances();
    syncGearKnobsAndPickables(simState);
  }

  function animateRowSlide(axis, index, delta, onComplete) {
    _rowSlideAnim = {
      axis: axis === 'col' ? 'col' : 'row',
      index: index | 0,
      delta: delta || 0,
      elapsed: 0.0,
      duration: 0.35,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };
    _cogSpinBoost = Math.max(_cogSpinBoost, 3.8);

    if (window.GAME.VfxPost && typeof window.GAME.VfxPost.triggerShake === 'function') {
      window.GAME.VfxPost.triggerShake(0.055, 0.22);
    }
    if (window.GAME.Contraptions && typeof window.GAME.Contraptions.spawnDustPuff === 'function') {
      var dwp = _rowSlideAnim.axis === 'row'
        ? gridToWorld(3.5, _rowSlideAnim.index)
        : gridToWorld(_rowSlideAnim.index, 3.5);
      window.GAME.Contraptions.spawnDustPuff(dwp.x, 0.04, dwp.z);
    }
    repackBoardInstances();
  }

  function animateFerryMove(targetCol, onComplete) {
    var fromC = _ferryVisualCol;
    var toC = typeof targetCol === 'number' ? targetCol : (_ferryState ? _ferryState.col : fromC);
    _ferryAnim = {
      fromCol: fromC,
      toCol: toC,
      elapsed: 0.0,
      duration: 0.35,
      onComplete: typeof onComplete === 'function' ? onComplete : null
    };
    _cogSpinBoost = Math.max(_cogSpinBoost, 3.4);
    if (window.GAME.VfxPost && typeof window.GAME.VfxPost.triggerShake === 'function') {
      window.GAME.VfxPost.triggerShake(0.045, 0.20);
    }
  }

  var HIGHLIGHT_COLORS = {
    move:   0x5ADCF2,
    attack: 0xE86A38,
    danger: 0xE08A24,
    gear:   0xFFB82E,
    hint:   0xFFE44D,
    exit:   0xFFE066
  };

  function setTileHighlights(list) {
    _activeHighlights = Array.isArray(list) ? list : [];
    if (!_instHighlight) return;

    var count = 0;
    for (var i = 0; i < _activeHighlights.length && count < 64; i++) {
      var item = _activeHighlights[i];
      if (!item || typeof item.col !== 'number' || typeof item.row !== 'number') continue;
      if (item.col < 0 || item.col >= GRID_SIZE || item.row < 0 || item.row >= GRID_SIZE) continue;

      var wp = gridToWorld(item.col, item.row);
      var hY = getHeightAt(wp.x, wp.z);
      if (hY < -5.0) continue;

      var yElev = Math.max(0.0, hY) + 0.018;
      _instHighlight.setMatrixAt(count, composeTileMatrix(wp.x, yElev, wp.z, 0.0));
      var hex = HIGHLIGHT_COLORS[item.kind] || HIGHLIGHT_COLORS.move;
      _colorTmp.setHex(hex);
      _instHighlight.setColorAt(count, _colorTmp);
      count++;
    }

    _instHighlight.count = count;
    _instHighlight.instanceMatrix.needsUpdate = true;
    if (_instHighlight.instanceColor) _instHighlight.instanceColor.needsUpdate = true;
  }

  function getInteractivePickables() {
    return _pickables;
  }

  function isWorldPosOnFerry(wx, wz) {
    if (!_ferryState) return false;
    var fRows = _ferryState.rows || [3, 4];
    var minRow = Math.min(fRows[0], fRows[fRows.length - 1]);
    var maxRow = Math.max(fRows[0], fRows[fRows.length - 1]);
    var zMin = (minRow - HALF_GRID) * TILE_SIZE - TILE_SIZE * 0.5;
    var zMax = (maxRow - HALF_GRID) * TILE_SIZE + TILE_SIZE * 0.5;
    if (wz < zMin || wz > zMax) return false;

    var fWidth = _ferryState.width || 2;
    // Check both logical ferry column and smoothly animated visual column
    var lMinX = (_ferryState.col - HALF_GRID) * TILE_SIZE - TILE_SIZE * 0.5;
    var lMaxX = lMinX + fWidth * TILE_SIZE;
    if (wx >= lMinX && wx <= lMaxX) return true;

    var vMinX = (_ferryVisualCol - HALF_GRID) * TILE_SIZE - TILE_SIZE * 0.5;
    var vMaxX = vMinX + fWidth * TILE_SIZE;
    return wx >= vMinX && wx <= vMaxX;
  }

  /**
   * Exact analytical height matching rendered tile vertices (<= 0.0001m parity!).
   */
  function getHeightAt(wx, wz) {
    if (wx < -8.0 || wx > 8.0 || wz < -8.0 || wz > 8.0) {
      return CHASM_FLOOR_Y;
    }

    var g = worldToGrid(wx, wz);
    var col = clamp(g.col, 0, GRID_SIZE - 1);
    var row = clamp(g.row, 0, GRID_SIZE - 1);

    if (isWorldPosOnFerry(wx, wz)) {
      return 0.0;
    }

    var cell = _boardCells[row][col];
    if (!cell || cell.type === 'chasm') {
      return CHASM_FLOOR_Y;
    }

    if ((cell.type === 'channel' || cell.type === 'waterLock') && !cell.hasBridge) {
      var center = gridToWorld(col, row);
      var lx = wx - center.x;
      var lz = wz - center.z;
      if (cell.isCornerChannel) {
        var cR = Math.cos(cell.cornerRotY);
        var sR = Math.sin(cell.cornerRotY);
        var ux = lx * cR - lz * sR;
        var uz = lx * sR + lz * cR;
        return channelCornerProfileY(ux, uz);
      }
      var across = (cell.channelAxis === 'row') ? lz : lx;
      return channelProfileY(across);
    }

    return 0.0;
  }

  function getSurfaceAt(wx, wz) {
    var g = worldToGrid(wx, wz);
    var inB = (wx >= -8.0 && wx <= 8.0 && wz >= -8.0 && wz <= 8.0 &&
               g.col >= 0 && g.col < GRID_SIZE && g.row >= 0 && g.row < GRID_SIZE);
    var y = getHeightAt(wx, wz);
    var sType = 'chasm';

    if (inB) {
      if (isWorldPosOnFerry(wx, wz)) {
        sType = 'ferry';
      } else {
        sType = _boardCells[g.row][g.col].type || 'sandstone';
      }
    }

    return {
      y: y,
      normal: { x: 0, y: 1, z: 0 },
      surfaceType: sType,
      col: g.col,
      row: g.row
    };
  }

  function isWaterOrFordAt(wx, wz) {
    if (wx < -8.0 || wx > 8.0 || wz < -8.0 || wz > 8.0) return false;
    if (isWorldPosOnFerry(wx, wz)) return false;
    var g = worldToGrid(wx, wz);
    if (g.col < 0 || g.col >= GRID_SIZE || g.row < 0 || g.row >= GRID_SIZE) return false;
    var cell = _boardCells[g.row][g.col];
    if (!cell || cell.hasBridge) return false;
    if (!_waterActiveMap[g.col + ',' + g.row]) return false;
    return getHeightAt(wx, wz) <= WATER_SURFACE_Y + 0.04;
  }

  /**
   * 2-Pass Hard Depenetration Solver.
   * STRICT parameter order per CONTRACT.md: (x, yFeet, z, radius, height)
   */
  function resolveHorizontal(x, yFeet, z, radius, height) {
    var px = +x || 0.0;
    var py = +yFeet || 0.0;
    var pz = +z || 0.0;
    var r = Math.max(0.05, +radius || 0.35);
    var h = Math.max(0.1, +height || 1.5);
    var hit = false;
    var nx = 0.0;
    var nz = 0.0;

    for (var pass = 0; pass < 2; pass++) {
      // 1. Circle-vs-Obstacle depenetration (Pillars & Corner Braziers)
      for (var i = 0; i < _obstacles.length; i++) {
        var obs = _obstacles[i];
        if (py >= obs.maxY || (py + h) <= obs.minY) continue;
        var dx = px - obs.x;
        var dz = pz - obs.z;
        var minDist = r + obs.radius;
        var distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          var dist = Math.sqrt(distSq);
          var pushX = dist > 1e-5 ? (dx / dist) : 1.0;
          var pushZ = dist > 1e-5 ? (dz / dist) : 0.0;
          var pen = minDist - dist;
          px += pushX * pen;
          pz += pushZ * pen;
          hit = true;
          nx = pushX;
          nz = pushZ;
        }
      }

      // 2. Island outer perimeter guardrail when grounded (py > -0.30m)
      if (py > -0.30) {
        var maxBound = 7.92 - r;
        if (px < -maxBound) { px = -maxBound; hit = true; nx = 1.0; nz = 0.0; }
        else if (px > maxBound) { px = maxBound; hit = true; nx = -1.0; nz = 0.0; }
        if (pz < -maxBound) { pz = -maxBound; hit = true; nx = 0.0; nz = 1.0; }
        else if (pz > maxBound) { pz = maxBound; hit = true; nx = 0.0; nz = -1.0; }
      }
    }

    return { x: px, z: pz, hit: hit, nx: nx, nz: nz };
  }

  function getObstacles() {
    return _obstacles;
  }

  function raycast(originVec3, dirVec3, maxDist) {
    if (!_raycaster || !originVec3 || !dirVec3) {
      return { hit: false, point: null, normal: null, distance: Infinity, object: null };
    }
    _raycaster.set(originVec3, dirVec3);
    _raycaster.near = 0.0;
    _raycaster.far = (typeof maxDist === 'number' && maxDist > 0) ? maxDist : 200.0;
    _rayHits.length = 0;
    _raycaster.intersectObjects(_raycastTargets, true, _rayHits);

    if (_rayHits.length > 0) {
      var h = _rayHits[0];
      return {
        hit: true,
        point: h.point,
        normal: (h.face && h.face.normal) ? h.face.normal : { x: 0, y: 1, z: 0 },
        distance: h.distance,
        object: h.object
      };
    }
    return { hit: false, point: null, normal: null, distance: Infinity, object: null };
  }

  function update(dt, elapsed) {
    var stepDt = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.1) : (1 / 60);
    var tNow = typeof elapsed === 'number' ? elapsed : 0.0;

    // 1. Advance active row/column slide animation (0.35s cubic ease-out)
    if (_rowSlideAnim) {
      _rowSlideAnim.elapsed += stepDt;
      if (_rowSlideAnim.elapsed >= _rowSlideAnim.duration) {
        var cb = _rowSlideAnim.onComplete;
        _rowSlideAnim = null;
        repackBoardInstances();
        if (cb) cb();
      } else {
        repackBoardInstances();
      }
    }

    // 2. Advance Level 4 Ferry smooth glide animation (0.35s cubic ease-out)
    if (_ferryAnim) {
      _ferryAnim.elapsed += stepDt;
      var fu = clamp(_ferryAnim.elapsed / _ferryAnim.duration, 0.0, 1.0);
      var fEase = 1.0 - Math.pow(1.0 - fu, 3);
      _ferryVisualCol = _ferryAnim.fromCol + (_ferryAnim.toCol - _ferryAnim.fromCol) * fEase;
      if (fu >= 1.0) {
        _ferryVisualCol = _ferryAnim.toCol;
        var fCb = _ferryAnim.onComplete;
        _ferryAnim = null;
        if (fCb) fCb();
      }
    }

    // 3. Spin left-flank Bronze Cogwheels & right-flank Wooden Waterwheels
    _cogSpinBoost = Math.max(0.0, _cogSpinBoost - stepDt * 6.5);
    _cogPhase += stepDt * (0.28 + _cogSpinBoost);
    var waterBoost = (_levelId === 2) ? 1.55 : 1.0;
    _waterPhase += stepDt * waterBoost;

    updateFlankPositionsAndFlames(tNow);

    // 4. Gentle cumulus cloud sea breeze translation (stays framed inside frustum!) & soft tactical highlight pulse
    if (_cloudUpperGroup) {
      _cloudUpperGroup.position.set(
        Math.sin(tNow * 0.14) * 1.15,
        Math.sin(tNow * 0.22) * 0.28,
        Math.cos(tNow * 0.12) * 1.15
      );
    }
    if (_cloudLowerGroup) {
      _cloudLowerGroup.position.set(
        -Math.sin(tNow * 0.11) * 1.25,
        Math.cos(tNow * 0.19) * 0.30,
        -Math.cos(tNow * 0.13) * 1.25
      );
    }
    if (_instHighlight && _instHighlight.count > 0 && _cache && _cache.mats.highlight) {
      _cache.mats.highlight.opacity = 0.26 + 0.06 * Math.sin(tNow * 3.8);
    }
  }

  window.GAME.World = {
    init: init,
    buildLevel: buildLevel,
    syncTiles: syncTiles,
    animateRowSlide: animateRowSlide,
    animateFerryMove: animateFerryMove,
    setTileHighlights: setTileHighlights,
    getInteractivePickables: getInteractivePickables,
    getHeightAt: getHeightAt,
    getSurfaceAt: getSurfaceAt,
    isWaterOrFordAt: isWaterOrFordAt,
    resolveHorizontal: resolveHorizontal,
    getObstacles: getObstacles,
    raycast: raycast,
    update: update
  };
})();

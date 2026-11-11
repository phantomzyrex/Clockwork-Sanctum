(function () {
  'use strict';

  window.GAME = window.GAME || {};

  // ============================================================================
  // Clockwork Sanctum — LUT-Accelerated Hand-Painted Procedural Texture Suite
  // Target: < 300ms total boot generation, max 512x512, 0 leaks across 8x reloads
  // ============================================================================

  var GRID = 256;
  var MASK = GRID - 1;
  var VAL_LUT = new Float32Array(GRID * GRID);
  var HASH_X = new Float32Array(GRID * GRID);
  var HASH_Y = new Float32Array(GRID * GRID);
  var _lutReady = false;

  function ensureLUT() {
    if (_lutReady) return;
    _lutReady = true;
    var s = 0x5A7C9E31;
    for (var i = 0; i < GRID * GRID; i++) {
      s = (Math.imul(s ^ (s >>> 15), 0x2C1B3C6D) + 0x165667B1) | 0;
      VAL_LUT[i] = ((s >>> 8) & 0xFFFF) / 65535.0;
      s = (Math.imul(s ^ (s >>> 13), 0x85EBCA6B) + 0xC2B2AE35) | 0;
      HASH_X[i] = ((s >>> 8) & 0xFFFF) / 65535.0;
      s = (Math.imul(s ^ (s >>> 16), 0x27D4EB2F) + 0x9E3779B9) | 0;
      HASH_Y[i] = ((s >>> 8) & 0xFFFF) / 65535.0;
    }
  }

  // Tileable smooth value noise on power-of-2 period P (P in {2,4,8,16,32,64,128,256})
  function tileNoise(u, v, period) {
    var pMask = period - 1;
    var px = u * period + 1024.0;
    var py = v * period + 1024.0;
    var ix0 = px | 0;
    var iy0 = py | 0;
    var fx = px - ix0;
    var fy = py - iy0;

    // Quintic smoothstep for zero grid-line artifacts at 400% zoom
    var sx = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
    var sy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);

    var x0 = ix0 & pMask;
    var y0 = iy0 & pMask;
    var x1 = (ix0 + 1) & pMask;
    var y1 = (iy0 + 1) & pMask;

    var row0 = y0 * GRID;
    var row1 = y1 * GRID;
    var v00 = VAL_LUT[row0 + x0];
    var v10 = VAL_LUT[row0 + x1];
    var v01 = VAL_LUT[row1 + x0];
    var v11 = VAL_LUT[row1 + x1];

    var a = v00 + sx * (v10 - v00);
    var b = v01 + sx * (v11 - v01);
    return a + sy * (b - a);
  }

  function fbmTile(u, v, basePeriod, octaves) {
    var sum = 0.0;
    var amp = 0.5;
    var norm = 0.0;
    var p = basePeriod;
    for (var o = 0; o < octaves; o++) {
      sum += amp * tileNoise(u + o * 0.173, v + o * 0.311, p);
      norm += amp;
      amp *= 0.5;
      p = Math.min(256, p * 2);
    }
    return sum / norm;
  }

  // Tileable Worley cellular distances (returns F1, F2, and directional cell normal)
  var _cellOut = { f1: 0, f2: 0, dx: 0, dy: 0, id: 0 };
  function worleyTile(u, v, cells, seedOff) {
    var cx = u * cells;
    var cy = v * cells;
    var ix = Math.floor(cx);
    var iy = Math.floor(cy);
    var best1 = 99.0;
    var best2 = 99.0;
    var bdx = 0.0;
    var bdy = 0.0;
    var bid = 0.0;
    var off = seedOff | 0;

    for (var dy = -1; dy <= 1; dy++) {
      var ny = iy + dy;
      var wy = ((ny % cells) + cells) % cells;
      var rowIdx = ((wy + off) & MASK) * GRID;
      for (var dx = -1; dx <= 1; dx++) {
        var nx = ix + dx;
        var wx = ((nx % cells) + cells) % cells;
        var idx = rowIdx + ((wx + off * 3) & MASK);
        var px = nx + 0.15 + 0.70 * HASH_X[idx];
        var py = ny + 0.15 + 0.70 * HASH_Y[idx];
        var vx = cx - px;
        var vy = cy - py;
        var d2 = vx * vx + vy * vy;
        if (d2 < best1) {
          best2 = best1;
          best1 = d2;
          bdx = vx;
          bdy = vy;
          bid = VAL_LUT[idx];
        } else if (d2 < best2) {
          best2 = d2;
        }
      }
    }
    _cellOut.f1 = Math.sqrt(best1);
    _cellOut.f2 = Math.sqrt(best2);
    _cellOut.dx = bdx;
    _cellOut.dy = bdy;
    _cellOut.id = bid;
    return _cellOut;
  }

  // Pre-bake a tileable Worley field at WxW (e.g. 128x128) for 48x faster 512x512 sampling
  function bakeWorleyField(W, cells, seedOff) {
    var f1Arr = new Float32Array(W * W);
    var edgeArr = new Float32Array(W * W);
    var sunArr = new Float32Array(W * W);
    var idArr = new Float32Array(W * W);
    var invW = 1.0 / W;
    for (var y = 0; y < W; y++) {
      var v = y * invW;
      for (var x = 0; x < W; x++) {
        var u = x * invW;
        var c = worleyTile(u, v, cells, seedOff);
        var i = y * W + x;
        f1Arr[i] = c.f1;
        edgeArr[i] = c.f2 - c.f1;
        sunArr[i] = Math.max(-0.4, Math.min(0.6, (-c.dx * 0.65 - c.dy * 0.65)));
        idArr[i] = c.id;
      }
    }
    return { W: W, mask: W - 1, f1: f1Arr, edge: edgeArr, sun: sunArr, id: idArr };
  }

  function sampleField(arr, W, mask, u, v) {
    var px = u * W;
    var py = v * W;
    var ix = px | 0;
    var iy = py | 0;
    var fx = px - ix;
    var fy = py - iy;
    var x0 = ix & mask;
    var y0 = iy & mask;
    var x1 = (ix + 1) & mask;
    var y1 = (iy + 1) & mask;
    var r0 = y0 * W;
    var r1 = y1 * W;
    var a = arr[r0 + x0] + fx * (arr[r0 + x1] - arr[r0 + x0]);
    var b = arr[r1 + x0] + fx * (arr[r1 + x1] - arr[r1 + x0]);
    return a + fy * (b - a);
  }

  function clampByte(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : (v | 0));
  }

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    // Headless Node unit-test fallback
    return {
      width: w,
      height: h,
      getContext: function () {
        return {
          createImageData: function (cw, ch) {
            return { width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) };
          },
          putImageData: function () {},
          save: function () {},
          restore: function () {},
          beginPath: function () {},
          moveTo: function () {},
          lineTo: function () {},
          quadraticCurveTo: function () {},
          stroke: function () {},
          fill: function () {},
          arc: function () {},
          fillRect: function () {},
          strokeRect: function () {}
        };
      }
    };
  }

  function toThreeTexture(canvas, isSRGB, repeatWrap) {
    if (typeof THREE === 'undefined') {
      return { image: canvas, isStubTexture: true };
    }
    var tex = new THREE.CanvasTexture(canvas);
    if (isSRGB && THREE.sRGBEncoding !== undefined) {
      tex.encoding = THREE.sRGBEncoding;
    }
    if (repeatWrap) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    } else {
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
    }
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  // --------------------------------------------------------------------------
  // 1. Hand-Painted Golden Sandstone (#E8B86D / #D69E4E) + Bump
  // --------------------------------------------------------------------------
  function buildSandstoneTextures() {
    var S = 512;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;

    var BS = 256;
    var bumpCanvas = makeCanvas(BS, BS);
    var bctx = bumpCanvas.getContext('2d');
    var bimg = bctx.createImageData(BS, BS);
    var bdata = bimg.data;

    var invS = 1.0 / S;
    for (var y = 0; y < S; y++) {
      var v = y * invS;
      for (var x = 0; x < S; x++) {
        var u = x * invS;

        // Broad painterly Ankama brush washes + warm sedimentary strata
        var nBroad = fbmTile(u, v, 4, 3);
        var warpU = u + (nBroad - 0.5) * 0.08;
        var warpV = v + (tileNoise(u + 0.41, v + 0.19, 8) - 0.5) * 0.06;
        var strata = tileNoise(warpU * 0.5, warpV * 1.5, 8);
        var dab = tileNoise(u + 0.23, v + 0.67, 16);
        var fleck = tileNoise(u + 0.71, v + 0.13, 32);

        // Rich toasted honey-ochre sandstone (#DDA252 / #C48332 under sunlit ACES — zero cream bleach!)
        var t = 0.45 * nBroad + 0.35 * strata + 0.20 * dab;
        var brush = t + 0.045 * Math.sin(t * 16.0);

        var r = 156 + brush * 48 + (fleck - 0.5) * 9;
        var g = 100 + brush * 40 + (fleck - 0.5) * 8;
        var b = 36 + brush * 30 + (fleck - 0.5) * 6;

        // Strong toasted-sienna outer bevel rim + warm golden inner chamfer lip
        var edgeDist = Math.min(Math.min(u, 1.0 - u), Math.min(v, 1.0 - v));
        if (edgeDist < 0.11) {
          var sunBias = (1.0 - u) * 0.5 + (1.0 - v) * 0.5 - 0.5;
          if (edgeDist < 0.046) {
            var outerT = 1.0 - edgeDist / 0.046;
            r -= outerT * (44 - sunBias * 14);
            g -= outerT * (36 - sunBias * 11);
            b -= outerT * (20 - sunBias * 6);
          } else {
            var ridgeT = Math.sin(((edgeDist - 0.046) / 0.064) * Math.PI);
            r += ridgeT * (14 + sunBias * 15);
            g += ridgeT * (11 + sunBias * 12);
            b += ridgeT * (6 + sunBias * 7);
          }
        }

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Subtle gouache edge chisel nicks ONLY along tile border (zero white fingernail arcs!)
    ctx.save();
    ctx.fillStyle = 'rgba(98, 54, 18, 0.26)';
    var nicks = [
      [0.24, 0.02, 10, 4], [0.71, 0.98, 12, 4],
      [0.02, 0.62, 4, 11], [0.98, 0.34, 4, 10]
    ];
    for (var nk = 0; nk < nicks.length; nk++) {
      var nc = nicks[nk];
      ctx.beginPath();
      ctx.arc(nc[0] * S, nc[1] * S, (nc[2] + nc[3]) * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Sandstone Bump (256x256 linear)
    var invBS = 1.0 / BS;
    for (var by = 0; by < BS; by++) {
      var bv = by * invBS;
      for (var bx = 0; bx < BS; bx++) {
        var bu = bx * invBS;
        var h = 0.55 * fbmTile(bu, bv, 8, 3) + 0.45 * tileNoise(bu, bv, 32);
        var hv = clampByte(96 + h * 115);
        var bi = (by * BS + bx) * 4;
        bdata[bi] = hv;
        bdata[bi + 1] = hv;
        bdata[bi + 2] = hv;
        bdata[bi + 3] = 255;
      }
    }
    bctx.putImageData(bimg, 0, 0);

    return {
      map: toThreeTexture(canvas, true, true),
      bump: toThreeTexture(bumpCanvas, false, true)
    };
  }

  // --------------------------------------------------------------------------
  // 2. Plush Velvety Chartreuse Moss (#9AD422 / #8CC61E) + Bump
  // --------------------------------------------------------------------------
  function buildMossTextures() {
    var S = 512;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;

    var BS = 256;
    var bumpCanvas = makeCanvas(BS, BS);
    var bctx = bumpCanvas.getContext('2d');
    var bimg = bctx.createImageData(BS, BS);
    var bdata = bimg.data;

    var wf1 = bakeWorleyField(128, 6, 7);
    var wf2 = bakeWorleyField(128, 13, 31);

    var invS = 1.0 / S;
    for (var y = 0; y < S; y++) {
      var v = y * invS;
      for (var x = 0; x < S; x++) {
        var u = x * invS;

        // Broad hand-painted velvet brush washes + gentle botanical pillows (zero corn-cob dimple grid!)
        var broadWash = fbmTile(u, v, 4, 3);
        var f1a = sampleField(wf1.f1, 128, 127, u, v);
        var dome1 = Math.max(0.0, 1.0 - f1a * 0.92);
        var sun1 = sampleField(wf1.sun, 128, 127, u, v);

        var f1b = sampleField(wf2.f1, 128, 127, u + 0.13, v + 0.29);
        var dome2 = Math.max(0.0, 1.0 - f1b * 1.05);
        var velvet = tileNoise(u, v, 16);

        var lush = 0.48 * broadWash + 0.26 * dome1 + 0.14 * dome2 + 0.12 * velvet;
        var highlight = Math.max(0.0, Math.min(1.0, lush + sun1 * 0.18 - 0.04));

        // Warm Ankama golden-chartreuse moss: deep olive-emerald (#366804) -> rich chartreuse (#7CB60C) -> sunlit lime-gold (#A8DA12)
        var r = 54 + highlight * 114;
        var g = 104 + highlight * 114;
        var b = 4 + highlight * 14;

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    var invBS = 1.0 / BS;
    for (var by = 0; by < BS; by++) {
      var bv = by * invBS;
      for (var bx = 0; bx < BS; bx++) {
        var bu = bx * invBS;
        var bw = fbmTile(bu, bv, 4, 3);
        var bf1 = sampleField(wf1.f1, 128, 127, bu, bv);
        var bd1 = Math.max(0.0, 1.0 - bf1 * 0.95);
        var bh = clampByte(106 + (0.68 * bw + 0.32 * bd1) * 52);
        var bi = (by * BS + bx) * 4;
        bdata[bi] = bh;
        bdata[bi + 1] = bh;
        bdata[bi + 2] = bh;
        bdata[bi + 3] = 255;
      }
    }
    bctx.putImageData(bimg, 0, 0);

    return {
      map: toThreeTexture(canvas, true, true),
      bump: toThreeTexture(bumpCanvas, false, true)
    };
  }

  // --------------------------------------------------------------------------
  // 3. Chiseled Slate-Buff Cliff Stone (#7D8491 / #586170) + Bump
  // --------------------------------------------------------------------------
  function buildCliffStoneTextures() {
    var S = 512;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;

    var BS = 256;
    var bumpCanvas = makeCanvas(BS, BS);
    var bctx = bumpCanvas.getContext('2d');
    var bimg = bctx.createImageData(BS, BS);
    var bdata = bimg.data;

    var wfCliff = bakeWorleyField(128, 6, 53);

    var invS = 1.0 / S;
    for (var y = 0; y < S; y++) {
      var v = y * invS;
      var vStretch = (v * 0.50) % 1.0;
      for (var x = 0; x < S; x++) {
        var u = x * invS;

        // Broad hand-chiseled Ankama limestone-slate rock facets
        var edgeVal = sampleField(wfCliff.edge, 128, 127, u, vStretch);
        var ridge = Math.min(1.0, edgeVal * 3.4);
        var facetShade = sampleField(wfCliff.id, 128, 127, u, vStretch);
        var grain = 0.68 * tileNoise(u, v, 8) + 0.32 * tileNoise(u + 0.17, v + 0.31, 16);

        // Clean sculpted fracture crease without muddy charcoal speckling
        var crease = ridge < 0.18 ? (0.74 + (ridge / 0.18) * 0.26) : 1.0;
        var warmBuff = tileNoise(u + 0.5, v + 0.2, 4);

        // Luminous sunlit limestone-slate (#848E9E -> #A6AEBC) with warm buff mineral washes
        var base = 0.45 * facetShade + 0.55 * grain;
        var r = (98 + base * 64 + warmBuff * 20) * crease;
        var g = (104 + base * 60 + warmBuff * 15) * crease;
        var b = (116 + base * 58 + (1.0 - warmBuff) * 10) * crease;

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    var invBS = 1.0 / BS;
    for (var by = 0; by < BS; by++) {
      var bv = by * invBS;
      var bvStretch = (bv * 0.50) % 1.0;
      for (var bx = 0; bx < BS; bx++) {
        var bu = bx * invBS;
        var bedge = sampleField(wfCliff.edge, 128, 127, bu, bvStretch);
        var br = Math.min(1.0, bedge * 3.2);
        var bg = tileNoise(bu, bv, 8);
        var bh = clampByte(88 + (0.62 * br + 0.38 * bg) * 104);
        var bi = (by * BS + bx) * 4;
        bdata[bi] = bh;
        bdata[bi + 1] = bh;
        bdata[bi + 2] = bh;
        bdata[bi + 3] = 255;
      }
    }
    bctx.putImageData(bimg, 0, 0);

    return {
      map: toThreeTexture(canvas, true, true),
      bump: toThreeTexture(bumpCanvas, false, true)
    };
  }

  // --------------------------------------------------------------------------
  // 4. Brushed Antique Gold-Bronze (#B87D32 / #DDA448) + Bump
  // --------------------------------------------------------------------------
  function buildBronzeTextures() {
    var S = 256;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;

    var bumpCanvas = makeCanvas(S, S);
    var bctx = bumpCanvas.getContext('2d');
    var bimg = bctx.createImageData(S, S);
    var bdata = bimg.data;

    var invS = 1.0 / S;
    for (var y = 0; y < S; y++) {
      var v = y * invS;
      for (var x = 0; x < S; x++) {
        var u = x * invS;
        // Smooth isotropic hand-painted antique gold-bronze patina (ZERO stripes or concentric rings!)
        var patina = fbmTile(u, v, 4, 3);
        var dapple = tileNoise(u + 0.37, v + 0.61, 8);
        var micro = tileNoise(u + 0.11, v + 0.83, 16);
        var val = 0.56 * patina + 0.30 * dapple + 0.14 * micro;

        // Warm gleaming antique gold-bronze (#946222 -> #E0A84C)
        var r = 148 + val * 76;
        var g = 98 + val * 68;
        var b = 34 + val * 40;

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;

        // Gentle hammered bronze micro-relief
        var bh = clampByte(118 + val * 28);
        bdata[idx] = bh;
        bdata[idx + 1] = bh;
        bdata[idx + 2] = bh;
        bdata[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bimg, 0, 0);

    return {
      map: toThreeTexture(canvas, true, true),
      bump: toThreeTexture(bumpCanvas, false, true)
    };
  }

  // --------------------------------------------------------------------------
  // 5. Painterly Sunlit Walnut & Oak Timber (#8F562E / #BE783A) + Smooth Bump
  // --------------------------------------------------------------------------
  function buildOakWoodTextures() {
    var S = 256;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;

    var BS = 256;
    var bumpCanvas = makeCanvas(BS, BS);
    var bctx = bumpCanvas.getContext('2d');
    var bimg = bctx.createImageData(BS, BS);
    var bdata = bimg.data;

    var invS = 1.0 / S;
    for (var y = 0; y < S; y++) {
      var v = y * invS;
      // Soft broad timber bevel wash (zero 1px concentric moire rings when polarUv-mapped!)
      var boardWave = 0.90 + 0.10 * Math.sin(v * Math.PI * 4.0);

      for (var x = 0; x < S; x++) {
        var u = x * invS;
        // 100% seamless integer-period u-wrapping so curved rims have zero seam or contour lines!
        var brush = fbmTile(u, v, 4, 3);
        var longFlow = tileNoise(u, v, 8);
        var softGrain = 0.5 + 0.5 * Math.sin((v * 2.0 + brush * 0.85) * Math.PI * 2.0);
        var tone = (0.54 * brush + 0.30 * longFlow + 0.16 * softGrain) * boardWave;

        // Warm hand-painted sunlit walnut & honey-oak (#6E401C -> #A66632 -> #C68244)
        var r = 108 + tone * 86;
        var g = 63 + tone * 60;
        var b = 28 + tone * 34;

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;

        var bh = clampByte(114 + tone * 32);
        bdata[idx] = bh;
        bdata[idx + 1] = bh;
        bdata[idx + 2] = bh;
        bdata[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bimg, 0, 0);

    return {
      map: toThreeTexture(canvas, true, true),
      bump: toThreeTexture(bumpCanvas, false, true)
    };
  }

  // --------------------------------------------------------------------------
  // 6. Painterly Flowing Turquoise Sky-Water (#1A9EE6 -> #42D4FF + Sunlit Ribbons)
  // --------------------------------------------------------------------------
  function buildWaterFoamTexture() {
    var S = 256;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;
    var invS = 1.0 / S;

    for (var y = 0; y < S; y++) {
      var v = y * invS;
      for (var x = 0; x < S; x++) {
        var u = x * invS;
        // Smooth painterly longitudinal & sinuous water current ribbons (ZERO Voronoi polygon pool-tiles!)
        var warpA = fbmTile(u, v, 4, 3);
        var warpB = tileNoise(u + 0.31, v + 0.57, 8);
        var ribbon1 = 0.5 + 0.5 * Math.sin((u * 2.0 + v * 1.0 + warpA * 0.95) * Math.PI * 2.0);
        var ribbon2 = 0.5 + 0.5 * Math.cos((u * 3.0 - v * 2.0 + warpB * 0.75) * Math.PI * 2.0);
        var flow = 0.46 * warpA + 0.32 * ribbon1 + 0.22 * ribbon2;
        var crest = flow > 0.68 ? Math.min(1.0, (flow - 0.68) * 2.6) : 0.0;

        // Luminous Ankama cerulean-turquoise water (#189BE2 -> #3ED2FA) with soft sunlit aqua-cream crests
        var r = 22 + flow * 44 + crest * 145;
        var g = 152 + flow * 62 + crest * 40;
        var b = 226 + flow * 24 + crest * 5;

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toThreeTexture(canvas, true, true);
  }

  // --------------------------------------------------------------------------
  // 7. Soft Radial Cloud Puff Sprite (0.0% border alpha) & Cloud Displacement
  // --------------------------------------------------------------------------
  function buildCloudTextures() {
    var S = 256;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;
    var invS = 1.0 / S;

    // 7 overlapping cumulus lobes strictly inside radius <= 0.46 (0% border opacity!)
    var lobes = [
      [0.50, 0.50, 0.31],
      [0.37, 0.52, 0.23],
      [0.63, 0.53, 0.23],
      [0.44, 0.40, 0.24],
      [0.57, 0.41, 0.22],
      [0.43, 0.60, 0.20],
      [0.58, 0.59, 0.20]
    ];

    for (var y = 0; y < S; y++) {
      var v = y * invS;
      for (var x = 0; x < S; x++) {
        var u = x * invS;
        var dxCenter = u - 0.5;
        var dyCenter = v - 0.5;
        var rOuter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);

        var density = 0.0;
        if (rOuter < 0.475) {
          for (var l = 0; l < lobes.length; l++) {
            var lx = u - lobes[l][0];
            var ly = v - lobes[l][1];
            var lr = lobes[l][2];
            var d = Math.sqrt(lx * lx + ly * ly) / lr;
            if (d < 1.0) {
              var w = 1.0 - d * d;
              density = Math.max(density, w * w);
            }
          }
          // Guaranteed smooth outer fade to 0 before UV border
          var borderFade = Math.max(0.0, Math.min(1.0, (0.475 - rOuter) / 0.11));
          density *= borderFade * borderFade;
        }

        // Sunlit warm-white top (v < 0.5) -> cool sky-blue belly (#CBE8FF, v > 0.5)
        var belly = Math.max(0.0, Math.min(1.0, (v - 0.28) * 1.45));
        var r = 255 - belly * 44;
        var g = 255 - belly * 20;
        var b = 255;

        var idx = (y * S + x) * 4;
        data[idx] = clampByte(r);
        data[idx + 1] = clampByte(g);
        data[idx + 2] = clampByte(b);
        data[idx + 3] = clampByte(density * 255);
      }
    }
    ctx.putImageData(img, 0, 0);

    // 128x128 smooth billowy cumulus displacement map
    var DS = 128;
    var dispCanvas = makeCanvas(DS, DS);
    var dctx = dispCanvas.getContext('2d');
    var dimg = dctx.createImageData(DS, DS);
    var ddata = dimg.data;
    var invDS = 1.0 / DS;
    for (var dy = 0; dy < DS; dy++) {
      var dv = dy * invDS;
      for (var dx = 0; dx < DS; dx++) {
        var du = dx * invDS;
        var cw = worleyTile(du, dv, 5, 89);
        var puff = Math.max(0.0, 1.0 - cw.f1 * 1.25);
        var dh = clampByte(80 + Math.sqrt(puff) * 170);
        var di = (dy * DS + dx) * 4;
        ddata[di] = dh;
        ddata[di + 1] = dh;
        ddata[di + 2] = dh;
        ddata[di + 3] = 255;
      }
    }
    dctx.putImageData(dimg, 0, 0);

    return {
      puff: toThreeTexture(canvas, true, false),
      disp: toThreeTexture(dispCanvas, false, true)
    };
  }

  // --------------------------------------------------------------------------
  // 8. Soft Radial Fire / Spark Glow Sprite (0.0% border alpha)
  // --------------------------------------------------------------------------
  function buildFireGlowTexture() {
    var S = 128;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;
    var invS = 1.0 / S;

    for (var y = 0; y < S; y++) {
      var v = y * invS;
      for (var x = 0; x < S; x++) {
        var u = x * invS;
        var dx = u - 0.5;
        var dy = v - 0.5;
        var r = Math.sqrt(dx * dx + dy * dy) / 0.47;
        var a = r >= 1.0 ? 0.0 : Math.pow(1.0 - r, 2.2);
        var core = r >= 0.45 ? 0.0 : Math.pow(1.0 - r / 0.45, 1.6);

        var idx = (y * S + x) * 4;
        data[idx] = 255;
        data[idx + 1] = clampByte(130 + core * 120);
        data[idx + 2] = clampByte(18 + core * 195);
        data[idx + 3] = clampByte(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return toThreeTexture(canvas, true, false);
  }

  // --------------------------------------------------------------------------
  // 9. Soft Feathered Contact AO Shadow Disc (0.0% border alpha)
  // --------------------------------------------------------------------------
  function buildSoftShadowTexture() {
    var S = 64;
    var canvas = makeCanvas(S, S);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(S, S);
    var data = img.data;
    var invS = 1.0 / S;

    for (var y = 0; y < S; y++) {
      var v = (y + 0.5) * invS;
      for (var x = 0; x < S; x++) {
        var u = (x + 0.5) * invS;
        var dx = u - 0.5;
        var dy = v - 0.5;
        var r = Math.sqrt(dx * dx + dy * dy) / 0.46;
        var a = r >= 1.0 ? 0.0 : Math.pow(1.0 - r * r, 1.85);

        var idx = (y * S + x) * 4;
        data[idx] = 26;
        data[idx + 1] = 13;
        data[idx + 2] = 5;
        data[idx + 3] = clampByte(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    return toThreeTexture(canvas, true, false);
  }

  // ============================================================================
  // Public Singleton API (`window.GAME.Textures`)
  // ============================================================================
  var Textures = {
    initialized: false,
    initMs: 0,
    maps: {},

    init: function () {
      if (this.initialized) {
        return this.maps;
      }
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      ensureLUT();

      var sand = buildSandstoneTextures();
      var moss = buildMossTextures();
      var cliff = buildCliffStoneTextures();
      var bronze = buildBronzeTextures();
      var oak = buildOakWoodTextures();
      var waterFoam = buildWaterFoamTexture();
      var cloud = buildCloudTextures();
      var fireGlow = buildFireGlowTexture();
      var aoShadow = buildSoftShadowTexture();

      this.maps = {
        sandstone: sand.map,
        sandstoneBump: sand.bump,
        moss: moss.map,
        mossBump: moss.bump,
        cliffStone: cliff.map,
        cliffBump: cliff.bump,
        bronze: bronze.map,
        bronzeBump: bronze.bump,
        oakWood: oak.map,
        oakBump: oak.bump,
        waterFoam: waterFoam,
        cloudPuff: cloud.puff,
        cloudDisp: cloud.disp,
        fireGlow: fireGlow,
        aoShadow: aoShadow
      };

      // Expose direct aliases on GAME.Textures for convenience across modules
      var keys = Object.keys(this.maps);
      for (var i = 0; i < keys.length; i++) {
        this[keys[i]] = this.maps[keys[i]];
      }

      var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      this.initMs = +(t1 - t0).toFixed(2);
      this.initialized = true;
      return this.maps;
    },

    get: function (name) {
      if (!this.initialized) {
        this.init();
      }
      return this.maps[name] || null;
    }
  };

  window.GAME.Textures = Textures;
})();

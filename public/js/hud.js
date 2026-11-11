/* ==========================================================================
   Clockwork Sanctum: The Living Board — Collector-Card & Gold-Medallion HUD
   Owns ONLY: js/hud.js (paired with style.css)
   Attaches onto: window.GAME.HUD
   Round 2 Polish: 512x512 Volumetric 3/4 Ankama Miniature Portraits,
   Safe-Zone Weapon Framing (x in 23%..76%), Sculpted Chiseled Stone Gargoyle,
   Zero Ribbon Truncation (max-width: 580px), and <= 16% Viewport Occlusion.
   ========================================================================== */
(function () {
  'use strict';

  window.GAME = window.GAME || {};

  // ------------------------------------------------------------------------
  // Built-in Level Metadata Fallbacks (Matches CONTRACT.md Section 5.2)
  // ------------------------------------------------------------------------
  var DEFAULT_LEVEL_META = {
    1: {
      title: 'The Sundial Courtyard',
      goal: 'Shatter all 3 Gargoyles before Rogue catches you!',
      parTurns: 4,
      parSteps: 4
    },
    2: {
      title: 'The Waterwheel Aqueduct',
      goal: 'Wash 2 Gargoyles, sun-shatter 3rd & power Wheel',
      parTurns: 4,
      parSteps: 4
    },
    3: {
      title: 'The Clockwork Bell-Hammer',
      goal: 'Sweep Gargoyles & sun-shatter before Rogue strikes',
      parTurns: 4,
      parSteps: 4
    },
    4: {
      title: 'The Twin-Cog Sky Split',
      goal: 'Ferry across chasm & shatter all 4 Gargoyles!',
      parTurns: 3,
      parSteps: 3
    }
  };

  var DEFAULT_HERO_META = {
    warrior: {
      id: 'warrior',
      type: 'warrior',
      name: 'Warrior',
      role: 'Sanctum Knight',
      hp: 24,
      maxHp: 24,
      ap: 99,
      maxAp: 99,
      moveRange: 2,
      armor: 3,
      power: 3,
      tier: 1,
      desc: 'Dodge 2 · Mirrors & Gears'
    },
    mage: {
      id: 'mage',
      type: 'mage',
      name: 'Astral Aid',
      role: 'Pocket Summon [F]',
      hp: 18,
      maxHp: 18,
      ap: 1,
      maxAp: 1,
      moveRange: 0,
      armor: 2,
      power: 2,
      tier: 1,
      desc: '⚡ Freeze Rogue 2 Steps'
    },
    rogue: {
      id: 'rogue',
      type: 'rogue',
      name: 'Shadow Rogue',
      role: 'Relentless Hunter',
      hp: 18,
      maxHp: 18,
      ap: 1,
      maxAp: 1,
      moveRange: 1,
      armor: 2,
      power: 3,
      tier: 3,
      desc: 'Prowls 1 tile after every step'
    }
  };

  // ------------------------------------------------------------------------
  // Crisp Inline SVGs (All with explicit integer width & height attributes)
  // ------------------------------------------------------------------------
  var SVGS = {
    heart:
      '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><linearGradient id="csHeartG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#ff8585"/><stop offset="55%" stop-color="#ef3338"/><stop offset="100%" stop-color="#9e1419"/>' +
      '</linearGradient></defs>' +
      '<path d="M12 21.2C12 21.2 3 15.4 3 8.7C3 5.5 5.4 3.2 8.3 3.2C10.1 3.2 11.4 4.1 12 5.3C12.6 4.1 13.9 3.2 15.7 3.2C18.6 3.2 21 5.5 21 8.7C21 15.4 12 21.2 12 21.2Z" fill="url(#csHeartG)" stroke="#241510" stroke-width="2.1" stroke-linejoin="round"/>' +
      '<ellipse cx="8.1" cy="7.3" rx="2.1" ry="1.3" transform="rotate(-28 8.1 7.3)" fill="#ffc4c4" opacity="0.8"/>' +
      '</svg>',

    crystal:
      '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><linearGradient id="csCrysG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#b8fbff"/><stop offset="50%" stop-color="#33d8ff"/><stop offset="100%" stop-color="#0d7fb5"/>' +
      '</linearGradient></defs>' +
      '<path d="M12 2.2C14.8 6.4 18.6 10.1 18.6 14.5C18.6 18.5 15.7 21.5 12 21.5C8.3 21.5 5.4 18.5 5.4 14.5C5.4 10.1 9.2 6.4 12 2.2Z" fill="url(#csCrysG)" stroke="#1d1814" stroke-width="2.1" stroke-linejoin="round"/>' +
      '<path d="M11.6 5.6C9.6 8.8 8.1 11.4 8.2 14.3C8.3 16.4 9.5 18 11.2 18.6C10.2 16.9 10.1 14.2 11.6 5.6Z" fill="#e8feff" opacity="0.82"/>' +
      '</svg>',

    trophy:
      '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">' +
      '<defs><linearGradient id="csTrophyG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fff099"/><stop offset="52%" stop-color="#f2ac29"/><stop offset="100%" stop-color="#ad680e"/>' +
      '</linearGradient></defs>' +
      '<path d="M7 4H17V9.5C17 12.6 14.8 15 12 15C9.2 15 7 12.6 7 9.5V4Z" fill="url(#csTrophyG)" stroke="#24180f" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path d="M7 6H4.2C4.2 9.4 5.6 11.3 7.4 11.7M17 6H19.8C19.8 9.4 18.4 11.3 16.6 11.7" fill="none" stroke="#f4b738" stroke-width="2.1" stroke-linecap="round"/>' +
      '<path d="M12 15V18.5M8.5 20H15.5" stroke="#f5be41" stroke-width="2.4" stroke-linecap="round"/>' +
      '<rect x="7.8" y="18.6" width="8.4" height="2.6" rx="1.1" fill="#e5a128" stroke="#24180f" stroke-width="1.5"/>' +
      '</svg>',

    soundOn:
      '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 9.5H8.2L13.5 5V19L8.2 14.5H4V9.5Z" fill="#fff4d6" stroke="#231810" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M16.5 8.5C18.1 10.2 18.1 13.8 16.5 15.5M19.2 6C22 9.2 22 14.8 19.2 18" fill="none" stroke="#ffd875" stroke-width="2.1" stroke-linecap="round"/>' +
      '</svg>',

    soundOff:
      '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 9.5H8.2L13.5 5V19L8.2 14.5H4V9.5Z" fill="#ffd2cc" stroke="#231810" stroke-width="1.8" stroke-linejoin="round"/>' +
      '<path d="M16.5 9L21 15M21 9L16.5 15" fill="none" stroke="#ff7a70" stroke-width="2.4" stroke-linecap="round"/>' +
      '</svg>',

    classWarrior:
      '<svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M12.8 2.2L13.8 3.2L6.6 10.4L5.6 9.4L12.8 2.2Z" fill="#eef6fc"/>' +
      '<path d="M4.2 8.2L7.8 11.8M3 13L5.6 10.4" stroke="#ffd166" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg>',

    classMage:
      '<svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M8 1.8L9.6 6.2L14.2 8L9.6 9.8L8 14.2L6.4 9.8L1.8 8L6.4 6.2Z" fill="#6bf4ff" stroke="#183247" stroke-width="0.9"/>' +
      '</svg>',

    classRogue:
      '<svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M3 12.5L12.5 3M12.5 12.5L3 3" stroke="#ff5c77" stroke-width="2.1" stroke-linecap="round"/>' +
      '<circle cx="8" cy="8" r="1.9" fill="#ffd166"/>' +
      '</svg>',

    classGargoyle:
      '<svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M2 10C3.5 5.5 5.8 4.5 8 6.5C10.2 4.5 12.5 5.5 14 10C11.5 9.2 9.8 9.8 8 12C6.2 9.8 4.5 9.2 2 10Z" fill="#f5b8ff" stroke="#2a1130" stroke-width="1"/>' +
      '</svg>',

    actMove:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M4.5 3H8.5V8.5L12.5 10.5V13H3.5V10L4.5 8V3Z" fill="#84ed64" stroke="#1d1610" stroke-width="1.3" stroke-linejoin="round"/>' +
      '</svg>',

    actMirror:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M8 1.8L13.5 8L8 14.2L2.5 8Z" fill="#8cf6ff" stroke="#ffd166" stroke-width="1.5" stroke-linejoin="round"/>' +
      '</svg>',

    actGear:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="4.2" fill="none" stroke="#ffd166" stroke-width="2.2"/>' +
      '<path d="M8 1.5V3.5M8 12.5V14.5M1.5 8H3.5M12.5 8H14.5M3.4 3.4L4.8 4.8M11.2 11.2L12.6 12.6M12.6 3.4L11.2 4.8M4.8 11.2L3.4 12.6" stroke="#ffd166" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>',

    actAbility:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M9.2 1.5L3.5 9H7.6L6.8 14.5L12.5 7H8.4L9.2 1.5Z" fill="#ffdf6e" stroke="#21160e" stroke-width="1.2" stroke-linejoin="round"/>' +
      '</svg>',

    actHint:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<circle cx="8" cy="6.6" r="4.2" fill="#ffe885" stroke="#22170f" stroke-width="1.3"/>' +
      '<rect x="6.2" y="11" width="3.6" height="2.6" rx="0.8" fill="#d9a03b"/>' +
      '</svg>',

    actUndo:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M6.2 4L2.8 7.2L6.2 10.4" fill="none" stroke="#dce8f8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M3.2 7.2H9.6C11.8 7.2 13.2 8.6 13.2 10.6C13.2 12.1 12.2 13.2 10.6 13.5" fill="none" stroke="#dce8f8" stroke-width="1.9" stroke-linecap="round"/>' +
      '</svg>',

    actReset:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M12.6 5.2A5.2 5.2 0 1 0 13.1 9.5" fill="none" stroke="#ffe49c" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M13.2 2.5V5.6H10.1" fill="none" stroke="#ffe49c" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',

    actEndTurn:
      '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M4.2 2.5H11.8L9 7.8L11.8 13.5H4.2L7 7.8L4.2 2.5Z" fill="#fff9dc" stroke="#3b2308" stroke-width="1.4" stroke-linejoin="round"/>' +
      '</svg>',

    starFull:
      '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 2.3L14.9 8.2L21.4 9.1L16.7 13.7L17.8 20.2L12 17.1L6.2 20.2L7.3 13.7L2.6 9.1L9.1 8.2Z" fill="#ffd954" stroke="#291a0d" stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>',

    starEmpty:
      '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M12 2.3L14.9 8.2L21.4 9.1L16.7 13.7L17.8 20.2L12 17.1L6.2 20.2L7.3 13.7L2.6 9.1L9.1 8.2Z" fill="#4a392b" stroke="#26190f" stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>',

    homeCrest:
      '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M3.5 11.2L12 4L20.5 11.2V19.8H14.6V14.4H9.4V19.8H3.5V11.2Z" fill="#ffe285" stroke="#231810" stroke-width="2" stroke-linejoin="round"/>' +
      '</svg>'
  };

  // ------------------------------------------------------------------------
  // Synchronous 512x512 Volumetric 3/4 Ankama Miniature Portrait Studio
  // Safe Character & Weapon Corridor: x in [116..394] (22.6%..76.9%)
  // ------------------------------------------------------------------------
  var _portraitCanvases = null;
  var _portraits = null;

  function makeCanvas(size) {
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  }

  // Exact 4x4 (16x MSAA) pre-multiplied alpha box-filter downsampler (zero Cairo stair-stepping!)
  function boxDownsample4x(srcCanvas) {
    var sw = srcCanvas.width;
    var sh = srcCanvas.height;
    var dw = sw >> 2;
    var dh = sh >> 2;
    var dst = document.createElement('canvas');
    dst.width = dw;
    dst.height = dh;
    var sctx = srcCanvas.getContext('2d');
    var dctx = dst.getContext('2d');
    var sData = sctx.getImageData(0, 0, sw, sh).data;
    var dImg = dctx.createImageData(dw, dh);
    var dData = dImg.data;

    for (var dy = 0; dy < dh; dy++) {
      var sy0 = dy << 2;
      for (var dx = 0; dx < dw; dx++) {
        var sx0 = dx << 2;
        var sumR = 0;
        var sumG = 0;
        var sumB = 0;
        var sumA = 0;
        for (var oy = 0; oy < 4; oy++) {
          var rowBase = ((sy0 + oy) * sw + sx0) << 2;
          for (var ox = 0; ox < 4; ox++) {
            var idx = rowBase + (ox << 2);
            var a = sData[idx + 3];
            sumR += sData[idx] * a;
            sumG += sData[idx + 1] * a;
            sumB += sData[idx + 2] * a;
            sumA += a;
          }
        }
        var dIdx = (dy * dw + dx) << 2;
        if (sumA > 0) {
          dData[dIdx] = (sumR / sumA + 0.5) | 0;
          dData[dIdx + 1] = (sumG / sumA + 0.5) | 0;
          dData[dIdx + 2] = (sumB / sumA + 0.5) | 0;
          dData[dIdx + 3] = ((sumA + 8) >> 4);
        }
      }
    }
    dctx.putImageData(dImg, 0, 0);
    return dst;
  }

  // Zoomed head-and-shoulders crop -> 384x384 -> exact 4x4 pre-multiplied box downsample -> 96x96
  function makeMedallion96(src512, sx, sy, sw) {
    var stage = makeCanvas(384);
    var ctx = stage.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(src512, sx, sy, sw, sw, 0, 0, 384, 384);
    return boxDownsample4x(stage);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function fillAndInk(ctx, fillStyle, inkStyle, lineWidth) {
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (inkStyle) {
      ctx.strokeStyle = inkStyle;
      ctx.lineWidth = lineWidth || 4.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  function paintSoftAura(ctx, cx, cy, rInner, rOuter, innerRgba) {
    var g = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
    g.addColorStop(0, innerRgba);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintThreeQuarterEye(ctx, ex, ey, rx, ry, topColor, midColor, glowColor, ink) {
    // Soft warm eyelid socket shadow
    ctx.beginPath();
    ctx.ellipse(ex, ey - 1, rx + 3, ry + 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(54, 24, 12, 0.22)';
    ctx.fill();

    // Warm cream sclera with top lid shadow
    var sclG = ctx.createLinearGradient(ex, ey - ry, ex, ey + ry);
    sclG.addColorStop(0, '#dfd0c3');
    sclG.addColorStop(0.28, '#fffdf9');
    sclG.addColorStop(1, '#f7ede0');
    ctx.beginPath();
    ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    fillAndInk(ctx, sclG, ink, 4.0);

    // Rich 3-tone Ankama iris shifted right for 3/4 gaze
    var ix = ex + rx * 0.22;
    var iy = ey + 1.5;
    var irx = rx * 0.72;
    var iry = ry * 0.78;
    var irisG = ctx.createLinearGradient(ix, iy - iry, ix, iy + iry);
    irisG.addColorStop(0, topColor);
    irisG.addColorStop(0.55, midColor);
    irisG.addColorStop(1, glowColor);
    ctx.beginPath();
    ctx.ellipse(ix, iy, irx, iry, 0, 0, Math.PI * 2);
    ctx.fillStyle = irisG;
    ctx.fill();

    // Deep warm pupil
    ctx.beginPath();
    ctx.ellipse(ix + 1, iy, irx * 0.48, iry * 0.54, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e100a';
    ctx.fill();

    // Primary top-left specular catchlight + warm lower bounce dot
    ctx.beginPath();
    ctx.ellipse(ix - irx * 0.34, iy - iry * 0.36, irx * 0.30, iry * 0.24, -0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ix + irx * 0.30, iy + iry * 0.40, irx * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    // Painterly upper lash arch
    ctx.beginPath();
    ctx.ellipse(ex, ey - 1, rx + 0.5, ry, 0, Math.PI * 1.06, Math.PI * 1.95);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // ------------------------------------------------------------------------
  // 1. WARRIOR (Asymmetric ~22° Right-Turned Painted Ankama Figurine!)
  // Painterly warm-umber outline (#3D1E0E, 4.6-5.2px) & rich 3D volume shading
  // ------------------------------------------------------------------------
  function paintWarriorPortrait(includeWeapon) {
    var S = 512;
    var c = makeCanvas(S);
    var ctx = c.getContext('2d');
    var ink = '#3d1e0e';
    var showSword = includeWeapon !== false;

    paintSoftAura(ctx, 236, 224, 28, 200, 'rgba(255, 245, 200, 0.52)');

    // Crimson-rust cloak fold swept behind near (left) shoulder
    var capeG = ctx.createLinearGradient(118, 314, 270, 480);
    capeG.addColorStop(0, '#b83728');
    capeG.addColorStop(1, '#58150f');
    ctx.beginPath();
    ctx.moveTo(118, 480);
    ctx.quadraticCurveTo(114, 348, 174, 322);
    ctx.lineTo(318, 340);
    ctx.quadraticCurveTo(352, 392, 346, 480);
    ctx.closePath();
    fillAndInk(ctx, capeG, ink, 5.0);

    // Asymmetric 3/4 Chest Brigandine & Leather Tunic (turned ~22° right)
    var torsoG = ctx.createRadialGradient(212, 362, 16, 240, 404, 148);
    torsoG.addColorStop(0, '#ec6946');
    torsoG.addColorStop(0.55, '#ad3524');
    torsoG.addColorStop(1, '#5c1810');
    ctx.beginPath();
    ctx.moveTo(132, 492);
    ctx.quadraticCurveTo(138, 336, 238, 330);
    ctx.quadraticCurveTo(328, 338, 342, 492);
    ctx.closePath();
    fillAndInk(ctx, torsoG, ink, 5.2);

    // Sculpted Steel Gorget Collar (shifted 3/4 right with chest centerline at x=254)
    var steelG = ctx.createLinearGradient(178, 316, 308, 384);
    steelG.addColorStop(0, '#f8fbff');
    steelG.addColorStop(0.48, '#b5c6d8');
    steelG.addColorStop(1, '#5d6e82');
    ctx.beginPath();
    ctx.moveTo(176, 334);
    ctx.quadraticCurveTo(254, 394, 308, 336);
    ctx.quadraticCurveTo(294, 314, 244, 316);
    ctx.quadraticCurveTo(190, 314, 176, 334);
    ctx.closePath();
    fillAndInk(ctx, steelG, ink, 4.6);

    // Diagonal Stitched Saddle-Leather Baldric & Gold Buckle
    var strapG = ctx.createLinearGradient(164, 342, 316, 470);
    strapG.addColorStop(0, '#b56d38');
    strapG.addColorStop(1, '#5e3214');
    ctx.beginPath();
    ctx.moveTo(164, 356);
    ctx.lineTo(298, 474);
    ctx.lineTo(320, 452);
    ctx.lineTo(186, 336);
    ctx.closePath();
    fillAndInk(ctx, strapG, ink, 4.6);

    ctx.beginPath();
    roundRectPath(ctx, 236, 390, 36, 30, 8);
    fillAndInk(ctx, '#ffd866', ink, 4.4);

    // Far (Right) Foreshortened Bronze Shoulder Pad
    var paulRightG = ctx.createRadialGradient(316, 360, 4, 322, 372, 44);
    paulRightG.addColorStop(0, '#f7cf70');
    paulRightG.addColorStop(0.6, '#be7b1d');
    paulRightG.addColorStop(1, '#704109');
    ctx.beginPath();
    ctx.ellipse(320, 374, 34, 26, 0.36, 0, Math.PI * 2);
    fillAndInk(ctx, paulRightG, ink, 4.6);

    // Prominent Near (Left) Sculpted Golden-Bronze Pauldron in Foreground!
    var paulLeftG = ctx.createRadialGradient(162, 356, 8, 168, 374, 68);
    paulLeftG.addColorStop(0, '#fff5b5');
    paulLeftG.addColorStop(0.48, '#eaa531');
    paulLeftG.addColorStop(1, '#8f520e');
    ctx.beginPath();
    ctx.moveTo(118, 404);
    ctx.quadraticCurveTo(114, 338, 176, 332);
    ctx.quadraticCurveTo(220, 344, 214, 394);
    ctx.quadraticCurveTo(168, 424, 118, 404);
    ctx.closePath();
    fillAndInk(ctx, paulLeftG, ink, 5.0);

    ctx.beginPath();
    ctx.moveTo(132, 386);
    ctx.quadraticCurveTo(148, 350, 194, 350);
    ctx.strokeStyle = 'rgba(255, 252, 224, 0.72)';
    ctx.lineWidth = 4.6;
    ctx.stroke();

    // Warm Shaded Neck Column
    ctx.beginPath();
    roundRectPath(ctx, 212, 294, 52, 42, 14);
    fillAndInk(ctx, '#bd754b', ink, 4.4);

    // Prominent Near (Left) Ear at x=154 (NO right ear — true ~22° 3/4 turn!)
    var earG = ctx.createRadialGradient(152, 244, 4, 156, 252, 28);
    earG.addColorStop(0, '#fcd0a8');
    earG.addColorStop(1, '#c4784c');
    ctx.beginPath();
    ctx.ellipse(155, 250, 22, 28, -0.16, 0, Math.PI * 2);
    fillAndInk(ctx, earG, ink, 4.8);
    ctx.beginPath();
    ctx.arc(157, 251, 9, 0.4 * Math.PI, 1.4 * Math.PI);
    ctx.strokeStyle = '#99532c';
    ctx.lineWidth = 3.8;
    ctx.stroke();

    // Asymmetric 3/4 Sculpted Resin-Figurine Chibi Head (Foreshortened Right Cheek!)
    var skinG = ctx.createRadialGradient(218, 202, 18, 240, 236, 132);
    skinG.addColorStop(0, '#fff0dc');
    skinG.addColorStop(0.54, '#f8c396');
    skinG.addColorStop(0.84, '#e09565');
    skinG.addColorStop(1, '#b5693e');

    ctx.beginPath();
    ctx.moveTo(158, 198);
    ctx.quadraticCurveTo(152, 294, 214, 316);
    // Chin shifted slightly right + foreshortened S-curve up far right cheek!
    ctx.quadraticCurveTo(264, 326, 298, 304);
    ctx.quadraticCurveTo(326, 282, 318, 238);
    ctx.quadraticCurveTo(324, 198, 314, 168);
    ctx.quadraticCurveTo(298, 128, 236, 128);
    ctx.quadraticCurveTo(166, 130, 158, 198);
    ctx.closePath();
    fillAndInk(ctx, skinG, ink, 5.2);

    // Warm sunlit cheek blush + subtle under-hair brow shadow
    paintSoftAura(ctx, 196, 266, 2, 30, 'rgba(240, 108, 86, 0.36)');
    paintSoftAura(ctx, 298, 260, 2, 20, 'rgba(240, 108, 86, 0.30)');

    // Asymmetric 3/4 Eyes: Larger Near Eye (x=212) vs Foreshortened Far Eye (x=282)!
    paintThreeQuarterEye(ctx, 212, 236, 22, 24.5, '#451e0c', '#a45724', '#ffd07a', ink);
    paintThreeQuarterEye(ctx, 282, 234, 16.0, 23.0, '#451e0c', '#a45724', '#ffd07a', ink);

    // Projecting 3/4 Sculpted Nose (shifted right to x=264!)
    ctx.beginPath();
    ctx.moveTo(256, 226);
    ctx.quadraticCurveTo(276, 250, 258, 260);
    ctx.fillStyle = 'rgba(186, 104, 62, 0.42)';
    ctx.fill();
    ctx.strokeStyle = '#854322';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Confident 3/4 Determined Ankama Smirk
    ctx.beginPath();
    ctx.moveTo(226, 282);
    ctx.quadraticCurveTo(258, 293, 284, 276);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 4.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Sculpted Asymmetric Chestnut Eyebrows
    var browG = ctx.createLinearGradient(0, 186, 0, 208);
    browG.addColorStop(0, '#8e4d28');
    browG.addColorStop(1, '#4a230e');
    ctx.beginPath();
    roundRectPath(ctx, 182, 192, 54, 14, 7);
    fillAndInk(ctx, browG, ink, 4.0);
    ctx.beginPath();
    roundRectPath(ctx, 264, 190, 42, 13.5, 6.5);
    fillAndInk(ctx, browG, ink, 4.0);

    // Dynamic Swept-Back Layered Chestnut Hair (Sweeping Left-to-Right in 3/4 Volume!)
    var hairBaseG = ctx.createRadialGradient(204, 114, 18, 238, 148, 146);
    hairBaseG.addColorStop(0, '#e59d5e');
    hairBaseG.addColorStop(0.48, '#9c552a');
    hairBaseG.addColorStop(1, '#4d230e');

    ctx.beginPath();
    ctx.moveTo(148, 232);
    ctx.quadraticCurveTo(122, 174, 152, 120);
    ctx.lineTo(138, 102);
    ctx.quadraticCurveTo(182, 72, 230, 78);
    ctx.lineTo(246, 58);
    ctx.quadraticCurveTo(298, 66, 322, 104);
    ctx.lineTo(340, 104);
    ctx.quadraticCurveTo(346, 144, 322, 192);
    // Swept hairline locks framing 3/4 temple
    ctx.quadraticCurveTo(308, 162, 284, 158);
    ctx.quadraticCurveTo(266, 178, 240, 160);
    ctx.quadraticCurveTo(212, 182, 186, 168);
    ctx.quadraticCurveTo(164, 182, 156, 230);
    ctx.closePath();
    fillAndInk(ctx, hairBaseG, ink, 5.2);

    // Warm sunlit hair crown sheen & soft lock partings
    ctx.beginPath();
    ctx.moveTo(166, 136);
    ctx.quadraticCurveTo(218, 92, 290, 110);
    ctx.quadraticCurveTo(252, 130, 202, 148);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 220, 158, 0.48)';
    ctx.fill();

    ctx.strokeStyle = '#47200c';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(196, 102);
    ctx.quadraticCurveTo(232, 118, 244, 156);
    ctx.moveTo(256, 86);
    ctx.quadraticCurveTo(286, 108, 292, 152);
    ctx.stroke();

    // Gleaming Broadsword on Collector Card Only (Omitted in Zoomed Medallion Bust!)
    if (showSword) {
      ctx.save();
      ctx.translate(334, 386);
      ctx.rotate(0.20);

      ctx.beginPath();
      ctx.moveTo(0, -162);
      ctx.lineTo(23, -120);
      ctx.lineTo(20, 10);
      ctx.lineTo(-20, 10);
      ctx.lineTo(-23, -120);
      ctx.closePath();
      var bladeAllG = ctx.createLinearGradient(-23, -156, 23, 10);
      bladeAllG.addColorStop(0, '#ffffff');
      bladeAllG.addColorStop(0.48, '#e8f4fc');
      bladeAllG.addColorStop(0.53, '#9db8d1');
      bladeAllG.addColorStop(1, '#6d88a4');
      fillAndInk(ctx, bladeAllG, ink, 4.8);

      ctx.beginPath();
      ctx.moveTo(0, -152);
      ctx.lineTo(0, 6);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.6;
      ctx.stroke();

      var guardG = ctx.createLinearGradient(-34, 4, 34, 26);
      guardG.addColorStop(0, '#fff2a6');
      guardG.addColorStop(0.5, '#eaa52c');
      guardG.addColorStop(1, '#96580c');
      ctx.beginPath();
      roundRectPath(ctx, -34, 6, 68, 19, 8);
      fillAndInk(ctx, guardG, ink, 4.6);

      ctx.beginPath();
      ctx.arc(0, 15.5, 7, 0, Math.PI * 2);
      fillAndInk(ctx, '#f23838', ink, 3.4);

      ctx.beginPath();
      roundRectPath(ctx, -19, 25, 38, 32, 11);
      fillAndInk(ctx, '#a46032', ink, 4.6);
      ctx.restore();
    }

    return c;
  }

  // ------------------------------------------------------------------------
  // 2. MAGE (Asymmetric ~20° Right-Turned Arcane Sorceress Figurine!)
  // Painterly royal-indigo (#142A54) & warm-umber (#472415) 4.6-5.0px strokes
  // ------------------------------------------------------------------------
  function paintMagePortrait(includeWeapon) {
    var S = 512;
    var c = makeCanvas(S);
    var ctx = c.getContext('2d');
    var robeInk = '#142a54';
    var warmInk = '#472415';
    var showStaff = includeWeapon !== false;

    paintSoftAura(ctx, 240, 228, 28, 198, 'rgba(136, 240, 255, 0.44)');

    // Asymmetric Honey-Amber Hair Cascade (Voluminous Near Left Curl, Foreshortened Right!)
    var backHairG = ctx.createRadialGradient(168, 258, 12, 220, 294, 156);
    backHairG.addColorStop(0, '#ffcb5c');
    backHairG.addColorStop(0.52, '#d88418');
    backHairG.addColorStop(1, '#824407');
    ctx.beginPath();
    ctx.ellipse(160, 292, 46, 70, 0.24, 0, Math.PI * 2);
    fillAndInk(ctx, backHairG, warmInk, 4.8);
    ctx.beginPath();
    ctx.ellipse(310, 292, 30, 54, -0.18, 0, Math.PI * 2);
    fillAndInk(ctx, backHairG, warmInk, 4.6);

    // Asymmetric 3/4 Royal-Cerulean Tunic Robe
    var robeG = ctx.createRadialGradient(218, 378, 16, 244, 418, 136);
    robeG.addColorStop(0, '#44a2ee');
    robeG.addColorStop(0.56, '#1d62ad');
    robeG.addColorStop(1, '#0e3063');
    ctx.beginPath();
    ctx.moveTo(140, 492);
    ctx.quadraticCurveTo(150, 342, 244, 336);
    ctx.quadraticCurveTo(328, 342, 340, 492);
    ctx.closePath();
    fillAndInk(ctx, robeG, robeInk, 5.0);

    // Ornate 3/4 Golden-Ochre Mantle Collar (Centerline Shifted Right to x=256!)
    var goldCollarG = ctx.createLinearGradient(158, 334, 322, 414);
    goldCollarG.addColorStop(0, '#fff4a8');
    goldCollarG.addColorStop(0.52, '#efb438');
    goldCollarG.addColorStop(1, '#9e630e');
    ctx.beginPath();
    ctx.moveTo(158, 358);
    ctx.quadraticCurveTo(256, 426, 322, 356);
    ctx.quadraticCurveTo(304, 332, 246, 334);
    ctx.quadraticCurveTo(178, 332, 158, 358);
    ctx.closePath();
    fillAndInk(ctx, goldCollarG, warmInk, 4.6);

    ctx.beginPath();
    ctx.moveTo(256, 356);
    ctx.lineTo(273, 376);
    ctx.lineTo(256, 396);
    ctx.lineTo(239, 376);
    ctx.closePath();
    fillAndInk(ctx, '#7af8ff', robeInk, 4.0);

    // Asymmetric 3/4 Porcelain-Peach Chibi Face (Turned ~20° Right!)
    var faceG = ctx.createRadialGradient(224, 240, 16, 242, 260, 110);
    faceG.addColorStop(0, '#fff4e6');
    faceG.addColorStop(0.62, '#fad0ae');
    faceG.addColorStop(1, '#d9936b');
    ctx.beginPath();
    ctx.moveTo(164, 246);
    ctx.quadraticCurveTo(164, 326, 248, 334);
    ctx.quadraticCurveTo(316, 326, 314, 254);
    ctx.quadraticCurveTo(312, 196, 240, 196);
    ctx.quadraticCurveTo(166, 196, 164, 246);
    ctx.closePath();
    fillAndInk(ctx, faceG, warmInk, 4.8);

    // Soft hat-brim shade + warm rosy cheeks
    ctx.beginPath();
    ctx.ellipse(242, 214, 74, 20, -0.04, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72, 34, 48, 0.20)';
    ctx.fill();
    paintSoftAura(ctx, 196, 284, 2, 26, 'rgba(248, 116, 108, 0.42)');
    paintSoftAura(ctx, 294, 280, 2, 20, 'rgba(248, 116, 108, 0.34)');

    // Sparkling Asymmetric Sapphire-Cerulean 3/4 Eyes (Near x=216, Far x=280!)
    paintThreeQuarterEye(ctx, 216, 258, 21, 23.5, '#0c316b', '#2492e8', '#9ef8ff', warmInk);
    paintThreeQuarterEye(ctx, 280, 256, 15.5, 22.0, '#0c316b', '#2492e8', '#9ef8ff', warmInk);

    // Cute 3/4 Sculpted Nose & Sweet Smile (shifted right to x=258!)
    ctx.beginPath();
    ctx.moveTo(256, 264);
    ctx.quadraticCurveTo(266, 274, 256, 279);
    ctx.strokeStyle = '#9e5c3e';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(253, 291, 16, 0.14 * Math.PI, 0.84 * Math.PI);
    ctx.strokeStyle = warmInk;
    ctx.lineWidth = 4.4;
    ctx.stroke();

    // Fluffy Sunlit Golden Cheek Curls & Swept Bangs
    var frontHairG = ctx.createLinearGradient(148, 184, 324, 320);
    frontHairG.addColorStop(0, '#ffec94');
    frontHairG.addColorStop(0.55, '#eea426');
    frontHairG.addColorStop(1, '#a85e0c');

    // Thick sculpted near-left curl
    ctx.beginPath();
    ctx.moveTo(160, 212);
    ctx.quadraticCurveTo(134, 270, 172, 324);
    ctx.quadraticCurveTo(194, 290, 186, 222);
    ctx.closePath();
    fillAndInk(ctx, frontHairG, warmInk, 4.6);

    // Foreshortened far-right curl
    ctx.beginPath();
    ctx.moveTo(312, 214);
    ctx.quadraticCurveTo(330, 264, 306, 312);
    ctx.quadraticCurveTo(294, 284, 298, 224);
    ctx.closePath();
    fillAndInk(ctx, frontHairG, warmInk, 4.4);

    // Asymmetric swept bangs
    ctx.beginPath();
    ctx.moveTo(162, 224);
    ctx.quadraticCurveTo(208, 190, 252, 216);
    ctx.quadraticCurveTo(286, 194, 314, 220);
    ctx.quadraticCurveTo(304, 180, 240, 180);
    ctx.quadraticCurveTo(176, 180, 162, 224);
    ctx.closePath();
    fillAndInk(ctx, frontHairG, warmInk, 4.6);

    // Dynamic Tilted Cobalt Wizard Hat (Sweeping Gracefully Back-Left per Master Ref!)
    ctx.beginPath();
    ctx.ellipse(242, 200, 126, 28, -0.06, 0, Math.PI * 2);
    fillAndInk(ctx, '#0f285c', robeInk, 5.0);

    var hatCrownG = ctx.createRadialGradient(216, 108, 12, 240, 134, 136);
    hatCrownG.addColorStop(0, '#6bc0ff');
    hatCrownG.addColorStop(0.50, '#2570cf');
    hatCrownG.addColorStop(1, '#103775');
    ctx.beginPath();
    ctx.moveTo(162, 186);
    ctx.quadraticCurveTo(176, 98, 196, 56);
    ctx.quadraticCurveTo(212, 46, 232, 68);
    ctx.quadraticCurveTo(266, 96, 314, 182);
    ctx.closePath();
    fillAndInk(ctx, hatCrownG, robeInk, 5.2);

    // Golden Hatband + Buckle
    ctx.beginPath();
    ctx.moveTo(160, 174);
    ctx.quadraticCurveTo(240, 150, 318, 172);
    ctx.lineTo(324, 192);
    ctx.quadraticCurveTo(240, 170, 154, 192);
    ctx.closePath();
    fillAndInk(ctx, goldCollarG, robeInk, 4.4);

    // Upturned Sunlit Wizard Hat Brim
    var brimTopG = ctx.createLinearGradient(116, 174, 372, 216);
    brimTopG.addColorStop(0, '#6ec2ff');
    brimTopG.addColorStop(0.55, '#2874d1');
    brimTopG.addColorStop(1, '#133e80');
    ctx.beginPath();
    ctx.moveTo(116, 204);
    ctx.quadraticCurveTo(242, 154, 372, 194);
    ctx.quadraticCurveTo(314, 218, 242, 202);
    ctx.quadraticCurveTo(170, 218, 116, 204);
    ctx.closePath();
    fillAndInk(ctx, brimTopG, robeInk, 5.0);

    // Ornate Diamond-Prism Sun Staff on Collector Card Only (x: 320..380)
    if (showStaff) {
      ctx.save();
      ctx.translate(348, 346);
      ctx.rotate(0.09);

      paintSoftAura(ctx, 0, -56, 4, 48, 'rgba(255, 248, 184, 0.88)');

      ctx.beginPath();
      roundRectPath(ctx, -8.5, -22, 17, 174, 8);
      fillAndInk(ctx, '#bd7626', warmInk, 4.6);

      ctx.beginPath();
      ctx.arc(0, -50, 27, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.strokeStyle = '#ffda62';
      ctx.lineWidth = 11;
      ctx.stroke();
      ctx.strokeStyle = warmInk;
      ctx.lineWidth = 3.6;
      ctx.stroke();

      var crysG = ctx.createLinearGradient(-20, -86, 20, -26);
      crysG.addColorStop(0, '#ffffff');
      crysG.addColorStop(0.45, '#9cf0ff');
      crysG.addColorStop(1, '#ffd470');
      ctx.beginPath();
      ctx.moveTo(0, -88);
      ctx.lineTo(21, -56);
      ctx.lineTo(0, -24);
      ctx.lineTo(-21, -56);
      ctx.closePath();
      fillAndInk(ctx, crysG, robeInk, 4.2);
      ctx.restore();
    }

    return c;
  }

  // ------------------------------------------------------------------------
  // 3. SHADOW ROGUE VILLAIN (Asymmetric ~18° Obsidian-Crimson Hunter Figurine!)
  // Deep crimson-obsidian cowl shadow with blazing crimson-ember slanted eyes
  // Modes: 'hunting' | 'frozen' | 'blinded' | 'banished'
  // ------------------------------------------------------------------------
  function paintRoguePortrait(includeWeapon, villainMode) {
    var S = 512;
    var c = makeCanvas(S);
    var ctx = c.getContext('2d');
    var ink = '#240912';
    var showDaggers = includeWeapon !== false;
    var mode = villainMode || 'hunting';

    if (mode === 'frozen') {
      paintSoftAura(ctx, 244, 232, 26, 206, 'rgba(92, 238, 255, 0.72)');
    } else if (mode === 'blinded' || mode === 'banished') {
      paintSoftAura(ctx, 244, 232, 26, 206, 'rgba(255, 230, 112, 0.78)');
    } else {
      paintSoftAura(ctx, 244, 232, 26, 198, 'rgba(255, 48, 84, 0.56)');
    }

    // Asymmetric 3/4 Obsidian-Crimson Hunter Mantle Cloak
    var cloakG = ctx.createRadialGradient(212, 368, 16, 244, 412, 148);
    cloakG.addColorStop(0, mode === 'frozen' ? '#3d688c' : '#8f182e');
    cloakG.addColorStop(0.55, mode === 'frozen' ? '#1f3b5c' : '#4a0d1b');
    cloakG.addColorStop(1, '#16060c');
    ctx.beginPath();
    ctx.moveTo(126, 492);
    ctx.quadraticCurveTo(136, 332, 242, 326);
    ctx.quadraticCurveTo(338, 336, 354, 492);
    ctx.closePath();
    fillAndInk(ctx, cloakG, ink, 5.0);

    // Near-left sculpted crimson shoulder capelet fold
    var capeletG = ctx.createLinearGradient(126, 332, 224, 430);
    capeletG.addColorStop(0, mode === 'frozen' ? '#67b8e6' : '#c42340');
    capeletG.addColorStop(1, mode === 'frozen' ? '#1c3e5e' : '#4f0e1c');
    ctx.beginPath();
    ctx.moveTo(128, 418);
    ctx.quadraticCurveTo(128, 338, 196, 330);
    ctx.quadraticCurveTo(226, 356, 212, 410);
    ctx.quadraticCurveTo(168, 430, 128, 418);
    ctx.closePath();
    fillAndInk(ctx, capeletG, ink, 4.6);

    // Crossed dark leather bandolier + crimson-gold clasp
    var beltG = ctx.createLinearGradient(174, 344, 324, 468);
    beltG.addColorStop(0, '#5e232c');
    beltG.addColorStop(1, '#290c12');
    ctx.beginPath();
    ctx.moveTo(174, 352);
    ctx.lineTo(312, 474);
    ctx.lineTo(334, 452);
    ctx.lineTo(196, 332);
    ctx.closePath();
    fillAndInk(ctx, beltG, '#1f080d', 4.6);

    ctx.beginPath();
    roundRectPath(ctx, 240, 384, 36, 30, 8);
    fillAndInk(ctx, '#ff425e', '#24080e', 4.4);

    // Sculpted Asymmetric 3/4 Obsidian-Slate Assassin Cowl
    var hoodOuterG = ctx.createRadialGradient(204, 134, 18, 244, 216, 178);
    hoodOuterG.addColorStop(0, mode === 'frozen' ? '#5e8eb5' : '#6e2236');
    hoodOuterG.addColorStop(0.46, mode === 'frozen' ? '#2c4866' : '#33121e');
    hoodOuterG.addColorStop(1, '#14070d');

    ctx.beginPath();
    ctx.moveTo(132, 314);
    ctx.quadraticCurveTo(118, 188, 178, 102);
    ctx.quadraticCurveTo(196, 56, 224, 62);
    ctx.quadraticCurveTo(286, 70, 336, 132);
    ctx.quadraticCurveTo(368, 184, 354, 310);
    ctx.quadraticCurveTo(308, 356, 248, 356);
    ctx.quadraticCurveTo(182, 356, 132, 314);
    ctx.closePath();
    fillAndInk(ctx, hoodOuterG, ink, 5.2);

    // Rim cloth drape highlights on near-left hood slope
    ctx.beginPath();
    ctx.moveTo(156, 258);
    ctx.quadraticCurveTo(168, 146, 246, 92);
    ctx.strokeStyle = mode === 'frozen' ? 'rgba(170, 242, 255, 0.58)' : 'rgba(255, 118, 142, 0.42)';
    ctx.lineWidth = 6.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Deep Recessed Abyssal Hood Shadow Cavity
    var cavityG = ctx.createRadialGradient(256, 218, 8, 254, 228, 94);
    cavityG.addColorStop(0, '#1f070f');
    cavityG.addColorStop(0.55, '#110308');
    cavityG.addColorStop(1, '#070104');
    ctx.beginPath();
    ctx.moveTo(168, 268);
    ctx.quadraticCurveTo(166, 150, 260, 132);
    ctx.quadraticCurveTo(338, 150, 336, 266);
    ctx.quadraticCurveTo(304, 314, 256, 316);
    ctx.quadraticCurveTo(198, 314, 168, 268);
    ctx.closePath();
    fillAndInk(ctx, cavityG, '#0f0307', 4.4);

    // Blazing Crimson-Ember Slanted Almond Eyes Glowing Inside Deep Cowl!
    [
      { x: 218, y: 215, rot: 0.23, rx: 27.0, ry: 12.6 },
      { x: 288, y: 213, rot: -0.21, rx: 20.0, ry: 11.2 }
    ].forEach(function (ey) {
      ctx.save();
      ctx.translate(ey.x, ey.y);
      ctx.rotate(ey.rot);

      var auraCol = mode === 'frozen'
        ? 'rgba(110, 244, 255, 0.78)'
        : (mode === 'blinded' ? 'rgba(255, 232, 110, 0.88)' : 'rgba(255, 36, 66, 0.85)');
      paintSoftAura(ctx, 0, 0, 2, ey.rx * 1.95, auraCol);

      var eyeGlowG = ctx.createLinearGradient(-ey.rx, -ey.ry, ey.rx, ey.ry);
      if (mode === 'frozen') {
        eyeGlowG.addColorStop(0, '#bcf8ff');
        eyeGlowG.addColorStop(0.45, '#ffffff');
        eyeGlowG.addColorStop(1, '#36d6ff');
      } else if (mode === 'blinded') {
        eyeGlowG.addColorStop(0, '#fff4ad');
        eyeGlowG.addColorStop(0.45, '#ffffff');
        eyeGlowG.addColorStop(1, '#ffb82e');
      } else {
        eyeGlowG.addColorStop(0, '#ff8598');
        eyeGlowG.addColorStop(0.45, '#fff4d2');
        eyeGlowG.addColorStop(1, '#ff1738');
      }

      ctx.beginPath();
      ctx.moveTo(-ey.rx, 2.0);
      ctx.quadraticCurveTo(-ey.rx * 0.14, -ey.ry * 1.24, ey.rx, -2.6);
      ctx.quadraticCurveTo(ey.rx * 0.34, ey.ry * 1.18, -ey.rx, 2.0);
      ctx.closePath();
      fillAndInk(ctx, eyeGlowG, '#1a0409', 3.2);

      ctx.beginPath();
      ctx.ellipse(-ey.rx * 0.12, -1.2, ey.rx * 0.32, ey.ry * 0.34, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    });

    // Tailored 3/4 Obsidian-Crimson Bandit Mask Over Nose Bridge & Jaw
    var maskG = ctx.createRadialGradient(228, 272, 10, 254, 292, 90);
    maskG.addColorStop(0, mode === 'frozen' ? '#497396' : '#691b2d');
    maskG.addColorStop(0.55, mode === 'frozen' ? '#263e57' : '#360d18');
    maskG.addColorStop(1, '#17060b');
    ctx.beginPath();
    ctx.moveTo(168, 258);
    ctx.quadraticCurveTo(222, 244, 264, 240);
    ctx.quadraticCurveTo(304, 245, 336, 258);
    ctx.quadraticCurveTo(326, 326, 260, 338);
    ctx.quadraticCurveTo(186, 330, 168, 258);
    ctx.closePath();
    fillAndInk(ctx, maskG, ink, 4.8);

    // Crimson-Gold Arch Piping Along Hood Rim
    ctx.beginPath();
    ctx.moveTo(156, 292);
    ctx.quadraticCurveTo(158, 146, 260, 126);
    ctx.quadraticCurveTo(342, 148, 344, 288);
    ctx.strokeStyle = mode === 'frozen' ? '#84f2ff' : '#ff4d67';
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Twin Crimson-Edge Shadow Daggers
    if (showDaggers) {
      [
        { x: 186, y: 420, rot: -0.40, flip: 1 },
        { x: 322, y: 414, rot: 0.34, flip: -1 }
      ].forEach(function (dg) {
        ctx.save();
        ctx.translate(dg.x, dg.y);
        ctx.rotate(dg.rot);
        ctx.scale(dg.flip, 1);

        var dBladeG = ctx.createLinearGradient(-16, -112, 18, 8);
        dBladeG.addColorStop(0, '#fff2f5');
        dBladeG.addColorStop(0.5, '#ff8598');
        dBladeG.addColorStop(1, '#7a1628');

        ctx.beginPath();
        ctx.moveTo(4, -112);
        ctx.quadraticCurveTo(27, -54, 15, 10);
        ctx.lineTo(-13, 10);
        ctx.quadraticCurveTo(-7, -50, 4, -112);
        ctx.closePath();
        fillAndInk(ctx, dBladeG, '#24070e', 4.8);

        ctx.beginPath();
        roundRectPath(ctx, -23, 6, 46, 14, 6);
        fillAndInk(ctx, '#eb9c38', '#2b100d', 4.4);
        ctx.restore();
      });
    }

    // Status overlays for Frozen (Time-Crystal Prism) or Sun-Blinded (Golden Stars)
    if (mode === 'frozen') {
      ctx.save();
      ctx.fillStyle = 'rgba(120, 242, 255, 0.24)';
      ctx.strokeStyle = '#bdfaff';
      ctx.lineWidth = 5.0;
      [
        [[98, 290], [134, 180], [166, 282]],
        [[346, 286], [386, 174], [414, 292]]
      ].forEach(function (tri) {
        ctx.beginPath();
        ctx.moveTo(tri[0][0], tri[0][1]);
        ctx.lineTo(tri[1][0], tri[1][1]);
        ctx.lineTo(tri[2][0], tri[2][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    } else if (mode === 'blinded' || mode === 'banished') {
      [
        [152, 118, 18],
        [254, 78, 22],
        [356, 122, 17]
      ].forEach(function (stPt) {
        paintSoftAura(ctx, stPt[0], stPt[1], 2, stPt[2] * 2.1, 'rgba(255, 224, 92, 0.85)');
        ctx.beginPath();
        ctx.moveTo(stPt[0], stPt[1] - stPt[2]);
        ctx.lineTo(stPt[0] + stPt[2] * 0.35, stPt[1] - stPt[2] * 0.35);
        ctx.lineTo(stPt[0] + stPt[2], stPt[1]);
        ctx.lineTo(stPt[0] + stPt[2] * 0.35, stPt[1] + stPt[2] * 0.35);
        ctx.lineTo(stPt[0], stPt[1] + stPt[2]);
        ctx.lineTo(stPt[0] - stPt[2] * 0.35, stPt[1] + stPt[2] * 0.35);
        ctx.lineTo(stPt[0] - stPt[2], stPt[1]);
        ctx.lineTo(stPt[0] - stPt[2] * 0.35, stPt[1] - stPt[2] * 0.35);
        ctx.closePath();
        fillAndInk(ctx, '#fff6b0', '#704208', 3.4);
      });
    }

    return c;
  }

  // ------------------------------------------------------------------------
  // 4. STONE GARGOYLE (Asymmetric ~18° Right-Turned Weathered Limestone Figurine!)
  // Single-mass chiseled stone shoulders & barrel ribcage (ZERO chest ovals!),
  // organic rounded knuckle-paws (ZERO 6 piano-key rectangles!), warm sunlit
  // cream-limestone top-left highlight & proud carved stone wing ribs!
  // ------------------------------------------------------------------------
  function paintGargoylePortrait(mode) {
    // mode: 'sleeping' | 'sunstruck' | 'awakened' | 'shattered'
    var S = 512;
    var c = makeCanvas(S);
    var ctx = c.getContext('2d');
    var ink = '#34303b';

    if (mode === 'shattered') {
      paintSoftAura(ctx, 256, 300, 16, 175, 'rgba(255, 232, 132, 0.48)');
      var rubG = ctx.createLinearGradient(140, 290, 370, 456);
      rubG.addColorStop(0, '#e3dac8');
      rubG.addColorStop(0.5, '#969088');
      rubG.addColorStop(1, '#484350');

      var polys = [
        [[134, 412], [176, 368], [228, 384], [214, 434], [148, 438]],
        [[218, 372], [268, 334], [318, 364], [302, 426], [228, 422]],
        [[296, 392], [352, 366], [382, 408], [364, 444], [304, 440]],
        [[176, 432], [248, 416], [284, 452], [188, 460]]
      ];
      polys.forEach(function (pts) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
        ctx.closePath();
        fillAndInk(ctx, rubG, ink, 4.8);
      });

      [
        [186, 288, 12],
        [258, 238, 16],
        [324, 296, 11],
        [226, 192, 9],
        [292, 184, 8]
      ].forEach(function (m) {
        paintSoftAura(ctx, m[0], m[1], 1, m[2] * 2.4, 'rgba(255, 224, 96, 0.65)');
        ctx.beginPath();
        ctx.arc(m[0], m[1], m[2], 0, Math.PI * 2);
        ctx.fillStyle = '#fff5b8';
        ctx.fill();
      });
      return c;
    }

    // Warm sanctuary rim halo behind sculpted limestone figurine
    paintSoftAura(
      ctx,
      248,
      206,
      28,
      212,
      mode === 'sunstruck' ? 'rgba(255, 240, 152, 0.84)' : 'rgba(255, 230, 178, 0.50)'
    );

    // Warm Sunlit Cream-Limestone Top-Left -> Weathered Ash-Limestone -> Cool Plum-Slate Shadow!
    var stoneBodyG = ctx.createRadialGradient(196, 274, 22, 256, 358, 188);
    if (mode === 'sunstruck') {
      stoneBodyG.addColorStop(0, '#f8ecd0');
      stoneBodyG.addColorStop(0.45, '#b8ab9d');
      stoneBodyG.addColorStop(0.80, '#756b74');
      stoneBodyG.addColorStop(1, '#47404f');
    } else {
      stoneBodyG.addColorStop(0, '#eae1d0');
      stoneBodyG.addColorStop(0.42, '#a39d94');
      stoneBodyG.addColorStop(0.76, '#6d6874');
      stoneBodyG.addColorStop(1, '#443f4d');
    }

    var wingLift = mode === 'awakened' ? -18 : 0;

    // 0. Carved Dark-Limestone Pedestal Plinth at Base
    var plinthG = ctx.createLinearGradient(118, 448, 396, 496);
    plinthG.addColorStop(0, '#6b6370');
    plinthG.addColorStop(0.5, '#4c4556');
    plinthG.addColorStop(1, '#312c3a');
    ctx.beginPath();
    roundRectPath(ctx, 116, 452, 282, 42, 11);
    fillAndInk(ctx, plinthG, ink, 4.8);

    // 1. Asymmetric Curved Scalloped Stone Bat-Wings (Flaring Outward — ZERO Vertical Chimney Posts!)
    var leftWingMemG = ctx.createLinearGradient(88, 106, 196, 338);
    leftWingMemG.addColorStop(0, '#aba398');
    leftWingMemG.addColorStop(0.50, '#6a6370');
    leftWingMemG.addColorStop(1, '#3d3846');

    ctx.beginPath();
    ctx.moveTo(192, 276);
    // Arched leading stone wing-spar sweeping up and outward past left shoulder
    ctx.quadraticCurveTo(148, 168 + wingLift, 94, 114 + wingLift);
    // Scalloped bat-membrane arches curving gracefully inward to shoulder
    ctx.quadraticCurveTo(116, 174 + wingLift, 96, 234 + wingLift * 0.5);
    ctx.quadraticCurveTo(126, 268, 146, 322);
    ctx.lineTo(188, 330);
    ctx.closePath();
    fillAndInk(ctx, leftWingMemG, ink, 5.0);

    // Proud Sunlit Carved Stone Wing-Spar, Hooked Thumb-Claw & Finger Ribs on Near-Left Wing!
    ctx.strokeStyle = '#ebe2d1';
    ctx.lineWidth = 9.0;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(186, 268);
    ctx.quadraticCurveTo(146, 170 + wingLift, 98, 118 + wingLift);
    ctx.stroke();

    ctx.strokeStyle = '#d1c8b8';
    ctx.lineWidth = 5.0;
    ctx.beginPath();
    ctx.moveTo(132, 166 + wingLift);
    ctx.quadraticCurveTo(116, 204 + wingLift * 0.6, 100, 232 + wingLift * 0.5);
    ctx.moveTo(154, 206 + wingLift * 0.6);
    ctx.quadraticCurveTo(142, 256, 148, 314);
    ctx.stroke();

    // Foreshortened Far-Right Scalloped Stone Bat-Wing Behind Right Shoulder
    var rightWingMemG = ctx.createLinearGradient(322, 122, 412, 334);
    rightWingMemG.addColorStop(0, '#8f898e');
    rightWingMemG.addColorStop(0.55, '#554f5e');
    rightWingMemG.addColorStop(1, '#332f3d');

    ctx.beginPath();
    ctx.moveTo(322, 282);
    ctx.quadraticCurveTo(360, 182 + wingLift, 404, 132 + wingLift);
    ctx.quadraticCurveTo(386, 186 + wingLift, 400, 242 + wingLift * 0.5);
    ctx.quadraticCurveTo(374, 274, 358, 324);
    ctx.lineTo(326, 332);
    ctx.closePath();
    fillAndInk(ctx, rightWingMemG, ink, 4.8);

    ctx.strokeStyle = '#c2b9ac';
    ctx.lineWidth = 7.6;
    ctx.beginPath();
    ctx.moveTo(326, 272);
    ctx.quadraticCurveTo(360, 184 + wingLift, 400, 136 + wingLift);
    ctx.stroke();

    // 2. Broad Single-Mass Crouching Limestone Shoulders & Barrel Ribcage (ZERO Chest Ovals!)
    ctx.beginPath();
    ctx.moveTo(146, 456);
    // Broad bowed near-left boulder deltoid & forearm mass
    ctx.quadraticCurveTo(110, 386, 124, 308);
    ctx.quadraticCurveTo(140, 248, 204, 246);
    ctx.lineTo(314, 250);
    // Foreshortened far-right shoulder & bowed outer arm
    ctx.quadraticCurveTo(368, 258, 378, 316);
    ctx.quadraticCurveTo(388, 388, 356, 456);
    ctx.closePath();
    fillAndInk(ctx, stoneBodyG, ink, 5.2);

    // Sunlit Near-Left Boulder Deltoid Volume & Single Broad Carved Sternum Bevel Plane
    var nearDeltG = ctx.createRadialGradient(162, 312, 6, 170, 328, 62);
    nearDeltG.addColorStop(0, 'rgba(250, 242, 226, 0.56)');
    nearDeltG.addColorStop(1, 'rgba(250, 242, 226, 0)');
    ctx.fillStyle = nearDeltG;
    ctx.beginPath();
    ctx.arc(168, 324, 62, 0, Math.PI * 2);
    ctx.fill();

    // Single Broad Chiseled Architectural Chest Shelf & Masonry Crack (NO paired ovals!)
    var chestPlaneG = ctx.createLinearGradient(184, 298, 328, 386);
    chestPlaneG.addColorStop(0, 'rgba(242, 233, 216, 0.38)');
    chestPlaneG.addColorStop(0.55, 'rgba(138, 132, 136, 0.14)');
    chestPlaneG.addColorStop(1, 'rgba(52, 46, 62, 0.42)');
    ctx.beginPath();
    ctx.moveTo(182, 312);
    ctx.quadraticCurveTo(260, 296, 328, 316);
    ctx.lineTo(314, 378);
    ctx.quadraticCurveTo(258, 392, 196, 376);
    ctx.closePath();
    ctx.fillStyle = chestPlaneG;
    ctx.fill();

    // Subtle chiseled collar ridge + diagonal weathered stone crack across single chest mass
    ctx.strokeStyle = 'rgba(246, 238, 222, 0.46)';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(190, 326);
    ctx.quadraticCurveTo(262, 342, 322, 328);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(48, 43, 56, 0.62)';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(222, 322);
    ctx.lineTo(246, 348);
    ctx.lineTo(238, 368);
    ctx.moveTo(246, 348);
    ctx.lineTo(268, 356);
    ctx.stroke();

    // Deep Crouched Under-Chest Shadow Pocket Between Bowed Forearms
    ctx.beginPath();
    ctx.ellipse(258, 398, 44, 26, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#302b3a';
    ctx.fill();

    // Two Organic Rounded Stone Forearm-and-Knuckle Paws Planted on Sill (ZERO 6 Piano Keys!)
    // Near-left heavy curved forearm + unified rounded stone paw
    var leftPawG = ctx.createRadialGradient(192, 404, 8, 200, 422, 56);
    leftPawG.addColorStop(0, '#ebe2d1');
    leftPawG.addColorStop(0.56, '#9c968e');
    leftPawG.addColorStop(1, '#524c5c');
    ctx.beginPath();
    ctx.moveTo(142, 360);
    ctx.quadraticCurveTo(176, 346, 212, 388);
    ctx.quadraticCurveTo(246, 396, 244, 434);
    ctx.quadraticCurveTo(242, 456, 198, 456);
    ctx.quadraticCurveTo(154, 456, 152, 428);
    ctx.quadraticCurveTo(136, 398, 142, 360);
    ctx.closePath();
    fillAndInk(ctx, leftPawG, ink, 4.8);

    // Subtle curved stone knuckle dimple clefts inside unified left paw
    ctx.strokeStyle = '#3a3544';
    ctx.lineWidth = 4.0;
    ctx.beginPath();
    ctx.moveTo(184, 418);
    ctx.quadraticCurveTo(188, 438, 184, 452);
    ctx.moveTo(214, 416);
    ctx.quadraticCurveTo(218, 438, 214, 452);
    ctx.stroke();

    // Far-right foreshortened stone forearm + unified rounded stone paw
    var rightPawG = ctx.createRadialGradient(298, 408, 8, 306, 424, 52);
    rightPawG.addColorStop(0, '#d8cfc0');
    rightPawG.addColorStop(0.58, '#8a8582');
    rightPawG.addColorStop(1, '#494353');
    ctx.beginPath();
    ctx.moveTo(364, 364);
    ctx.quadraticCurveTo(334, 350, 298, 390);
    ctx.quadraticCurveTo(268, 398, 270, 434);
    ctx.quadraticCurveTo(272, 456, 312, 456);
    ctx.quadraticCurveTo(352, 456, 354, 428);
    ctx.quadraticCurveTo(368, 400, 364, 364);
    ctx.closePath();
    fillAndInk(ctx, rightPawG, ink, 4.8);

    ctx.strokeStyle = '#3a3544';
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(298, 418);
    ctx.quadraticCurveTo(295, 438, 299, 452);
    ctx.moveTo(326, 418);
    ctx.quadraticCurveTo(323, 438, 327, 452);
    ctx.stroke();

    // 3. Asymmetric Swept-Outward Carved Stone Bat-Ears (3/4 Turned Right!)
    // Broad sunlit near-left bat-ear
    ctx.beginPath();
    ctx.moveTo(184, 182);
    ctx.quadraticCurveTo(132, 138, 108, 152);
    ctx.quadraticCurveTo(124, 208, 180, 236);
    ctx.closePath();
    fillAndInk(ctx, stoneBodyG, ink, 4.8);
    ctx.beginPath();
    ctx.moveTo(174, 194);
    ctx.quadraticCurveTo(142, 162, 124, 166);
    ctx.quadraticCurveTo(138, 202, 172, 220);
    ctx.closePath();
    ctx.fillStyle = '#403a4a';
    ctx.fill();

    // Foreshortened far-right bat-ear
    ctx.beginPath();
    ctx.moveTo(328, 186);
    ctx.quadraticCurveTo(366, 148, 384, 158);
    ctx.quadraticCurveTo(374, 206, 332, 232);
    ctx.closePath();
    fillAndInk(ctx, stoneBodyG, ink, 4.8);
    ctx.beginPath();
    ctx.moveTo(334, 196);
    ctx.quadraticCurveTo(358, 170, 370, 172);
    ctx.quadraticCurveTo(360, 202, 336, 218);
    ctx.closePath();
    ctx.fillStyle = '#3b3545';
    ctx.fill();

    // 4. Asymmetric ~22° Right-Turned Chiseled Gargoyle Cranium (Centerline at x=272!)
    var headStoneG = ctx.createRadialGradient(222, 152, 18, 258, 224, 144);
    if (mode === 'sunstruck') {
      headStoneG.addColorStop(0, '#fcf0d5');
      headStoneG.addColorStop(0.48, '#b8ab9e');
      headStoneG.addColorStop(1, '#59505e');
    } else {
      headStoneG.addColorStop(0, '#f0e7d6');
      headStoneG.addColorStop(0.45, '#a8a299');
      headStoneG.addColorStop(0.82, '#6d6875');
      headStoneG.addColorStop(1, '#443f4e');
    }

    ctx.beginPath();
    ctx.moveTo(176, 180);
    ctx.lineTo(196, 130);
    ctx.quadraticCurveTo(262, 114, 316, 136);
    ctx.lineTo(332, 180);
    // Tighter foreshortened right cheek & heavy 3/4 underbite jowl
    ctx.quadraticCurveTo(348, 224, 336, 270);
    ctx.quadraticCurveTo(324, 314, 268, 318);
    // Broad sunlit left jowl & prominent near cheekbone
    ctx.quadraticCurveTo(180, 314, 164, 264);
    ctx.quadraticCurveTo(152, 220, 176, 180);
    ctx.closePath();
    fillAndInk(ctx, headStoneG, ink, 5.2);

    // Warm sunlit forehead crown sheen + delicate sagittal masonry crack
    ctx.beginPath();
    ctx.ellipse(234, 150, 44, 19, -0.10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 250, 235, 0.52)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(286, 130);
    ctx.lineTo(274, 158);
    ctx.lineTo(282, 174);
    ctx.strokeStyle = '#433e4c';
    ctx.lineWidth = 3.4;
    ctx.stroke();

    // Prominent sunlit near-left cheekbone vs foreshortened right cheek
    ctx.beginPath();
    ctx.ellipse(198, 248, 26, 17, 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(248, 240, 224, 0.38)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(322, 248, 14, 12, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(224, 216, 224, 0.16)';
    ctx.fill();

    // Asymmetric 3/4 Recessed Eye Sockets (Near x=228 rx=25, Far Foreshortened x=302 rx=17.5!)
    [
      { sx: 228, sy: 214, rx: 25, ry: 13.8, tilt: 0.17 },
      { sx: 302, sy: 215, rx: 17.5, ry: 12.2, tilt: -0.16 }
    ].forEach(function (ey) {
      ctx.save();
      ctx.translate(ey.sx, ey.sy);
      ctx.rotate(ey.tilt);

      ctx.beginPath();
      ctx.ellipse(0, 2, ey.rx + 2, ey.ry + 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2632';
      ctx.fill();

      if (mode === 'sleeping') {
        var lidG = ctx.createLinearGradient(0, -ey.ry, 0, ey.ry);
        lidG.addColorStop(0, '#c4bdb2');
        lidG.addColorStop(0.65, '#7c7782');
        lidG.addColorStop(1, '#413c4b');
        ctx.beginPath();
        ctx.ellipse(0, -1, ey.rx - 1, ey.ry - 1.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = lidG;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(-ey.rx + 2, 3);
        ctx.quadraticCurveTo(0, 10.5, ey.rx - 2, 2);
        ctx.strokeStyle = '#211d28';
        ctx.lineWidth = 4.8;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (mode === 'sunstruck') {
        paintSoftAura(ctx, 0, 0, 2, ey.rx * 1.45, 'rgba(255, 220, 72, 0.92)');
        ctx.beginPath();
        ctx.ellipse(0, 0, ey.rx - 2, ey.ry - 2, 0, 0, Math.PI * 2);
        fillAndInk(ctx, '#fffbe0', '#8c4c08', 3.8);
      } else {
        paintSoftAura(ctx, 0, 0, 2, ey.rx * 1.40, 'rgba(255, 68, 238, 0.88)');
        ctx.beginPath();
        ctx.ellipse(0, 0, ey.rx - 2, ey.ry - 2, 0, 0, Math.PI * 2);
        fillAndInk(ctx, '#ff54f0', ink, 3.8);
        ctx.beginPath();
        ctx.arc(1, 0, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    });

    // Heavy Overhanging 3/4 W-Furrowed Stone Brow Ridge (Cleft Shifted Right to x=272!)
    var browG = ctx.createLinearGradient(174, 174, 336, 220);
    browG.addColorStop(0, '#f0e7d5');
    browG.addColorStop(0.55, '#ada79e');
    browG.addColorStop(1, '#6f6a78');
    ctx.beginPath();
    ctx.moveTo(174, 198);
    ctx.quadraticCurveTo(218, 170, 260, 198);
    ctx.lineTo(272, 206);
    ctx.lineTo(282, 198);
    ctx.quadraticCurveTo(310, 174, 336, 200);
    ctx.quadraticCurveTo(330, 214, 308, 206);
    ctx.quadraticCurveTo(288, 212, 272, 222);
    ctx.quadraticCurveTo(248, 212, 214, 206);
    ctx.quadraticCurveTo(182, 214, 174, 198);
    ctx.closePath();
    fillAndInk(ctx, browG, ink, 4.8);

    // Projecting 3/4 Bulbous Carved Gargoyle Snout (Tip Shifted Right to x=276!)
    var noseG = ctx.createRadialGradient(262, 234, 4, 272, 244, 36);
    noseG.addColorStop(0, '#f2ead9');
    noseG.addColorStop(0.58, '#a49f98');
    noseG.addColorStop(1, '#5e5968');
    ctx.beginPath();
    ctx.moveTo(256, 212);
    ctx.lineTo(282, 212);
    ctx.quadraticCurveTo(304, 238, 298, 254);
    ctx.quadraticCurveTo(274, 266, 242, 254);
    ctx.quadraticCurveTo(238, 238, 256, 212);
    ctx.closePath();
    fillAndInk(ctx, noseG, ink, 4.6);

    // Asymmetric 3/4 Flared Stone Nostrils
    ctx.beginPath();
    ctx.ellipse(261, 252, 6.2, 4.2, -0.32, 0, Math.PI * 2);
    ctx.ellipse(287, 251, 4.4, 3.5, 0.32, 0, Math.PI * 2);
    ctx.fillStyle = '#25212e';
    ctx.fill();

    // Grimacing 3/4 Carved Stone Underbite Mouth + Two Short Sculpted Stone Fang-Bumps!
    ctx.beginPath();
    ctx.moveTo(208, 283);
    ctx.quadraticCurveTo(242, 270, 272, 275);
    ctx.quadraticCurveTo(298, 270, 320, 282);
    ctx.strokeStyle = '#282432';
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    [
      [226, 281, 10],
      [304, 280, 8.5]
    ].forEach(function (fg) {
      ctx.beginPath();
      ctx.moveTo(fg[0] - fg[2] * 0.5, fg[1]);
      ctx.lineTo(fg[0], fg[1] - fg[2]);
      ctx.lineTo(fg[0] + fg[2] * 0.5, fg[1]);
      ctx.closePath();
      fillAndInk(ctx, '#dfd6c5', ink, 3.2);
    });

    // Subtle sunlit lower stone lip ridge
    ctx.beginPath();
    ctx.moveTo(228, 289);
    ctx.quadraticCurveTo(272, 283, 306, 289);
    ctx.strokeStyle = 'rgba(244, 236, 222, 0.42)';
    ctx.lineWidth = 4.2;
    ctx.stroke();

    // Solar gold fissures if sunstruck
    if (mode === 'sunstruck') {
      ctx.strokeStyle = '#ffe869';
      ctx.lineWidth = 5.4;
      ctx.beginPath();
      ctx.moveTo(262, 128);
      ctx.lineTo(252, 174);
      ctx.lineTo(266, 198);
      ctx.moveTo(208, 326);
      ctx.lineTo(258, 358);
      ctx.lineTo(310, 324);
      ctx.moveTo(258, 358);
      ctx.lineTo(256, 424);
      ctx.stroke();
    }

    return c;
  }

  // ------------------------------------------------------------------------
  // 5. SANCTUM SPELLBOOK (Painterly Mahogany-Ink Leather Tome & Sun Clasp)
  // ------------------------------------------------------------------------
  function paintSpellbookPortrait() {
    var S = 512;
    var c = makeCanvas(S);
    var ctx = c.getContext('2d');
    var ink = '#361c0c';

    ctx.save();
    ctx.translate(256, 256);
    ctx.rotate(0.08);

    paintSoftAura(ctx, 0, 0, 22, 180, 'rgba(255, 220, 112, 0.42)');

    // Back leather board
    ctx.beginPath();
    ctx.moveTo(-104, 120);
    ctx.lineTo(94, 154);
    ctx.lineTo(142, -90);
    ctx.lineTo(112, -120);
    ctx.lineTo(-74, -146);
    ctx.closePath();
    fillAndInk(ctx, '#633819', ink, 5.4);

    // Thick cream-gold gilded page block
    var pageG = ctx.createLinearGradient(-80, 80, 126, -90);
    pageG.addColorStop(0, '#fff3d6');
    pageG.addColorStop(1, '#d8be8c');
    ctx.beginPath();
    ctx.moveTo(-90, 104);
    ctx.lineTo(82, 134);
    ctx.lineTo(126, -94);
    ctx.lineTo(94, -112);
    ctx.lineTo(-74, 82);
    ctx.closePath();
    fillAndInk(ctx, pageG, ink, 4.8);

    ctx.strokeStyle = '#bca06c';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-72, 112);
    ctx.lineTo(78, 138);
    ctx.moveTo(90, 116);
    ctx.lineTo(127, -82);
    ctx.stroke();

    // Rich sunlit saddle-leather front cover (radial sheen!)
    var leatherG = ctx.createRadialGradient(-34, -44, 14, -8, -8, 168);
    leatherG.addColorStop(0, '#c47e44');
    leatherG.addColorStop(0.54, '#824c22');
    leatherG.addColorStop(1, '#4d2a10');

    ctx.beginPath();
    ctx.moveTo(-128, 94);
    ctx.lineTo(68, 124);
    ctx.lineTo(112, -116);
    ctx.lineTo(-86, -146);
    ctx.closePath();
    fillAndInk(ctx, leatherG, ink, 5.6);

    // Gold-embossed inner cover frame
    ctx.beginPath();
    ctx.moveTo(-98, 70);
    ctx.lineTo(46, 94);
    ctx.lineTo(82, -90);
    ctx.lineTo(-64, -114);
    ctx.closePath();
    ctx.strokeStyle = '#f5be4e';
    ctx.lineWidth = 6.4;
    ctx.stroke();

    // Raised brass spine bands
    [-82, -18, 46].forEach(function (sy) {
      ctx.beginPath();
      roundRectPath(ctx, -132 + sy * 0.16, sy, 30, 15, 6);
      fillAndInk(ctx, '#eba938', ink, 4.4);
    });

    // Sculpted Golden Sun-Flame Clasp Emblem
    var sunG = ctx.createLinearGradient(0, -64, 0, 56);
    sunG.addColorStop(0, '#fffab8');
    sunG.addColorStop(0.52, '#f7b22c');
    sunG.addColorStop(1, '#c2710e');

    ctx.beginPath();
    ctx.moveTo(-4, -60);
    ctx.quadraticCurveTo(46, -8, 38, 30);
    ctx.quadraticCurveTo(30, 60, -8, 56);
    ctx.quadraticCurveTo(-46, 52, -42, 16);
    ctx.quadraticCurveTo(-38, -12, -16, -30);
    ctx.quadraticCurveTo(-16, 8, -4, 12);
    ctx.quadraticCurveTo(8, 4, -4, -60);
    ctx.closePath();
    fillAndInk(ctx, sunG, ink, 4.8);

    ctx.restore();
    return c;
  }

  function ensurePortraitCanvases() {
    if (_portraitCanvases) return _portraitCanvases;
    var warCard512 = paintWarriorPortrait(true);
    var mageCard512 = paintMagePortrait(true);
    var rogueCard512 = paintRoguePortrait(true, 'hunting');
    var rogueFrozen512 = paintRoguePortrait(true, 'frozen');
    var rogueBlinded512 = paintRoguePortrait(true, 'blinded');
    var warBust512 = paintWarriorPortrait(false);
    var mageBust512 = paintMagePortrait(false);
    var rogueBust512 = paintRoguePortrait(false, 'hunting');
    var spellbook512 = paintSpellbookPortrait();

    _portraitCanvases = {
      // 16x-MSAA pre-multiplied box-downsampled 128x128 collector card canvases (<2x CSS scale = ZERO stair-stepping!)
      warrior: boxDownsample4x(warCard512),
      mage: boxDownsample4x(mageCard512),
      rogue: boxDownsample4x(rogueCard512),
      rogue_frozen: boxDownsample4x(rogueFrozen512),
      rogue_blinded: boxDownsample4x(rogueBlinded512),
      gargoyle_sleeping: boxDownsample4x(paintGargoylePortrait('sleeping')),
      gargoyle_sunstruck: boxDownsample4x(paintGargoylePortrait('sunstruck')),
      gargoyle_awakened: boxDownsample4x(paintGargoylePortrait('awakened')),
      gargoyle_shattered: boxDownsample4x(paintGargoylePortrait('shattered')),
      spellbook: boxDownsample4x(spellbook512),
      // Zoomed weapon-free 96x96 head-and-shoulders medallion canvases (16x MSAA!)
      warrior_med: makeMedallion96(warBust512, 72, 46, 344),
      mage_med: makeMedallion96(mageBust512, 76, 44, 348),
      rogue_med: makeMedallion96(rogueBust512, 78, 50, 344),
      spellbook_med: makeMedallion96(spellbook512, 84, 84, 344)
    };
    return _portraitCanvases;
  }

  function blitPortrait(dstCanvas, key) {
    if (!dstCanvas || dstCanvas._portKey === key) return;
    var map = ensurePortraitCanvases();
    var src = map[key] || map.warrior;
    if (!src) return;
    var ctx = dstCanvas.getContext('2d');
    ctx.clearRect(0, 0, dstCanvas.width, dstCanvas.height);
    ctx.drawImage(src, 0, 0, dstCanvas.width, dstCanvas.height);
    dstCanvas._portKey = key;
  }

  function ensurePortraits() {
    if (_portraits) return _portraits;
    var map = ensurePortraitCanvases();
    _portraits = {};
    Object.keys(map).forEach(function (k) {
      _portraits[k] = map[k].toDataURL('image/png');
    });
    return _portraits;
  }

  // ------------------------------------------------------------------------
  // HUD State & Persistent DOM References
  // ------------------------------------------------------------------------
  var _callbacks = {};
  var _root = null;
  var _els = {};
  var _lastState = null;
  var _forceHiddenByUrl = false;
  var _visible = true;
  var _welcomeOpen = false;
  var _welcomeDrawerMode = null;
  var _guideFocusRole = null;
  var _bestStarsByLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
  var _toastTimer = null;
  var _pulseTimer = null;
  var _pulsingGargoyleId = null;

  var ISLAND_PICKER_META = [
    {
      id: 1,
      title: 'The Sundial Courtyard',
      sub: 'Prism Mirrors & Sliding Gears · 3 Gargoyles',
      par: 4
    },
    {
      id: 2,
      title: 'The Waterwheel Aqueduct',
      sub: 'Sluice Floodgates & Waterwheel · 3 Gargoyles',
      par: 4
    },
    {
      id: 3,
      title: 'The Clockwork Bell-Hammer',
      sub: 'Swinging Pendulum & Sun-Blind · 3 Gargoyles',
      par: 4
    },
    {
      id: 4,
      title: 'The Twin-Cog Sky Split',
      sub: 'Chasm Ferry & Dual Sunbeams · 4 Gargoyles',
      par: 3
    }
  ];

  function checkUrlHiddenFlags() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      return params.get('hud') === '0' || params.get('thumb') === '1';
    } catch (e) {
      var s = String(window.location.search || '');
      return s.indexOf('hud=0') !== -1 || s.indexOf('thumb=1') !== -1;
    }
  }

  function checkWelcomeDisabledByUrl() {
    if (checkUrlHiddenFlags()) return true;
    try {
      var params = new URLSearchParams(window.location.search || '');
      var w = params.get('welcome');
      if (w === '0' || w === 'false') return true;
      if (params.has('bench') || params.has('closeup')) return true;
      return false;
    } catch (e) {
      var s = String(window.location.search || '');
      return s.indexOf('welcome=0') !== -1 || s.indexOf('bench=') !== -1 || s.indexOf('closeup=') !== -1;
    }
  }

  function stopEventThrough(el) {
    if (!el) return;
    ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'wheel'].forEach(function (ev) {
      el.addEventListener(ev, function (e) {
        e.stopPropagation();
      });
    });
  }

  function invokeCb(names, arg1) {
    for (var i = 0; i < names.length; i++) {
      var fn = _callbacks && _callbacks[names[i]];
      if (typeof fn === 'function') {
        return { handled: true, value: fn(arg1) };
      }
    }
    return { handled: false, value: undefined };
  }

  function playUiClick() {
    try {
      if (window.GAME && window.GAME.Audio) {
        if (typeof window.GAME.Audio.unlock === 'function') window.GAME.Audio.unlock();
        if (typeof window.GAME.Audio.playSelect === 'function') window.GAME.Audio.playSelect();
      }
    } catch (e) {}
  }

  // ------------------------------------------------------------------------
  // Actions Dispatched by HUD Controls
  // ------------------------------------------------------------------------
  function handleSelectHero(heroId) {
    if (heroId === 'mage' || heroId === 'astralAid') {
      handleUseAstralAid();
      return;
    }
    playUiClick();
    var r = invokeCb(['onSelectHero', 'selectHero'], heroId);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.selectHero === 'function') {
      window.GAME.Simulation.selectHero(heroId);
    }
  }

  function handleUseAstralAid() {
    if (window.GAME && window.GAME.Audio && typeof window.GAME.Audio.unlock === 'function') {
      window.GAME.Audio.unlock();
    }
    var r = invokeCb(['onUseAstralAid', 'useAstralAid']);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.useAstralAid === 'function') {
      window.GAME.Simulation.useAstralAid(false);
    }
  }

  function handleInspectRogue() {
    playUiClick();
    if (!_lastState || !_lastState.rogue) return;
    var rg = _lastState.rogue;
    if (window.GAME.Simulation && typeof window.GAME.Simulation.handlePick === 'function') {
      window.GAME.Simulation.handlePick({ pickType: 'rogueVillain', col: rg.col, row: rg.row });
    }
  }

  function handleSetActionMode(mode) {
    playUiClick();
    var r = invokeCb(['onSetActionMode', 'onActionMode', 'setActionMode'], mode);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.setActionMode === 'function') {
      window.GAME.Simulation.setActionMode(mode);
    }
  }

  function handleHint() {
    playUiClick();
    var r = invokeCb(['onHint', 'onRequestHint', 'requestHint']);
    var hintVal = r.value;
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.requestHint === 'function') {
      hintVal = window.GAME.Simulation.requestHint();
    }
    if (hintVal) {
      var msg = typeof hintVal === 'string' ? hintVal : hintVal.text || hintVal.message || '';
      if (msg) showToast(msg, 'hint');
    }
  }

  function handleUndo() {
    playUiClick();
    var r = invokeCb(['onUndo', 'undo']);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.undo === 'function') {
      window.GAME.Simulation.undo();
    }
  }

  function handleReset() {
    playUiClick();
    var r = invokeCb(['onReset', 'onResetLevel', 'onReplay', 'resetLevel']);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.resetLevel === 'function') {
      window.GAME.Simulation.resetLevel();
    }
  }

  function handleEndTurn() {
    var r = invokeCb(['onEndTurn', 'endTurn']);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.endTurn === 'function') {
      window.GAME.Simulation.endTurn();
    }
  }

  function handleSelectLevel(lvl) {
    playUiClick();
    var r = invokeCb(['onSelectLevel', 'onLoadLevel', 'onLevelChange', 'loadLevel'], lvl);
    if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.loadLevel === 'function') {
      window.GAME.Simulation.loadLevel(lvl);
    }
  }

  function handleToggleMute() {
    var r = invokeCb(['onToggleMute', 'onMuteToggle', 'toggleMute']);
    if (!r.handled && window.GAME.Audio && typeof window.GAME.Audio.toggleMute === 'function') {
      window.GAME.Audio.toggleMute();
    }
    refreshMuteUi();
  }

  function handleInspectGargoyle(g) {
    if (!g) return;
    playUiClick();
    _pulsingGargoyleId = g.id;
    if (_lastState) render(_lastState);

    invokeCb(['onInspectGargoyle', 'onFocusGargoyle', 'onSelectGargoyle'], g);

    var isDefeated = !!(g.defeated || g.shattered || g.dead || (typeof g.hp === 'number' && g.hp <= 0));
    if (!isDefeated && typeof g.col === 'number' && typeof g.row === 'number') {
      if (window.GAME.World && typeof window.GAME.World.setTileHighlights === 'function') {
        var baseList = (_lastState && Array.isArray(_lastState.validHighlights)) ? _lastState.validHighlights.slice() : [];
        baseList.push({ col: g.col, row: g.row, kind: g.sunstruck ? 'hint' : 'danger' });
        window.GAME.World.setTileHighlights(baseList);
      }
      var stateLabel = g.sunstruck ? 'Sunstruck!' : (g.awakened ? 'Awakened' : 'Sleeping · Sun-Weak');
      showToast('Stone Gargoyle (' + g.col + ', ' + g.row + ') — ' + stateLabel, 'gold');
    } else {
      showToast('Stone Gargoyle — Shattered ✓', 'gold');
    }

    if (_pulseTimer) clearTimeout(_pulseTimer);
    _pulseTimer = setTimeout(function () {
      _pulsingGargoyleId = null;
      if (_lastState) {
        if (window.GAME.World && typeof window.GAME.World.setTileHighlights === 'function') {
          window.GAME.World.setTileHighlights(_lastState.validHighlights || []);
        }
        render(_lastState);
      }
    }, 950);
  }

  function refreshMuteUi() {
    var muted = false;
    if (window.GAME && window.GAME.Audio && typeof window.GAME.Audio.isMuted === 'function') {
      muted = !!window.GAME.Audio.isMuted();
    }
    if (_els.muteBtn) {
      _els.muteBtn.classList.toggle('is-muted', muted);
      _els.muteBtn.innerHTML = muted ? SVGS.soundOff : SVGS.soundOn;
      _els.muteBtn.title = muted ? 'Unmute Audio (M)' : 'Mute Audio (M)';
      _els.muteBtn.setAttribute('aria-label', _els.muteBtn.title);
    }
    if (_els.cubeMusicBtn) {
      _els.cubeMusicBtn.classList.toggle('is-muted-cube', muted);
      _els.cubeMusicBtn.title = muted ? 'Unmute Sanctuary Music (M)' : 'Mute Sanctuary Music (M)';
    }
    if (_els.cubeMusicBadge) {
      _els.cubeMusicBadge.textContent = muted ? 'OFF' : 'ON';
      _els.cubeMusicBadge.classList.toggle('is-off', muted);
    }
  }

  function syncWelcomeUi() {
    if (!_root) return;
    _root.classList.toggle('is-welcome-open', _welcomeOpen);
    if (_els.welcomeScreen) {
      _els.welcomeScreen.classList.toggle('is-open', _welcomeOpen);
      _els.welcomeScreen.setAttribute('aria-hidden', _welcomeOpen ? 'false' : 'true');
    }
    if (!_welcomeOpen) {
      closeWelcomeDrawer();
    }
  }

  function isWelcomeOpen() {
    return !!_welcomeOpen && !_forceHiddenByUrl;
  }

  function isWelcomeDrawerOpen() {
    return !!(_welcomeOpen && _welcomeDrawerMode);
  }

  function closeWelcomeDrawer() {
    _welcomeDrawerMode = null;
    _guideFocusRole = null;
    if (_els.welcomeDrawer) {
      _els.welcomeDrawer.classList.remove('is-open');
    }
  }

  function openWelcome() {
    if (_forceHiddenByUrl) return;
    playUiClick();
    _welcomeOpen = true;
    closeWelcomeDrawer();
    syncWelcomeUi();
    refreshWelcomeBadges();
  }

  function dismissWelcome(silent) {
    if (!_welcomeOpen) return;
    _welcomeOpen = false;
    closeWelcomeDrawer();
    syncWelcomeUi();
    if (!silent) {
      try {
        if (window.GAME && window.GAME.Audio) {
          if (typeof window.GAME.Audio.unlock === 'function') window.GAME.Audio.unlock();
          if (typeof window.GAME.Audio.playWelcomeStart === 'function') {
            window.GAME.Audio.playWelcomeStart();
          } else if (typeof window.GAME.Audio.playSelect === 'function') {
            window.GAME.Audio.playSelect();
          }
        }
      } catch (e) {}
      invokeCb(['onResetCamera']);
      if (_lastState) {
        var curLvl = Number(_lastState.levelId || 1);
        var defMeta = DEFAULT_LEVEL_META[curLvl] || DEFAULT_LEVEL_META[1];
        showToast('☀️ Island ' + curLvl + ': ' + defMeta.goal, 'gold');
      }
    }
  }

  function refreshWelcomeBadges() {
    var curLvl = (_lastState && _lastState.levelId) ? Number(_lastState.levelId) : 1;
    if (_els.cubeGearBadge) {
      _els.cubeGearBadge.textContent = 'LV ' + curLvl;
    }
    if (_els.cubeStarsBadge) {
      var sumStars =
        (_bestStarsByLevel[1] || 0) +
        (_bestStarsByLevel[2] || 0) +
        (_bestStarsByLevel[3] || 0) +
        (_bestStarsByLevel[4] || 0);
      _els.cubeStarsBadge.textContent = sumStars > 0 ? (sumStars + '★') : '4×3★';
    }
  }

  function renderWelcomeDrawerContent() {
    if (!_els.welcomeDrawer || !_els.drawerTitle || !_els.drawerContent || !_els.drawerFoot) return;
    var curLvl = (_lastState && _lastState.levelId) ? Number(_lastState.levelId) : 1;
    _els.drawerContent.innerHTML = '';
    _els.drawerFoot.innerHTML = '';

    if (_welcomeDrawerMode === 'islands' || _welcomeDrawerMode === 'stars') {
      _els.drawerTitle.textContent =
        _welcomeDrawerMode === 'stars'
          ? '★ Sanctuary Par & Star Challenges'
          : '🏝️ Choose a Clockwork Sky Island';

      var grid = document.createElement('div');
      grid.className = 'cs-islands-grid';

      ISLAND_PICKER_META.forEach(function (info) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'cs-island-card' + (info.id === curLvl ? ' is-current' : '');
        var earned = _bestStarsByLevel[info.id] || 0;
        var starTxt =
          (earned >= 1 ? '★' : '☆') +
          (earned >= 2 ? '★' : '☆') +
          (earned >= 3 ? '★' : '☆');
        card.innerHTML =
          '<div class="cs-island-top">' +
            '<span class="cs-island-tag cs-outlined-text">Sky Island ' + info.id + ' · Par ' + info.par + '</span>' +
            '<span class="cs-island-stars">' + starTxt + '</span>' +
          '</div>' +
          '<div class="cs-island-name cs-outlined-text">' + info.title + '</div>' +
          '<div class="cs-island-sub">' + info.sub + '</div>';
        card.addEventListener('click', function () {
          handleSelectLevel(info.id);
          dismissWelcome(false);
        });
        grid.appendChild(card);
      });
      _els.welcomeDrawer.querySelector('.cs-drawer-body').appendChild(grid);
    } else {
      _els.drawerTitle.textContent = '📜 How to Play Clockwork Sanctum';
      var list = document.createElement('div');
      list.className = 'cs-guide-list';
      var rows = [
        {
          role: 'warrior',
          icon: '☀️',
          head: '1. Shatter Every Gargoyle with Sunbeams',
          desc: 'Click Prism Mirrors to bounce golden sunbeams or Brass Gears to slide stone rows. Any Stone Gargoyle struck by a sunbeam shatters instantly!'
        },
        {
          role: 'rogue',
          icon: '🗡️',
          head: '2. Outsmart the Stalking Shadow Rogue',
          desc: 'After every move you make, the Shadow Rogue prowls 1 tile closer along his crimson arrow. Click your Knight to dodge up to 2 tiles—or blind the Rogue in a sunbeam!'
        },
        {
          role: 'mage',
          icon: '⚡',
          head: '3. Summon Mage\'s Astral Aid [F]',
          desc: 'Trapped? Click the glowing Astral Aid card (or press F) to drop the Mage from the sky and Time-Freeze the Rogue for 2 full steps at 0 step cost!'
        }
      ];
      rows.forEach(function (r) {
        var row = document.createElement('div');
        row.className = 'cs-guide-row' + (_guideFocusRole === r.role ? ' is-highlight' : '');
        row.innerHTML =
          '<div class="cs-guide-icon">' + r.icon + '</div>' +
          '<div class="cs-guide-body">' +
            '<div class="cs-guide-head cs-outlined-text">' + r.head + '</div>' +
            '<div class="cs-guide-desc">' + r.desc + '</div>' +
          '</div>';
        list.appendChild(row);
      });
      _els.drawerContent.appendChild(list);
    }

    var playNowBtn = document.createElement('button');
    playNowBtn.type = 'button';
    playNowBtn.className = 'cs-vic-btn is-primary cs-outlined-text';
    playNowBtn.textContent = 'Play Island ' + curLvl + ' →';
    playNowBtn.addEventListener('click', function () {
      dismissWelcome(false);
    });
    _els.drawerFoot.appendChild(playNowBtn);
  }

  function openWelcomeDrawer(mode, focusRole) {
    playUiClick();
    if (_welcomeDrawerMode === mode && (!focusRole || _guideFocusRole === focusRole)) {
      closeWelcomeDrawer();
      return;
    }
    _welcomeDrawerMode = mode;
    _guideFocusRole = focusRole || null;
    renderWelcomeDrawerContent();
    if (_els.welcomeDrawer) {
      _els.welcomeDrawer.classList.add('is-open');
    }
  }

  // ------------------------------------------------------------------------
  // Card Node Builders (Persistent, Zero InnerHTML Churn in Render Loop)
  // ------------------------------------------------------------------------
  function createCollectorCardDom(isGargoyle) {
    var card = document.createElement('div');
    card.className = 'cs-collector-card hud-interactive' + (isGargoyle ? ' is-gargoyle' : '');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    stopEventThrough(card);

    var inner = document.createElement('div');
    inner.className = 'cs-card-inner';

    var header = document.createElement('div');
    header.className = 'cs-card-header';

    var gem = document.createElement('span');
    gem.className = 'cs-card-class-gem';

    var title = document.createElement('span');
    title.className = 'cs-card-title cs-outlined-text';

    var coin = document.createElement('span');
    coin.className = 'cs-card-coin';

    header.appendChild(gem);
    header.appendChild(title);
    header.appendChild(coin);

    var artWrap = document.createElement('div');
    artWrap.className = 'cs-card-art-wrap';

    var portrait = document.createElement('canvas');
    portrait.width = 128;
    portrait.height = 128;
    portrait.className = 'cs-card-portrait';

    var statsLeft = document.createElement('div');
    statsLeft.className = 'cs-card-stats-left';
    var badgeHeart = document.createElement('span');
    badgeHeart.className = 'cs-badge-heart cs-outlined-text';
    badgeHeart.title = 'Vitality (HP)';
    var badgeShield = document.createElement('span');
    badgeShield.className = 'cs-badge-shield cs-outlined-text';
    badgeShield.title = 'Stone / Plate Armor';
    statsLeft.appendChild(badgeHeart);
    statsLeft.appendChild(badgeShield);

    var statsRight = document.createElement('div');
    statsRight.className = 'cs-card-stats-right';
    var orbMove = document.createElement('span');
    orbMove.className = 'cs-mini-orb orb-move cs-outlined-text';
    orbMove.title = 'Move Range';
    var orbAp = document.createElement('span');
    orbAp.className = 'cs-mini-orb orb-ap cs-outlined-text';
    orbAp.title = 'Action Points (AP)';
    var orbPow = document.createElement('span');
    orbPow.className = 'cs-mini-orb orb-pow cs-outlined-text';
    orbPow.title = 'Range / Power';
    statsRight.appendChild(orbMove);
    statsRight.appendChild(orbAp);
    statsRight.appendChild(orbPow);

    artWrap.appendChild(portrait);
    artWrap.appendChild(statsLeft);
    artWrap.appendChild(statsRight);

    var seam = document.createElement('div');
    seam.className = 'cs-card-seam';
    seam.innerHTML = '<span class="cs-seam-pip"></span><span class="cs-seam-pip pip-warm"></span>';

    var desc = document.createElement('div');
    desc.className = 'cs-card-desc cs-outlined-text';

    var tagPill = document.createElement('div');
    tagPill.className = 'cs-card-floating-tag cs-outlined-text';
    tagPill.style.display = 'none';

    inner.appendChild(header);
    inner.appendChild(artWrap);
    inner.appendChild(seam);
    inner.appendChild(desc);
    card.appendChild(inner);
    card.appendChild(tagPill);

    return {
      root: card,
      gem: gem,
      title: title,
      coin: coin,
      portrait: portrait,
      badgeHeart: badgeHeart,
      badgeShield: badgeShield,
      orbMove: orbMove,
      orbAp: orbAp,
      orbPow: orbPow,
      desc: desc,
      tagPill: tagPill,
      boundId: null
    };
  }

  // ------------------------------------------------------------------------
  // Build Persistent 5-Zone + Action Bar + Victory Banner DOM
  // ------------------------------------------------------------------------
  function buildDom() {
    ensurePortraitCanvases();

    _root = document.getElementById('hud-root');
    if (!_root) {
      _root = document.createElement('div');
      _root.id = 'hud-root';
      document.body.appendChild(_root);
    }
    _root.innerHTML = '';

    // ---- ZONE 1: TOP-LEFT ACTIVE HERO MEDALLION ----
    var topLeft = document.createElement('div');
    topLeft.className = 'cs-top-left hud-interactive';
    stopEventThrough(topLeft);
    topLeft.innerHTML =
      '<div class="cs-medallion-ring">' +
        '<div class="cs-medallion-well">' +
          '<canvas width="96" height="96" class="cs-medallion-portrait" id="cs-tl-portrait"></canvas>' +
        '</div>' +
        '<div class="cs-medallion-badge cs-outlined-text" id="cs-tl-lvl-badge">1</div>' +
      '</div>' +
      '<div class="cs-stat-pill-right">' +
        '<div class="cs-stat-row">' +
          '<span class="cs-stat-icon" id="cs-tl-role-icon">' + SVGS.classWarrior + '</span>' +
          '<span class="cs-hero-name-value cs-outlined-text" id="cs-tl-hp">Warrior</span>' +
        '</div>' +
        '<div class="cs-stat-row">' +
          '<span class="cs-role-value cs-outlined-text" id="cs-tl-ap">Cranks & Bashes</span>' +
        '</div>' +
      '</div>';
    _root.appendChild(topLeft);

    // ---- ZONE 2: TOP-CENTER WHISPER-COMPACT LEVEL RIBBON & TOAST ----
    var topCenter = document.createElement('div');
    topCenter.className = 'cs-top-center';
    topCenter.innerHTML =
      '<div class="cs-level-ribbon" id="cs-level-ribbon">' +
        '<span class="cs-ribbon-tag cs-outlined-text" id="cs-ribbon-lvl">Level 1</span>' +
        '<span class="cs-ribbon-sep">·</span>' +
        '<span class="cs-ribbon-title cs-outlined-text" id="cs-ribbon-title">The Sundial Courtyard</span>' +
        '<span class="cs-ribbon-sep">—</span>' +
        '<span class="cs-ribbon-goal cs-outlined-text" id="cs-ribbon-goal">Bounce sunbeam through all 3 Gargoyles</span>' +
      '</div>' +
      '<div class="cs-toast cs-outlined-text" id="cs-hud-toast"></div>';
    _root.appendChild(topCenter);

    // ---- ZONE 3: TOP-RIGHT SANCTUM TOME MEDALLION & LEVEL SWITCHER ----
    var topRight = document.createElement('div');
    topRight.className = 'cs-top-right hud-interactive';
    stopEventThrough(topRight);
    topRight.innerHTML =
      '<div class="cs-stat-pill-left">' +
        '<div class="cs-tr-top-row">' +
          '<div class="cs-trophy-group" id="cs-trophy-group">' +
            '<span class="cs-trophy-text cs-outlined-text" id="cs-tr-trophy-val">0/3</span>' +
            '<span class="cs-stat-icon">' + SVGS.trophy + '</span>' +
          '</div>' +
          '<span class="cs-tr-divider"></span>' +
          '<button type="button" class="cs-mute-btn" id="cs-mute-btn" title="Mute Audio (M)">' + SVGS.soundOn + '</button>' +
          '<button type="button" class="cs-home-btn" id="cs-home-btn" title="Welcome Screen (Esc)">' + SVGS.homeCrest + '</button>' +
        '</div>' +
        '<div class="cs-tr-lvl-row" id="cs-lvl-btns">' +
          '<span class="cs-lvl-label cs-outlined-text">LV</span>' +
        '</div>' +
      '</div>' +
      '<div class="cs-medallion-ring">' +
        '<div class="cs-medallion-well">' +
          '<canvas width="96" height="96" class="cs-medallion-portrait is-tome" id="cs-tr-tome"></canvas>' +
        '</div>' +
        '<div class="cs-medallion-badge cs-outlined-text" id="cs-tr-turn-badge">T1</div>' +
      '</div>';
    _root.appendChild(topRight);

    var lvlRow = topRight.querySelector('#cs-lvl-btns');
    _els.lvlPills = {};
    [1, 2, 3, 4].forEach(function (lvl) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cs-lvl-pill' + (lvl === 1 ? ' is-active' : '');
      btn.textContent = String(lvl);
      btn.title = 'Load Level ' + lvl;
      btn.addEventListener('click', function () {
        handleSelectLevel(lvl);
      });
      lvlRow.appendChild(btn);
      _els.lvlPills[lvl] = btn;
    });

    // ---- ZONE 4: BOTTOM-LEFT 3 COLLECTOR HERO CARDS ----
    var heroDeck = document.createElement('div');
    heroDeck.className = 'cs-hero-deck';
    _els.heroCards = [];
    for (var h = 0; h < 3; h++) {
      var hc = createCollectorCardDom(false);
      (function (cardSlot) {
        cardSlot.root.addEventListener('click', function () {
          if (cardSlot.boundId) handleSelectHero(cardSlot.boundId);
        });
        cardSlot.root.addEventListener('keydown', function (e) {
          if ((e.key === 'Enter' || e.key === ' ') && cardSlot.boundId) {
            e.preventDefault();
            handleSelectHero(cardSlot.boundId);
          }
        });
      })(hc);
      heroDeck.appendChild(hc.root);
      _els.heroCards.push(hc);
    }
    _root.appendChild(heroDeck);

    // ---- ZONE 6: BOTTOM-CENTER STREAMLINED UTILITY BAR (HINT · UNDO · RESET) ----
    var actionBar = document.createElement('div');
    actionBar.className = 'cs-action-bar hud-interactive';
    stopEventThrough(actionBar);
    _els.modeBtns = {};

    var hintBtn = document.createElement('button');
    hintBtn.type = 'button';
    hintBtn.className = 'cs-act-btn is-hint-primary cs-outlined-text';
    hintBtn.innerHTML = SVGS.actHint + '<span>HINT (H)</span>';
    hintBtn.title = 'Highlight Optimal Next Click (H)';
    hintBtn.addEventListener('click', handleHint);
    actionBar.appendChild(hintBtn);

    var sep1 = document.createElement('span');
    sep1.className = 'cs-bar-sep';
    actionBar.appendChild(sep1);

    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.className = 'cs-act-btn is-util cs-outlined-text';
    undoBtn.innerHTML = SVGS.actUndo + '<span>UNDO (Z)</span>';
    undoBtn.title = 'Undo Last Step (Z)';
    undoBtn.addEventListener('click', handleUndo);
    actionBar.appendChild(undoBtn);
    _els.undoBtn = undoBtn;

    var resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'cs-act-btn is-util cs-outlined-text';
    resetBtn.innerHTML = SVGS.actReset + '<span>RESET (R)</span>';
    resetBtn.title = 'Reset Level (R)';
    resetBtn.addEventListener('click', handleReset);
    actionBar.appendChild(resetBtn);
    _els.resetBtn = resetBtn;

    _root.appendChild(actionBar);

    // ---- ZONE 5: BOTTOM-RIGHT SHADOW ROGUE VILLAIN + STONE GARGOYLE CARDS ----
    var gargDeck = document.createElement('div');
    gargDeck.className = 'cs-gargoyle-deck';
    var extraPill = document.createElement('div');
    extraPill.className = 'cs-gargoyle-extra-pill cs-outlined-text';
    extraPill.style.display = 'none';
    gargDeck.appendChild(extraPill);
    _els.gargExtraPill = extraPill;

    var rogueCard = createCollectorCardDom(false);
    rogueCard.root.classList.add('is-rogue-villain');
    rogueCard.root.addEventListener('click', handleInspectRogue);
    rogueCard.root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleInspectRogue();
      }
    });
    gargDeck.appendChild(rogueCard.root);
    _els.rogueCard = rogueCard;

    _els.gargCards = [];
    for (var g = 0; g < 3; g++) {
      var gc = createCollectorCardDom(true);
      (function (gSlot) {
        gSlot.root.addEventListener('click', function () {
          if (gSlot.boundObj) handleInspectGargoyle(gSlot.boundObj);
        });
      })(gc);
      gargDeck.appendChild(gc.root);
      _els.gargCards.push(gc);
    }
    _root.appendChild(gargDeck);

    // ---- ZONE 7A: COMPACT SUNLIT VICTORY BANNER ----
    var vic = document.createElement('div');
    vic.className = 'cs-victory-banner hud-interactive';
    stopEventThrough(vic);
    vic.innerHTML =
      '<div class="cs-victory-kicker cs-outlined-text">☀️ Sanctuary Purified · Rogue Banished!</div>' +
      '<div class="cs-victory-title cs-outlined-text" id="cs-vic-title">The Sundial Courtyard</div>' +
      '<div class="cs-victory-stars" id="cs-vic-stars"></div>' +
      '<div class="cs-victory-meta cs-outlined-text" id="cs-vic-meta">Cleared in 4 Steps · Par 4</div>' +
      '<div class="cs-victory-actions">' +
        '<button type="button" class="cs-vic-btn cs-outlined-text" id="cs-vic-replay">Replay</button>' +
        '<button type="button" class="cs-vic-btn is-primary cs-outlined-text" id="cs-vic-next">Next Level →</button>' +
      '</div>';
    _root.appendChild(vic);

    // ---- ZONE 7B: COMPACT SHADOW AMBUSH DEFEAT BANNER ----
    var amb = document.createElement('div');
    amb.className = 'cs-ambush-banner hud-interactive';
    stopEventThrough(amb);
    amb.innerHTML =
      '<div class="cs-ambush-kicker cs-outlined-text">🗡️ Shadow Ambush!</div>' +
      '<div class="cs-ambush-title cs-outlined-text">The Shadow Rogue Caught Your Knight!</div>' +
      '<div class="cs-ambush-meta cs-outlined-text">Rewind 1 step to dodge, sun-blind, or summon Mage\'s Astral Aid [F].</div>' +
      '<div class="cs-victory-actions">' +
        '<button type="button" class="cs-vic-btn is-undo-primary cs-outlined-text" id="cs-amb-undo">↩ Undo Step (Z)</button>' +
        '<button type="button" class="cs-vic-btn cs-outlined-text" id="cs-amb-retry">Retry Level (R)</button>' +
      '</div>';
    _root.appendChild(amb);

    _els.tlPortrait = topLeft.querySelector('#cs-tl-portrait');
    _els.tlLvlBadge = topLeft.querySelector('#cs-tl-lvl-badge');
    _els.tlRoleIcon = topLeft.querySelector('#cs-tl-role-icon');
    _els.tlHp = topLeft.querySelector('#cs-tl-hp');
    _els.tlAp = topLeft.querySelector('#cs-tl-ap');

    _els.ribbon = topCenter.querySelector('#cs-level-ribbon');
    _els.ribbonLvl = topCenter.querySelector('#cs-ribbon-lvl');
    _els.ribbonTitle = topCenter.querySelector('#cs-ribbon-title');
    _els.ribbonGoal = topCenter.querySelector('#cs-ribbon-goal');
    _els.toast = topCenter.querySelector('#cs-hud-toast');

    _els.trophyGroup = topRight.querySelector('#cs-trophy-group');
    _els.trTrophyVal = topRight.querySelector('#cs-tr-trophy-val');
    _els.muteBtn = topRight.querySelector('#cs-mute-btn');
    _els.homeBtn = topRight.querySelector('#cs-home-btn');
    _els.trTome = topRight.querySelector('#cs-tr-tome');
    _els.trTurnBadge = topRight.querySelector('#cs-tr-turn-badge');

    // ---- ZONE 8: OPTION 2 ("THE SUNBEAM SHOWDOWN") LIVE 3D BOARD WELCOME SCREEN ----
    var welcome = document.createElement('div');
    welcome.className = 'cs-welcome-screen' + (_welcomeOpen ? ' is-open' : '');
    welcome.id = 'cs-welcome-screen';
    welcome.innerHTML =
      '<div class="cs-welcome-halo"></div>' +
      '<div class="cs-welcome-logo-wrap">' +
        '<img src="./assets/welcome/logo_crest.png" alt="Clockwork Sanctum — Shatter Gargoyles · Outsmart the Rogue" class="cs-welcome-logo" draggable="false" />' +
      '</div>' +
      '<button type="button" class="cs-welcome-mascot is-warrior" id="cs-welcome-warrior" title="Sanctum Knight — Click Mirrors, Crank Gears & Dodge 2 Tiles">' +
        '<img src="./assets/welcome/mascot_warrior.png" alt="Sanctum Knight Warrior" draggable="false" />' +
      '</button>' +
      '<button type="button" class="cs-welcome-mascot is-rogue" id="cs-welcome-rogue" title="Shadow Rogue — Prowls 1 Tile Closer After Every Move!">' +
        '<img src="./assets/welcome/mascot_rogue.png" alt="Shadow Rogue Hunter" draggable="false" />' +
      '</button>' +
      '<button type="button" class="cs-welcome-mascot is-mage" id="cs-welcome-mage" title="Astral Aid [F] — Summon Mage to Time-Freeze the Rogue for 2 Steps!">' +
        '<img src="./assets/welcome/mascot_mage.png" alt="Astral Aid Mage" draggable="false" />' +
      '</button>' +
      '<div class="cs-welcome-menu" id="cs-welcome-menu">' +
        '<button type="button" class="cs-welcome-slab-btn is-play" id="cs-welcome-play-btn" title="Play Clockwork Sanctum (Enter / Space)">' +
          '<img src="./assets/welcome/btn_play.png" alt="Play" draggable="false" />' +
        '</button>' +
        '<button type="button" class="cs-welcome-slab-btn is-islands" id="cs-welcome-islands-btn" title="Choose from 4 Clockwork Sky Islands">' +
          '<img src="./assets/welcome/btn_islands.png" alt="4 Sky Islands" draggable="false" />' +
        '</button>' +
      '</div>' +
      '<div class="cs-welcome-cubes" id="cs-welcome-cubes">' +
        '<button type="button" class="cs-welcome-cube-btn" id="cs-cube-music" title="Toggle Sanctuary Music (M)">' +
          '<img src="./assets/welcome/cube_music.png" alt="Music" draggable="false" />' +
          '<span class="cs-cube-badge cs-outlined-text" id="cs-cube-music-badge">ON</span>' +
        '</button>' +
        '<button type="button" class="cs-welcome-cube-btn" id="cs-cube-stars" title="Sanctuary Par & Star Challenges">' +
          '<img src="./assets/welcome/cube_stars.png" alt="Stars & Par" draggable="false" />' +
          '<span class="cs-cube-badge cs-outlined-text" id="cs-cube-stars-badge">4×3★</span>' +
        '</button>' +
        '<button type="button" class="cs-welcome-cube-btn" id="cs-cube-guide" title="How to Play Clockwork Sanctum">' +
          '<img src="./assets/welcome/cube_guide.png" alt="How to Play" draggable="false" />' +
          '<span class="cs-cube-badge is-cyan cs-outlined-text" id="cs-cube-guide-badge">RULES</span>' +
        '</button>' +
        '<button type="button" class="cs-welcome-cube-btn" id="cs-cube-gear" title="Cycle Live 3D Sky Island Preview">' +
          '<img src="./assets/welcome/cube_gear.png" alt="Cycle Sky Island" draggable="false" />' +
          '<span class="cs-cube-badge cs-outlined-text" id="cs-cube-gear-badge">LV 1</span>' +
        '</button>' +
      '</div>' +
      '<div class="cs-welcome-drawer" id="cs-welcome-drawer">' +
        '<div class="cs-drawer-head">' +
          '<div class="cs-drawer-title cs-outlined-text" id="cs-drawer-title">Choose a Sky Island</div>' +
          '<button type="button" class="cs-drawer-close cs-outlined-text" id="cs-drawer-close" title="Close">✕</button>' +
        '</div>' +
        '<div class="cs-drawer-body" id="cs-drawer-content"></div>' +
        '<div class="cs-drawer-foot" id="cs-drawer-foot"></div>' +
      '</div>';
    _root.appendChild(welcome);

    _els.welcomeScreen = welcome;
    _els.welcomePlayBtn = welcome.querySelector('#cs-welcome-play-btn');
    _els.welcomeIslandsBtn = welcome.querySelector('#cs-welcome-islands-btn');
    _els.welcomeWarriorBtn = welcome.querySelector('#cs-welcome-warrior');
    _els.welcomeRogueBtn = welcome.querySelector('#cs-welcome-rogue');
    _els.welcomeMageBtn = welcome.querySelector('#cs-welcome-mage');
    _els.cubeMusicBtn = welcome.querySelector('#cs-cube-music');
    _els.cubeMusicBadge = welcome.querySelector('#cs-cube-music-badge');
    _els.cubeStarsBtn = welcome.querySelector('#cs-cube-stars');
    _els.cubeStarsBadge = welcome.querySelector('#cs-cube-stars-badge');
    _els.cubeGuideBtn = welcome.querySelector('#cs-cube-guide');
    _els.cubeGearBtn = welcome.querySelector('#cs-cube-gear');
    _els.cubeGearBadge = welcome.querySelector('#cs-cube-gear-badge');
    _els.welcomeDrawer = welcome.querySelector('#cs-welcome-drawer');
    _els.drawerTitle = welcome.querySelector('#cs-drawer-title');
    _els.drawerContent = welcome.querySelector('#cs-drawer-content');
    _els.drawerFoot = welcome.querySelector('#cs-drawer-foot');
    _els.drawerClose = welcome.querySelector('#cs-drawer-close');

    [
      _els.welcomePlayBtn,
      _els.welcomeIslandsBtn,
      _els.welcomeWarriorBtn,
      _els.welcomeRogueBtn,
      _els.welcomeMageBtn,
      _els.cubeMusicBtn,
      _els.cubeStarsBtn,
      _els.cubeGuideBtn,
      _els.cubeGearBtn,
      _els.welcomeDrawer
    ].forEach(stopEventThrough);

    _els.welcomePlayBtn.addEventListener('click', function () {
      dismissWelcome(false);
    });
    _els.welcomeIslandsBtn.addEventListener('click', function () {
      openWelcomeDrawer('islands');
    });
    _els.cubeMusicBtn.addEventListener('click', handleToggleMute);
    _els.cubeStarsBtn.addEventListener('click', function () {
      openWelcomeDrawer('stars');
    });
    _els.cubeGuideBtn.addEventListener('click', function () {
      openWelcomeDrawer('guide');
    });
    _els.cubeGearBtn.addEventListener('click', function () {
      var curLvl = (_lastState && _lastState.levelId) ? Number(_lastState.levelId) : 1;
      var nextLvl = curLvl < 4 ? curLvl + 1 : 1;
      try {
        if (window.GAME && window.GAME.Audio) {
          if (typeof window.GAME.Audio.unlock === 'function') window.GAME.Audio.unlock();
          if (typeof window.GAME.Audio.playGearSlide === 'function') window.GAME.Audio.playGearSlide();
        }
      } catch (e) {}
      var r = invokeCb(['onSelectLevel', 'onLoadLevel', 'onLevelChange', 'loadLevel'], nextLvl);
      if (!r.handled && window.GAME.Simulation && typeof window.GAME.Simulation.loadLevel === 'function') {
        window.GAME.Simulation.loadLevel(nextLvl);
      }
      if (_welcomeDrawerMode) {
        renderWelcomeDrawerContent();
      }
    });
    _els.welcomeWarriorBtn.addEventListener('click', function () {
      openWelcomeDrawer('guide', 'warrior');
    });
    _els.welcomeRogueBtn.addEventListener('click', function () {
      openWelcomeDrawer('guide', 'rogue');
    });
    _els.welcomeMageBtn.addEventListener('click', function () {
      try {
        if (window.GAME && window.GAME.Audio && typeof window.GAME.Audio.playAstralAid === 'function') {
          window.GAME.Audio.unlock();
          window.GAME.Audio.playAstralAid();
        }
      } catch (e) {}
      openWelcomeDrawer('guide', 'mage');
    });
    _els.drawerClose.addEventListener('click', function () {
      playUiClick();
      closeWelcomeDrawer();
    });
    if (_els.homeBtn) {
      _els.homeBtn.addEventListener('click', openWelcome);
    }

    _els.vicBanner = vic;
    _els.vicTitle = vic.querySelector('#cs-vic-title');
    _els.vicStars = vic.querySelector('#cs-vic-stars');
    _els.vicMeta = vic.querySelector('#cs-vic-meta');
    _els.vicReplay = vic.querySelector('#cs-vic-replay');
    _els.vicNext = vic.querySelector('#cs-vic-next');

    _els.ambBanner = amb;
    _els.ambUndo = amb.querySelector('#cs-amb-undo');
    _els.ambRetry = amb.querySelector('#cs-amb-retry');

    blitPortrait(_els.trTome, 'spellbook_med');
    blitPortrait(_els.tlPortrait, 'warrior_med');

    _els.muteBtn.addEventListener('click', handleToggleMute);
    _els.vicReplay.addEventListener('click', handleReset);
    _els.ambUndo.addEventListener('click', handleUndo);
    _els.ambRetry.addEventListener('click', handleReset);
    _els.vicNext.addEventListener('click', function () {
      var curLvl = (_lastState && _lastState.levelId) ? Number(_lastState.levelId) : 1;
      var nextLvl = curLvl < 4 ? curLvl + 1 : 1;
      handleSelectLevel(nextLvl);
    });
  }

  // ------------------------------------------------------------------------
  // State Normalization Helpers
  // ------------------------------------------------------------------------
  function normalizeHeroes(rawHeroes) {
    var list = [];
    if (Array.isArray(rawHeroes)) {
      list = rawHeroes;
    } else if (rawHeroes && typeof rawHeroes === 'object') {
      ['warrior', 'mage', 'rogue'].forEach(function (k) {
        if (rawHeroes[k]) list.push(rawHeroes[k]);
      });
      if (list.length === 0) {
        Object.keys(rawHeroes).forEach(function (k) {
          list.push(rawHeroes[k]);
        });
      }
    }
    if (list.length === 0) {
      return [DEFAULT_HERO_META.warrior, DEFAULT_HERO_META.mage, DEFAULT_HERO_META.rogue];
    }
    return list.map(function (h, idx) {
      var rawKey = String(h.id || h.classKey || h.type || ['warrior', 'mage', 'rogue'][idx] || 'warrior').toLowerCase();
      var baseKey = rawKey.indexOf('mage') !== -1 ? 'mage' : (rawKey.indexOf('rogue') !== -1 ? 'rogue' : 'warrior');
      var def = DEFAULT_HERO_META[baseKey];
      var specs = (window.GAME.CONFIG && window.GAME.CONFIG.HERO_SPECS && window.GAME.CONFIG.HERO_SPECS[baseKey]) || {};
      var maxHp = h.maxHp != null ? h.maxHp : (specs.maxHp != null ? specs.maxHp : def.maxHp);
      var hp = h.hp != null ? h.hp : (specs.hp != null ? specs.hp : def.hp);
      var maxAp = h.maxAp != null ? h.maxAp : (specs.maxAp != null ? specs.maxAp : def.maxAp);
      var ap = h.ap != null ? h.ap : maxAp;
      var moveRange = h.moveRange != null ? h.moveRange : (h.move != null ? h.move : (specs.moveRange || specs.move || def.moveRange));
      var armor = h.armor != null ? h.armor : (specs.armor != null ? specs.armor : def.armor);
      var power = h.power != null ? h.power : (h.range != null ? h.range : (specs.power || specs.abilityRange || def.power));
      return {
        id: h.id || def.id,
        classKey: baseKey,
        name: h.name || specs.name || def.name,
        role: h.role || specs.role || def.role || '',
        col: typeof h.col === 'number' ? h.col : undefined,
        row: typeof h.row === 'number' ? h.row : undefined,
        hp: hp,
        maxHp: maxHp,
        ap: ap,
        maxAp: maxAp,
        moveRange: moveRange,
        armor: armor,
        power: power,
        tier: def.tier,
        desc: h.description || h.desc || specs.description || def.desc
      };
    });
  }

  function normalizeGargoyles(rawGargoyles) {
    if (Array.isArray(rawGargoyles)) return rawGargoyles;
    if (rawGargoyles && typeof rawGargoyles === 'object') {
      return Object.keys(rawGargoyles).map(function (k) {
        return rawGargoyles[k];
      });
    }
    return [];
  }

  // ------------------------------------------------------------------------
  // Public API: init, render, showToast, setVisible, getPortraits
  // ------------------------------------------------------------------------
  function init(callbacks) {
    _callbacks = callbacks || {};
    _forceHiddenByUrl = checkUrlHiddenFlags();
    _welcomeOpen = !checkWelcomeDisabledByUrl();
    ensurePortraitCanvases();
    buildDom();
    syncWelcomeUi();

    if (typeof window !== 'undefined' && window.addEventListener && !window.__csHudMuteHooked) {
      window.__csHudMuteHooked = true;
      window.addEventListener('game:audio-mute', refreshMuteUi);
    }

    if (_forceHiddenByUrl) {
      setVisible(false);
    } else {
      setVisible(true);
    }

    refreshMuteUi();
    render({
      levelId: 1,
      steps: 0,
      turn: 1,
      selectedHeroId: 'warrior',
      actionMode: 'move',
      heroes: [DEFAULT_HERO_META.warrior, DEFAULT_HERO_META.mage, DEFAULT_HERO_META.rogue],
      gargoyles: [
        { id: 'g1', hp: 9, armor: 3, defeated: false, sunstruck: false },
        { id: 'g2', hp: 9, armor: 3, defeated: false, sunstruck: false },
        { id: 'g3', hp: 9, armor: 3, defeated: false, sunstruck: false }
      ],
      canUndo: false,
      victory: false
    });
  }

  function render(simState) {
    if (!simState) return;
    _lastState = simState;
    if (!_root) buildDom();

    if (_forceHiddenByUrl) {
      _root.classList.add('hud-hidden');
      return;
    }

    ensurePortraitCanvases();
    var lvlId = Number(simState.levelId || 1);
    var defLvl = DEFAULT_LEVEL_META[lvlId] || DEFAULT_LEVEL_META[1];
    var meta = simState.levelMeta || (window.GAME.LEVELS && window.GAME.LEVELS[lvlId]) || {};

    var lvlTitle = meta.name || meta.title || defLvl.title;
    var lvlGoal = meta.shortGoal || meta.goal || meta.subtitle || meta.objective || defLvl.goal;
    if (lvlGoal && lvlGoal.length > 68) {
      lvlGoal = defLvl.goal;
    }

    var exitUnlocked = !!(simState.exit && simState.exit.unlocked && !simState.victory);
    if (exitUnlocked) {
      lvlGoal = 'Exit Stair Unlocked — Click Golden Stair!';
    }

    // 1. Update Top-Center Ribbon (max-width: 580px — zero "..." truncation!)
    _els.ribbonLvl.textContent = 'Level ' + lvlId;
    _els.ribbonTitle.textContent = lvlTitle;
    _els.ribbonGoal.textContent = lvlGoal;
    _els.ribbon.classList.toggle('is-exit-unlocked', exitUnlocked);

    // 2. Normalize Heroes & Find Active Hero
    var heroes = normalizeHeroes(simState.heroes);
    var selId = simState.selectedHeroId || (heroes[0] && heroes[0].id) || 'warrior';
    var activeHero = heroes[0];
    for (var i = 0; i < heroes.length; i++) {
      if (heroes[i].id === selId || heroes[i].classKey === selId) {
        activeHero = heroes[i];
        break;
      }
    }

    var classSvgMap = {
      warrior: SVGS.classWarrior,
      mage: SVGS.classMage,
      rogue: SVGS.classRogue
    };

    // 3. Update Top-Left Medallion (Active Hero Name + Auto-Action Role)
    if (activeHero) {
      blitPortrait(_els.tlPortrait, (activeHero.classKey || 'warrior') + '_med');
      if (_els.tlRoleIcon) {
        _els.tlRoleIcon.innerHTML = classSvgMap[activeHero.classKey] || SVGS.classWarrior;
      }
      _els.tlHp.textContent = activeHero.name;
      _els.tlAp.textContent = activeHero.role || 'Ready';
    }
    _els.tlLvlBadge.textContent = String(lvlId);

    // 4. Update Top-Right Tome Medallion, Trophy Counter & Level Switcher
    var gargoyles = normalizeGargoyles(simState.gargoyles);
    var totalGarg = gargoyles.length;
    var defGarg = 0;
    for (var gIdx = 0; gIdx < gargoyles.length; gIdx++) {
      var gg = gargoyles[gIdx];
      if (gg.defeated || gg.shattered || gg.tumbled || gg.dead || (typeof gg.hp === 'number' && gg.hp <= 0)) {
        defGarg++;
      }
    }
    _els.trTrophyVal.textContent = defGarg + '/' + totalGarg;
    _els.trophyGroup.classList.toggle('is-complete', totalGarg > 0 && defGarg >= totalGarg);
    _els.trTurnBadge.textContent = String(simState.steps != null ? simState.steps : 0);
    _els.trTurnBadge.title = 'Steps Taken';

    [1, 2, 3, 4].forEach(function (n) {
      if (_els.lvlPills[n]) {
        _els.lvlPills[n].classList.toggle('is-active', n === lvlId);
      }
    });
    refreshMuteUi();

    // 5. Update Bottom-Left Collector Deck: Slot 0 = Warrior, Slot 1 = Mage: Astral Aid Summon, Slot 2 = Hidden
    var warSlot = _els.heroCards[0];
    if (warSlot) {
      var warHero = activeHero || DEFAULT_HERO_META.warrior;
      warSlot.root.style.display = 'flex';
      warSlot.boundId = warHero.id || 'warrior';
      warSlot.root.className = 'cs-collector-card hud-interactive theme-warrior is-selected';
      warSlot.root.title = 'Warrior (Click to toggle 2-tile dodge diamonds)';
      warSlot.gem.innerHTML = SVGS.classWarrior;
      warSlot.title.textContent = warHero.name || 'Warrior';
      warSlot.coin.textContent = '★';
      blitPortrait(warSlot.portrait, 'warrior');
      warSlot.tagPill.style.display = 'block';
      warSlot.tagPill.className = 'cs-card-floating-tag is-knight cs-outlined-text';
      warSlot.tagPill.textContent = simState.showMoveHighlights ? 'DODGE ON' : 'YOUR HERO';
      warSlot.desc.innerHTML =
        '<span class="cs-card-desc-main">Sanctum Knight</span>' +
        '<span class="cs-card-desc-sub">Dodge 2 · Mirrors & Gears</span>';
    }

    var aidSlot = _els.heroCards[1];
    if (aidSlot) {
      var aidObj = simState.astralAid || { charges: 1, maxCharges: 1, freezeSteps: 2 };
      var aidCharges = typeof aidObj.charges === 'number' ? aidObj.charges : 1;
      var aidReady = aidCharges > 0 && !simState.victory && !simState.defeated;
      aidSlot.root.style.display = 'flex';
      aidSlot.boundId = 'astralAid';
      aidSlot.root.className =
        'cs-collector-card hud-interactive theme-mage is-astral-aid' +
        (aidReady ? ' is-ready' : '') +
        (aidCharges <= 0 ? ' is-spent' : '');
      aidSlot.root.title = aidCharges > 0
        ? 'Summon Mage: Astral Aid [F] — Freezes Shadow Rogue for 2 Steps (0 Steps Cost)'
        : 'Astral Aid Spent (Recharges next level)';
      aidSlot.gem.innerHTML = SVGS.classMage;
      aidSlot.title.textContent = 'Astral Aid';
      aidSlot.coin.textContent = String(aidCharges);
      blitPortrait(aidSlot.portrait, 'mage');
      aidSlot.tagPill.style.display = 'block';
      aidSlot.tagPill.className =
        'cs-card-floating-tag ' + (aidCharges > 0 ? 'is-astral' : 'is-spent') + ' cs-outlined-text';
      aidSlot.tagPill.textContent = aidCharges > 0 ? '⚡ SUMMON [F]' : 'SPENT';
      if (aidCharges > 0) {
        aidSlot.desc.innerHTML =
          '<span class="cs-card-desc-main is-astral-ready">⚡ Freeze Rogue 2</span>' +
          '<span class="cs-card-desc-sub">Free Action · Press [F]</span>';
      } else {
        aidSlot.desc.innerHTML =
          '<span class="cs-card-desc-main is-astral-spent">Summon Spent</span>' +
          '<span class="cs-card-desc-sub">Recharges Next Level</span>';
      }
    }

    if (_els.heroCards[2]) {
      _els.heroCards[2].root.style.display = 'none';
      _els.heroCards[2].boundId = null;
    }

    // 6A. Update Bottom-Right Dedicated Shadow Rogue Villain Card
    if (_els.rogueCard) {
      var rg = simState.rogue;
      if (!rg) {
        _els.rogueCard.root.style.display = 'none';
      } else {
        _els.rogueCard.root.style.display = 'flex';
        var rBanished = !!(rg.banished || simState.victory);
        var rFrozen = !rBanished && (rg.frozenSteps || 0) > 0;
        var rBlinded = !rBanished && !rFrozen && !!rg.sunBlinded;
        var rAmbush = !rBanished && !!(simState.ambushed || simState.defeated);

        _els.rogueCard.root.className =
          'cs-collector-card hud-interactive is-rogue-villain' +
          (rFrozen ? ' is-frozen' : '') +
          (rBlinded ? ' is-sun-blinded' : '') +
          (rBanished ? ' is-banished' : '') +
          (rAmbush ? ' is-ambush' : '');

        _els.rogueCard.gem.innerHTML = SVGS.classRogue;
        _els.rogueCard.title.textContent = 'Shadow Rogue';
        _els.rogueCard.coin.textContent = '!';
        _els.rogueCard.tagPill.style.display = 'block';

        var rPortKey = rFrozen ? 'rogue_frozen' : ((rBlinded || rBanished) ? 'rogue_blinded' : 'rogue');
        blitPortrait(_els.rogueCard.portrait, rPortKey);

        var rMain = '🗡️ Stalking';
        var rSub = '1 tile / step';
        if (rBanished) {
          rMain = '✨ Banished!';
          rSub = 'Light prevailed';
          _els.rogueCard.tagPill.className = 'cs-card-floating-tag is-spent cs-outlined-text';
          _els.rogueCard.tagPill.textContent = 'DEFEATED';
        } else if (rAmbush) {
          rMain = '🗡️ Ambush!';
          rSub = 'Press Z to Undo';
          _els.rogueCard.tagPill.className = 'cs-card-floating-tag is-villain cs-outlined-text';
          _els.rogueCard.tagPill.textContent = 'CAUGHT!';
        } else if (rFrozen) {
          rMain = '❄️ Frozen · ' + rg.frozenSteps;
          rSub = rg.frozenSteps === 1 ? 'Skips next step' : 'Skips 2 steps';
          _els.rogueCard.tagPill.className = 'cs-card-floating-tag is-astral cs-outlined-text';
          _els.rogueCard.tagPill.textContent = 'TIME-LOCKED';
        } else if (rBlinded) {
          rMain = '☀️ Sun-Blinded!';
          rSub = 'Dazzled in beam';
          _els.rogueCard.tagPill.className = 'cs-card-floating-tag is-blinded cs-outlined-text';
          _els.rogueCard.tagPill.textContent = 'STUNNED';
        } else {
          var rawW = (simState.heroes && simState.heroes[0]) || activeHero;
          var manh = (rawW && typeof rawW.col === 'number' && typeof rg.col === 'number')
            ? (Math.abs(rawW.col - rg.col) + Math.abs(rawW.row - rg.row))
            : 3;
          var pathLen = (typeof rg.distToWarrior === 'number' && !isNaN(rg.distToWarrior) && rg.distToWarrior > 0 && rg.distToWarrior < 99)
            ? rg.distToWarrior
            : manh;
          rMain = '🗡️ Stalks · ' + pathLen + (pathLen === 1 ? ' Tile' : ' Tiles');
          rSub = pathLen <= 1 ? '⚠️ Strikes Next!' : 'Moves 1 / step';
          _els.rogueCard.tagPill.className = 'cs-card-floating-tag is-villain cs-outlined-text';
          _els.rogueCard.tagPill.textContent = pathLen <= 1 ? '⚠️ DANGER' : 'HUNTER';
        }

        _els.rogueCard.desc.innerHTML =
          '<span class="cs-gargoyle-status-main">' + rMain + '</span>' +
          '<span class="cs-gargoyle-status-sub">' + rSub + '</span>';
      }
    }

    // 6B. Update Bottom-Right Stone Gargoyle Collector Cards (Up to 3 Cards, 0px Overlap)
    var displayGargs = gargoyles.slice();
    if (displayGargs.length > 3) {
      displayGargs.sort(function (a, b) {
        var da = (a.defeated || a.shattered || a.dead) ? 1 : 0;
        var db = (b.defeated || b.shattered || b.dead) ? 1 : 0;
        return da - db;
      });
      _els.gargExtraPill.style.display = 'block';
      _els.gargExtraPill.textContent = (totalGarg - defGarg) + ' of ' + totalGarg + ' Active';
    } else {
      _els.gargExtraPill.style.display = 'none';
    }

    for (var gcIdx = 0; gcIdx < _els.gargCards.length; gcIdx++) {
      var gSlot = _els.gargCards[gcIdx];
      var gObj = displayGargs[gcIdx];
      if (!gObj) {
        gSlot.root.style.display = 'none';
        gSlot.boundObj = null;
        continue;
      }
      gSlot.root.style.display = 'flex';
      gSlot.boundObj = gObj;

      var gDef = !!(gObj.defeated || gObj.shattered || gObj.tumbled || gObj.dead || (typeof gObj.hp === 'number' && gObj.hp <= 0));
      var gSun = !gDef && !!gObj.sunstruck;
      var gAwake = !gDef && !gSun && !!(gObj.awakened || gObj.awake || gObj.state === 'awakened' || gObj.alert);
      var gPulse = _pulsingGargoyleId && gObj.id === _pulsingGargoyleId;

      gSlot.root.className =
        'cs-collector-card hud-interactive is-gargoyle' +
        (gDef ? ' is-defeated' : '') +
        (gSun ? ' is-sunstruck' : '') +
        (gPulse ? ' is-pulsing' : '');

      gSlot.gem.innerHTML = SVGS.classGargoyle;
      gSlot.title.textContent = gObj.name || 'Stone Gargoyle';
      gSlot.coin.textContent = String(gcIdx + 1);

      var gPortKey = gDef
        ? 'gargoyle_shattered'
        : gSun
          ? 'gargoyle_sunstruck'
          : gAwake
            ? 'gargoyle_awakened'
            : 'gargoyle_sleeping';
      blitPortrait(gSlot.portrait, gPortKey);

      var gHp = gDef ? 0 : (gObj.hp != null ? gObj.hp : 9);
      var gArmor = gObj.armor != null ? gObj.armor : 3;
      gSlot.badgeHeart.textContent = String(gHp);
      gSlot.badgeShield.textContent = String(gArmor);
      gSlot.orbMove.textContent = gAwake ? '2' : '0';
      gSlot.orbAp.textContent = gAwake ? '2' : '0';
      gSlot.orbAp.classList.toggle('is-empty', !gAwake);
      gSlot.orbPow.textContent = '3';

      var mainStatus = 'Sleeping · Sun-Weak';
      var subStatus = (typeof gObj.col === 'number' && typeof gObj.row === 'number')
        ? 'Tile (' + gObj.col + ', ' + gObj.row + ')'
        : 'Pierce with sunbeam';
      if (gDef) {
        mainStatus = gObj.defeatMode === 'tumble' ? 'Swept Off ✓' : 'Shattered ✓';
        subStatus = 'Threat cleared';
      } else if (gSun) {
        mainStatus = 'Sunstruck!';
        subStatus = 'Solar beam locked';
      } else if (gAwake) {
        mainStatus = 'Awakened';
        subStatus = 'Stone guard alert';
      }

      gSlot.desc.innerHTML =
        '<span class="cs-gargoyle-status-main">' + mainStatus + '</span>' +
        '<span class="cs-gargoyle-status-sub">' + subStatus + '</span>';
    }

    // 7. Update Bottom-Center Action Bar Active Mode & Undo Enabled
    var curMode = simState.actionMode || 'move';
    Object.keys(_els.modeBtns).forEach(function (mKey) {
      _els.modeBtns[mKey].classList.toggle('is-active', mKey === curMode);
    });
    if (_els.undoBtn) {
      _els.undoBtn.disabled = simState.canUndo === false;
    }

    // 8. Update Victory & Shadow Ambush Overlay Banners
    var won = !!(simState.victory || simState.won || simState.levelCleared);
    var lost = !won && !!(simState.defeated || simState.ambushed);
    _els.vicBanner.classList.toggle('is-open', won);
    if (_els.ambBanner) {
      _els.ambBanner.classList.toggle('is-open', lost);
      if (_els.ambUndo) {
        _els.ambUndo.disabled = simState.canUndo === false;
      }
    }
    if (won) {
      if (_els.toast) _els.toast.classList.remove('is-visible');
      var stepsUsed = simState.steps != null ? simState.steps : 1;
      var par = simState.parSteps || meta.parSteps || defLvl.parSteps || 4;
      var stars = simState.stars || (stepsUsed <= par ? 3 : (stepsUsed <= par + 2 ? 2 : 1));
      _bestStarsByLevel[lvlId] = Math.max(_bestStarsByLevel[lvlId] || 0, stars);
      _els.vicTitle.textContent = 'Level ' + lvlId + ' · ' + lvlTitle;
      _els.vicStars.innerHTML =
        (stars >= 1 ? SVGS.starFull : SVGS.starEmpty) +
        (stars >= 2 ? SVGS.starFull : SVGS.starEmpty) +
        (stars >= 3 ? SVGS.starFull : SVGS.starEmpty);
      _els.vicMeta.textContent = 'Cleared in ' + stepsUsed + (stepsUsed === 1 ? ' Step' : ' Steps') + ' · Par ' + par;
      _els.vicNext.textContent = lvlId < 4 ? 'Next Level →' : 'Play Again (Lv 1) →';
    } else if (lost) {
      if (_els.toast) _els.toast.classList.remove('is-visible');
    }

    refreshWelcomeBadges();
    syncWelcomeUi();
  }

  function showToast(msg, tone) {
    if (!msg) return;
    if (!_root) buildDom();
    if (!_els.toast || _forceHiddenByUrl || !_visible) return;

    _els.toast.className = 'cs-toast cs-outlined-text is-visible' + (tone ? ' tone-' + tone : '');
    _els.toast.textContent = String(msg);

    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () {
      if (_els.toast) {
        _els.toast.classList.remove('is-visible');
      }
    }, 3400);
  }

  function setVisible(visible) {
    _forceHiddenByUrl = checkUrlHiddenFlags();
    _visible = _forceHiddenByUrl ? false : !!visible;
    if (!_root) {
      _root = document.getElementById('hud-root');
    }
    if (_root) {
      _root.classList.toggle('hud-hidden', !_visible);
    }
    if (document.body) {
      document.body.classList.toggle('hud-off', !_visible);
    }
  }

  function getPortraits() {
    return Object.assign({}, ensurePortraits());
  }

  if (checkUrlHiddenFlags()) {
    _forceHiddenByUrl = true;
    var existingRoot = document.getElementById('hud-root');
    if (existingRoot) existingRoot.classList.add('hud-hidden');
  }

  window.GAME.HUD = {
    init: init,
    render: render,
    showToast: showToast,
    setVisible: setVisible,
    getPortraits: getPortraits,
    isWelcomeOpen: isWelcomeOpen,
    isWelcomeDrawerOpen: isWelcomeDrawerOpen,
    openWelcome: openWelcome,
    dismissWelcome: dismissWelcome,
    closeWelcomeDrawer: closeWelcomeDrawer
  };
})();

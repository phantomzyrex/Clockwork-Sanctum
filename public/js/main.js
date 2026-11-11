(function () {
  'use strict';

  window.GAME = window.GAME || {};

  var bootT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  var startupMs = 0;
  var shaderErrorCount = 0;
  var _inPerfReport = false;

  // Hook console.error early so any Three.js WebGLProgram / GLSL error is counted accurately
  var origConsoleError = console.error ? console.error.bind(console) : function () {};
  console.error = function () {
    for (var i = 0; i < arguments.length; i++) {
      var msg = String(arguments[i] || '');
      if (
        msg.indexOf('THREE.WebGLProgram') !== -1 ||
        msg.indexOf('THREE.WebGLShader') !== -1 ||
        msg.indexOf('Shader Error') !== -1 ||
        msg.indexOf('GL_INVALID') !== -1 ||
        msg.indexOf('ERROR: 0:') !== -1
      ) {
        shaderErrorCount++;
      }
    }
    return origConsoleError.apply(console, arguments);
  };

  // Pre-allocated raycasting & math temporaries (0 per-frame GC allocations)
  var _raycaster = null;
  var _pointerNDC = null;
  var _groundPlane = null;
  var _planeHitPt = null;
  var _rayHits = [];
  var _pickPayload = {
    pickType: null,
    col: 0,
    row: 0,
    unitId: null,
    mirrorId: null,
    gearId: null,
    sluiceId: null
  };

  // Core Three.js & loop state
  var canvas = null;
  var hudRoot = null;
  var renderer = null;
  var scene = null;
  var camera = null;
  var hoverRingMesh = null;

  var elapsedSec = 0;
  var lastFrameMs = 0;
  var emaFrameMs = 16.67;
  var smoothFps = 60.0;
  var lastDrawCalls = 0;
  var lastTriangles = 0;
  var isRunning = false;
  var audioUnlocked = false;
  var simBuildsSceneOnLoad = false;
  var lastBuiltLevelRef = null;

  // Isometric orbital camera state
  // Default: pos (18.0, 20.2, 21.8) looking at target (0.0, -1.45, 0.0), fov 34.0
  // dx = 18.0, dy = 21.65, dz = 21.8 => dist = 35.60509, azimuth = ~0.69021 rad (~39.55 deg), pitch = ~0.65356 rad
  var DEFAULT_POS = [18.0, 20.2, 21.8];
  var DEFAULT_TARGET = [0.0, -1.45, 0.0];
  var DEFAULT_FOV = 34.0;
  var DEFAULT_DX = DEFAULT_POS[0] - DEFAULT_TARGET[0];
  var DEFAULT_DY = DEFAULT_POS[1] - DEFAULT_TARGET[1];
  var DEFAULT_DZ = DEFAULT_POS[2] - DEFAULT_TARGET[2];
  var DEFAULT_AZIMUTH = Math.atan2(DEFAULT_DX, DEFAULT_DZ);
  var DEFAULT_PITCH = Math.atan2(DEFAULT_DY, Math.hypot(DEFAULT_DX, DEFAULT_DZ));
  var DEFAULT_DIST = Math.hypot(DEFAULT_DX, DEFAULT_DY, DEFAULT_DZ);

  var camState = {
    targetX: DEFAULT_TARGET[0],
    targetY: DEFAULT_TARGET[1],
    targetZ: DEFAULT_TARGET[2],
    goalTargetX: DEFAULT_TARGET[0],
    goalTargetY: DEFAULT_TARGET[1],
    goalTargetZ: DEFAULT_TARGET[2],
    azimuth: DEFAULT_AZIMUTH,
    goalAzimuth: DEFAULT_AZIMUTH,
    pitch: DEFAULT_PITCH,
    goalPitch: DEFAULT_PITCH,
    dist: DEFAULT_DIST,
    goalDist: DEFAULT_DIST,
    minDist: 16.0,
    maxDist: 38.0,
    fov: DEFAULT_FOV,
    orbitKeyDir: 0,
    isOrbitDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartAzimuth: 0,
    dragStartPitch: 0,
    lockedPresetMode: false
  };

  // Pointer click vs drag tracking
  var pointerState = {
    down: false,
    button: -1,
    downX: 0,
    downY: 0,
    moved: false,
    insideCanvas: false
  };

  // Parsed URL flags
  var urlFlags = {
    level: null,
    bench: null,
    closeup: null,
    thumb: false,
    hudExplicit: null,
    hudVisible: true,
    needsWarmup: false
  };

  function parseUrlFlags() {
    var search = (typeof window !== 'undefined' && window.location) ? window.location.search : '';
    var params = new URLSearchParams(search || '');

    if (params.has('level')) {
      var lv = parseInt(params.get('level'), 10);
      if (lv >= 1 && lv <= 4) urlFlags.level = lv;
    }

    if (params.has('bench')) {
      var b = parseInt(params.get('bench'), 10);
      if (b >= 1 && b <= 4) urlFlags.bench = b;
    }

    if (params.has('closeup')) {
      var cu = parseInt(params.get('closeup'), 10);
      if (cu >= 1 && cu <= 6) urlFlags.closeup = cu;
    }

    var thumbVal = params.get('thumb');
    urlFlags.thumb = (thumbVal === '1' || thumbVal === 'true');

    if (params.has('hud')) {
      var hudVal = params.get('hud');
      urlFlags.hudExplicit = (hudVal !== '0' && hudVal !== 'false');
    }

    if (urlFlags.thumb) {
      urlFlags.hudVisible = false;
    } else if (urlFlags.hudExplicit !== null) {
      urlFlags.hudVisible = urlFlags.hudExplicit;
    } else if (urlFlags.bench !== null) {
      urlFlags.hudVisible = (urlFlags.bench === 4);
    } else if (urlFlags.closeup !== null) {
      urlFlags.hudVisible = (urlFlags.closeup === 6);
    } else {
      urlFlags.hudVisible = true;
    }

    urlFlags.needsWarmup = Boolean(urlFlags.thumb || urlFlags.bench !== null || urlFlags.closeup !== null);
  }

  function vecToArr(v, fallback) {
    if (!v) return fallback.slice();
    if (Array.isArray(v) && v.length >= 3) {
      return [+v[0] || 0, +v[1] || 0, +v[2] || 0];
    }
    if (typeof v === 'object' && v.x !== undefined) {
      return [+v.x || 0, +v.y || 0, +v.z || 0];
    }
    return fallback.slice();
  }

  function setCameraFromPosTarget(posArr, targetArr, fovVal, instant) {
    var px = posArr[0], py = posArr[1], pz = posArr[2];
    var tx = targetArr[0], ty = targetArr[1], tz = targetArr[2];
    var dx = px - tx;
    var dy = py - ty;
    var dz = pz - tz;
    var horiz = Math.hypot(dx, dz);
    var dist = Math.max(2.0, Math.hypot(dx, dy, dz));
    var az = (horiz > 1e-5) ? Math.atan2(dx, dz) : DEFAULT_AZIMUTH;
    var pitch = Math.atan2(dy, Math.max(1e-5, horiz));

    camState.goalTargetX = tx;
    camState.goalTargetY = ty;
    camState.goalTargetZ = tz;
    camState.goalAzimuth = az;
    camState.goalPitch = pitch;
    camState.goalDist = dist;

    if (fovVal && camera && Math.abs(camera.fov - fovVal) > 0.01) {
      camState.fov = fovVal;
      camera.fov = fovVal;
      camera.updateProjectionMatrix();
    }

    if (instant) {
      camState.targetX = tx;
      camState.targetY = ty;
      camState.targetZ = tz;
      camState.azimuth = az;
      camState.pitch = pitch;
      camState.dist = dist;
      applyCameraTransform();
    }
  }

  function applyCameraTransform() {
    if (!camera) return;
    var horiz = camState.dist * Math.cos(camState.pitch);
    var cx = camState.targetX + horiz * Math.sin(camState.azimuth);
    var cy = camState.targetY + camState.dist * Math.sin(camState.pitch);
    var cz = camState.targetZ + horiz * Math.cos(camState.azimuth);
    camera.position.set(cx, cy, cz);
    camera.lookAt(camState.targetX, camState.targetY, camState.targetZ);
  }

  function resetCamera(instant) {
    var cfgCam = (window.GAME.CONFIG && window.GAME.CONFIG.CAMERA) || {};
    var defPos = vecToArr(cfgCam.defaultPos, DEFAULT_POS);
    var defTarget = vecToArr(cfgCam.defaultTarget, DEFAULT_TARGET);
    var defFov = cfgCam.fov || DEFAULT_FOV;
    camState.lockedPresetMode = false;

    var dx = defPos[0] - defTarget[0];
    var dz = defPos[2] - defTarget[2];
    var horiz = Math.hypot(dx, dz);
    var defAz = (horiz > 1e-5) ? Math.atan2(dx, dz) : DEFAULT_AZIMUTH;

    // Normalize current azimuth near defAz (~39.5 deg) so smooth reset takes shortest arc
    var twoPi = Math.PI * 2;
    var diff = defAz - camState.azimuth;
    diff = ((diff + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
    camState.azimuth = defAz - diff;

    setCameraFromPosTarget(defPos, defTarget, defFov, Boolean(instant));
  }

  function getFallbackBenchPreset(idx) {
    switch (idx) {
      case 1:
        // Stage 1: Macro sunlit floating island, taller slate cliff, cogs, waterwheels, corner braziers & cumulus cloud sea
        return { pos: DEFAULT_POS.slice(), target: DEFAULT_TARGET.slice(), fov: DEFAULT_FOV };
      case 2:
        // Stage 2: Diamond Prism Mirrors (~39.5 deg azimuth so rot=1,3 mirrors show full 3D breadth), Golden Sunbeam 90-deg bounces & Corner Brazier
        return { pos: [12.0, 13.4, 14.8], target: [-0.2, 0.35, -0.3], fov: 31 };
      case 3:
        // Stage 3: Tactical squad close-up on Warrior/Mage/Rogue & Stone Gargoyles
        return { pos: [10.4, 11.4, 12.8], target: [-0.6, 0.38, 1.4], fov: 30 };
      case 4:
      default:
        // Stage 4: Iconic isometric gameplay view (~39.5 deg azimuth) with full Collector-Card HUD
        return { pos: DEFAULT_POS.slice(), target: DEFAULT_TARGET.slice(), fov: DEFAULT_FOV };
    }
  }

  function computeDynamicCloseupFallback(idx) {
    var cfg = window.GAME.CONFIG;
    var state = (window.GAME.Simulation && window.GAME.Simulation.getState)
      ? window.GAME.Simulation.getState()
      : null;

    if (idx === 1) {
      // 1. Warrior, Mage & Rogue chibi models on cyan-outlined tiles (dist ~ 11.8m)
      var hx = -2.5, hz = 2.5;
      if (state && state.heroes && state.heroes.length && cfg && cfg.gridToWorld) {
        var sx = 0, sz = 0, n = 0;
        for (var i = 0; i < state.heroes.length; i++) {
          var h = state.heroes[i];
          if (h && !h.defeated) {
            var wp = cfg.gridToWorld(h.col, h.row);
            sx += wp.x;
            sz += wp.z;
            n++;
          }
        }
        if (n > 0) {
          hx = sx / n;
          hz = sz / n;
        }
      }
      return { pos: [hx + 6.1, 7.2, hz + 7.4], target: [hx, 0.55, hz], fov: 28 };
    }

    if (idx === 2) {
      // 2. Stone Gargoyles on magenta-outlined tiles (dist ~ 11.5m)
      var gx = 2.5, gz = 1.5;
      if (state && state.gargoyles && state.gargoyles.length && cfg && cfg.gridToWorld) {
        var gsx = 0, gsz = 0, gn = 0;
        for (var j = 0; j < state.gargoyles.length; j++) {
          var g = state.gargoyles[j];
          if (g && !g.defeated) {
            var gwp = cfg.gridToWorld(g.col, g.row);
            gsx += gwp.x;
            gsz += gwp.z;
            gn++;
          }
        }
        if (gn > 0) {
          gx = gsx / gn;
          gz = gsz / gn;
        }
      }
      return { pos: [gx + 6.0, 7.0, gz + 7.2], target: [gx, 0.5, gz], fov: 28 };
    }

    if (idx === 3) {
      // 3. Diamond Prism Mirror & Golden Sunbeam 90-deg reflection joint (~39 deg azimuth, dist ~ 11.2m)
      var mx = 0.0, mz = -1.0;
      if (state && state.mirrors && state.mirrors.length && cfg && cfg.gridToWorld) {
        var m0 = state.mirrors[0];
        var mwp = cfg.gridToWorld(m0.col, m0.row);
        mx = mwp.x;
        mz = mwp.z;
      }
      return { pos: [mx + 5.6, 6.8, mz + 6.9], target: [mx, 0.65, mz], fov: 28 };
    }

    if (idx === 4) {
      // 4. Left-flank Bronze Cogwheels & Right-flank Wooden Waterwheel / Cliff Diorama (dist ~ 14.8m)
      return { pos: [10.0, 7.4, 14.2], target: [0.6, -2.1, 5.2], fov: 32 };
    }

    if (idx === 5) {
      // 5. Beveled Sandstone-to-Moss tile seams & Level contraption (Aqueduct / Pendulum, dist ~ 13.0m)
      return { pos: [7.5, 8.2, 9.1], target: [0.5, -0.05, 0.5], fov: 30, level: 2 };
    }

    // 6. Full 1280x720 HUD inspection view (~39.5 deg azimuth)
    return { pos: DEFAULT_POS.slice(), target: DEFAULT_TARGET.slice(), fov: DEFAULT_FOV };
  }

  function resolveInitialLevel() {
    if (urlFlags.level !== null) return urlFlags.level;

    var cfgCam = (window.GAME.CONFIG && window.GAME.CONFIG.CAMERA) || {};
    if (urlFlags.thumb && cfgCam.thumbPreset && cfgCam.thumbPreset.level >= 1 && cfgCam.thumbPreset.level <= 4) {
      return cfgCam.thumbPreset.level;
    }

    if (urlFlags.closeup !== null) {
      var cuMap = cfgCam.closeupPresets || {};
      var cuPreset = cuMap[urlFlags.closeup] || cuMap[String(urlFlags.closeup)];
      if (cuPreset && cuPreset.level >= 1 && cuPreset.level <= 4) {
        return cuPreset.level;
      }
      if (urlFlags.closeup === 5) {
        return 2; // Auto-load Level 2 Aqueduct so water channels/sluices & tile seams are inspected
      }
    }

    if (urlFlags.bench !== null) {
      var bMap = cfgCam.benchPresets || {};
      var bPreset = bMap[urlFlags.bench] || bMap[String(urlFlags.bench)];
      if (bPreset && bPreset.level >= 1 && bPreset.level <= 4) {
        return bPreset.level;
      }
    }

    return 1;
  }

  function applyUrlPresetCamera() {
    var cfgCam = (window.GAME.CONFIG && window.GAME.CONFIG.CAMERA) || {};

    if (urlFlags.thumb) {
      // Iconic 640x400 (16:10) framing synced with CONFIG.CAMERA.thumbPreset (~39.5 deg azimuth, full -5.65m tapered slate spire, top brazier & waterwheels centered)
      var rawThumb = cfgCam.thumbPreset;
      var tPos = rawThumb ? vecToArr(rawThumb.pos || rawThumb.position, DEFAULT_POS) : DEFAULT_POS.slice();
      var tTgt = rawThumb ? vecToArr(rawThumb.target || rawThumb.lookAt, DEFAULT_TARGET) : DEFAULT_TARGET.slice();
      var tFov = (rawThumb && rawThumb.fov) ? rawThumb.fov : DEFAULT_FOV;
      camState.lockedPresetMode = true;
      setCameraFromPosTarget(tPos, tTgt, tFov, true);
      return;
    }

    if (urlFlags.bench !== null) {
      var bMap = cfgCam.benchPresets || {};
      var rawBench = bMap[urlFlags.bench] || bMap[String(urlFlags.bench)];
      var fbBench = getFallbackBenchPreset(urlFlags.bench);
      var bPos = rawBench ? vecToArr(rawBench.pos || rawBench.position, fbBench.pos) : fbBench.pos;
      var bTgt = rawBench ? vecToArr(rawBench.target || rawBench.lookAt, fbBench.target) : fbBench.target;
      var bFov = (rawBench && rawBench.fov) ? rawBench.fov : fbBench.fov;
      camState.lockedPresetMode = true;
      setCameraFromPosTarget(bPos, bTgt, bFov, true);
      return;
    }

    if (urlFlags.closeup !== null) {
      var cuMap = cfgCam.closeupPresets || {};
      var rawCu = cuMap[urlFlags.closeup] || cuMap[String(urlFlags.closeup)];
      var fbCu = computeDynamicCloseupFallback(urlFlags.closeup);
      var cPos = rawCu ? vecToArr(rawCu.pos || rawCu.position, fbCu.pos) : fbCu.pos;
      var cTgt = rawCu ? vecToArr(rawCu.target || rawCu.lookAt, fbCu.target) : fbCu.target;
      var cFov = (rawCu && rawCu.fov) ? rawCu.fov : fbCu.fov;
      camState.lockedPresetMode = true;
      setCameraFromPosTarget(cPos, cTgt, cFov, true);
      return;
    }

    resetCamera(true);
    if (
      !urlFlags.needsWarmup &&
      window.GAME.HUD &&
      typeof window.GAME.HUD.isWelcomeOpen === 'function' &&
      window.GAME.HUD.isWelcomeOpen()
    ) {
      camState.goalTargetY = DEFAULT_TARGET[1] + 0.85;
      camState.targetY = camState.goalTargetY;
      camState.goalDist = DEFAULT_DIST - 2.6;
      camState.dist = camState.goalDist;
      camState.goalPitch = DEFAULT_PITCH - 0.035;
      camState.pitch = camState.goalPitch;
      applyCameraTransform();
    }
  }

  function applyHudVisibility(visible) {
    urlFlags.hudVisible = Boolean(visible);
    if (window.GAME.HUD && typeof window.GAME.HUD.setVisible === 'function') {
      window.GAME.HUD.setVisible(urlFlags.hudVisible);
    }
    if (hudRoot) {
      if (!urlFlags.hudVisible) {
        hudRoot.style.setProperty('display', 'none', 'important');
      } else {
        hudRoot.style.removeProperty('display');
      }
    }
  }

  function buildHoverRing() {
    var outerHalf = 0.91;
    var innerHalf = 0.84;
    var rOuter = 0.21;
    var rInner = 0.16;

    function makeRoundedSquarePath( targetPath, half, r ) {
      targetPath.moveTo(-half + r, -half);
      targetPath.lineTo(half - r, -half);
      targetPath.quadraticCurveTo(half, -half, half, -half + r);
      targetPath.lineTo(half, half - r);
      targetPath.quadraticCurveTo(half, half, half - r, half);
      targetPath.lineTo(-half + r, half);
      targetPath.quadraticCurveTo(-half, half, -half, half - r);
      targetPath.lineTo(-half, -half + r);
      targetPath.quadraticCurveTo(-half, -half, -half + r, -half);
    }

    var shape = new THREE.Shape();
    makeRoundedSquarePath(shape, outerHalf, rOuter);
    var hole = new THREE.Path();
    makeRoundedSquarePath(hole, innerHalf, rInner);
    shape.holes.push(hole);

    var geom = new THREE.ShapeGeometry(shape, 8);
    geom.rotateX(-Math.PI / 2);

    var mat = new THREE.MeshBasicMaterial({
      color: 0xFFF4B8,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    var mesh = new THREE.Mesh(geom, mat);
    mesh.name = 'TileHoverRing';
    mesh.visible = false;
    mesh.renderOrder = 6;
    return mesh;
  }

  function instrumentWebGLShaderChecks(gl) {
    if (!gl || gl.__sanctumWrapped) return;
    gl.__sanctumWrapped = true;

    if (typeof gl.compileShader === 'function') {
      var origCompile = gl.compileShader.bind(gl);
      gl.compileShader = function (shader) {
        origCompile(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          shaderErrorCount++;
        }
      };
    }

    if (typeof gl.linkProgram === 'function') {
      var origLink = gl.linkProgram.bind(gl);
      gl.linkProgram = function (program) {
        origLink(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          shaderErrorCount++;
        }
      };
    }
  }

  function unlockAudioOnce() {
    if (audioUnlocked && window.GAME.Audio && typeof window.GAME.Audio.isPlaying === 'function' && window.GAME.Audio.isPlaying()) {
      return;
    }
    if (window.GAME.Audio && typeof window.GAME.Audio.unlock === 'function') {
      try {
        window.GAME.Audio.unlock(true);
        if (typeof window.GAME.Audio.isPlaying === 'function' && window.GAME.Audio.isPlaying()) {
          audioUnlocked = true;
        }
      } catch (e) {
        // Ignore sandboxed autoplay blocks safely
      }
    }
  }

  function findPickUserData(obj) {
    var cur = obj;
    while (cur) {
      if (cur.userData && cur.userData.pickType) {
        return cur.userData;
      }
      cur = cur.parent;
    }
    return null;
  }

  function fillPickPayload(ud, hitPoint) {
    var cfg = window.GAME.CONFIG;
    var col = (ud.col !== undefined && ud.col !== null) ? ud.col : null;
    var row = (ud.row !== undefined && ud.row !== null) ? ud.row : null;

    if ((col === null || row === null) && hitPoint && cfg && cfg.worldToGrid) {
      var g = cfg.worldToGrid(hitPoint.x, hitPoint.z);
      if (col === null) col = g.col;
      if (row === null) row = g.row;
    }

    _pickPayload.pickType = ud.pickType;
    _pickPayload.col = col;
    _pickPayload.row = row;
    _pickPayload.unitId = ud.unitId || ud.heroId || ud.gargoyleId || ud.id || null;
    _pickPayload.mirrorId = ud.mirrorId || ud.id || null;
    _pickPayload.gearId = (ud.gearId !== undefined) ? ud.gearId : (ud.id !== undefined ? ud.id : null);
    _pickPayload.sluiceId = ud.sluiceId || ud.id || null;
    _pickPayload.delta = ud.delta;
    _pickPayload.axis = ud.axis;
    _pickPayload.index = ud.index;
    _pickPayload.targetCol = ud.targetCol;
    return _pickPayload;
  }

  function raycastBoardAtNDC(ndcX, ndcY) {
    if (!_raycaster || !camera) return null;
    _pointerNDC.set(ndcX, ndcY);
    _raycaster.setFromCamera(_pointerNDC, camera);

    var bestPriorityHit = null;
    var bestPriorityUd = null;
    var bestTileHit = null;
    var bestTileUd = null;

    // 1. Check Units (heroes & gargoyles)
    if (window.GAME.Units && typeof window.GAME.Units.getInteractivePickables === 'function') {
      var unitList = window.GAME.Units.getInteractivePickables();
      if (unitList && unitList.length) {
        _rayHits.length = 0;
        _raycaster.intersectObjects(unitList, true, _rayHits);
        for (var u = 0; u < _rayHits.length; u++) {
          var uUd = findPickUserData(_rayHits[u].object);
          if (uUd && (!bestPriorityHit || _rayHits[u].distance < bestPriorityHit.distance)) {
            bestPriorityHit = _rayHits[u];
            bestPriorityUd = uUd;
          }
        }
      }
    }

    // 2. Check Contraptions (mirrors, sluice gates, ferry levers)
    if (window.GAME.Contraptions && typeof window.GAME.Contraptions.getInteractivePickables === 'function') {
      var conList = window.GAME.Contraptions.getInteractivePickables();
      if (conList && conList.length) {
        _rayHits.length = 0;
        _raycaster.intersectObjects(conList, true, _rayHits);
        for (var c = 0; c < _rayHits.length; c++) {
          var cUd = findPickUserData(_rayHits[c].object);
          if (cUd && (!bestPriorityHit || _rayHits[c].distance < bestPriorityHit.distance)) {
            bestPriorityHit = _rayHits[c];
            bestPriorityUd = cUd;
          }
        }
      }
    }

    // 3. Check World pickables (gearKnobs, ferryLevers, tiles)
    if (window.GAME.World && typeof window.GAME.World.getInteractivePickables === 'function') {
      var worldList = window.GAME.World.getInteractivePickables();
      if (worldList && worldList.length) {
        _rayHits.length = 0;
        _raycaster.intersectObjects(worldList, true, _rayHits);
        for (var w = 0; w < _rayHits.length; w++) {
          var wUd = findPickUserData(_rayHits[w].object);
          if (!wUd) continue;
          if (wUd.pickType !== 'tile') {
            if (!bestPriorityHit || _rayHits[w].distance < bestPriorityHit.distance) {
              bestPriorityHit = _rayHits[w];
              bestPriorityUd = wUd;
            }
          } else if (!bestTileHit || _rayHits[w].distance < bestTileHit.distance) {
            bestTileHit = _rayHits[w];
            bestTileUd = wUd;
          }
        }
      }
    }

    if (bestPriorityHit && bestPriorityUd) {
      return fillPickPayload(bestPriorityUd, bestPriorityHit.point);
    }

    if (bestTileHit && bestTileUd) {
      return fillPickPayload(bestTileUd, bestTileHit.point);
    }

    // 4. Fallback Y=0 analytical grid intersection (catches thin beveled mortar seams cleanly)
    var cfg = window.GAME.CONFIG;
    if (cfg && cfg.worldToGrid && _raycaster.ray.intersectPlane(_groundPlane, _planeHitPt)) {
      var gridPos = cfg.worldToGrid(_planeHitPt.x, _planeHitPt.z);
      var gSize = cfg.GRID_SIZE || 8;
      if (gridPos.col >= 0 && gridPos.col < gSize && gridPos.row >= 0 && gridPos.row < gSize) {
        var hY = (window.GAME.World && window.GAME.World.getHeightAt)
          ? window.GAME.World.getHeightAt(_planeHitPt.x, _planeHitPt.z)
          : 0.0;
        if (hY > -5.0) {
          _pickPayload.pickType = 'tile';
          _pickPayload.col = gridPos.col;
          _pickPayload.row = gridPos.row;
          _pickPayload.unitId = null;
          _pickPayload.mirrorId = null;
          _pickPayload.gearId = null;
          _pickPayload.sluiceId = null;
          return _pickPayload;
        }
      }
    }

    return null;
  }

  function updateHoverFeedback(clientX, clientY) {
    if (
      !canvas ||
      !hoverRingMesh ||
      urlFlags.needsWarmup ||
      (window.GAME.HUD && typeof window.GAME.HUD.isWelcomeOpen === 'function' && window.GAME.HUD.isWelcomeOpen())
    ) {
      if (hoverRingMesh) hoverRingMesh.visible = false;
      if (canvas) canvas.style.cursor = camState.isOrbitDragging ? 'grabbing' : 'default';
      return;
    }

    var rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    var ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    var ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    var pick = raycastBoardAtNDC(ndcX, ndcY);
    if (!pick) {
      hoverRingMesh.visible = false;
      canvas.style.cursor = camState.isOrbitDragging ? 'grabbing' : 'default';
      return;
    }

    canvas.style.cursor = camState.isOrbitDragging ? 'grabbing' : 'pointer';

    var cfg = window.GAME.CONFIG;
    if (
      cfg &&
      cfg.gridToWorld &&
      pick.col !== null &&
      pick.col !== undefined &&
      pick.row !== null &&
      pick.row !== undefined &&
      pick.col >= 0 &&
      pick.col < (cfg.GRID_SIZE || 8) &&
      pick.row >= 0 &&
      pick.row < (cfg.GRID_SIZE || 8)
    ) {
      var wp = cfg.gridToWorld(pick.col, pick.row);
      var groundY = (window.GAME.World && window.GAME.World.getHeightAt)
        ? window.GAME.World.getHeightAt(wp.x, wp.z)
        : 0.0;
      if (groundY > -5.0) {
        hoverRingMesh.position.set(wp.x, Math.max(0.0, groundY) + 0.028, wp.z);
        hoverRingMesh.visible = true;
      } else {
        hoverRingMesh.visible = false;
      }
    } else {
      hoverRingMesh.visible = false;
    }
  }

  function isHudElementEvent(e) {
    var t = e.target;
    if (!t || t === canvas || t === document.body || t === document.documentElement) {
      return false;
    }
    if (t.id === 'canvas-container' || t.id === 'hud-root') {
      return false;
    }
    // Interactive HUD controls live inside #hud-root
    if (hudRoot && hudRoot.contains(t)) {
      var style = window.getComputedStyle(t);
      if (style && style.pointerEvents === 'none') return false;
      return true;
    }
    return false;
  }

  function bindInputEvents() {
    if (!canvas) return;

    canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    window.addEventListener('pointerdown', function (e) {
      unlockAudioOnce();
      if (isHudElementEvent(e)) return;

      pointerState.down = true;
      pointerState.button = e.button;
      pointerState.downX = e.clientX;
      pointerState.downY = e.clientY;
      pointerState.moved = false;

      if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey)) {
        camState.isOrbitDragging = true;
        camState.lockedPresetMode = false;
        camState.dragStartX = e.clientX;
        camState.dragStartY = e.clientY;
        camState.dragStartAzimuth = camState.goalAzimuth;
        camState.dragStartPitch = camState.goalPitch;
        canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('pointermove', function (e) {
      pointerState.insideCanvas = !isHudElementEvent(e);

      if (pointerState.down) {
        var dx = e.clientX - pointerState.downX;
        var dy = e.clientY - pointerState.downY;
        if (Math.hypot(dx, dy) > 5) {
          pointerState.moved = true;
        }
      }

      if (camState.isOrbitDragging) {
        var orbitDx = e.clientX - camState.dragStartX;
        var orbitDy = e.clientY - camState.dragStartY;
        camState.goalAzimuth = camState.dragStartAzimuth - orbitDx * 0.0072;
        camState.goalPitch = Math.max(0.40, Math.min(0.95, camState.dragStartPitch + orbitDy * 0.0042));
        return;
      }

      if (pointerState.insideCanvas) {
        updateHoverFeedback(e.clientX, e.clientY);
      } else if (hoverRingMesh) {
        hoverRingMesh.visible = false;
      }
    });

    window.addEventListener('pointerup', function (e) {
      if (camState.isOrbitDragging) {
        camState.isOrbitDragging = false;
        canvas.style.cursor = 'default';
      }

      if (!pointerState.down) return;
      var wasMoved = pointerState.moved;
      var btn = pointerState.button;
      pointerState.down = false;
      pointerState.button = -1;

      if (btn === 0 && !e.altKey && !wasMoved && !isHudElementEvent(e)) {
        if (window.GAME.HUD && typeof window.GAME.HUD.isWelcomeOpen === 'function' && window.GAME.HUD.isWelcomeOpen()) {
          if (typeof window.GAME.HUD.isWelcomeDrawerOpen === 'function' && window.GAME.HUD.isWelcomeDrawerOpen()) {
            window.GAME.HUD.closeWelcomeDrawer();
          }
          return;
        }
        var rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          var ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          var ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          var pick = raycastBoardAtNDC(ndcX, ndcY);
          if (pick && window.GAME.Simulation && typeof window.GAME.Simulation.handlePick === 'function') {
            window.GAME.Simulation.handlePick({
              pickType: pick.pickType,
              col: pick.col,
              row: pick.row,
              unitId: pick.unitId,
              mirrorId: pick.mirrorId,
              gearId: pick.gearId,
              sluiceId: pick.sluiceId,
              delta: pick.delta,
              axis: pick.axis,
              index: pick.index,
              targetCol: pick.targetCol
            });
          }
        }
      }
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      unlockAudioOnce();
      camState.lockedPresetMode = false;
      var zoomStep = (e.deltaY > 0 ? 1.55 : -1.55);
      camState.goalDist = Math.max(camState.minDist, Math.min(camState.maxDist, camState.goalDist + zoomStep));
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      unlockAudioOnce();
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      var key = e.key;
      var lower = key ? key.toLowerCase() : '';
      var Sim = window.GAME.Simulation;
      var Aud = window.GAME.Audio;
      var Hud = window.GAME.HUD;

      if (Hud && typeof Hud.isWelcomeOpen === 'function' && Hud.isWelcomeOpen()) {
        if (key === 'Escape') {
          if (typeof Hud.isWelcomeDrawerOpen === 'function' && Hud.isWelcomeDrawerOpen()) {
            e.preventDefault();
            Hud.closeWelcomeDrawer();
          }
          return;
        }
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          Hud.dismissWelcome(false);
          return;
        }
        if (lower === 'm') {
          if (Aud && typeof Aud.toggleMute === 'function') {
            Aud.toggleMute();
            if (Sim && Sim.getState && Hud.render) Hud.render(Sim.getState());
          }
          return;
        }
        if (key === '1' || key === '2' || key === '3' || key === '4') {
          var wLv = parseInt(key, 10);
          if (Sim && typeof Sim.loadLevel === 'function') Sim.loadLevel(wLv);
          return;
        }
        if (lower === 'q') {
          camState.lockedPresetMode = false;
          camState.orbitKeyDir = -1;
          return;
        }
        if (lower === 'e') {
          camState.lockedPresetMode = false;
          camState.orbitKeyDir = 1;
          return;
        }
        return;
      }

      if (key === 'Escape') {
        e.preventDefault();
        if (Hud && typeof Hud.openWelcome === 'function') {
          Hud.openWelcome();
        }
        return;
      }

      // Undo supports both Z and Ctrl/Cmd+Z
      if (lower === 'z') {
        e.preventDefault();
        if (Sim && typeof Sim.undo === 'function') Sim.undo();
        return;
      }

      if (e.ctrlKey || e.metaKey) return;

      if (key === '1' || key === '2' || key === '3' || key === '4') {
        var lv = parseInt(key, 10);
        if (Sim && typeof Sim.loadLevel === 'function') {
          Sim.loadLevel(lv);
          if (Hud && typeof Hud.showToast === 'function') {
            var st = Sim.getState ? Sim.getState() : null;
            var title = (st && st.levelMeta && st.levelMeta.title) ? st.levelMeta.title : ('Level ' + lv);
            Hud.showToast('Loaded ' + title, 'info');
          }
        }
        return;
      }

      if (key === 'Tab') {
        e.preventDefault();
        cycleActiveHero();
        return;
      }

      if (lower === 'q') {
        camState.lockedPresetMode = false;
        camState.orbitKeyDir = -1;
        return;
      }
      if (lower === 'e') {
        camState.lockedPresetMode = false;
        camState.orbitKeyDir = 1;
        return;
      }
      if (lower === 'c') {
        resetCamera(false);
        return;
      }

      if (lower === 'm') {
        if (Aud && typeof Aud.toggleMute === 'function') {
          var muted = Aud.toggleMute();
          if (Sim && Sim.getState && Hud && Hud.render) {
            Hud.render(Sim.getState());
          }
          if (Hud && typeof Hud.showToast === 'function') {
            Hud.showToast(muted ? 'Audio Muted' : 'Audio Unmuted', 'info');
          }
        }
        return;
      }

      if (lower === 'r') {
        if (Sim && typeof Sim.resetLevel === 'function') {
          Sim.resetLevel();
        }
        return;
      }

      if (lower === 'h') {
        triggerHint();
        return;
      }

      if (lower === 'f') {
        e.preventDefault();
        if (Sim && typeof Sim.useAstralAid === 'function') {
          Sim.useAstralAid(false);
        }
        return;
      }

      if (key === ' ' || key === 'Enter') {
        var curState = Sim && Sim.getState ? Sim.getState() : null;
        if (curState && curState.victory) {
          e.preventDefault();
          var nextLv = ((curState.levelId || 1) % 4) + 1;
          if (typeof Sim.loadLevel === 'function') Sim.loadLevel(nextLv);
        } else if (curState && curState.defeated && key === 'Enter') {
          e.preventDefault();
          if (typeof Sim.undo === 'function') Sim.undo();
        } else if (curState && !curState.victory && !curState.defeated && key === ' ') {
          e.preventDefault();
          if (typeof Sim.useAstralAid === 'function') Sim.useAstralAid(false);
        }
      }
    });

    window.addEventListener('keyup', function (e) {
      var lower = e.key ? e.key.toLowerCase() : '';
      if (lower === 'q' && camState.orbitKeyDir < 0) camState.orbitKeyDir = 0;
      if (lower === 'e' && camState.orbitKeyDir > 0) camState.orbitKeyDir = 0;
    });

    window.addEventListener('resize', handleResize);
  }

  function cycleActiveHero() {
    var Sim = window.GAME.Simulation;
    if (!Sim || typeof Sim.getState !== 'function' || typeof Sim.selectHero !== 'function') return;
    var state = Sim.getState();
    if (!state || !state.heroes || !state.heroes.length) return;

    var living = [];
    for (var i = 0; i < state.heroes.length; i++) {
      if (!state.heroes[i].defeated) living.push(state.heroes[i].id);
    }
    if (!living.length) return;

    var idx = living.indexOf(state.selectedHeroId);
    var nextId = living[(idx + 1) % living.length];
    Sim.selectHero(nextId);
  }

  function triggerHint() {
    var Sim = window.GAME.Simulation;
    if (!Sim || typeof Sim.requestHint !== 'function') return;
    Sim.requestHint();
  }

  function buildHudCallbacks() {
    function selectHero(id) {
      unlockAudioOnce();
      if (window.GAME.Simulation && typeof window.GAME.Simulation.selectHero === 'function') {
        window.GAME.Simulation.selectHero(id);
      }
    }

    function setMode(mode) {
      unlockAudioOnce();
      if (window.GAME.Simulation && typeof window.GAME.Simulation.setActionMode === 'function') {
        window.GAME.Simulation.setActionMode(mode);
      }
    }

    function loadLevel(levelId) {
      unlockAudioOnce();
      var lv = parseInt(levelId, 10);
      if (lv >= 1 && lv <= 4 && window.GAME.Simulation && typeof window.GAME.Simulation.loadLevel === 'function') {
        window.GAME.Simulation.loadLevel(lv);
      }
    }

    function nextLevel() {
      unlockAudioOnce();
      var Sim = window.GAME.Simulation;
      if (!Sim || typeof Sim.loadLevel !== 'function') return;
      var cur = Sim.getState ? Sim.getState() : null;
      var nextLv = cur && cur.levelId ? ((cur.levelId % 4) + 1) : 1;
      Sim.loadLevel(nextLv);
    }

    function endTurn() {
      unlockAudioOnce();
      if (window.GAME.Simulation && typeof window.GAME.Simulation.endTurn === 'function') {
        window.GAME.Simulation.endTurn();
      }
    }

    function undo() {
      unlockAudioOnce();
      if (window.GAME.Simulation && typeof window.GAME.Simulation.undo === 'function') {
        window.GAME.Simulation.undo();
      }
    }

    function resetLevel() {
      unlockAudioOnce();
      if (window.GAME.Simulation && typeof window.GAME.Simulation.resetLevel === 'function') {
        window.GAME.Simulation.resetLevel();
      }
    }

    function hint() {
      unlockAudioOnce();
      triggerHint();
    }

    function toggleMute() {
      unlockAudioOnce();
      var muted = false;
      if (window.GAME.Audio && typeof window.GAME.Audio.toggleMute === 'function') {
        muted = window.GAME.Audio.toggleMute();
      }
      if (window.GAME.Simulation && window.GAME.Simulation.getState && window.GAME.HUD && window.GAME.HUD.render) {
        window.GAME.HUD.render(window.GAME.Simulation.getState());
      }
      return muted;
    }

    function focusGargoyle(arg) {
      unlockAudioOnce();
      var targetId = (arg && typeof arg === 'object') ? arg.id : arg;
      if (!targetId) return;
      var Sim = window.GAME.Simulation;
      if (!Sim) return;
      var st = Sim.getState ? Sim.getState() : null;
      if (st && st.gargoyles) {
        for (var i = 0; i < st.gargoyles.length; i++) {
          var g = st.gargoyles[i];
          if (g.id === targetId) {
            if (typeof Sim.handlePick === 'function') {
              Sim.handlePick({ pickType: 'gargoyle', unitId: g.id, col: g.col, row: g.row });
            }
            break;
          }
        }
      }
    }

    function useAstralAid() {
      unlockAudioOnce();
      if (window.GAME.Simulation && typeof window.GAME.Simulation.useAstralAid === 'function') {
        window.GAME.Simulation.useAstralAid(false);
      }
    }

    return {
      // Canonical names + common aliases so HUD glue is 100% seamless
      onSelectHero: selectHero,
      selectHero: selectHero,
      onUseAstralAid: useAstralAid,
      useAstralAid: useAstralAid,
      onActionMode: setMode,
      onSetActionMode: setMode,
      setActionMode: setMode,
      onMove: function () { setMode('move'); },
      onRotateMirror: function () { setMode('rotateMirror'); },
      onShiftGear: function () { setMode('shiftGear'); },
      onAbility: function () { setMode('ability'); },
      onSelectLevel: loadLevel,
      onLoadLevel: loadLevel,
      loadLevel: loadLevel,
      onNextLevel: nextLevel,
      nextLevel: nextLevel,
      onEndTurn: endTurn,
      endTurn: endTurn,
      onUndo: undo,
      undo: undo,
      onReset: resetLevel,
      onResetLevel: resetLevel,
      onReplay: resetLevel,
      resetLevel: resetLevel,
      onHint: hint,
      requestHint: hint,
      onToggleMute: toggleMute,
      toggleMute: toggleMute,
      onSelectGargoyle: focusGargoyle,
      onFocusGargoyle: focusGargoyle,
      onInspectGargoyle: focusGargoyle,
      onResetCamera: function () { resetCamera(false); }
    };
  }

  function syncSceneToState(state, animateChanges) {
    if (!state) return;

    if (window.GAME.Audio && typeof window.GAME.Audio.setLevel === 'function' && state.levelId) {
      window.GAME.Audio.setLevel(state.levelId);
    }

    // If Simulation.loadLevel did not rebuild 3D level geometry itself, rebuild when level object changes
    if (!simBuildsSceneOnLoad) {
      var levelRef = state.tiles || state.levelId;
      if (levelRef !== lastBuiltLevelRef) {
        lastBuiltLevelRef = levelRef;
        if (window.GAME.World && typeof window.GAME.World.buildLevel === 'function') {
          window.GAME.World.buildLevel(state);
        }
        if (window.GAME.Contraptions && typeof window.GAME.Contraptions.buildLevel === 'function') {
          window.GAME.Contraptions.buildLevel(state);
        }
        if (window.GAME.Units && typeof window.GAME.Units.buildLevel === 'function') {
          window.GAME.Units.buildLevel(state);
        }
      }
    }

    if (window.GAME.World && typeof window.GAME.World.syncTiles === 'function') {
      window.GAME.World.syncTiles(state);
    }
    if (window.GAME.Contraptions && typeof window.GAME.Contraptions.syncFromState === 'function') {
      window.GAME.Contraptions.syncFromState(state, Boolean(animateChanges));
    }
    if (window.GAME.Units && typeof window.GAME.Units.syncFromState === 'function') {
      window.GAME.Units.syncFromState(state);
    }
    if (window.GAME.World && typeof window.GAME.World.setTileHighlights === 'function') {
      window.GAME.World.setTileHighlights(state.validHighlights || []);
    }
    if (window.GAME.HUD && typeof window.GAME.HUD.render === 'function') {
      window.GAME.HUD.render(state);
    }
    applyHudVisibility(urlFlags.hudVisible);
  }

  function handleResize() {
    if (!renderer || !camera) return;
    var w = Math.max(1, window.innerWidth || 1280);
    var h = Math.max(1, window.innerHeight || 720);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (window.GAME.VfxPost && typeof window.GAME.VfxPost.resize === 'function') {
      window.GAME.VfxPost.resize(w, h);
    }
  }

  function updateCameraControls(dt) {
    if (camState.orbitKeyDir !== 0) {
      camState.goalAzimuth += camState.orbitKeyDir * 1.45 * dt;
    } else if (
      !urlFlags.needsWarmup &&
      !camState.lockedPresetMode &&
      !camState.isOrbitDragging &&
      window.GAME.HUD &&
      typeof window.GAME.HUD.isWelcomeOpen === 'function' &&
      window.GAME.HUD.isWelcomeOpen()
    ) {
      camState.goalAzimuth = DEFAULT_AZIMUTH + Math.sin(elapsedSec * 0.30) * 0.16;
      camState.goalPitch = DEFAULT_PITCH - 0.035 + Math.sin(elapsedSec * 0.22) * 0.018;
      camState.goalDist = DEFAULT_DIST - 2.6 + Math.sin(elapsedSec * 0.24) * 0.45;
      camState.goalTargetX = DEFAULT_TARGET[0];
      camState.goalTargetY = DEFAULT_TARGET[1] + 0.85;
      camState.goalTargetZ = DEFAULT_TARGET[2];
    }

    var alpha = 1.0 - Math.exp(-12.0 * dt);
    camState.azimuth += (camState.goalAzimuth - camState.azimuth) * alpha;
    camState.pitch += (camState.goalPitch - camState.pitch) * alpha;
    camState.dist += (camState.goalDist - camState.dist) * alpha;
    camState.targetX += (camState.goalTargetX - camState.targetX) * alpha;
    camState.targetY += (camState.goalTargetY - camState.targetY) * alpha;
    camState.targetZ += (camState.goalTargetZ - camState.targetZ) * alpha;

    applyCameraTransform();
  }

  function stepModules(dt) {
    elapsedSec += dt;
    updateCameraControls(dt);

    if (hoverRingMesh && hoverRingMesh.visible && hoverRingMesh.material) {
      hoverRingMesh.material.opacity = 0.46 + 0.16 * Math.sin(elapsedSec * 5.0);
    }

    if (window.GAME.Simulation && typeof window.GAME.Simulation.update === 'function') {
      window.GAME.Simulation.update(dt, elapsedSec);
    }
    if (window.GAME.World && typeof window.GAME.World.update === 'function') {
      window.GAME.World.update(dt, elapsedSec);
    }
    if (window.GAME.Contraptions && typeof window.GAME.Contraptions.update === 'function') {
      window.GAME.Contraptions.update(dt, elapsedSec);
    }
    if (window.GAME.Units && typeof window.GAME.Units.update === 'function') {
      window.GAME.Units.update(dt, elapsedSec);
    }
  }

  function renderFrame(dt) {
    if (!renderer || !scene || !camera) return;

    if (renderer.info && renderer.info.autoReset === false) {
      renderer.info.reset();
    }

    if (window.GAME.VfxPost && typeof window.GAME.VfxPost.render === 'function') {
      window.GAME.VfxPost.render(dt, elapsedSec);
    } else {
      renderer.render(scene, camera);
    }

    if (renderer.info && renderer.info.render) {
      lastDrawCalls = renderer.info.render.calls || 0;
      lastTriangles = renderer.info.render.triangles || 0;
    }
  }

  function onAnimationFrame(nowMs) {
    if (!isRunning) return;
    requestAnimationFrame(onAnimationFrame);

    if (lastFrameMs === 0) lastFrameMs = nowMs;
    var rawDtMs = nowMs - lastFrameMs;
    lastFrameMs = nowMs;

    if (rawDtMs > 0.1 && rawDtMs < 250.0) {
      emaFrameMs = emaFrameMs * 0.88 + rawDtMs * 0.12;
      smoothFps = 1000.0 / Math.max(1.0, emaFrameMs);
    }

    var dt = Math.min(Math.max(rawDtMs * 0.001, 1.0 / 240.0), 0.05);
    stepModules(dt);
    renderFrame(dt);
  }

  function getPerfReport() {
    var extraShaderErrs = 0;
    if (!_inPerfReport && window.GAME.VfxPost && typeof window.GAME.VfxPost.getHealthReport === 'function') {
      _inPerfReport = true;
      try {
        var vfxHealth = window.GAME.VfxPost.getHealthReport();
        if (vfxHealth && vfxHealth.shaderErrors) {
          extraShaderErrs = vfxHealth.shaderErrors;
        }
      } finally {
        _inPerfReport = false;
      }
    }
    var totalShaderErrs = Math.max(shaderErrorCount, extraShaderErrs);

    var mem = (renderer && renderer.info && renderer.info.memory) ? renderer.info.memory : {};
    var progs = (renderer && renderer.info && renderer.info.programs) ? renderer.info.programs.length : 0;

    return {
      fps: +smoothFps.toFixed(1),
      frameTimeMs: +emaFrameMs.toFixed(2),
      drawCalls: lastDrawCalls,
      triangles: lastTriangles,
      geometries: mem.geometries || 0,
      textures: mem.textures || 0,
      programs: progs,
      startupMs: startupMs,
      shaderErrors: totalShaderErrs
    };
  }

  function ensureGameTestHooks() {
    window.GAME_TEST = window.GAME_TEST || {};

    if (typeof window.GAME_TEST.runAllSolutions === 'function' && !window.GAME_TEST.__welcomeWrapped) {
      var origRunAll = window.GAME_TEST.runAllSolutions;
      window.GAME_TEST.runAllSolutions = function () {
        if (window.GAME.HUD && typeof window.GAME.HUD.dismissWelcome === 'function') {
          window.GAME.HUD.dismissWelcome(true);
        }
        return origRunAll.apply(this, arguments);
      };
      window.GAME_TEST.__welcomeWrapped = true;
    }

    window.GAME_TEST.stepPhysics = function (dt, numFrames) {
      var stepDt = dt || (1 / 60);
      var count = (numFrames !== undefined && numFrames !== null) ? numFrames : 1;
      for (var i = 0; i < count; i++) {
        stepModules(stepDt);
      }
      renderFrame(stepDt);
      return true;
    };
  }

  function init() {
    if (typeof THREE === 'undefined') {
      origConsoleError('Clockwork Sanctum: THREE is not loaded.');
      return;
    }

    parseUrlFlags();
    if (window.GAME.Audio && typeof window.GAME.Audio.init === 'function') {
      window.GAME.Audio.init();
    }

    canvas = document.getElementById('game-canvas') || document.querySelector('canvas');
    hudRoot = document.getElementById('hud-root');

    _raycaster = new THREE.Raycaster();
    _pointerNDC = new THREE.Vector2();
    _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    _planeHitPt = new THREE.Vector3();

    var width = Math.max(1, window.innerWidth || 1280);
    var height = Math.max(1, window.innerHeight || 720);
    var cfgCam = (window.GAME.CONFIG && window.GAME.CONFIG.CAMERA) || {};
    camState.minDist = cfgCam.minDistance || 16.0;
    camState.maxDist = Math.max(38.0, cfgCam.maxDistance || 38.0);
    var initFov = cfgCam.fov || DEFAULT_FOV;
    var initNear = cfgCam.near || 0.2;
    var initFar = Math.max(220, cfgCam.far || 260);

    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    instrumentWebGLShaderChecks(renderer.getContext());

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(initFov, width / height, initNear, initFar);
    resetCamera(true);

    // Expose core Three.js references & telemetry hooks
    window.GAME.renderer = renderer;
    window.GAME.scene = scene;
    window.GAME.camera = camera;
    window.GAME_PERF = {
      getReport: getPerfReport
    };

    // Ordered module initialization per CONTRACT.md:
    // Textures -> VfxPost -> World -> Contraptions -> Units -> Audio -> HUD -> Simulation
    if (window.GAME.Textures && typeof window.GAME.Textures.init === 'function') {
      window.GAME.Textures.init();
    }
    if (window.GAME.VfxPost && typeof window.GAME.VfxPost.init === 'function') {
      window.GAME.VfxPost.init(renderer, scene, camera);
    }
    if (window.GAME.World && typeof window.GAME.World.init === 'function') {
      window.GAME.World.init(scene);
    }
    if (window.GAME.Contraptions && typeof window.GAME.Contraptions.init === 'function') {
      window.GAME.Contraptions.init(scene);
    }
    if (window.GAME.Units && typeof window.GAME.Units.init === 'function') {
      window.GAME.Units.init(scene);
    }
    if (window.GAME.Audio && typeof window.GAME.Audio.init === 'function') {
      window.GAME.Audio.init();
    }
    if (window.GAME.HUD && typeof window.GAME.HUD.init === 'function') {
      window.GAME.HUD.init(buildHudCallbacks());
    }

    hoverRingMesh = buildHoverRing();
    scene.add(hoverRingMesh);

    var startLevel = resolveInitialLevel();
    var initChangeFired = false;

    if (window.GAME.Simulation) {
      if (typeof window.GAME.Simulation.init === 'function') {
        window.GAME.Simulation.init(startLevel);
      }

      // Detect whether Simulation.init / loadLevel already called World/Contraptions/Units.buildLevel
      var worldPicks = (window.GAME.World && window.GAME.World.getInteractivePickables)
        ? window.GAME.World.getInteractivePickables()
        : [];
      var unitPicks = (window.GAME.Units && window.GAME.Units.getInteractivePickables)
        ? window.GAME.Units.getInteractivePickables()
        : [];
      simBuildsSceneOnLoad = Boolean(worldPicks && worldPicks.length > 0 && unitPicks && unitPicks.length > 0);

      if (typeof window.GAME.Simulation.onChange === 'function') {
        window.GAME.Simulation.onChange(function (state) {
          initChangeFired = true;
          syncSceneToState(state, true);
        });
      }

      if (!initChangeFired && typeof window.GAME.Simulation.getState === 'function') {
        syncSceneToState(window.GAME.Simulation.getState(), false);
      }
    }

    ensureGameTestHooks();
    applyHudVisibility(urlFlags.hudVisible);
    applyUrlPresetCamera();
    bindInputEvents();

    var bootNow = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    startupMs = Math.round(bootNow - bootT0);

    // Step warmup frames unconditionally (2 on standard boot, 60 on ?thumb=1 / ?bench=1..4 / ?closeup=1..6),
    // render Frame 1 to compile/upload GPU prewarm pools and fire onAfterRender auto-hide,
    // then render steady-state Frame 2 so renderer.info.render.calls immediately reflects runtime drawCalls (<= 349 < 480)
    var warmDt = 1.0 / 60.0;
    var warmCount = urlFlags.needsWarmup ? 60 : 2;
    for (var w = 0; w < warmCount; w++) {
      stepModules(warmDt);
    }
    renderFrame(warmDt);
    stepModules(warmDt);
    renderFrame(warmDt);

    isRunning = true;
    requestAnimationFrame(onAnimationFrame);
  }

  var Main = {
    init: init,
    resetCamera: resetCamera,
    setHudVisible: applyHudVisibility,
    stepFrame: function (dt) {
      var d = dt || (1 / 60);
      stepModules(d);
      renderFrame(d);
    }
  };

  window.GAME.Main = Main;

  const scheduleBoot = () => {
    const deferFn = (typeof window !== 'undefined' && window.__nativeSetTimeout) || setTimeout;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => deferFn(init, 0));
    } else {
      deferFn(init, 0);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleBoot);
  } else {
    scheduleBoot();
  }
})();

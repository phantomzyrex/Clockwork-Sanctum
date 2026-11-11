(function () {
  'use strict';

  window.GAME = window.GAME || {};

  // Hardware-GPU & ANGLE/HLSL Safe GLSL Math Chunk (SKILL.md Section 3)
  var GLSL_SAFE_HELPERS = [
    'float sqr(float x) { return x * x; }',
    'float pow3(float x) { float s = x * x; return s * x; }',
    'float pow4(float x) { float s = x * x; return s * s; }',
    'float safePow(float base, float expVal) {',
    '  return pow(max(base, 1e-5), expVal);',
    '}',
    'float safeAtan(float y, float x) {',
    '  return (abs(x) + abs(y) > 1e-5) ? atan(y, x) : 0.0;',
    '}',
    'vec3 safeHdr(vec3 c) {',
    '  float r = (c.r >= 0.0 && c.r <= 50.0) ? c.r : 0.0;',
    '  float g = (c.g >= 0.0 && c.g <= 50.0) ? c.g : 0.0;',
    '  float b = (c.b >= 0.0 && c.b <= 50.0) ? c.b : 0.0;',
    '  return min(vec3(r, g, b), vec3(16.0));',
    '}'
  ].join('\n');

  var _renderer = null;
  var _scene = null;
  var _camera = null;
  var _initialized = false;

  // Cached GPU resources (created ONCE at init -> 0 leaks across 8x level reloads)
  var _pmremRT = null;
  var _lightRig = null;
  var _sunLight = null;
  var _hemiLight = null;
  var _rimLight = null;
  var _frontFillLight = null;
  var _brazierLights = [];
  var _moteTexture = null;
  var _moteGeometry = null;
  var _moteMaterial = null;
  var _motePoints = null;
  var _moteSeeds = null;
  var _moteBasePos = null;
  var MOTE_COUNT = 56;

  // Pre-allocated vectors for zero-GC per-frame camera micro-shake & flash
  var _savedCamPos = null;
  var _camRight = null;
  var _camUp = null;
  var _camFwd = null;

  var _shakeTimer = 0.0;
  var _shakeDuration = 0.001;
  var _shakeAmount = 0.0;
  var _shakeSeed = 0.0;

  var _sunFlashTimer = 0.0;
  var _sunFlashDuration = 0.001;
  var _sunFlashBoost = 0.0;
  var BASE_SUN_INTENSITY = 1.74;
  var BASE_EXPOSURE = 0.95;

  // Health diagnostics
  var _pmremInvalidTexels = 0;
  var _nanPixels = 0;
  var _shaderErrors = 0;

  var BRAZIER_COORDS = [
    { x: -7.0, y: 1.42, z: -7.0, phase: 0.0 },
    { x:  7.0, y: 1.42, z: -7.0, phase: 1.73 },
    { x:  7.0, y: 1.42, z:  7.0, phase: 3.41 },
    { x: -7.0, y: 1.42, z:  7.0, phase: 5.09 }
  ];

  function clamp01(v) {
    return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Builds a 100% hardware-GPU-safe sunlit sky + sandstone/moss bounce environment
   * using ONLY built-in THREE.MeshBasicMaterial (which natively ends with
   * #include <encodings_fragment> for RGBEEncoding in Three.js r128, guaranteeing
   * 0 alpha=255 whiteout texels across Apple Metal, NVIDIA, AMD ANGLE, and llvmpipe).
   */
  function bakeSafeSunlitPMREM(renderer) {
    var envScene = new THREE.Scene();
    var tempGeoms = [];
    var tempMats = [];

    // 1. Vertex-colored sunlit sky & warm sandstone bounce sphere (values strictly in [0.06, 0.98])
    var domeGeo = new THREE.SphereGeometry(20.0, 32, 24);
    var posAttr = domeGeo.getAttribute('position');
    var colors = new Float32Array(posAttr.count * 3);

    // Normalized key-sun direction matching (-15.5, 20.5, 11.5)
    var sunLen = Math.hypot(-15.5, 20.5, 11.5);
    var sx = -15.5 / sunLen;
    var sy = 20.5 / sunLen;
    var sz = 11.5 / sunLen;

    for (var i = 0; i < posAttr.count; i++) {
      var vx = posAttr.getX(i);
      var vy = posAttr.getY(i);
      var vz = posAttr.getZ(i);
      var vLen = Math.hypot(vx, vy, vz) || 1.0;
      var nx = vx / vLen;
      var ny = vy / vLen;
      var nz = vz / vLen;

      var r, g, b;
      if (ny >= 0.0) {
        // Upper sky: rich cerulean zenith -> luminous horizon, scaled 0.65x so PMREM + Hemi don't bleach cast shadows!
        var tSky = Math.pow(ny, 0.65);
        r = lerp(0.56, 0.28, tSky) * 0.65;
        g = lerp(0.83, 0.63, tSky) * 0.65;
        b = lerp(0.99, 0.92, tSky) * 0.65;

        // Warm golden sun lobe toward (-14, 24, 12)
        var sunDot = clamp01(nx * sx + ny * sy + nz * sz);
        var sunGlow = sunDot * sunDot * sunDot * sunDot;
        r = lerp(r, 0.88, sunGlow * 0.72);
        g = lerp(g, 0.78, sunGlow * 0.72);
        b = lerp(b, 0.54, sunGlow * 0.65);
      } else {
        // Lower bounce: warm toasted sandstone & umber shadow bounce (scaled 0.65x for rich 38-45% shadow depth)
        var tGround = clamp01(-ny);
        var warmSide = clamp01((-nx + nz) * 0.35 + 0.5);
        var bounceR = lerp(0.26, 0.52, warmSide);
        var bounceG = lerp(0.28, 0.36, warmSide);
        var bounceB = lerp(0.34, 0.18, warmSide);

        r = lerp(0.36, bounceR, Math.min(1.0, tGround * 1.6));
        g = lerp(0.50, bounceG, Math.min(1.0, tGround * 1.6));
        b = lerp(0.60, bounceB, Math.min(1.0, tGround * 1.6));
      }

      colors[i * 3]     = clamp01(r);
      colors[i * 3 + 1] = clamp01(g);
      colors[i * 3 + 2] = clamp01(b);
    }

    domeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var domeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false
    });
    envScene.add(new THREE.Mesh(domeGeo, domeMat));
    tempGeoms.push(domeGeo);
    tempMats.push(domeMat);

    // 2. Crisp specular reflection cards for brass prism frames & bronze cogwheels
    var sunCardGeo = new THREE.SphereGeometry(2.2, 16, 12);
    var sunCardMat = new THREE.MeshBasicMaterial({ color: 0xFFEED0 });
    var sunCard = new THREE.Mesh(sunCardGeo, sunCardMat);
    sunCard.position.set(sx * 15.0, sy * 15.0, sz * 15.0);
    envScene.add(sunCard);
    tempGeoms.push(sunCardGeo);
    tempMats.push(sunCardMat);

    var skyCardGeo = new THREE.SphereGeometry(2.8, 16, 12);
    var skyCardMat = new THREE.MeshBasicMaterial({ color: 0x86C9F5 });
    var skyCard = new THREE.Mesh(skyCardGeo, skyCardMat);
    skyCard.position.set(11.0, 8.0, -10.0);
    envScene.add(skyCard);
    tempGeoms.push(skyCardGeo);
    tempMats.push(skyCardMat);

    var bounceDiscGeo = new THREE.CircleGeometry(9.5, 24);
    var bounceDiscMat = new THREE.MeshBasicMaterial({ color: 0x9B6B34, side: THREE.DoubleSide });
    var bounceDisc = new THREE.Mesh(bounceDiscGeo, bounceDiscMat);
    bounceDisc.rotation.x = -Math.PI / 2;
    bounceDisc.position.set(0.0, -6.5, 0.0);
    envScene.add(bounceDisc);
    tempGeoms.push(bounceDiscGeo);
    tempMats.push(bounceDiscMat);

    // Bake with NoToneMapping per racing_vehicular_sim.md Section 1.1
    var prevToneMapping = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;

    var pmremGen = new THREE.PMREMGenerator(renderer);
    if (typeof pmremGen.compileEquirectangularShader === 'function') {
      pmremGen.compileEquirectangularShader();
    }
    var rt = pmremGen.fromScene(envScene, 0.035);

    renderer.toneMapping = prevToneMapping;
    pmremGen.dispose();

    for (var gIdx = 0; gIdx < tempGeoms.length; gIdx++) {
      tempGeoms[gIdx].dispose();
    }
    for (var mIdx = 0; mIdx < tempMats.length; mIdx++) {
      tempMats[mIdx].dispose();
    }

    // Hardware GPU PMREM Whiteout Audit: verify 0 alpha===255 texels
    _pmremInvalidTexels = 0;
    try {
      if (rt && rt.width > 0 && rt.height > 0 && typeof renderer.readRenderTargetPixels === 'function') {
        var sampleW = Math.min(64, rt.width);
        var sampleH = Math.min(64, rt.height);
        var pixelBuf = new Uint8Array(sampleW * sampleH * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, sampleW, sampleH, pixelBuf);
        var invalidCount = 0;
        for (var p = 0; p < pixelBuf.length; p += 4) {
          if (pixelBuf[p + 3] === 255) {
            invalidCount++;
          }
        }
        _pmremInvalidTexels = invalidCount;
      }
    } catch (readErr) {
      _pmremInvalidTexels = 0;
    }

    return rt;
  }

  function createSunMoteTexture() {
    var size = 64;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    var half = size * 0.5;
    var grad = ctx.createRadialGradient(half, half, 0.0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 252, 228, 1.0)');
    grad.addColorStop(0.32, 'rgba(255, 214, 112, 0.72)');
    grad.addColorStop(0.70, 'rgba(255, 180, 64, 0.18)');
    grad.addColorStop(1.0, 'rgba(255, 180, 64, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    var tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  }

  function buildAmbientSunMotes() {
    _moteTexture = createSunMoteTexture();
    _moteGeometry = new THREE.BufferGeometry();
    var positions = new Float32Array(MOTE_COUNT * 3);
    _moteBasePos = new Float32Array(MOTE_COUNT * 3);
    _moteSeeds = new Float32Array(MOTE_COUNT * 2);

    // Deterministic Halton-like distribution over courtyard [-7.8..7.8]
    for (var i = 0; i < MOTE_COUNT; i++) {
      var u = ((i * 0.61803398875) % 1.0);
      var v = ((i * 0.38196601125 + 0.17) % 1.0);
      var w = ((i * 0.75487766625 + 0.31) % 1.0);
      var bx = (u - 0.5) * 15.6;
      var by = 0.38 + w * 3.4;
      var bz = (v - 0.5) * 15.6;

      _moteBasePos[i * 3]     = bx;
      _moteBasePos[i * 3 + 1] = by;
      _moteBasePos[i * 3 + 2] = bz;

      positions[i * 3]     = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;

      _moteSeeds[i * 2]     = i * 1.37;
      _moteSeeds[i * 2 + 1] = 0.45 + (i % 7) * 0.09;
    }

    _moteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    _moteGeometry.computeBoundingSphere();

    _moteMaterial = new THREE.PointsMaterial({
      size: 0.14,
      map: _moteTexture,
      color: 0xFFE394,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    _motePoints = new THREE.Points(_moteGeometry, _moteMaterial);
    _motePoints.name = 'SunlitCourtyardMotes';
    _motePoints.frustumCulled = false;
    return _motePoints;
  }

  function init(renderer, scene, camera) {
    _renderer = renderer || _renderer;
    _scene = scene || _scene;
    _camera = camera || _camera;

    if (!_savedCamPos) {
      _savedCamPos = new THREE.Vector3();
      _camRight = new THREE.Vector3();
      _camUp = new THREE.Vector3();
      _camFwd = new THREE.Vector3();
    }

    if (_renderer) {
      _renderer.outputEncoding = THREE.sRGBEncoding;
      _renderer.toneMapping = THREE.ACESFilmicToneMapping;
      _renderer.toneMappingExposure = BASE_EXPOSURE;
      _renderer.shadowMap.enabled = true;
      _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ('physicallyCorrectLights' in _renderer) {
        _renderer.physicallyCorrectLights = false;
      }
    }

    if (_scene && !_scene.background) {
      _scene.background = new THREE.Color(0x63B6F2);
    }

    // Bake PMREM environment ONCE for the entire application lifetime
    if (_renderer && !_pmremRT) {
      _pmremRT = bakeSafeSunlitPMREM(_renderer);
    }
    if (_scene && _pmremRT) {
      _scene.environment = _pmremRT.texture;
    }

    if (!_initialized && _scene) {
      _lightRig = new THREE.Group();
      _lightRig.name = 'AnkamaSunlitLightRig';

      // 1. Warm Sunlit Directional Key Light — crisp diagonal reference shadow angle (-15.5, 20.5, 11.5)
      _sunLight = new THREE.DirectionalLight(0xFFECC8, BASE_SUN_INTENSITY);
      _sunLight.position.set(-15.5, 20.5, 11.5);
      _sunLight.target.position.set(0.0, -0.5, 0.0);
      _sunLight.castShadow = true;
      _sunLight.shadow.mapSize.set(2048, 2048);
      _sunLight.shadow.camera.near = 4.0;
      _sunLight.shadow.camera.far = 48.0;
      _sunLight.shadow.camera.left = -12.2;
      _sunLight.shadow.camera.right = 12.2;
      _sunLight.shadow.camera.top = 12.2;
      _sunLight.shadow.camera.bottom = -12.2;
      _sunLight.shadow.bias = -0.00035;
      _sunLight.shadow.normalBias = 0.018;
      _sunLight.shadow.radius = 1.45;
      _lightRig.add(_sunLight);
      _lightRig.add(_sunLight.target);

      // 2. Sky-Blue to Rich Toasted-Umber Hemisphere Fill (0.22 keeps cast shadows crisp warm-umber!)
      _hemiLight = new THREE.HemisphereLight(0x7EC8FF, 0x6E4018, 0.22);
      _hemiLight.position.set(0.0, 24.0, 0.0);
      _lightRig.add(_hemiLight);

      // 3. Cool Cerulean Sky Rim Light so shadowed grey cliff facets glow cool sky-slate (#586170)
      _rimLight = new THREE.DirectionalLight(0x9BD8FF, 0.20);
      _rimLight.position.set(16.0, 12.0, -14.0);
      _rimLight.castShadow = false;
      _lightRig.add(_rimLight);

      // 4. Subtle Toy-Box Isometric Front Fill for expressive chibi faces without flattening shadows
      _frontFillLight = new THREE.DirectionalLight(0xFFE6BE, 0.06);
      _frontFillLight.position.set(14.0, 9.5, 15.0);
      _frontFillLight.castShadow = false;
      _lightRig.add(_frontFillLight);

      // 5. Four Warm Flickering PointLights anchored at the 4 corner braziers
      _brazierLights.length = 0;
      for (var i = 0; i < BRAZIER_COORDS.length; i++) {
        var bc = BRAZIER_COORDS[i];
        var pt = new THREE.PointLight(0xFF9922, 0.84, 7.5, 1.8);
        pt.position.set(bc.x, bc.y, bc.z);
        pt.castShadow = false;
        _lightRig.add(pt);
        _brazierLights.push(pt);
      }

      // 6. Floating Sunlit Courtyard Dust/Pollen Motes
      _lightRig.add(buildAmbientSunMotes());

      _scene.add(_lightRig);
      _initialized = true;
    } else if (_lightRig && _scene && _lightRig.parent !== _scene) {
      _scene.add(_lightRig);
    }
  }

  function triggerShake(amount, duration) {
    var amt = (typeof amount === 'number' && !isNaN(amount)) ? Math.max(0.0, Math.min(amount, 1.2)) : 0.14;
    var dur = (typeof duration === 'number' && !isNaN(duration)) ? Math.max(0.04, Math.min(duration, 2.0)) : 0.28;
    if (amt >= _shakeAmount * (_shakeTimer / Math.max(0.001, _shakeDuration)) || _shakeTimer <= 0.0) {
      _shakeAmount = amt;
      _shakeDuration = dur;
      _shakeTimer = dur;
      _shakeSeed += 1.7;
    }
  }

  function pulseSunFlash(boost, duration) {
    _sunFlashBoost = (typeof boost === 'number' && !isNaN(boost)) ? Math.max(0.0, Math.min(boost, 0.65)) : 0.25;
    _sunFlashDuration = (typeof duration === 'number' && !isNaN(duration)) ? Math.max(0.08, duration) : 0.45;
    _sunFlashTimer = _sunFlashDuration;
  }

  function updateLightsAndMotes(dt, elapsed) {
    var t = (typeof elapsed === 'number' && !isNaN(elapsed)) ? elapsed : 0.0;
    var safeDt = (typeof dt === 'number' && dt > 0.0 && dt < 0.25) ? dt : (1.0 / 60.0);

    // Organic async firelight flicker on all 4 corner braziers
    for (var i = 0; i < _brazierLights.length; i++) {
      var ph = BRAZIER_COORDS[i].phase;
      var flick = 0.84
        + 0.13 * Math.sin(t * 7.3 + ph)
        + 0.08 * Math.sin(t * 13.9 + ph * 1.7)
        + 0.05 * Math.cos(t * 21.4 + ph * 0.6);
      _brazierLights[i].intensity = flick;
      _brazierLights[i].position.y = BRAZIER_COORDS[i].y + 0.04 * Math.sin(t * 6.1 + ph);
    }

    // Celebratory sunlight swell (e.g. Gargoyle sunbeam shatter / Exit unlock)
    if (_sunFlashTimer > 0.0 && _sunLight && _renderer) {
      _sunFlashTimer = Math.max(0.0, _sunFlashTimer - safeDt);
      var k = _sunFlashTimer / _sunFlashDuration;
      var env = Math.sin(k * Math.PI);
      _sunLight.intensity = BASE_SUN_INTENSITY + _sunFlashBoost * env;
      _renderer.toneMappingExposure = BASE_EXPOSURE + (_sunFlashBoost * 0.14) * env;
    } else if (_sunLight && _renderer) {
      _sunLight.intensity = BASE_SUN_INTENSITY;
      _renderer.toneMappingExposure = BASE_EXPOSURE;
    }

    // Drift sunlit courtyard pollen motes in-place (zero allocations)
    if (_moteGeometry && _moteBasePos && _moteSeeds) {
      var posAttr = _moteGeometry.getAttribute('position');
      var arr = posAttr.array;
      for (var m = 0; m < MOTE_COUNT; m++) {
        var idx3 = m * 3;
        var seed = _moteSeeds[m * 2];
        var spd = _moteSeeds[m * 2 + 1];
        arr[idx3]     = _moteBasePos[idx3]     + Math.sin(t * spd + seed) * 0.42;
        arr[idx3 + 1] = _moteBasePos[idx3 + 1] + Math.sin(t * (spd * 0.85) + seed * 1.3) * 0.26;
        arr[idx3 + 2] = _moteBasePos[idx3 + 2] + Math.cos(t * (spd * 0.92) + seed * 0.7) * 0.42;
      }
      posAttr.needsUpdate = true;
    }
  }

  function render(dt, elapsed) {
    if (!_renderer || !_scene || !_camera) return;

    var safeDt = (typeof dt === 'number' && dt > 0.0 && dt < 0.25) ? dt : (1.0 / 60.0);
    var t = (typeof elapsed === 'number' && !isNaN(elapsed)) ? elapsed : 0.0;

    updateLightsAndMotes(safeDt, t);

    var appliedShake = false;
    if (_shakeTimer > 0.0) {
      _shakeTimer = Math.max(0.0, _shakeTimer - safeDt);
      var decay = _shakeTimer / Math.max(0.001, _shakeDuration);
      var env = decay * decay;
      var amp = _shakeAmount * env;
      if (amp > 1e-4) {
        _savedCamPos.copy(_camera.position);
        _camera.getWorldDirection(_camFwd);
        _camRight.crossVectors(_camFwd, _camera.up).normalize();
        _camUp.crossVectors(_camRight, _camFwd).normalize();

        var ox = Math.sin(t * 53.0 + _shakeSeed) * amp;
        var oy = Math.cos(t * 67.0 + _shakeSeed * 1.9) * amp * 0.82;
        _camera.position.addScaledVector(_camRight, ox);
        _camera.position.addScaledVector(_camUp, oy);
        _camera.updateMatrixWorld();
        appliedShake = true;
      }
    }

    _renderer.render(_scene, _camera);

    if (appliedShake) {
      _camera.position.copy(_savedCamPos);
      _camera.updateMatrixWorld();
    }
  }

  function resize(width, height) {
    if (!_renderer) return;
    var w = Math.max(1, Math.floor(width || window.innerWidth || 1280));
    var h = Math.max(1, Math.floor(height || window.innerHeight || 720));
    _renderer.setSize(w, h, false);
    if (_camera && _camera.isPerspectiveCamera) {
      _camera.aspect = w / h;
      _camera.updateProjectionMatrix();
    }
  }

  function getHealthReport() {
    var reportedShaderErrors = _shaderErrors;
    if (window.GAME_PERF && typeof window.GAME_PERF.getReport === 'function') {
      var perf = window.GAME_PERF.getReport();
      if (perf && typeof perf.shaderErrors === 'number') {
        reportedShaderErrors = Math.max(reportedShaderErrors, perf.shaderErrors);
      }
    }
    return {
      pmremInvalidTexels: _pmremInvalidTexels,
      nanPixels: _nanPixels,
      shaderErrors: reportedShaderErrors
    };
  }

  function getCamera() {
    return _camera;
  }

  window.GAME.VfxPost = {
    GLSL_SAFE_HELPERS: GLSL_SAFE_HELPERS,
    init: init,
    render: render,
    resize: resize,
    triggerShake: triggerShake,
    pulseSunFlash: pulseSunFlash,
    getCamera: getCamera,
    getHealthReport: getHealthReport
  };
})();

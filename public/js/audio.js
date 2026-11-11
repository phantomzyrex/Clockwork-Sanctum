/* ============================================================================
 * Clockwork Sanctum: The Living Board — Procedural Web Audio Engine (js/audio.js)
 * ----------------------------------------------------------------------------
 * 100% procedural Web Audio API soundtrack & tactile clockwork toy-box Foley
 * inspired by sunlit Ankama / Wakfu / Captain Toad / Monument Valley worlds.
 * Zero external assets, zero ES module imports, sandbox & headless safe.
 * ============================================================================ */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.GAME = root.GAME || {};

  // --- Musical Pitch Helpers (MIDI -> Hz) ---
  function mtof(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  // --- Engine State ---
  var initialized = false;
  var unlocked = false;
  var muted = false;
  var currentLevel = 1;
  var justUnlockedUntil = 0;
  var autoStartedInCurrentPress = false;
  var wasEverAudible = false;
  var silentStartGuardConsumed = false;
  var lastHoverTryMs = -1e9;
  var muteToggledInGesture = false;
  var fallbackAudioEl = null;
  var cachedOvertureBlob = null;
  var fallbackBlobUrl = null;

  var ctx = null;
  var masterGain = null;
  var masterComp = null;
  var musicBus = null;
  var sfxBus = null;
  var reverbSend = null;
  var delaySend = null;
  var sharedNoiseBuf = null;
  var stereoPannerSupported = false;

  // --- Sequencer State (104 BPM, 16-bar / 64-sixteenth sunlit chamber score) ---
  var BPM = 104;
  var STEP_SEC = (60 / BPM) / 4; // ~0.14423s per 16th note
  var TOTAL_STEPS = 64;          // 16 bars of 4/4 (4 distinct 4-bar phrases)
  var schedulerTimer = null;
  var currentStep = 0;
  var nextStepTime = 0;
  var victoryDuckUntil = 0;

  // Per-SFX rate limit timestamps (prevents voice pileup in instant batch runs)
  var lastSfxMs = {};
  var activeVoiceCount = 0;
  var MAX_ACTIVE_VOICES = 48;

  // Alternating left/right boot toggle for charming hop variation
  var hopParity = 0;

  // ==========================================================================
  // 16-Bar Sunlit Lydian / Mixolydian Chamber Composition (G Lydian <-> D Mixo)
  // MIDI Reference:
  //   G2=43, A2=45, B2=47, C3=48, D3=50, E3=52, F#3=54, G3=55, A3=57, B3=59
  //   C4=60, C#4=61, D4=62, E4=64, F#4=66, G4=67, A4=69, B4=71
  //   C5=72, C#5=73, D5=74, E5=76, F#5=78, G5=79, A5=81, B5=83, C#6=85, D6=86
  // ==========================================================================

  // 16-bar chord progression (1 bar = 4 steps; 16 bars = 64 steps)
  // Phrase A (bars 0..3):  Gmaj9  | A/G (Lydian!) | F#m7/B -> Em9 | Dmaj9
  // Phrase B (bars 4..7):  Gmaj9  | C#m7b5 -> A9  | Bm7           | E9sus4 -> A7
  // Phrase C (bars 8..11): Cmaj9  | D9sus4        | Gmaj7/B       | Em9 -> A13
  // Phrase D (bars 12..15):Am9    | Bm7 -> Cmaj9  | D13sus4       | G6/9 (turnaround)
  var BAR_CHORDS = [
    // Phrase A — Sunlit Awakening (G Lydian)
    { bass: [43, 50], arp: [59, 62, 66, 69, 71, 66], pad: [67, 74], bell: 79 },
    { bass: [43, 45], arp: [61, 64, 69, 73, 76, 69], pad: [69, 73], bell: 81 },
    { bass: [52, 47], arp: [59, 64, 67, 71, 74, 67], pad: [64, 71], bell: 76 },
    { bass: [50, 45], arp: [57, 62, 66, 69, 73, 66], pad: [66, 74], bell: 78 },
    // Phrase B — Dancing Bronze Cogs
    { bass: [43, 50], arp: [59, 62, 67, 71, 74, 69], pad: [67, 71], bell: 79 },
    { bass: [45, 52], arp: [61, 64, 69, 73, 76, 71], pad: [69, 76], bell: 85 },
    { bass: [47, 54], arp: [59, 62, 66, 69, 74, 66], pad: [66, 74], bell: 83 },
    { bass: [52, 45], arp: [59, 64, 69, 71, 76, 69], pad: [64, 73], bell: 81 },
    // Phrase C — Drifting Cumulus Sky Bridge (Mixolydian warmth)
    { bass: [48, 55], arp: [60, 64, 67, 71, 74, 67], pad: [67, 72], bell: 79 },
    { bass: [50, 55], arp: [60, 62, 67, 69, 74, 69], pad: [69, 74], bell: 81 },
    { bass: [47, 55], arp: [59, 62, 67, 71, 74, 71], pad: [67, 74], bell: 83 },
    { bass: [52, 45], arp: [59, 64, 67, 73, 76, 69], pad: [67, 73], bell: 85 },
    // Phrase D — Golden Sanctuary Cadence
    { bass: [45, 52], arp: [60, 64, 67, 69, 74, 67], pad: [64, 72], bell: 81 },
    { bass: [47, 48], arp: [59, 64, 67, 71, 74, 71], pad: [67, 74], bell: 83 },
    { bass: [50, 45], arp: [60, 62, 67, 69, 74, 76], pad: [69, 74], bell: 86 },
    { bass: [43, 50], arp: [59, 62, 64, 69, 71, 74], pad: [67, 74], bell: 79 }
  ];

  // Celesta / Music-Box Lead Melody (64 steps; 0 = rest, >0 = MIDI note)
  var CELESTA_MELODY = [
    // Phrase A
    74, 0, 79, 0,   81, 0, 73, 74,   76, 0, 71, 0,   69, 0, 0, 0,
    // Phrase B
    74, 0, 79, 81,  83, 0, 85, 0,    86, 0, 81, 78,  76, 0, 0, 0,
    // Phrase C
    79, 0, 76, 74,  72, 0, 74, 79,   83, 0, 79, 74,  76, 0, 81, 0,
    // Phrase D
    79, 76, 72, 0,  74, 79, 83, 0,   81, 0, 78, 81,  79, 0, 0, 0
  ];

  // Rosewood Toy-Box Marimba Counter-Melody (64 steps; playful syncopation)
  var MARIMBA_LINE = [
    // Phrase A
    0, 0, 67, 0,    0, 69, 0, 0,     0, 67, 0, 64,   66, 0, 69, 74,
    // Phrase B
    0, 67, 0, 0,    0, 73, 0, 69,    0, 66, 69, 0,   71, 0, 73, 76,
    // Phrase C
    64, 0, 67, 0,   69, 0, 67, 0,    71, 0, 67, 0,   69, 73, 0, 69,
    // Phrase D
    0, 64, 0, 69,   0, 67, 0, 71,    74, 0, 69, 0,   67, 71, 74, 0
  ];

  // Harp Arpeggio Pattern indices into chord.arp (per step within a 4-step bar)
  var HARP_STEP_INDEX = [0, 2, 4, 3];

  // ==========================================================================
  // Safe Web Audio Parameter & Node Helpers
  // ==========================================================================

  function safeTime(t) {
    if (!ctx) return 0;
    var now = ctx.currentTime;
    if (typeof t !== 'number' || !isFinite(t) || t < now) return now;
    return t;
  }

  function safeSet(param, val, t) {
    if (!param) return;
    try {
      var v = isFinite(val) ? val : 0;
      param.setValueAtTime(v, safeTime(t));
    } catch (e) {}
  }

  function safeLin(param, val, t) {
    if (!param) return;
    try {
      var v = isFinite(val) ? val : 0;
      param.linearRampToValueAtTime(v, safeTime(t));
    } catch (e) {}
  }

  function safeExp(param, val, t) {
    if (!param) return;
    try {
      var v = (isFinite(val) && val > 0.00005) ? val : 0.00005;
      param.exponentialRampToValueAtTime(v, safeTime(t));
    } catch (e) {}
  }

  function makePanNode(panVal) {
    if (!ctx || !stereoPannerSupported || !panVal) return null;
    try {
      var p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, panVal));
      return p;
    } catch (e) {
      return null;
    }
  }

  function trackVoice(stopTime) {
    if (!ctx) return;
    activeVoiceCount++;
    var delayMs = Math.max(30, Math.min(4000, (stopTime - ctx.currentTime) * 1000 + 40));
    setTimeout(function () {
      activeVoiceCount = Math.max(0, activeVoiceCount - 1);
    }, delayMs);
  }

  function createSharedNoiseBuffer(audioCtx) {
    var sr = audioCtx.sampleRate || 44100;
    var len = Math.floor(sr * 1.8);
    var buf = audioCtx.createBuffer(1, len, sr);
    var data = buf.getChannelData(0);
    // Deterministic PRNG so texture is crisp and repeatable
    var seed = 0x5A17C9E3;
    for (var i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 2147483648.0) - 1.0;
    }
    return buf;
  }

  function createChamberImpulse(audioCtx, durationSec, decayRate) {
    var sr = audioCtx.sampleRate || 44100;
    var len = Math.floor(sr * durationSec);
    var buf = audioCtx.createBuffer(2, len, sr);
    var left = buf.getChannelData(0);
    var right = buf.getChannelData(1);
    var seedL = 0x13579BDF;
    var seedR = 0x2468ACE1;
    for (var i = 0; i < len; i++) {
      var t = i / len;
      var env = Math.pow(1 - t, decayRate);
      // Soft pre-delay shape so direct transients remain super crisp
      var pre = i < sr * 0.012 ? (i / (sr * 0.012)) : 1.0;
      seedL = (seedL * 1664525 + 1013904223) >>> 0;
      seedR = (seedR * 22695477 + 1) >>> 0;
      left[i] = ((seedL / 2147483648.0) - 1.0) * env * pre * 0.5;
      right[i] = ((seedR / 2147483648.0) - 1.0) * env * pre * 0.5;
    }
    return buf;
  }

  // ==========================================================================
  // Context & Signal Graph Construction (Sandbox-Hardened)
  // ==========================================================================

  function ensureContext() {
    if (ctx) return ctx;
    if (typeof root === 'undefined') return null;

    var AudioCtx = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      ctx = new AudioCtx();
    } catch (e) {
      ctx = null;
      return null;
    }

    try {
      stereoPannerSupported = typeof ctx.createStereoPanner === 'function';
      sharedNoiseBuf = createSharedNoiseBuffer(ctx);

      // Master Glue Compressor -> Destination
      masterComp = ctx.createDynamicsCompressor();
      masterComp.threshold.value = -10;
      masterComp.knee.value = 12;
      masterComp.ratio.value = 4.0;
      masterComp.attack.value = 0.005;
      masterComp.release.value = 0.16;
      masterComp.connect(ctx.destination);

      // Master Mute/Volume Node
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0.0 : 0.85;
      masterGain.connect(masterComp);

      // Music & SFX Sub-Buses
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.42;
      musicBus.connect(masterGain);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.88;
      sfxBus.connect(masterGain);

      // Sunlit Chamber Convolver Send
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.24;
      var convolver = ctx.createConvolver();
      convolver.buffer = createChamberImpulse(ctx, 0.85, 2.7);
      var revFilter = ctx.createBiquadFilter();
      revFilter.type = 'lowpass';
      revFilter.frequency.value = 4200;
      reverbSend.connect(convolver);
      convolver.connect(revFilter);
      revFilter.connect(masterGain);

      // Synced Stereo Cloud Echo (dotted-16th / 8th sunlit shimmer)
      delaySend = ctx.createGain();
      delaySend.gain.value = 0.20;
      var delayL = ctx.createDelay(1.0);
      var delayR = ctx.createDelay(1.0);
      delayL.delayTime.value = STEP_SEC * 2.0; // 8th note
      delayR.delayTime.value = STEP_SEC * 3.0; // dotted 8th note
      var fbL = ctx.createGain();
      var fbR = ctx.createGain();
      fbL.gain.value = 0.22;
      fbR.gain.value = 0.20;
      var dFilter = ctx.createBiquadFilter();
      dFilter.type = 'lowpass';
      dFilter.frequency.value = 2700;

      delaySend.connect(dFilter);
      dFilter.connect(delayL);
      dFilter.connect(delayR);
      delayL.connect(fbL);
      fbL.connect(delayR);
      delayR.connect(fbR);
      fbR.connect(delayL);

      var panL = makePanNode(-0.55);
      var panR = makePanNode(0.55);
      if (panL && panR) {
        delayL.connect(panL);
        panL.connect(masterGain);
        delayR.connect(panR);
        panR.connect(masterGain);
      } else {
        delayL.connect(masterGain);
        delayR.connect(masterGain);
      }

      var onStateChange = function () {
        if (!ctx) return;
        if (ctx.state === 'running') {
          unlocked = true;
          if (ctx.currentTime > 0.015) {
            wasEverAudible = true;
            if (fallbackAudioEl && !fallbackAudioEl.paused) {
              var stepDur = STEP_SEC * 2.0;
              currentStep = (Math.floor((fallbackAudioEl.currentTime || 0) / stepDur) + 1) % TOTAL_STEPS;
            }
            stopFallbackAudio();
          }
          if (!muted) {
            startSequencer(true);
          }
          emitAudioStateEvent();
        } else if (!muted) {
          // Safari/WebKit can start in 'running' at t=0 and drop to 'interrupted'/'suspended' ~10ms later
          startFallbackAutoplayOverture();
          emitAudioStateEvent();
        }
      };
      if (typeof ctx.addEventListener === 'function') {
        ctx.addEventListener('statechange', onStateChange);
      } else {
        ctx.onstatechange = onStateChange;
      }
    } catch (e) {
      // Degrade gracefully if any auxiliary Web Audio node is restricted
    }

    return ctx;
  }

  function isAudibleNow() {
    if (muted) return false;
    if (ctx && ctx.state === 'running' && ctx.currentTime > 0.015) return true;
    if (fallbackAudioEl && !fallbackAudioEl.paused && !fallbackAudioEl.ended && fallbackAudioEl.currentTime > 0.01) return true;
    return false;
  }

  function emitAudioStateEvent() {
    if (isAudibleNow()) {
      wasEverAudible = true;
    }
    try {
      if (typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
        root.dispatchEvent(new CustomEvent('game:audio-mute', {
          detail: { muted: muted, audible: isAudibleNow() }
        }));
      }
    } catch (e) {}
  }

  function stopFallbackAudio() {
    if (fallbackAudioEl) {
      try {
        fallbackAudioEl.pause();
        fallbackAudioEl.removeAttribute('src');
        fallbackAudioEl.load();
        if (fallbackAudioEl.parentNode) {
          fallbackAudioEl.parentNode.removeChild(fallbackAudioEl);
        }
      } catch (e) {}
      fallbackAudioEl = null;
    }
    if (fallbackBlobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(fallbackBlobUrl);
      } catch (e) {}
      fallbackBlobUrl = null;
    }
  }

  // Synchronously synthesize (~3ms) a seamless 8-bar (9.23s > 7.0s Chrome MEI threshold)
  // stereo 24kHz WAV of the sunlit G-Lydian overture so DOM <audio autoplay loop> can
  // start immediately at t=0ms on page load without losing navigation activation!
  function getOrBuildOvertureWavBlob() {
    if (cachedOvertureBlob) return cachedOvertureBlob;
    if (typeof Blob === 'undefined') return null;

    var sr = 24000;
    var steps = 32; // 8 bars * 4 steps = 9.23s seamless loop
    var stepDur = STEP_SEC * 2.0;
    var totalFrames = Math.floor(sr * steps * stepDur);
    var mixL = new Float32Array(totalFrames);
    var mixR = new Float32Array(totalFrames);
    var twoPiOverSr = (Math.PI * 2.0) / sr;

    function addPartial(freq, t0, durSec, tauSec, amp, panVal, attSec) {
      if (!isFinite(freq) || freq <= 20 || freq >= sr * 0.47 || amp <= 0.00005) return;
      var startFrame = Math.floor(t0 * sr);
      var nFrames = Math.min(totalFrames, Math.floor(durSec * sr));
      if (nFrames <= 8) return;

      var w = freq * twoPiOverSr;
      var r = Math.exp(-1.0 / Math.max(1.0, tauSec * sr));
      var u = r * Math.cos(w);
      var v = r * Math.sin(w);

      var pan = Math.max(-1.0, Math.min(1.0, panVal || 0.0));
      var gainL = amp * Math.sqrt(0.5 * (1.0 - pan));
      var gainR = amp * Math.sqrt(0.5 * (1.0 + pan));

      var attFrames = Math.max(12, Math.floor((attSec || 0.005) * sr));
      var invAtt = 1.0 / attFrames;

      var x = 1.0;
      var y = 0.0;
      for (var k = 0; k < nFrames; k++) {
        var idx = startFrame + k;
        if (idx >= totalFrames) idx -= totalFrames;
        var att = k < attFrames ? (k * invAtt) : 1.0;
        var sample = y * att;
        mixL[idx] += sample * gainL;
        mixR[idx] += sample * gainR;
        var nx = x * u - y * v;
        y = x * v + y * u;
        x = nx;
      }
    }

    for (var s = 0; s < steps; s++) {
      var when = s * stepDur;
      var swung = when + ((s % 2 === 1) ? 0.007 : 0.0);
      var barIdx = Math.floor(s / 4) % 16;
      var beatSub = s % 4;
      var chord = BAR_CHORDS[barIdx];

      // 1. Plucked Acoustic Harp Arpeggio
      var arpMidi = chord.arp[HARP_STEP_INDEX[beatSub] % chord.arp.length];
      var arpFreq = mtof(arpMidi);
      var harpPan = -0.32 + beatSub * 0.16;
      addPartial(arpFreq, swung, stepDur * 2.4, 0.24, 0.105, harpPan, 0.005);
      addPartial(arpFreq * 2.0, swung, stepDur * 1.4, 0.11, 0.036, harpPan, 0.004);
      addPartial(arpFreq * 3.0, swung, stepDur * 0.7, 0.055, 0.014, harpPan, 0.003);

      // 2. Light Pizzicato Bass
      if (beatSub === 0) {
        var bf0 = mtof(chord.bass[0]);
        addPartial(bf0, when, stepDur * 2.0, 0.20, 0.14, 0.0, 0.007);
        addPartial(bf0 * 2.0, when, stepDur * 1.4, 0.11, 0.06, 0.0, 0.006);
      } else if (beatSub === 2) {
        var bf1 = mtof(chord.bass[1]);
        addPartial(bf1, when, stepDur * 1.7, 0.18, 0.105, 0.0, 0.007);
        addPartial(bf1 * 2.0, when, stepDur * 1.2, 0.09, 0.045, 0.0, 0.006);
      } else if (beatSub === 3 && (barIdx % 4 === 3)) {
        addPartial(mtof(chord.bass[0] + 7), swung, stepDur * 1.3, 0.14, 0.075, 0.0, 0.006);
      }

      // 3. Pastoral Woodwind Dyad Pad
      if (beatSub === 0 && (barIdx % 2 === 0)) {
        var pf0 = mtof(chord.pad[0]);
        var pf1 = mtof(chord.pad[1]);
        addPartial(pf0, when, stepDur * 7.2, 0.92, 0.046, -0.22, 0.14);
        addPartial(pf1, when + 0.02, stepDur * 7.2, 0.92, 0.040, 0.22, 0.14);
      }

      // 4. Celesta / Music-Box Lead Melody
      var melMidi = CELESTA_MELODY[s];
      if (melMidi > 0) {
        var mf = mtof(melMidi);
        addPartial(mf, swung, stepDur * 2.8, 0.30, 0.13, 0.14, 0.004);
        addPartial(mf * 2.0, swung, stepDur * 1.5, 0.14, 0.032, 0.14, 0.003);
        addPartial(mf * 3.0, swung, stepDur * 0.6, 0.045, 0.026, 0.14, 0.002);
      }

      // 5. Rosewood Toy-Box Marimba Counter-Melody
      var marMidi = MARIMBA_LINE[s];
      if (marMidi > 0) {
        var marF = mtof(marMidi);
        addPartial(marF, swung, stepDur * 1.6, 0.15, 0.092, -0.24, 0.004);
        addPartial(marF * 4.0, swung, stepDur * 0.35, 0.024, 0.028, -0.24, 0.002);
      }
    }

    // Sunlit Stereo Cloud Echo (8th left / dotted-8th right wrap-around shimmer)
    var dL = Math.floor(STEP_SEC * 2.0 * sr);
    var dR = Math.floor(STEP_SEC * 3.0 * sr);
    for (var eIdx = 0; eIdx < totalFrames; eIdx++) {
      var srcL = eIdx - dL;
      if (srcL < 0) srcL += totalFrames;
      var srcR = eIdx - dR;
      if (srcR < 0) srcR += totalFrames;
      mixL[eIdx] += mixR[srcL] * 0.14;
      mixR[eIdx] += mixL[srcR] * 0.12;
    }

    var numCh = 2;
    var dataBytes = totalFrames * numCh * 2;
    var wav = new ArrayBuffer(44 + dataBytes);
    var dv = new DataView(wav);
    function writeStr(offByte, str) {
      for (var c = 0; c < str.length; c++) {
        dv.setUint8(offByte + c, str.charCodeAt(c));
      }
    }
    writeStr(0, 'RIFF');
    dv.setUint32(4, 36 + dataBytes, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, numCh, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * numCh * 2, true);
    dv.setUint16(32, numCh * 2, true);
    dv.setUint16(34, 16, true);
    writeStr(36, 'data');
    dv.setUint32(40, dataBytes, true);

    var pos = 44;
    for (var i = 0; i < totalFrames; i++) {
      var rawL = mixL[i] * 0.88;
      var rawR = mixR[i] * 0.88;
      var sl = rawL / (1.0 + 0.28 * Math.abs(rawL));
      var srVal = rawR / (1.0 + 0.28 * Math.abs(rawR));
      if (sl > 0.98) sl = 0.98; else if (sl < -0.98) sl = -0.98;
      if (srVal > 0.98) srVal = 0.98; else if (srVal < -0.98) srVal = -0.98;
      dv.setInt16(pos, sl < 0 ? (sl * 0x8000) | 0 : (sl * 0x7FFF) | 0, true);
      dv.setInt16(pos + 2, srVal < 0 ? (srVal * 0x8000) | 0 : (srVal * 0x7FFF) | 0, true);
      pos += 4;
    }

    cachedOvertureBlob = new Blob([wav], { type: 'audio/wav' });
    return cachedOvertureBlob;
  }

  function startFallbackAutoplayOverture() {
    if (muted) return;
    if (ctx && ctx.state === 'running' && ctx.currentTime > 0.015) return;
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;

    try {
      if (!fallbackAudioEl) {
        var blob = getOrBuildOvertureWavBlob();
        if (!blob) return;
        fallbackBlobUrl = URL.createObjectURL(blob);
        var el = document.createElement('audio');
        el.id = 'cs-overture-autoplay';
        el.autoplay = true;
        el.loop = true;
        el.preload = 'auto';
        el.playsInline = true;
        el.setAttribute('autoplay', '');
        el.setAttribute('loop', '');
        el.setAttribute('playsinline', '');
        el.volume = 0.85;
        el.style.display = 'none';
        el.src = fallbackBlobUrl;
        if (document.body) {
          document.body.appendChild(el);
        } else if (document.documentElement) {
          document.documentElement.appendChild(el);
        }
        fallbackAudioEl = el;

        el.addEventListener('timeupdate', function () {
          if (muted || (ctx && ctx.state === 'running' && ctx.currentTime > 0.015)) {
            stopFallbackAudio();
            return;
          }
          if (!el.paused && el.currentTime > 0.01) {
            wasEverAudible = true;
            emitAudioStateEvent();
          }
        });

        el.addEventListener('playing', function () {
          if (muted || (ctx && ctx.state === 'running' && ctx.currentTime > 0.015)) {
            stopFallbackAudio();
            return;
          }
          emitAudioStateEvent();
        });
      }

      if (fallbackAudioEl && fallbackAudioEl.paused) {
        var playP = fallbackAudioEl.play();
        if (playP && typeof playP.then === 'function') {
          playP.then(function () {
            if (muted || (ctx && ctx.state === 'running' && ctx.currentTime > 0.015)) {
              stopFallbackAudio();
            } else {
              emitAudioStateEvent();
            }
          }, function () {
            // Cold-tab policy held HTMLMediaElement; first user gesture unlocks immediately
          });
        }
      }
    } catch (e) {}
  }

  function resumeContextSafely(withSilentKick) {
    if (!ctx) return;
    try {
      if (withSilentKick && ctx.state !== 'running') {
        // 1-frame silent buffer kick wakes WebKit/Safari/Chromium hardware graph inside user activation
        var silentBuf = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
        var silentSrc = ctx.createBufferSource();
        silentSrc.buffer = silentBuf;
        silentSrc.connect(ctx.destination);
        silentSrc.start(0);
      }
    } catch (e) {}
    try {
      if (ctx.state !== 'running' && typeof ctx.resume === 'function') {
        var p = ctx.resume();
        if (p && typeof p.then === 'function') {
          p.then(function () {
            if (ctx && ctx.state === 'running') {
              unlocked = true;
              if (ctx.currentTime > 0.015) {
                wasEverAudible = true;
                if (fallbackAudioEl && !fallbackAudioEl.paused) {
                  var stepDur = STEP_SEC * 2.0;
                  currentStep = (Math.floor((fallbackAudioEl.currentTime || 0) / stepDur) + 1) % TOTAL_STEPS;
                }
                stopFallbackAudio();
              }
              if (!muted) startSequencer(true);
              emitAudioStateEvent();
            }
          }, function () {});
        }
      } else if (ctx.state === 'running') {
        unlocked = true;
        if (ctx.currentTime > 0.015) {
          wasEverAudible = true;
          stopFallbackAudio();
        }
        if (!muted) startSequencer(false);
      }
    } catch (e) {}
  }

  function canPlaySfx(key, cooldownMs) {
    if (muted || !ctx || !sfxBus) return false;
    var now = nowMs();
    if (ctx.state !== 'running' && now > justUnlockedUntil) return false;
    if (activeVoiceCount >= MAX_ACTIVE_VOICES) return false;
    if (key && cooldownMs) {
      var prev = lastSfxMs[key] || 0;
      if (now - prev < cooldownMs) return false;
      lastSfxMs[key] = now;
    }
    return true;
  }

  function syncLevelFromSim() {
    try {
      if (root.GAME && root.GAME.Simulation && typeof root.GAME.Simulation.getState === 'function') {
        var st = root.GAME.Simulation.getState();
        if (st && st.levelId >= 1 && st.levelId <= 4) {
          currentLevel = st.levelId;
        }
      }
    } catch (e) {}
  }

  // ==========================================================================
  // Ensemble Instrument Synthesizers (Sunlit Clockwork Score)
  // ==========================================================================

  // 1. FM Celesta / Music-Box Bell
  function synthCelesta(freq, when, dur, gainAmt, panVal, sendEcho, destBus) {
    var bus = destBus || musicBus;
    if (!ctx || !bus || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;

      // Metallic tine FM modulator (ratio 3.0, fast bell-hammer decay)
      var mod = ctx.createOscillator();
      var modGain = ctx.createGain();
      mod.type = 'sine';
      mod.frequency.value = freq * 3.0;
      safeSet(modGain.gain, freq * 1.35, t0);
      safeExp(modGain.gain, 0.5, t0 + Math.min(0.085, dur * 0.45));

      // Carrier fundamental + soft octave air
      var car = ctx.createOscillator();
      car.type = 'sine';
      car.frequency.value = freq;

      var overtone = ctx.createOscillator();
      var overGain = ctx.createGain();
      overtone.type = 'triangle';
      overtone.frequency.value = freq * 2.0;
      overGain.gain.value = 0.14;

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + 0.005);
      safeExp(env.gain, gainAmt * 0.32, t0 + dur * 0.35);
      safeExp(env.gain, 0.0001, tEnd);

      mod.connect(modGain);
      modGain.connect(car.frequency);
      car.connect(env);
      overtone.connect(overGain);
      overGain.connect(env);

      var out = env;
      var pan = makePanNode(panVal || 0.15);
      if (pan) {
        env.connect(pan);
        out = pan;
      }
      out.connect(bus);
      if (reverbSend) out.connect(reverbSend);
      if (sendEcho && delaySend) {
        var echoTap = ctx.createGain();
        echoTap.gain.value = 0.45;
        env.connect(echoTap);
        echoTap.connect(delaySend);
      }

      mod.start(t0);
      car.start(t0);
      overtone.start(t0);
      mod.stop(tEnd + 0.02);
      car.stop(tEnd + 0.02);
      overtone.stop(tEnd + 0.02);
      trackVoice(tEnd);
    } catch (e) {}
  }

  // 2. Plucked Acoustic Harp / Classical Nylon Guitar
  function synthHarpPluck(freq, when, dur, gainAmt, panVal, destBus) {
    var bus = destBus || musicBus;
    if (!ctx || !bus || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;

      var osc1 = ctx.createOscillator();
      var osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      osc1.frequency.value = freq;
      osc2.frequency.value = freq * 1.0015; // warm natural string chorus

      var g2 = ctx.createGain();
      g2.gain.value = 0.28;

      var lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.Q.value = 1.6;
      safeSet(lpf.frequency, Math.min(4800, freq * 5.2), t0);
      safeExp(lpf.frequency, Math.max(280, freq * 1.35), t0 + Math.min(0.24, dur * 0.65));

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + 0.006);
      safeExp(env.gain, 0.0001, tEnd);

      osc1.connect(lpf);
      osc2.connect(g2);
      g2.connect(lpf);
      lpf.connect(env);

      var pan = makePanNode(panVal || -0.25);
      if (pan) {
        env.connect(pan);
        pan.connect(bus);
        if (reverbSend) pan.connect(reverbSend);
      } else {
        env.connect(bus);
        if (reverbSend) env.connect(reverbSend);
      }

      osc1.start(t0);
      osc2.start(t0);
      osc1.stop(tEnd + 0.02);
      osc2.stop(tEnd + 0.02);
      trackVoice(tEnd);
    } catch (e) {}
  }

  // 3. Wooden Toy-Box Marimba (Sine fundamental + 4x rosewood bar harmonic)
  function synthMarimba(freq, when, dur, gainAmt, panVal, destBus) {
    var bus = destBus || musicBus;
    if (!ctx || !bus || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;

      var fund = ctx.createOscillator();
      var harm = ctx.createOscillator();
      fund.type = 'sine';
      harm.type = 'sine';
      fund.frequency.value = freq;
      harm.frequency.value = freq * 4.0;

      var harmEnv = ctx.createGain();
      safeSet(harmEnv.gain, gainAmt * 0.35, t0);
      safeExp(harmEnv.gain, 0.0001, t0 + 0.045);

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + 0.004);
      safeExp(env.gain, 0.0001, tEnd);

      fund.connect(env);
      harm.connect(harmEnv);
      harmEnv.connect(bus);

      var pan = makePanNode(panVal || 0.28);
      if (pan) {
        env.connect(pan);
        pan.connect(bus);
        if (reverbSend) pan.connect(reverbSend);
      } else {
        env.connect(bus);
      }

      fund.start(t0);
      harm.start(t0);
      fund.stop(tEnd + 0.02);
      harm.stop(t0 + 0.06);
      trackVoice(tEnd);
    } catch (e) {}
  }

  // 4. Light Pizzicato Cello / Bass
  function synthPizzicato(freq, when, dur, gainAmt) {
    if (!ctx || !musicBus || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;

      var osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      safeSet(osc.frequency, freq * 1.03, t0);
      safeExp(osc.frequency, freq, t0 + 0.022);

      var sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.value = freq;

      var lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.Q.value = 2.0;
      safeSet(lpf.frequency, freq * 4.2, t0);
      safeExp(lpf.frequency, Math.max(120, freq * 1.4), t0 + 0.14);

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + 0.008);
      safeExp(env.gain, 0.0001, tEnd);

      osc.connect(lpf);
      sub.connect(lpf);
      lpf.connect(env);
      env.connect(musicBus);

      osc.start(t0);
      sub.start(t0);
      osc.stop(tEnd + 0.02);
      sub.stop(tEnd + 0.02);
      trackVoice(tEnd);
    } catch (e) {}
  }

  // 5. Soft Airy Woodwind / Pastoral Flute Pad
  function synthWoodwindPad(freq, when, dur, gainAmt, panVal, destBus) {
    var bus = destBus || musicBus;
    if (!ctx || !bus || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;

      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      // Gentle vibrato blooming gently into sustained notes
      var vib = ctx.createOscillator();
      var vibGain = ctx.createGain();
      vib.type = 'sine';
      vib.frequency.value = 5.1;
      safeSet(vibGain.gain, 0.0, t0);
      safeLin(vibGain.gain, freq * 0.0055, t0 + Math.min(0.28, dur * 0.4));
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);

      var lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = freq * 2.4;

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + Math.min(0.18, dur * 0.3));
      safeLin(env.gain, gainAmt * 0.78, t0 + dur * 0.75);
      safeExp(env.gain, 0.0001, tEnd);

      osc.connect(lpf);
      lpf.connect(env);

      var pan = makePanNode(panVal || 0.0);
      if (pan) {
        env.connect(pan);
        pan.connect(bus);
        if (reverbSend) pan.connect(reverbSend);
      } else {
        env.connect(bus);
        if (reverbSend) env.connect(reverbSend);
      }

      osc.start(t0);
      vib.start(t0);
      osc.stop(tEnd + 0.03);
      vib.stop(tEnd + 0.03);
      trackVoice(tEnd);
    } catch (e) {}
  }

  // 6. Delicate Pocket-Watch Escapement Tick-Tock
  function synthEscapementTick(when, isTick, gainAmt) {
    if (!ctx || !musicBus || !sharedNoiseBuf || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var src = ctx.createBufferSource();
      src.buffer = sharedNoiseBuf;
      var offset = isTick ? 0.12 : 0.47;

      var bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = isTick ? 3650 : 2580;
      bpf.Q.value = 7.5;

      var env = ctx.createGain();
      safeSet(env.gain, gainAmt, t0);
      safeExp(env.gain, 0.0001, t0 + 0.018);

      src.connect(bpf);
      bpf.connect(env);
      var pan = makePanNode(isTick ? -0.18 : 0.18);
      if (pan) {
        env.connect(pan);
        pan.connect(musicBus);
      } else {
        env.connect(musicBus);
      }

      src.start(t0, offset, 0.025);
      trackVoice(t0 + 0.025);
    } catch (e) {}
  }

  // 7. Resonant Bronze Tubular Chime (Level 3 layer & Fanfare)
  function synthTubularBell(freq, when, dur, gainAmt, destBus) {
    var bus = destBus || musicBus;
    if (!ctx || !bus || activeVoiceCount >= MAX_ACTIVE_VOICES) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;
      var ratios = [1.0, 2.0, 2.51, 3.01];
      var weights = [1.0, 0.45, 0.22, 0.15];

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + 0.006);
      safeExp(env.gain, 0.0001, tEnd);
      env.connect(bus);
      if (reverbSend) env.connect(reverbSend);

      for (var i = 0; i < ratios.length; i++) {
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = freq * ratios[i];
        g.gain.value = weights[i];
        o.connect(g);
        g.connect(env);
        o.start(t0);
        o.stop(tEnd + 0.02);
      }
      trackVoice(tEnd);
    } catch (e) {}
  }

  // ==========================================================================
  // Lookahead Sequencer Scheduler
  // ==========================================================================

  function scheduleMusicalStep(step, when) {
    syncLevelFromSim();

    // Smoothly manage music ducking during Victory Fanfare
    if (musicBus && ctx) {
      var targetMusic = (nowMs() < victoryDuckUntil) ? 0.09 : 0.42;
      safeLin(musicBus.gain, targetMusic, when + 0.04);
    }

    var barIdx = Math.floor(step / 4) % 16;
    var beatSub = step % 4; // 0..3 within quarter-bar? Note: 4 steps = 1 bar of 4 beats (8th-feel) or 1 beat of 16ths
    var chord = BAR_CHORDS[barIdx];

    // Subtle pocket-watch swing (+7ms on odd steps)
    var swungWhen = when + ((step % 2 === 1) ? 0.007 : 0.0);

    // 1. Pocket-Watch Escapement Tick-Tock (every step, ultra-delicate)
    var tickGain = (beatSub % 2 === 0) ? 0.030 : 0.019;
    if (currentLevel === 3) tickGain *= 1.25; // slightly crisper clockwork pulse in Level 3
    synthEscapementTick(swungWhen, beatSub % 2 === 0, tickGain);
    // Tiny escapement hairspring double-tick at end of every 4-bar phrase
    if (step % 16 === 15) {
      synthEscapementTick(swungWhen + STEP_SEC * 0.5, true, 0.022);
    }

    // 2. Plucked Acoustic Harp Arpeggios
    var arpMidi = chord.arp[HARP_STEP_INDEX[beatSub] % chord.arp.length];
    var harpPan = -0.32 + beatSub * 0.16;
    synthHarpPluck(mtof(arpMidi), swungWhen, STEP_SEC * 4.2, 0.085, harpPan);

    // 3. Light Pizzicato Bassline (steps 0 and 2 of each bar + pickup on bar 3/7/11/15)
    if (beatSub === 0) {
      synthPizzicato(mtof(chord.bass[0]), when, STEP_SEC * 3.6, 0.13);
    } else if (beatSub === 2) {
      synthPizzicato(mtof(chord.bass[1]), when, STEP_SEC * 3.0, 0.095);
    } else if (beatSub === 3 && (barIdx % 4 === 3)) {
      synthPizzicato(mtof(chord.bass[0] + 7), swungWhen, STEP_SEC * 2.0, 0.075);
    }

    // 4. Airy Woodwind / Flute Pad (sustained warm dyads on step 0 of every 2 bars)
    if (beatSub === 0 && (barIdx % 2 === 0)) {
      var padDur = STEP_SEC * 13.5;
      synthWoodwindPad(mtof(chord.pad[0]), when, padDur, 0.042, -0.22);
      synthWoodwindPad(mtof(chord.pad[1]), when + 0.02, padDur, 0.036, 0.22);
    }

    // 5. Celesta / Music-Box Lead Melody
    var melMidi = CELESTA_MELODY[step];
    if (melMidi > 0) {
      synthCelesta(mtof(melMidi), swungWhen, STEP_SEC * 4.6, 0.105, 0.14, true);
    }

    // 6. Wooden Toy-Box Marimba Counter-Melody
    var marMidi = MARIMBA_LINE[step];
    if (marMidi > 0) {
      synthMarimba(mtof(marMidi), swungWhen, STEP_SEC * 2.8, 0.085, -0.24);
    }

    // 7. Per-Level Sunlit Instrumentation Modulations (cheerful across all 4 levels!)
    if (currentLevel === 2) {
      // Level 2 (The Waterwheel Aqueduct): Sparkling high water-harp droplet shimmer
      if (beatSub === 1 || beatSub === 3) {
        var waterNote = chord.arp[(beatSub + 2) % chord.arp.length] + 12;
        synthCelesta(mtof(waterNote), swungWhen + STEP_SEC * 0.48, STEP_SEC * 1.6, 0.044, (beatSub === 1 ? 0.45 : -0.45), true);
      }
    } else if (currentLevel === 3) {
      // Level 3 (The Clockwork Bell-Hammer): Warm bronze tubular chime on phrase downbeats
      if (beatSub === 0 && (barIdx % 2 === 0)) {
        synthTubularBell(mtof(chord.bell - 12), when, STEP_SEC * 6.0, 0.048, musicBus);
      }
    } else if (currentLevel === 4) {
      // Level 4 (The Twin-Cog Sky Split): Soaring dual-register harmony descant
      if (melMidi > 0 && (step % 2 === 0)) {
        synthWoodwindPad(mtof(melMidi + 12), swungWhen + 0.012, STEP_SEC * 2.5, 0.034, 0.35);
      }
      if (beatSub === 0) {
        synthHarpPluck(mtof(chord.bell), when + STEP_SEC * 0.5, STEP_SEC * 2.2, 0.052, 0.38);
      }
    }
  }

  function schedulerTick() {
    if (!ctx || muted || !unlocked) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (ctx.state !== 'running') return;

    var now = ctx.currentTime;
    if (now > 0.015) {
      wasEverAudible = true;
      if (fallbackAudioEl) {
        stopFallbackAudio();
      }
    }
    // Prevent burst catch-up if tab was backgrounded or paused
    if (nextStepTime < now - 0.12 || nextStepTime > now + 1.0) {
      nextStepTime = now + 0.04;
    }

    var lookahead = 0.14;
    var guard = 0;
    while (nextStepTime < now + lookahead && guard < 6) {
      scheduleMusicalStep(currentStep, nextStepTime);
      // Treat 4 steps per bar at generous chamber pace (each step = 8th-note feel ~ 0.288s)
      nextStepTime += STEP_SEC * 2.0;
      currentStep = (currentStep + 1) % TOTAL_STEPS;
      guard++;
    }
  }

  function startSequencer(immediateTick) {
    if (!ctx || muted) return;
    if (ctx.state !== 'running') return;
    unlocked = true;
    if (schedulerTimer === null) {
      nextStepTime = ctx.currentTime + 0.008;
      schedulerTick();
      schedulerTimer = setInterval(schedulerTick, 40);
    } else if (immediateTick) {
      if (nextStepTime < ctx.currentTime || nextStepTime > ctx.currentTime + 0.25) {
        nextStepTime = ctx.currentTime + 0.008;
      }
      schedulerTick();
    }
  }

  function stopSequencer() {
    if (schedulerTimer !== null) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  // ==========================================================================
  // Tactile Clockwork Toy-Box Foley Suite (CONTRACT.md Section 5.6)
  // ==========================================================================

  // Helper: Short filtered noise burst for clicks, stone grinds, splashes & pebbles
  function playNoiseBurst(when, dur, filterType, fStart, fEnd, qVal, gainAmt, panVal, sendRev) {
    if (!ctx || !sfxBus || !sharedNoiseBuf) return;
    try {
      var t0 = safeTime(when);
      var tEnd = t0 + dur;
      var src = ctx.createBufferSource();
      src.buffer = sharedNoiseBuf;
      var randOffset = ((nowMs() * 0.013) % 1.1);

      var flt = ctx.createBiquadFilter();
      flt.type = filterType || 'bandpass';
      flt.Q.value = qVal || 1.5;
      safeSet(flt.frequency, fStart, t0);
      if (fEnd && fEnd !== fStart) {
        safeExp(flt.frequency, fEnd, tEnd);
      }

      var env = ctx.createGain();
      safeSet(env.gain, 0.0001, t0);
      safeLin(env.gain, gainAmt, t0 + Math.min(0.012, dur * 0.2));
      safeExp(env.gain, 0.0001, tEnd);

      src.connect(flt);
      flt.connect(env);

      var pan = makePanNode(panVal || 0);
      if (pan) {
        env.connect(pan);
        pan.connect(sfxBus);
        if (sendRev && reverbSend) pan.connect(reverbSend);
      } else {
        env.connect(sfxBus);
        if (sendRev && reverbSend) env.connect(reverbSend);
      }

      src.start(t0, randOffset, Math.min(1.6, dur + 0.03));
      trackVoice(tEnd);
    } catch (e) {}
  }

  // Helper: Crisp brass gear / ratchet detent click
  function playBrassClick(when, pitchHz, gainAmt, panVal) {
    if (!ctx || !sfxBus) return;
    try {
      var t0 = safeTime(when);
      var o1 = ctx.createOscillator();
      var o2 = ctx.createOscillator();
      o1.type = 'triangle';
      o2.type = 'sine';
      safeSet(o1.frequency, pitchHz, t0);
      safeExp(o1.frequency, pitchHz * 0.58, t0 + 0.024);
      safeSet(o2.frequency, pitchHz * 2.35, t0);

      var env = ctx.createGain();
      safeSet(env.gain, gainAmt, t0);
      safeExp(env.gain, 0.0001, t0 + 0.028);

      o1.connect(env);
      o2.connect(env);

      var pan = makePanNode(panVal || 0);
      if (pan) {
        env.connect(pan);
        pan.connect(sfxBus);
      } else {
        env.connect(sfxBus);
      }

      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + 0.032);
      o2.stop(t0 + 0.032);
      trackVoice(t0 + 0.032);
    } catch (e) {}
  }

  // 1. playHop(): Cute bouncy wooden-boot thud + pitch lift
  function playHop() {
    if (!canPlaySfx('hop', 35)) return;
    try {
      var t0 = ctx.currentTime + 0.004;
      hopParity = 1 - hopParity;
      var mult = hopParity ? 1.05 : 0.97;

      // Wooden boot sandstone thud
      var thud = ctx.createOscillator();
      var thudEnv = ctx.createGain();
      thud.type = 'sine';
      safeSet(thud.frequency, 155 * mult, t0);
      safeExp(thud.frequency, 64 * mult, t0 + 0.068);
      safeSet(thudEnv.gain, 0.26, t0);
      safeExp(thudEnv.gain, 0.0001, t0 + 0.075);
      thud.connect(thudEnv);
      thudEnv.connect(sfxBus);
      thud.start(t0);
      thud.stop(t0 + 0.08);

      // Crisp sole tap
      playNoiseBurst(t0, 0.032, 'bandpass', 880 * mult, 520, 2.4, 0.11, 0, false);

      // Playful toy-box pitch lift ("boop!")
      var lift = ctx.createOscillator();
      var liftEnv = ctx.createGain();
      lift.type = 'triangle';
      safeSet(lift.frequency, 310 * mult, t0 + 0.012);
      safeExp(lift.frequency, 535 * mult, t0 + 0.098);
      safeSet(liftEnv.gain, 0.0001, t0 + 0.01);
      safeLin(liftEnv.gain, 0.14, t0 + 0.024);
      safeExp(liftEnv.gain, 0.0001, t0 + 0.11);
      lift.connect(liftEnv);
      liftEnv.connect(sfxBus);
      lift.start(t0 + 0.01);
      lift.stop(t0 + 0.12);
      trackVoice(t0 + 0.12);
    } catch (e) {}
  }

  // 2. playSelect(): Crisp brass click + soft chime
  function playSelect() {
    if (!canPlaySfx('select', 25)) return;
    try {
      var t0 = ctx.currentTime + 0.004;
      playBrassClick(t0, 1760, 0.16, 0);
      // Two-note sunlit grace chime (D6 -> A6)
      synthCelesta(mtof(86), t0 + 0.008, 0.20, 0.15, -0.1, false, sfxBus);
      synthCelesta(mtof(93), t0 + 0.042, 0.26, 0.12, 0.15, true, sfxBus);
    } catch (e) {}
  }

  // 3. playMirrorRotate(bounceCount): Precision brass cog detent click + crystal shimmer
  function playMirrorRotate(bounceCount) {
    if (!canPlaySfx('mirrorRotate', 35)) return;
    try {
      var t0 = ctx.currentTime + 0.004;
      var b = Math.max(0, Math.min(6, Number(bounceCount) || 0));

      // 3 clockwork turntable ticks + locking brass detent matching 0.26s turn
      playBrassClick(t0, 1480, 0.15, -0.15);
      playBrassClick(t0 + 0.055, 1720, 0.13, 0.0);
      playBrassClick(t0 + 0.115, 1980, 0.14, 0.15);
      playBrassClick(t0 + 0.185, 1240, 0.19, 0.0);

      // Diamond prism crystal shimmer
      var baseMidi = 84 + b; // C6..F#6
      synthCelesta(mtof(baseMidi), t0 + 0.04, 0.34, 0.13, -0.2, true, sfxBus);
      synthCelesta(mtof(baseMidi + 7), t0 + 0.09, 0.40, 0.12, 0.25, true, sfxBus);
    } catch (e) {}
  }

  // 4. playBeamChord(bounceCount): Ascending crystalline harmonic chord (1..6)
  function playBeamChord(bounceCount) {
    if (!canPlaySfx('beamChord', 40)) return;
    try {
      var t0 = ctx.currentTime + 0.005;
      var b = Math.max(1, Math.min(6, Math.round(Number(bounceCount) || 1)));

      // Radiant G-Lydian crystal ladder climbing in register & harmonic richness per bounce
      var lydianLadder = [67, 71, 74, 78, 81, 85, 86, 90, 93, 95, 98]; // G4..D7
      var startIdx = b - 1;
      var noteCount = Math.min(5, 2 + Math.ceil(b * 0.5));

      for (var i = 0; i < noteCount; i++) {
        var midi = lydianLadder[Math.min(lydianLadder.length - 1, startIdx + i * 2)];
        var noteWhen = t0 + i * 0.024;
        var dur = 0.45 + b * 0.06;
        var pan = -0.35 + (i / Math.max(1, noteCount - 1)) * 0.7;
        synthCelesta(mtof(midi), noteWhen, dur, 0.11, pan, true, sfxBus);
      }

      // High diamond-prism harmonic halo on multi-bounce chains
      if (b >= 3) {
        var topMidi = lydianLadder[Math.min(lydianLadder.length - 1, startIdx + 5)];
        synthWoodwindPad(mtof(topMidi), t0 + 0.04, 0.52, 0.06, 0.0, sfxBus);
      }
    } catch (e) {}
  }

  // 5. playGearSlide(): Heavy sandstone block sliding grind + sub rumble + brass ratchet clicks
  function playGearSlide() {
    if (!canPlaySfx('gearSlide', 50)) return;
    try {
      var t0 = ctx.currentTime + 0.004;

      // Carved sandstone friction grind (0.34s matching World.animateRowSlide)
      playNoiseBurst(t0, 0.34, 'bandpass', 380, 620, 1.7, 0.24, 0.0, true);
      playNoiseBurst(t0 + 0.02, 0.30, 'lowpass', 950, 320, 1.1, 0.16, 0.0, false);

      // Sub stone mass rumble + heavy final settle lock at t = 0.32s
      var sub = ctx.createOscillator();
      var subEnv = ctx.createGain();
      sub.type = 'triangle';
      safeSet(sub.frequency, 68, t0);
      safeLin(sub.frequency, 52, t0 + 0.30);
      safeSet(subEnv.gain, 0.0001, t0);
      safeLin(subEnv.gain, 0.22, t0 + 0.03);
      safeExp(subEnv.gain, 0.0001, t0 + 0.34);
      sub.connect(subEnv);
      subEnv.connect(sfxBus);
      sub.start(t0);
      sub.stop(t0 + 0.36);

      // Final heavy stone detent thud
      var lock = ctx.createOscillator();
      var lockEnv = ctx.createGain();
      lock.type = 'sine';
      safeSet(lock.frequency, 112, t0 + 0.31);
      safeExp(lock.frequency, 44, t0 + 0.40);
      safeSet(lockEnv.gain, 0.28, t0 + 0.31);
      safeExp(lockEnv.gain, 0.0001, t0 + 0.41);
      lock.connect(lockEnv);
      lockEnv.connect(sfxBus);
      lock.start(t0 + 0.31);
      lock.stop(t0 + 0.42);
      trackVoice(t0 + 0.42);

      // Rapid brass ratchet teeth clicking along the crank track
      var clickTimes = [0.015, 0.05, 0.09, 0.135, 0.185, 0.24, 0.305];
      for (var i = 0; i < clickTimes.length; i++) {
        var pitch = 1520 + i * 95;
        playBrassClick(t0 + clickTimes[i], pitch, 0.13, -0.25 + i * 0.08);
      }
    } catch (e) {}
  }

  // 6. playWaterSplash(): Sparkling bubbling water rush & splash droplets
  function playWaterSplash() {
    if (!canPlaySfx('waterSplash', 45)) return;
    try {
      var t0 = ctx.currentTime + 0.004;

      // Foamy sky-water rush
      playNoiseBurst(t0, 0.42, 'bandpass', 540, 1750, 2.0, 0.22, -0.15, true);
      playNoiseBurst(t0 + 0.08, 0.36, 'bandpass', 1600, 720, 2.6, 0.15, 0.2, true);

      // 6 resonant upward-chirping water bubbles (classic Helmholtz bubble physics)
      var bubbleFreqs = [460, 620, 530, 790, 680, 940];
      for (var i = 0; i < bubbleFreqs.length; i++) {
        var bt = t0 + 0.02 + i * 0.052;
        var f0 = bubbleFreqs[i];
        var bub = ctx.createOscillator();
        var bEnv = ctx.createGain();
        bub.type = 'sine';
        safeSet(bub.frequency, f0, bt);
        safeExp(bub.frequency, f0 * 2.15, bt + 0.048);
        safeSet(bEnv.gain, 0.0001, bt);
        safeLin(bEnv.gain, 0.13, bt + 0.008);
        safeExp(bEnv.gain, 0.0001, bt + 0.052);
        bub.connect(bEnv);
        bEnv.connect(sfxBus);
        bub.start(bt);
        bub.stop(bt + 0.058);
      }
      trackVoice(t0 + 0.45);

      // Sunlit droplet sparkle
      synthCelesta(mtof(91), t0 + 0.07, 0.30, 0.08, 0.3, true, sfxBus);
      synthCelesta(mtof(96), t0 + 0.14, 0.32, 0.07, -0.3, true, sfxBus);
    } catch (e) {}
  }

  // 7. playPendulumWhoosh(): Deep Doppler-swept bronze whoosh + resonant bell-hammer ring
  function playPendulumWhoosh() {
    if (!canPlaySfx('pendulum', 80)) return;
    try {
      var t0 = ctx.currentTime + 0.005;

      // Doppler-swept heavy air & bronze blade whoosh (peaks at t0 + 0.24s)
      if (sharedNoiseBuf) {
        var src = ctx.createBufferSource();
        src.buffer = sharedNoiseBuf;
        var bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.Q.value = 2.4;
        safeSet(bpf.frequency, 150, t0);
        safeExp(bpf.frequency, 920, t0 + 0.24);
        safeExp(bpf.frequency, 140, t0 + 0.56);

        var wEnv = ctx.createGain();
        safeSet(wEnv.gain, 0.0001, t0);
        safeLin(wEnv.gain, 0.32, t0 + 0.23);
        safeExp(wEnv.gain, 0.0001, t0 + 0.58);

        src.connect(bpf);
        bpf.connect(wEnv);

        var pan = makePanNode(-0.7);
        if (pan) {
          safeSet(pan.pan, -0.7, t0);
          safeLin(pan.pan, 0.7, t0 + 0.56);
          wEnv.connect(pan);
          pan.connect(sfxBus);
        } else {
          wEnv.connect(sfxBus);
        }
        src.start(t0, 0.05, 0.62);
      }

      // Low Doppler bronze hum
      var hum = ctx.createOscillator();
      var humEnv = ctx.createGain();
      hum.type = 'sawtooth';
      var humLp = ctx.createBiquadFilter();
      humLp.type = 'lowpass';
      humLp.frequency.value = 360;
      safeSet(hum.frequency, 92, t0);
      safeLin(hum.frequency, 132, t0 + 0.24);
      safeLin(hum.frequency, 84, t0 + 0.55);
      safeSet(humEnv.gain, 0.0001, t0);
      safeLin(humEnv.gain, 0.16, t0 + 0.23);
      safeExp(humEnv.gain, 0.0001, t0 + 0.56);
      hum.connect(humLp);
      humLp.connect(humEnv);
      humEnv.connect(sfxBus);
      hum.start(t0);
      hum.stop(t0 + 0.58);

      // Resonant Bronze Bell-Hammer Ring at sweep apex (t0 + 0.22s)
      synthTubularBell(mtof(55), t0 + 0.22, 0.95, 0.22, sfxBus); // G3 bronze bell
      synthTubularBell(mtof(62), t0 + 0.225, 0.80, 0.14, sfxBus); // D4 fifth
    } catch (e) {}
  }

  // 8. playGargoyleShatter(): Limestone fracture crunch + tumbling pebbles + radiant golden chord
  function playGargoyleShatter() {
    if (!canPlaySfx('shatter', 60)) return;
    try {
      var t0 = ctx.currentTime + 0.005;

      // 1) Initial stone fracture impact & crack
      playNoiseBurst(t0, 0.16, 'bandpass', 1450, 420, 1.2, 0.36, 0.0, true);
      playNoiseBurst(t0 + 0.015, 0.28, 'lowpass', 680, 180, 1.5, 0.30, 0.0, true);

      var boom = ctx.createOscillator();
      var boomEnv = ctx.createGain();
      boom.type = 'triangle';
      safeSet(boom.frequency, 128, t0);
      safeExp(boom.frequency, 38, t0 + 0.22);
      safeSet(boomEnv.gain, 0.32, t0);
      safeExp(boomEnv.gain, 0.0001, t0 + 0.24);
      boom.connect(boomEnv);
      boomEnv.connect(sfxBus);
      boom.start(t0);
      boom.stop(t0 + 0.26);

      // 2) 8 cascading limestone chunks & tumbling pebbles bouncing across sandstone
      var pebbleOffsets = [0.05, 0.095, 0.14, 0.19, 0.25, 0.31, 0.38, 0.46];
      for (var i = 0; i < pebbleOffsets.length; i++) {
        var pt = t0 + pebbleOffsets[i];
        var pf = 620 + i * 260;
        var pg = 0.17 * Math.pow(0.84, i);
        var ppan = ((i % 2 === 0) ? -1 : 1) * (0.15 + i * 0.07);
        playNoiseBurst(pt, 0.042, 'bandpass', pf, pf * 0.72, 4.2, pg, ppan, false);
        playBrassClick(pt, pf * 0.65, pg * 0.65, ppan);
      }

      // 3) Radiant golden purification chord (G Lydian Major 9)
      var goldChord = [67, 74, 78, 81, 83, 86];
      for (var j = 0; j < goldChord.length; j++) {
        synthCelesta(
          mtof(goldChord[j]),
          t0 + 0.04 + j * 0.028,
          0.72,
          0.115,
          -0.35 + j * 0.14,
          true,
          sfxBus
        );
      }
      trackVoice(t0 + 0.85);
    } catch (e) {}
  }

  // 9. playAbility(heroType): Distinct signature for warrior, mage, rogue
  function playAbility(heroType) {
    if (!canPlaySfx('ability', 40)) return;
    try {
      var kind = String(heroType || 'warrior').toLowerCase();
      var t0 = ctx.currentTime + 0.004;

      if (kind.indexOf('mage') !== -1 || kind.indexOf('staff') !== -1 || kind.indexOf('astral') !== -1) {
        // MAGE — Celestial Sun-Staff Resonance & Lydian Shimmer Sweep
        var staffNotes = [74, 78, 81, 85, 86, 90]; // D5, F#5, A5, C#6, D6, F#6
        for (var i = 0; i < staffNotes.length; i++) {
          synthCelesta(mtof(staffNotes[i]), t0 + i * 0.032, 0.48, 0.12, -0.3 + i * 0.12, true, sfxBus);
        }
        synthWoodwindPad(mtof(74), t0 + 0.02, 0.50, 0.12, -0.2, sfxBus);
        synthWoodwindPad(mtof(81), t0 + 0.04, 0.52, 0.10, 0.2, sfxBus);
      } else if (kind.indexOf('rogue') !== -1 || kind.indexOf('swap') !== -1 || kind.indexOf('grapple') !== -1) {
        // ROGUE — Whipping Grapple Cord Zip + Brass Hook Snap + Taut Wire Pull
        playNoiseBurst(t0, 0.12, 'bandpass', 650, 3600, 3.5, 0.22, -0.3, false);

        var zip = ctx.createOscillator();
        var zipEnv = ctx.createGain();
        zip.type = 'sawtooth';
        var zFilter = ctx.createBiquadFilter();
        zFilter.type = 'bandpass';
        zFilter.frequency.value = 1800;
        safeSet(zip.frequency, 340, t0);
        safeExp(zip.frequency, 1520, t0 + 0.11);
        safeExp(zip.frequency, 580, t0 + 0.24);
        safeSet(zipEnv.gain, 0.0001, t0);
        safeLin(zipEnv.gain, 0.15, t0 + 0.04);
        safeExp(zipEnv.gain, 0.0001, t0 + 0.25);
        zip.connect(zFilter);
        zFilter.connect(zipEnv);
        zipEnv.connect(sfxBus);
        zip.start(t0);
        zip.stop(t0 + 0.26);

        // Brass grapple hook latch snap
        playBrassClick(t0 + 0.115, 2650, 0.24, 0.25);
        playBrassClick(t0 + 0.145, 1950, 0.18, 0.15);
        trackVoice(t0 + 0.28);
      } else {
        // WARRIOR — Heavy Bronze Buckler/Sword Clang + Titan Crank Torque
        synthTubularBell(mtof(50), t0, 0.48, 0.24, sfxBus);       // D3 heavy bronze
        synthTubularBell(mtof(62) * 1.01, t0 + 0.005, 0.38, 0.18, sfxBus);
        playNoiseBurst(t0, 0.09, 'bandpass', 1900, 820, 2.2, 0.22, 0.0, true);
        playBrassClick(t0 + 0.06, 1340, 0.20, -0.2);
        playBrassClick(t0 + 0.12, 1560, 0.20, 0.2);
      }
    } catch (e) {}
  }

  // 10. playTurnEnd(): Pocket-watch winding ratchet + warm sundial fifth
  function playTurnEnd() {
    if (!canPlaySfx('turnEnd', 60)) return;
    try {
      var t0 = ctx.currentTime + 0.004;
      playBrassClick(t0, 1620, 0.14, -0.2);
      playBrassClick(t0 + 0.055, 1880, 0.14, 0.0);
      playBrassClick(t0 + 0.11, 2140, 0.15, 0.2);

      synthMarimba(mtof(62), t0 + 0.04, 0.24, 0.14, -0.15, sfxBus); // D4
      synthMarimba(mtof(69), t0 + 0.11, 0.32, 0.15, 0.15, sfxBus);  // A4
      synthCelesta(mtof(79), t0 + 0.16, 0.38, 0.11, 0.0, true, sfxBus); // G5
    } catch (e) {}
  }

  // 11. playVictory(): Joyful sunlit Celesta, Harp & Warm Brass Fanfare
  function playVictory() {
    if (!canPlaySfx('victory', 300)) return;
    try {
      var t0 = ctx.currentTime + 0.01;
      // Gently duck background score so the fanfare sparkles cleanly
      victoryDuckUntil = nowMs() + 2700;
      if (musicBus) {
        safeLin(musicBus.gain, 0.08, t0 + 0.08);
      }

      // 1) Sparkling G-Lydian Harp Glissando Sweep
      var gliss = [67, 69, 71, 73, 74, 76, 78, 79];
      for (var i = 0; i < gliss.length; i++) {
        synthHarpPluck(mtof(gliss[i]), t0 + i * 0.038, 0.55, 0.12, -0.4 + i * 0.11, sfxBus);
      }

      // 2) Triumphant Brass/Woodwind + Celesta Fanfare Motif
      //    D5 -> G5 -> A5 (Lydian lift!) -> B5 -> D6 (radiant Gmaj9 peak!)
      var motif = [
        { m: 74, t: 0.24, d: 0.22 },
        { m: 79, t: 0.42, d: 0.22 },
        { m: 81, t: 0.60, d: 0.22 },
        { m: 83, t: 0.78, d: 0.28 },
        { m: 86, t: 1.06, d: 1.15 }
      ];
      for (var k = 0; k < motif.length; k++) {
        var n = motif[k];
        synthCelesta(mtof(n.m), t0 + n.t, n.d + 0.25, 0.16, 0.1, true, sfxBus);
        synthMarimba(mtof(n.m - 12), t0 + n.t, n.d, 0.13, -0.15, sfxBus);
      }

      // 3) Warm French-Horn / Woodwind Choir Chords underneath
      // Chord 1: G major (t + 0.24)
      var c1 = [55, 62, 67, 71];
      // Chord 2: A major over G — sunlit Lydian wonder! (t + 0.60)
      var c2 = [55, 64, 69, 73];
      // Chord 3: Radiant Gmaj9 finale (t + 1.06)
      var c3 = [43, 55, 62, 66, 71, 74];

      for (var a = 0; a < c1.length; a++) {
        synthWoodwindPad(mtof(c1[a]), t0 + 0.24, 0.36, 0.08, -0.2 + a * 0.12, sfxBus);
      }
      for (var b = 0; b < c2.length; b++) {
        synthWoodwindPad(mtof(c2[b]), t0 + 0.60, 0.44, 0.085, -0.2 + b * 0.12, sfxBus);
      }
      for (var c = 0; c < c3.length; c++) {
        synthWoodwindPad(mtof(c3[c]), t0 + 1.06, 1.35, 0.09, -0.3 + c * 0.12, sfxBus);
      }
      synthTubularBell(mtof(67), t0 + 1.06, 1.4, 0.15, sfxBus);

      // Twinkling top celesta grace bells on the final chord
      synthCelesta(mtof(90), t0 + 1.28, 0.75, 0.11, -0.3, true, sfxBus); // F#6
      synthCelesta(mtof(93), t0 + 1.42, 0.85, 0.11, 0.3, true, sfxBus);  // A6
      synthCelesta(mtof(98), t0 + 1.56, 1.05, 0.13, 0.0, true, sfxBus);  // D7
    } catch (e) {}
  }

  // 12. playError(): Tactile wooden/brass toy-box double-bonk (gentle, never harsh)
  function playError() {
    if (!canPlaySfx('error', 60)) return;
    try {
      var t0 = ctx.currentTime + 0.004;
      var notes = [255, 192];
      for (var i = 0; i < 2; i++) {
        var nt = t0 + i * 0.092;
        var osc = ctx.createOscillator();
        var env = ctx.createGain();
        osc.type = 'triangle';
        safeSet(osc.frequency, notes[i], nt);
        safeExp(osc.frequency, notes[i] * 0.78, nt + 0.075);
        safeSet(env.gain, 0.0001, nt);
        safeLin(env.gain, 0.18, nt + 0.006);
        safeExp(env.gain, 0.0001, nt + 0.082);
        osc.connect(env);
        env.connect(sfxBus);
        osc.start(nt);
        osc.stop(nt + 0.09);
        playNoiseBurst(nt, 0.024, 'bandpass', 640, 420, 3.0, 0.08, 0, false);
      }
      trackVoice(t0 + 0.22);
    } catch (e) {}
  }

  // 13. playAstralAid(): Celestial harp + starlight celesta cascade + crystalline frost lock
  function playAstralAid() {
    if (!canPlaySfx('astralAid', 120)) return;
    try {
      var t0 = ctx.currentTime + 0.006;
      var arp = [71, 74, 78, 83, 86, 90, 95]; // B4..B6 shimmering sapphire-gold cascade
      for (var i = 0; i < arp.length; i++) {
        var wt = t0 + i * 0.036;
        synthHarpPluck(mtof(arp[i]), wt, 0.55, 0.13, -0.4 + i * 0.13, sfxBus);
        synthCelesta(mtof(arp[i] + 12), wt + 0.015, 0.65, 0.09, 0.35 - i * 0.1, true, sfxBus);
      }
      // Crystalline time-cage lock chord at t + 0.28s
      synthTubularBell(mtof(79), t0 + 0.28, 0.95, 0.14, sfxBus);
      synthWoodwindPad(mtof(67), t0 + 0.18, 0.72, 0.08, -0.15, sfxBus);
      synthWoodwindPad(mtof(74), t0 + 0.18, 0.72, 0.08, 0.15, sfxBus);
      playNoiseBurst(t0 + 0.26, 0.16, 'bandpass', 2400, 4200, 3.2, 0.10, 0.0, true);
      trackVoice(t0 + 1.15);
    } catch (e) {}
  }

  // 14. playRogueStep(): Stealthy muted leather prowl + tense low pizzicato pluck
  function playRogueStep() {
    if (!canPlaySfx('rogueStep', 40)) return;
    try {
      var t0 = ctx.currentTime + 0.004;
      playNoiseBurst(t0, 0.065, 'bandpass', 720, 420, 2.2, 0.11, 0.12, false);
      synthMarimba(mtof(52), t0 + 0.01, 0.14, 0.12, 0.15, sfxBus); // Low E3 prowl pulse
      trackVoice(t0 + 0.18);
    } catch (e) {}
  }

  // 15. playSunBlind(): Dazzling golden sun-chime when Rogue steps into a sunbeam
  function playSunBlind() {
    if (!canPlaySfx('sunBlind', 90)) return;
    try {
      var t0 = ctx.currentTime + 0.005;
      synthCelesta(mtof(86), t0, 0.42, 0.12, -0.2, true, sfxBus);
      synthCelesta(mtof(90), t0 + 0.045, 0.48, 0.13, 0.2, true, sfxBus);
      synthHarpPluck(mtof(78), t0 + 0.02, 0.45, 0.11, 0.0, sfxBus);
      trackVoice(t0 + 0.55);
    } catch (e) {}
  }

  // 16. playAmbush(): Dramatic minor-chord shadow strike + steel blade ring + timpani thud
  function playAmbush() {
    if (!canPlaySfx('ambush', 220)) return;
    try {
      var t0 = ctx.currentTime + 0.006;
      // Sharp steel dagger draw
      playNoiseBurst(t0, 0.18, 'bandpass', 1800, 3600, 3.6, 0.22, 0.0, true);
      // Deep timpani impact
      var sub = ctx.createOscillator();
      var subEnv = ctx.createGain();
      sub.type = 'triangle';
      safeSet(sub.frequency, 118, t0 + 0.03);
      safeExp(sub.frequency, 42, t0 + 0.42);
      safeSet(subEnv.gain, 0.32, t0 + 0.03);
      safeExp(subEnv.gain, 0.0001, t0 + 0.46);
      sub.connect(subEnv);
      subEnv.connect(sfxBus);
      sub.start(t0 + 0.03);
      sub.stop(t0 + 0.48);

      // Dramatic E-minor / Phrygian sting
      var minorChord = [52, 55, 59, 63];
      for (var i = 0; i < minorChord.length; i++) {
        synthWoodwindPad(mtof(minorChord[i]), t0 + 0.04 + i * 0.02, 0.65, 0.10, -0.24 + i * 0.16, sfxBus);
      }
      synthTubularBell(mtof(52), t0 + 0.05, 0.85, 0.14, sfxBus);
      trackVoice(t0 + 0.92);
    } catch (e) {}
  }

  // 17. playWelcomeStart(): Radiant Sanctuary Curtain-Rise Fanfare when pressing PLAY on Welcome Screen
  function playWelcomeStart() {
    if (!canPlaySfx('welcomeStart', 180)) return;
    try {
      var t0 = ctx.currentTime + 0.006;
      // Tactile carved sandstone slab press + brass gear latch
      playNoiseBurst(t0, 0.055, 'bandpass', 980, 520, 2.8, 0.16, 0.0, false);
      // Ascending G-Lydian harp & celesta sunbeam glissando
      var gliss = [67, 71, 74, 78, 79, 81, 83, 86];
      for (var i = 0; i < gliss.length; i++) {
        var gt = t0 + 0.02 + i * 0.038;
        synthHarpPluck(mtof(gliss[i]), gt, 0.52, 0.13, -0.35 + i * 0.10, sfxBus);
        if (i % 2 === 1) {
          synthCelesta(mtof(gliss[i] + 12), gt + 0.012, 0.62, 0.10, 0.25 - i * 0.06, true, sfxBus);
        }
      }
      // Warm sunlit horn/woodwind swell + sanctuary bell
      var chord = [55, 62, 67, 71, 74];
      for (var c = 0; c < chord.length; c++) {
        synthWoodwindPad(mtof(chord[c]), t0 + 0.22, 0.72, 0.08, -0.24 + c * 0.12, sfxBus);
      }
      synthTubularBell(mtof(79), t0 + 0.28, 0.95, 0.13, sfxBus);
      trackVoice(t0 + 1.05);
    } catch (e) {}
  }

  // ==========================================================================
  // Lifecycle, Unlocking & Mute Controls
  // ==========================================================================

  function applyMasterMuteGain() {
    if (!ctx || !masterGain) return;
    try {
      var t0 = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(t0);
      masterGain.gain.setValueAtTime(masterGain.gain.value, t0);
      masterGain.gain.linearRampToValueAtTime(muted ? 0.0 : 0.85, t0 + 0.035);
    } catch (e) {
      try {
        masterGain.gain.value = muted ? 0.0 : 0.85;
      } catch (e2) {}
    }
  }

  function unlock(fromUserGesture) {
    var wasAudible = isAudibleNow();
    if (fromUserGesture && !muted && !wasAudible) {
      autoStartedInCurrentPress = true;
    }
    justUnlockedUntil = nowMs() + 250;
    ensureContext();
    resumeContextSafely(Boolean(fromUserGesture));
    if (ctx && ctx.state === 'running') {
      unlocked = true;
      if (ctx.currentTime > 0.015) {
        wasEverAudible = true;
        stopFallbackAudio();
      }
      if (!muted) {
        startSequencer(true);
      }
    } else if (fromUserGesture && !muted) {
      startFallbackAutoplayOverture();
    }
    return true;
  }

  function setMuted(bool) {
    muted = !!bool;
    muteToggledInGesture = true;
    applyMasterMuteGain();
    if (muted) {
      stopFallbackAudio();
      stopSequencer();
    } else {
      ensureContext();
      resumeContextSafely(true);
      if (ctx && ctx.state === 'running') {
        unlocked = true;
        if (ctx.currentTime > 0.015) {
          wasEverAudible = true;
          stopFallbackAudio();
        }
        startSequencer(true);
      } else {
        startFallbackAutoplayOverture();
      }
    }
    emitAudioStateEvent();
    return muted;
  }

  function toggleMute() {
    // Crucial UX fix: if music was NOT audible prior to this press/click (cold-tab autoplay
    // block) and this press's pointerdown unlocked it, NEVER mute on the first click —
    // keep Music ON & start immediately!
    if (
      !muted &&
      (
        autoStartedInCurrentPress ||
        (!wasEverAudible && !silentStartGuardConsumed)
      )
    ) {
      autoStartedInCurrentPress = false;
      silentStartGuardConsumed = true;
      setMuted(false);
      playSelect();
      return false;
    }
    autoStartedInCurrentPress = false;
    return setMuted(!muted);
  }

  function isMuted() {
    return muted;
  }

  function setLevel(levelId) {
    var lv = Number(levelId);
    if (lv >= 1 && lv <= 4) {
      currentLevel = lv;
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    // Optional URL mute flag support (?mute=1)
    try {
      if (root.location && typeof root.location.search === 'string') {
        if (root.location.search.indexOf('mute=1') !== -1) {
          muted = true;
        }
      }
    } catch (e) {}

    // 1. Synchronous Dual-Engine Immediate Page-Load Autoplay:
    //    - Start AudioContext.resume() immediately (0ms latency when WebAudio autoplay is open).
    //    - Synchronously attach & play an 8-bar (9.23s > 7s Chrome MEI threshold) stereo WAV
    //      <audio autoplay loop playsinline> so browsers with Media Engagement / navigation
    //      activation start the sunlit score immediately at t=0ms with zero clicks!
    var tryBootAutoplay = function () {
      if (muted || isAudibleNow()) return;
      ensureContext();
      resumeContextSafely(false);
      if (!ctx || ctx.state !== 'running') {
        startFallbackAutoplayOverture();
      }
    };
    tryBootAutoplay();

    // 2. Clean User-Activation Unlock on any click/tap/key + throttled hover/scroll retry
    if (typeof root.addEventListener === 'function') {
      var onUserGesture = function () {
        if (!isAudibleNow() || !ctx || ctx.state !== 'running') {
          unlock(true);
        }
      };
      var onSoftActivity = function () {
        if (muted || isAudibleNow()) return;
        var t = nowMs();
        if (t - lastHoverTryMs < 600) return;
        lastHoverTryMs = t;
        tryBootAutoplay();
      };

      root.addEventListener('pointerdown', onUserGesture, { capture: true, passive: true });
      root.addEventListener('mousedown', onUserGesture, { capture: true, passive: true });
      root.addEventListener('pointerup', onUserGesture, { capture: true, passive: true });
      root.addEventListener('mouseup', onUserGesture, { capture: true, passive: true });
      root.addEventListener('touchstart', onUserGesture, { capture: true, passive: true });
      root.addEventListener('touchend', onUserGesture, { capture: true, passive: true });
      root.addEventListener('click', function () {
        onUserGesture();
        // Clear press-scoped auto-start latch right after all synchronous click handlers finish
        setTimeout(function () {
          autoStartedInCurrentPress = false;
        }, 0);
      }, { capture: true, passive: true });
      root.addEventListener('pointermove', onSoftActivity, { capture: true, passive: true });
      root.addEventListener('wheel', onSoftActivity, { capture: true, passive: true });
      root.addEventListener('DOMContentLoaded', tryBootAutoplay);
      root.addEventListener('load', tryBootAutoplay);
      root.addEventListener('pageshow', tryBootAutoplay);
      root.addEventListener('focus', tryBootAutoplay);

      root.addEventListener('keydown', function (ev) {
        unlock(true);
        if (!ev || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
        var tag = (ev.target && ev.target.tagName) ? String(ev.target.tagName).toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (ev.key === 'm' || ev.key === 'M') {
          muteToggledInGesture = false;
          // Defer past synchronous keydown handlers (e.g. main.js) so M never double-toggles
          Promise.resolve().then(function () {
            if (!muteToggledInGesture) {
              toggleMute();
            }
          });
        }
      }, { capture: true });

      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible' && !muted) {
            tryBootAutoplay();
          }
        });
      }
    }
  }

  function update() {
    syncLevelFromSim();
  }

  // Expose window.GAME.Audio matching CONTRACT.md Section 5.6
  root.GAME.Audio = {
    init: init,
    unlock: unlock,
    toggleMute: toggleMute,
    isMuted: isMuted,
    isPlaying: isAudibleNow,
    setMuted: setMuted,
    setLevel: setLevel,
    update: update,

    playHop: playHop,
    playSelect: playSelect,
    playMirrorRotate: playMirrorRotate,
    playBeamChord: playBeamChord,
    playGearSlide: playGearSlide,
    playWaterSplash: playWaterSplash,
    playPendulumWhoosh: playPendulumWhoosh,
    playGargoyleShatter: playGargoyleShatter,
    playAbility: playAbility,
    playAstralAid: playAstralAid,
    playRogueStep: playRogueStep,
    playSunBlind: playSunBlind,
    playAmbush: playAmbush,
    playWelcomeStart: playWelcomeStart,
    playTurnEnd: playTurnEnd,
    playVictory: playVictory,
    playError: playError
  };

  // Start sunlit Welcome Screen score immediately as soon as audio.js executes on page load!
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();

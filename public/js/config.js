/**
 * Clockwork Sanctum: The Living Board
 * Master Configuration, Aesthetic 1 Sunlit Toy-Box Palette, Optical Math & Camera Rig
 */
(function () {
  'use strict';

  window.GAME = window.GAME || {};

  var GRID_SIZE = 8;
  var TILE_SIZE = 2.0;
  var HALF_GRID_OFFSET = (GRID_SIZE - 1) * 0.5; // 3.5 -> board spans [-7.0, +7.0] center-to-center, [-8.0, +8.0] outer bounds
  var BEAM_Y = 0.82;

  // Cardinal directions: 0:N(-Z), 1:E(+X), 2:S(+Z), 3:W(-X)
  var DIRS = [
    { id: 0, dc: 0, dr: -1, name: 'N', label: 'North (-Z)' },
    { id: 1, dc: 1, dr: 0, name: 'E', label: 'East (+X)' },
    { id: 2, dc: 0, dr: 1, name: 'S', label: 'South (+Z)' },
    { id: 3, dc: -1, dr: 0, name: 'W', label: 'West (-X)' }
  ];

  var DIR_BY_NAME = { N: 0, E: 1, S: 2, W: 3 };
  var OPPOSITE_DIR = [2, 3, 0, 1];

  // Locked Master Aesthetic 1 Palette across ALL 4 levels
  // (Ankama / Krosmaster Sunlit Sky-Island Toy-Box — NEVER dark/night/sci-fi)
  var PALETTE_HEX = {
    // Beveled Golden Sandstone (Rich Toasted Ankama Honey-Ochre)
    sandstone: 0xE2AA5A,
    sandstoneLight: 0xEBB96E,
    sandstoneBevel: 0xC88A3B,
    sandstoneDark: 0x9E6422,
    mortarSeam: 0x1E1108,

    // Plump Chartreuse Moss Cushions
    moss: 0x8FD11F,
    mossMid: 0x84C416,
    mossHighlight: 0xACE224,
    mossShadow: 0x437A08,

    // Chiseled Grey-Slate & Warm-Buff Cliff Stone
    cliffRock: 0x7D8491,
    cliffSlate: 0x4E5768,
    cliffShadow: 0x38404E,
    cliffBuff: 0x968E84,

    // Left-Flank Burnished Antique Bronze Cogwheels & Ornate Brass Frames
    bronze: 0x8C5B24,
    bronzeBright: 0xBA853C,
    brassGold: 0xE5A832,
    bronzeDark: 0x42290E,

    // Right-Flank Rustic Walnut/Oak Wooden Paddle-Waterwheels
    wood: 0x784520,
    woodLight: 0x965B2E,
    woodDark: 0x3D200C,

    // Bright Cerulean Daytime Sky & Fluffy Cumulus Clouds
    skyTop: 0x4FA6E8,
    skyHorizon: 0x8FD3FF,
    skyBounce: 0x7EC8FF,
    cloudTop: 0xFFFFFF,
    cloudUnderside: 0xBCE2FF,

    // Volumetric Golden Sunbeams, Sky-Iridescent Prism Mirrors & Fire Braziers
    beamCore: 0xFFF9DC,
    beamGlow: 0xFFB01E,
    prismCrystal: 0x9ADFFF,
    brazierInner: 0xFFF2A6,
    brazierOuter: 0xFF8818,
    brazierTerracotta: 0xB8642E,

    // Aqueduct Sparkling Turquoise Sky-Water
    water: 0x149CE6,
    waterDeep: 0x0E74B2,
    waterFoam: 0xFFFFFF,

    // Tactical Tile Outlines & Board Highlights
    heroOutline: 0x00F0FF,
    villainOutline: 0xFF2442,
    astralOutline: 0x5CE6FF,
    gargoyleOutline: 0xFF26D4,
    highlightMove: 0x33F0FF,
    highlightAttack: 0xFF5E5E,
    highlightGear: 0xFFB82E,
    highlightHint: 0xFFD94A,
    highlightDanger: 0xFF4D4D,
    highlightExit: 0xFFE066,

    // Chibi Hero & Gargoyle Sculpt Accents
    warriorArmor: 0x8C96A6,
    warriorTunic: 0xA64B2A,
    warriorHair: 0x6B3E26,
    mageBlue: 0x2A6BE4,
    mageGold: 0xF2B632,
    mageHair: 0xF0BC5E,
    rogueHood: 0x32363F,
    rogueTunic: 0x3B6E38,
    gargoyleStone: 0x8E9299,
    gargoyleCrease: 0x5C6068,

    // Warm Sunlit Key & Fill Lights
    sunLight: 0xFFF3D6,
    groundBounce: 0xC99B52,
    rimLight: 0x9BD8FF,

    // Collector-Card & Medallion HUD
    hudGold: 0xE5A93B,
    hudOutline: 0x261C16,
    hudSlate: 0x333B4C,
    hudHeart: 0xFF5E5E,
    hudAp: 0x5CE6FF
  };

  function hexToCss(hexNum) {
    return '#' + ('000000' + (hexNum >>> 0).toString(16)).slice(-6).toUpperCase();
  }

  function hexToRgb(hexNum) {
    return {
      r: (hexNum >> 16) & 255,
      g: (hexNum >> 8) & 255,
      b: hexNum & 255
    };
  }

  var PALETTE_CSS = {};
  Object.keys(PALETTE_HEX).forEach(function (k) {
    PALETTE_CSS[k] = hexToCss(PALETTE_HEX[k]);
  });

  // Expose hex numbers at top level of PALETTE plus .hex and .css maps for convenience
  var PALETTE = Object.assign({}, PALETTE_HEX, {
    hex: PALETTE_HEX,
    css: PALETTE_CSS
  });

  function gridToWorld(col, row) {
    return {
      x: (col - HALF_GRID_OFFSET) * TILE_SIZE,
      z: (row - HALF_GRID_OFFSET) * TILE_SIZE
    };
  }

  function worldToGrid(wx, wz) {
    return {
      col: Math.round(wx / TILE_SIZE + HALF_GRID_OFFSET),
      row: Math.round(wz / TILE_SIZE + HALF_GRID_OFFSET)
    };
  }

  function inBounds(col, row) {
    return col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE;
  }

  /**
   * Exact 90-degree double-sided crystal prism reflection:
   * - Even rot (0, 2) => '/' plane (rotation.y = PI/4 + rot*PI/2): N<->E, S<->W
   * - Odd  rot (1, 3) => '\' plane (rotation.y = PI/4 + rot*PI/2): N<->W, S<->E
   */
  function reflectDir(inDir, mirrorRot) {
    var d = ((inDir % 4) + 4) % 4;
    var r = ((mirrorRot % 4) + 4) % 4;
    return (r % 2 === 0) ? [1, 0, 3, 2][d] : [3, 2, 1, 0][d];
  }

  var HERO_SPECS = {
    warrior: {
      id: 'warrior',
      name: 'Warrior',
      role: 'Sanctum Knight',
      hp: 24,
      maxHp: 20,
      ap: 99,
      maxAp: 99,
      move: 2,
      moveRange: 2,
      power: 3,
      armor: 2,
      tier: 1,
      mirrorRange: 16,
      gearRange: 16,
      abilityKey: 'titanCrank',
      abilityName: 'Titan Crank',
      abilityRange: 16,
      shoveRange: 1,
      outlineColor: '#00F0FF',
      outlineHex: 0x00F0FF,
      cardBackdrop: '#D89E40',
      desc: 'Dodge 2 · Click Mirrors & Gears',
      description: 'Dodges 2 tiles; clicks any mirror, gear, or gargoyle.'
    },
    mage: {
      id: 'mage',
      name: 'Astral Aid',
      role: 'Pocket Summon [F]',
      hp: 18,
      maxHp: 18,
      ap: 1,
      maxAp: 1,
      move: 0,
      moveRange: 0,
      power: 3,
      armor: 1,
      tier: 2,
      mirrorRange: 16,
      gearRange: 16,
      abilityKey: 'astralAid',
      abilityName: 'Astral Aid',
      abilityRange: 16,
      outlineColor: '#5CE6FF',
      outlineHex: 0x5CE6FF,
      cardBackdrop: '#1F6A8A',
      desc: '⚡ Freeze Rogue 2 Steps',
      description: 'Summons Mage in starlight to freeze Rogue for 2 steps!'
    },
    rogue: {
      id: 'rogue',
      name: 'Shadow Rogue',
      role: 'Relentless Hunter',
      hp: 18,
      maxHp: 18,
      ap: 1,
      maxAp: 1,
      move: 1,
      moveRange: 1,
      power: 3,
      armor: 1,
      tier: 3,
      mirrorRange: 0,
      gearRange: 0,
      abilityKey: 'shadowAmbush',
      abilityName: 'Shadow Ambush',
      abilityRange: 1,
      outlineColor: '#FF2442',
      outlineHex: 0xFF2442,
      cardBackdrop: '#6E1426',
      desc: 'Stalks 1 Tile/Step · Blind w/ Sun',
      description: 'Stalks Warrior 1 tile per step. Blind him with sunbeams!'
    }
  };

  var GARGOYLE_SPEC = {
    id: 'gargoyle',
    name: 'Stone Gargoyle',
    hp: 9,
    maxHp: 9,
    ap: 2,
    maxAp: 2,
    move: 2,
    moveRange: 2,
    power: 3,
    armor: 3,
    tier: 1,
    outlineColor: '#FF33CC',
    outlineHex: 0xFF33CC,
    cardBackdrop: '#5B2D6E',
    description: 'Sleeping stone sentinel. Vulnerable to sunbeams & cliff drops.'
  };

  var CAMERA = {
    // ~39.5 deg azimuth + [18.0, 20.2, 21.8] framing lifts the -5.65m limestone-slate cliff
    // and front-right wooden waterwheel cleanly above the bottom HUD bar with cloud/sky margin!
    defaultPos: [18.0, 20.2, 21.8],
    defaultTarget: [0.0, -1.45, 0.0],
    fov: 34.0,
    near: 0.25,
    far: 180,
    minDistance: 16.0,
    maxDistance: 38.0,

    // Clean hero framing for ?thumb=1 (640x400 card capture, fits full -5.65m tapered slate spire)
    thumbPreset: {
      pos: [18.0, 20.2, 21.8],
      target: [0.0, -1.45, 0.0],
      fov: 34.0,
      level: 1,
      hideHud: true,
      hudVisible: false,
      label: 'Hero Thumbnail Framing'
    },

    // Canonical Tier-3 A/B Benchmark Stages (?bench=1..4)
    benchPresets: {
      1: {
        pos: [18.0, 20.2, 21.8],
        target: [0.0, -1.45, 0.0],
        fov: 34.0,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Stage 1: Macro Sunlit Sky-Island Diorama'
      },
      2: {
        pos: [11.8, 13.4, 14.8],
        target: [-0.2, 0.25, -0.4],
        fov: 31,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Stage 2: Prism Mirrors, Golden Sunbeam Chain & Corner Braziers'
      },
      3: {
        pos: [10.6, 11.8, 13.4],
        target: [-0.6, 0.30, 1.4],
        fov: 30,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Stage 3: Tactical Squad & Stone Gargoyles Close-Up'
      },
      4: {
        pos: [18.0, 20.2, 21.8],
        target: [0.0, -1.45, 0.0],
        fov: 34.0,
        level: 1,
        hideHud: false,
        hudVisible: true,
        label: 'Stage 4: Full Gameplay & Collector-Card HUD'
      }
    },

    // High-Zoom Tier-2 Micro-Inspection Plates (?closeup=1..6, distance = 10-16m)
    closeupPresets: {
      1: {
        // Warrior (-5,-1), Mage (-3,5), Rogue (1,5) chibi models on cyan-outlined tiles (dist ~ 13.3m)
        pos: [4.8, 7.4, 10.8],
        target: [-2.4, 0.45, 2.2],
        fov: 30,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Close-Up 1: Chibi Heroes & Cyan Tile Outlines'
      },
      2: {
        // Stone Gargoyles g2 (5,1) & g3 (5,3) on magenta-outlined tiles (dist ~ 12.8m)
        pos: [11.8, 7.6, 10.2],
        target: [5.0, 0.42, 2.0],
        fov: 29,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Close-Up 2: Carved Stone Gargoyles & Magenta Tile Outlines'
      },
      3: {
        // Diamond Prism Mirror & 90-degree Golden Sunbeam Reflection Joint at ~36 deg azimuth (dist ~ 11.8m)
        pos: [4.8, 6.8, 7.2],
        target: [-1.2, 0.72, -1.0],
        fov: 28,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Close-Up 3: Diamond Prism Mirror & Sunbeam Reflection Joint'
      },
      4: {
        // Front-Left Interlocking Bronze Cogwheels, Limestone Cliff & Front-Right Wooden Waterwheel (dist ~ 15.5m)
        pos: [9.6, 6.6, 15.2],
        target: [0.8, -1.9, 5.6],
        fov: 32.5,
        level: 1,
        hideHud: true,
        hudVisible: false,
        label: 'Close-Up 4: Cliff Bronze Cogwheels & Wooden Paddle-Waterwheel'
      },
      5: {
        // Beveled Sandstone-to-Moss Seams, Sparkling Headwater Intake, Sluices & Bridge (dist ~ 14.7m)
        pos: [10.6, 8.8, 6.8],
        target: [3.2, 0.05, -2.6],
        fov: 30,
        level: 2,
        hideHud: true,
        hudVisible: false,
        label: 'Close-Up 5: Sandstone/Moss Seams & Waterwheel Aqueduct Headwaters'
      },
      6: {
        // Full 1280x720 HUD & Diorama Clearance Inspection
        pos: [18.0, 20.2, 21.8],
        target: [0.0, -1.45, 0.0],
        fov: 34.0,
        level: 1,
        hideHud: false,
        hudVisible: true,
        label: 'Close-Up 6: Full 1280x720 Collector-Card & Medallion HUD'
      }
    }
  };

  window.GAME.CONFIG = {
    GRID_SIZE: GRID_SIZE,
    TILE_SIZE: TILE_SIZE,
    HALF_GRID_OFFSET: HALF_GRID_OFFSET,
    BOARD_WORLD_SIZE: GRID_SIZE * TILE_SIZE,
    TILE_TOP_Y: 0.0,
    TILE_DEPTH: 0.58,
    CHANNEL_BED_Y: -0.22,
    WATER_SURFACE_Y: -0.06,
    CHASM_FLOOR_Y: -20.0,
    BEAM_Y: BEAM_Y,
    MAX_BEAM_BOUNCES: 16,
    PALETTE: PALETTE,
    DIRS: DIRS,
    DIR_BY_NAME: DIR_BY_NAME,
    OPPOSITE_DIR: OPPOSITE_DIR,
    HERO_SPECS: HERO_SPECS,
    GARGOYLE_SPEC: GARGOYLE_SPEC,
    CAMERA: CAMERA,
    gridToWorld: gridToWorld,
    worldToGrid: worldToGrid,
    inBounds: inBounds,
    reflectDir: reflectDir,
    hexToCss: hexToCss,
    hexToRgb: hexToRgb
  };
})();

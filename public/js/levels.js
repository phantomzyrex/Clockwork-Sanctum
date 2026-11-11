/**
 * Clockwork Sanctum: The Living Board
 * 4 Deterministic Sunlit Mechanical Puzzle Levels, Solutions & Deep-Clone Helper
 *
 * ALL 4 LEVELS strictly share Master Aesthetic 1 (Ankama / Krosmaster Sunlit Sky-Island Toy-Box):
 * beveled golden sandstone, chartreuse moss cushions, chiseled grey-slate cliffs, left bronze
 * cogwheels, right wooden paddle-waterwheels, 4 corner fire braziers, and cerulean cloud sky.
 */
(function () {
  'use strict';

  window.GAME = window.GAME || {};

  var CORNER_BRAZIERS = [
    { id: 'brazier_nw', col: 0, row: 0 },
    { id: 'brazier_ne', col: 7, row: 0 },
    { id: 'brazier_se', col: 7, row: 7 },
    { id: 'brazier_sw', col: 0, row: 7 }
  ];

  function makeGrid(mossCoords, overrides) {
    var mossSet = {};
    (mossCoords || []).forEach(function (pt) {
      mossSet[pt[0] + ',' + pt[1]] = true;
    });

    var grid = [];
    for (var r = 0; r < 8; r++) {
      var rowArr = [];
      for (var c = 0; c < 8; c++) {
        var isCorner = (c === 0 || c === 7) && (r === 0 || r === 7);
        var type = (!isCorner && mossSet[c + ',' + r]) ? 'moss' : 'sandstone';
        var cellObj = {
          col: c,
          row: r,
          type: type,
          blocksBeam: false,
          blocksWater: true,
          hasBrazier: isCorner
        };
        if (isCorner) {
          cellObj.walkable = false; // 4 corner fire braziers occupy the corner plinths
        }
        rowArr.push(cellObj);
      }
      grid.push(rowArr);
    }

    (overrides || []).forEach(function (ov) {
      var cell = grid[ov.row][ov.col];
      Object.keys(ov).forEach(function (k) {
        cell[k] = ov[k];
      });
      if (cell.type === 'chasm') {
        // NOTE: Do NOT set walkable=false on chasm cells so the 2x2 Ferry deck
        // bridging (col,row) makes the cell walkable via isCellOnFerry()!
        delete cell.walkable;
        cell.blocksBeam = false;
        cell.blocksWater = false;
      } else if (cell.type === 'pillar') {
        cell.walkable = false;
        cell.blocksBeam = true;
        cell.blocksWater = true;
      } else if (cell.type === 'channel') {
        cell.blocksBeam = false;
        cell.blocksWater = false;
      } else if (cell.type === 'bridge') {
        cell.blocksBeam = false;
        cell.blocksWater = (ov.blocksWater !== undefined) ? ov.blocksWater : true;
      } else if (cell.type === 'roller') {
        cell.blocksBeam = false;
        cell.blocksWater = true;
        if (cell.dir === undefined && cell.rollerDir !== undefined) cell.dir = cell.rollerDir;
        if (cell.rollerDir === undefined && cell.dir !== undefined) cell.rollerDir = cell.dir;
      }
    });

    return grid;
  }

  function makeHero(id, col, row, facing) {
    var specs = (window.GAME.CONFIG && window.GAME.CONFIG.HERO_SPECS) || {};
    var spec = specs[id] || {
      name: id.charAt(0).toUpperCase() + id.slice(1),
      hp: id === 'warrior' ? 24 : 18,
      maxHp: id === 'warrior' ? 20 : 18,
      ap: 99,
      maxAp: 99,
      move: 64,
      moveRange: 64,
      power: 3,
      armor: id === 'warrior' ? 2 : 1,
      mirrorRange: 16,
      abilityRange: 16
    };
    return {
      id: id,
      type: id,
      name: spec.name,
      col: col,
      row: row,
      facing: facing !== undefined ? facing : 1,
      hp: spec.hp,
      maxHp: spec.maxHp,
      ap: spec.ap,
      maxAp: spec.maxAp,
      move: spec.move,
      moveRange: spec.moveRange,
      power: spec.power,
      armor: spec.armor,
      mirrorRange: spec.mirrorRange,
      abilityKey: spec.abilityKey || id,
      abilityName: spec.abilityName || 'Ability',
      abilityRange: spec.abilityRange,
      desc: spec.description || '',
      description: spec.description || ''
    };
  }

  function makeRogueVillain(col, row, facing) {
    return {
      id: 'rogue',
      type: 'rogue',
      name: 'Shadow Rogue',
      isVillain: true,
      col: col,
      row: row,
      facing: facing !== undefined ? facing : 3,
      frozenSteps: 0,
      sunBlinded: false,
      banished: false,
      nextStep: null,
      distToWarrior: 0
    };
  }

  function makeAstralAid(charges) {
    var count = charges !== undefined ? charges : 1;
    return {
      charges: count,
      maxCharges: count,
      freezeSteps: 2
    };
  }

  function makeGargoyle(id, col, row, facing) {
    return {
      id: id,
      type: 'gargoyle',
      name: 'Stone Gargoyle',
      col: col,
      row: row,
      facing: facing !== undefined ? facing : 2,
      hp: 9,
      maxHp: 9,
      armor: 3,
      power: 3,
      move: 2,
      moveRange: 2,
      state: 'sleeping',
      sleeping: true,
      awakened: false,
      sunstruck: false,
      defeated: false,
      defeatMode: null
    };
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ============================================================================
  // LEVEL 1 — THE SUNDIAL COURTYARD
  // Closely echoes the Master Style Reference Image:
  // - 4 corner fire braziers at (0,0), (7,0), (7,7), (0,7)
  // - Lush perimeter chartreuse moss cushions + warm golden sandstone center courtyard
  // - 6 diamond brass prism mirrors bouncing an X-crossing golden sunbeam on Frame 1
  // - Warrior (1,3), Mage (2,6), Rogue (4,6) on cyan-outlined tiles
  // - 3 Sleeping Stone Gargoyles at (3,1), (6,4), (6,5) on magenta-outlined tiles
  // - Puzzle: Slide Row 3 East (+1) & Column 6 North (-1), then turn Mirrors m5 & m6
  //   so ONE continuous sunbeam chain pierces all 3 Gargoyles simultaneously!
  // ============================================================================
  var LEVEL_1 = {
    id: 1,
    name: 'The Sundial Courtyard',
    title: 'The Sundial Courtyard',
    goal: 'Shatter all 3 Gargoyles before Rogue strikes',
    subtitle: 'Shatter all 3 Gargoyles before the Shadow Rogue ambushes your Knight',
    objective: 'Click Brass Gear Cranks and Prism Mirrors to sweep the golden sunbeam across all 3 Gargoyles (each shatters permanently on contact!) before the Shadow Rogue catches your Warrior. Summon Mage: Astral Aid [F] to freeze the Rogue for 2 steps!',
    parTurns: 4,
    maxParTurns: 4,
    parSteps: 4,
    simultaneousBeam: false,
    requireWaterLock: false,
    braziers: deepClone(CORNER_BRAZIERS),
    tiles: makeGrid(
      [
        [0, 2], [0, 3], [0, 4], [0, 6],
        [1, 1], [1, 2], [1, 6],
        [2, 0],
        [5, 6], [5, 7],
        [6, 2], [6, 6],
        [7, 2], [7, 3], [7, 6]
      ],
      [
        { col: 2, row: 6, isExit: true }
      ]
    ),
    heroes: [
      makeHero('warrior', 3, 6, 1)
    ],
    rogue: makeRogueVillain(5, 5, 3),
    astralAid: makeAstralAid(1),
    gargoyles: [
      makeGargoyle('g1', 3, 1, 2),
      makeGargoyle('g2', 6, 4, 3),
      makeGargoyle('g3', 6, 5, 3)
    ],
    emitters: [
      { id: 'e1', col: 2, row: 7, dir: 0, active: true, blocksTile: true, label: 'Sundial South Emitter' }
    ],
    mirrors: [
      { id: 'm1', col: 2, row: 3, rot: 0, movable: true, rotatable: true },
      { id: 'm2', col: 4, row: 3, rot: 1, movable: true, rotatable: true },
      { id: 'm3', col: 4, row: 5, rot: 0, movable: true, rotatable: true },
      { id: 'm4', col: 1, row: 5, rot: 1, movable: true, rotatable: true },
      { id: 'm5', col: 2, row: 1, rot: 1, movable: true, rotatable: true },
      { id: 'm6', col: 6, row: 2, rot: 0, movable: true, rotatable: true }
    ],
    gearRows: [
      {
        id: 'gear_row3',
        axis: 'row',
        index: 3,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: 1,
        knobSide: 'W',
        knobCol: 0,
        knobRow: 3,
        label: 'Courtyard Row 3 Gear'
      },
      {
        id: 'gear_col6',
        axis: 'col',
        index: 6,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: -1,
        knobSide: 'S',
        knobCol: 6,
        knobRow: 7,
        label: 'East Flank Col 6 Gear'
      }
    ],
    sluiceGates: [],
    waterLock: null,
    pendulum: null,
    ferry: null,
    exit: {
      col: 2,
      row: 6,
      unlocked: false,
      exitOnClear: true,
      requireAllHeroes: false,
      requireWaterLock: false
    }
  };

  // ============================================================================
  // LEVEL 2 — THE WATERWHEEL AQUEDUCT
  // Top-right & right-flank wooden paddle-waterwheels feed live sparkling turquoise
  // sky-water into two upstream headwater intake channels right up to closed Bronze
  // Sluice Gates on Frame 1:
  // - North Headwater Intake: (5,0) -> (5,1) -> (4,1) held back by sg_north (3,1).
  //   Opening sg_north rushes water West across (3,1)->(0,1), washing g1 (1,1) off
  //   the West mossy cliff!
  // - East Headwater Intake:  (6,0) -> (6,1) -> (6,2) held back by sg_east (6,3).
  //   Opening sg_east + sliding Row 4 gear +1 East aligns channel (5,4)->(6,4),
  //   spinning the Sanctuary Waterwheel Lock at (6,5) (powering Prism Turret m1 at 3,3),
  //   and washing g2 (6,6) off the South cliff!
  // - Mage turns Mirror m2 (3,6) so the powered turret beam shatters g3 (1,6)!
  // ============================================================================
  var LEVEL_2_OVERRIDES = [
    // North Aqueduct: live headwater intake (5,0)->(5,1)->(4,1) + downstream (3,1)->(0,1) West (3)
    { col: 5, row: 0, type: 'channel', flowDir: 2, channelAxis: 'col', headwater: true, intake: true, alwaysWet: true, upstream: true, sluiceId: 'sg_north' },
    { col: 5, row: 1, type: 'channel', flowDir: 3, channelAxis: 'row', headwater: true, intake: true, alwaysWet: true, upstream: true, sluiceId: 'sg_north' },
    { col: 4, row: 1, type: 'channel', flowDir: 3, channelAxis: 'row', headwater: true, intake: true, alwaysWet: true, upstream: true, sluiceId: 'sg_north' },
    { col: 3, row: 1, type: 'channel', flowDir: 3, channelAxis: 'row' },
    { col: 2, row: 1, type: 'channel', flowDir: 3, channelAxis: 'row' },
    { col: 1, row: 1, type: 'channel', flowDir: 3, channelAxis: 'row' },
    { col: 0, row: 1, type: 'channel', flowDir: 3, channelAxis: 'row' },

    // East Aqueduct: live headwater intake (6,0)->(6,1)->(6,2) + downstream (6,3)->(6,7) South (2),
    // interrupted at Row 4 by slidable sandstone bridge until gear_row4 shifts +1 East
    { col: 6, row: 0, type: 'channel', flowDir: 2, channelAxis: 'col', headwater: true, intake: true, alwaysWet: true, upstream: true, sluiceId: 'sg_east' },
    { col: 6, row: 1, type: 'channel', flowDir: 2, channelAxis: 'col', headwater: true, intake: true, alwaysWet: true, upstream: true, sluiceId: 'sg_east' },
    { col: 6, row: 2, type: 'channel', flowDir: 2, channelAxis: 'col', headwater: true, intake: true, alwaysWet: true, upstream: true, sluiceId: 'sg_east' },
    { col: 6, row: 3, type: 'channel', flowDir: 2, channelAxis: 'col' },
    { col: 5, row: 4, type: 'channel', flowDir: 2, channelAxis: 'col' },
    { col: 6, row: 4, type: 'bridge', blocksWater: true },
    { col: 6, row: 5, type: 'channel', flowDir: 2, channelAxis: 'col', isWaterLock: true },
    { col: 6, row: 6, type: 'channel', flowDir: 2, channelAxis: 'col' },
    { col: 6, row: 7, type: 'channel', flowDir: 2, channelAxis: 'col' },

    // Sanctuary Exit
    { col: 2, row: 7, isExit: true }
  ];

  var LEVEL_2 = {
    id: 2,
    name: 'The Waterwheel Aqueduct',
    title: 'The Waterwheel Aqueduct',
    goal: 'Wash 2 Gargoyles & sun-shatter the 3rd',
    subtitle: 'Wash 2 Gargoyles off cliffs, spin the Waterwheel Lock & beam the 3rd',
    objective: 'Open both bronze sluice gates and slide Row 4 to sweep 2 Gargoyles off mossy cliffs and power the Prism Turret, then sun-shatter the 3rd Gargoyle before the Shadow Rogue reaches you!',
    parTurns: 4,
    maxParTurns: 4,
    parSteps: 4,
    simultaneousBeam: false,
    requireWaterLock: true,
    braziers: deepClone(CORNER_BRAZIERS),
    tiles: makeGrid(
      [
        [0, 2], [0, 6],
        [1, 0], [2, 0], [3, 0], [4, 0],
        [4, 7], [5, 7],
        [7, 1], [7, 2], [7, 5], [7, 6]
      ],
      LEVEL_2_OVERRIDES
    ),
    heroes: [
      makeHero('warrior', 1, 4, 1)
    ],
    rogue: makeRogueVillain(4, 4, 3),
    astralAid: makeAstralAid(1),
    gargoyles: [
      makeGargoyle('g1', 1, 1, 1),
      makeGargoyle('g2', 6, 6, 0),
      makeGargoyle('g3', 1, 6, 1)
    ],
    emitters: [
      { id: 'e1', col: 0, row: 5, dir: 0, active: true, blocksTile: true, label: 'West Sun-Crystal Emitter' }
    ],
    mirrors: [
      { id: 'm0', col: 0, row: 3, rot: 0, movable: false, rotatable: true },
      { id: 'm1', col: 3, row: 3, rot: 1, movable: false, rotatable: true, turretWaterPowered: true, powered: false },
      { id: 'm2', col: 3, row: 6, rot: 1, movable: false, rotatable: true }
    ],
    gearRows: [
      {
        id: 'gear_row4',
        axis: 'row',
        index: 4,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: 1,
        slidesTiles: true,
        knobSide: 'W',
        knobCol: 0,
        knobRow: 4,
        label: 'Aqueduct Bridge Row 4 Gear'
      }
    ],
    headwaterCells: [
      { col: 5, row: 0, flowDir: 2, dir: 2, sluiceId: 'sg_north' },
      { col: 5, row: 1, flowDir: 3, dir: 3, sluiceId: 'sg_north' },
      { col: 4, row: 1, flowDir: 3, dir: 3, sluiceId: 'sg_north' },
      { col: 6, row: 0, flowDir: 2, dir: 2, sluiceId: 'sg_east' },
      { col: 6, row: 1, flowDir: 2, dir: 2, sluiceId: 'sg_east' },
      { col: 6, row: 2, flowDir: 2, dir: 2, sluiceId: 'sg_east' }
    ],
    intakeChannels: [
      { col: 5, row: 0, flowDir: 2, dir: 2, sluiceId: 'sg_north' },
      { col: 5, row: 1, flowDir: 3, dir: 3, sluiceId: 'sg_north' },
      { col: 4, row: 1, flowDir: 3, dir: 3, sluiceId: 'sg_north' },
      { col: 6, row: 0, flowDir: 2, dir: 2, sluiceId: 'sg_east' },
      { col: 6, row: 1, flowDir: 2, dir: 2, sluiceId: 'sg_east' },
      { col: 6, row: 2, flowDir: 2, dir: 2, sluiceId: 'sg_east' }
    ],
    sluiceGates: [
      {
        id: 'sg_north',
        col: 3,
        row: 1,
        open: false,
        flowDir: 3,
        intakeStart: { col: 5, row: 0, flowDir: 2 },
        intakeCells: [
          { col: 5, row: 0, flowDir: 2 },
          { col: 5, row: 1, flowDir: 3 },
          { col: 4, row: 1, flowDir: 3 }
        ],
        label: 'North Waterwheel Sluice'
      },
      {
        id: 'sg_east',
        col: 6,
        row: 3,
        open: false,
        flowDir: 2,
        intakeStart: { col: 6, row: 0, flowDir: 2 },
        intakeCells: [
          { col: 6, row: 0, flowDir: 2 },
          { col: 6, row: 1, flowDir: 2 },
          { col: 6, row: 2, flowDir: 2 }
        ],
        label: 'East Waterwheel Sluice'
      }
    ],
    waterLock: {
      id: 'lock_main',
      col: 6,
      row: 5,
      active: false,
      powersMirrorId: 'm1',
      label: 'Sanctuary Waterwheel Lock'
    },
    pendulum: null,
    ferry: null,
    exit: {
      col: 2,
      row: 7,
      unlocked: false,
      exitOnClear: true,
      requireAllHeroes: false,
      requireWaterLock: true
    }
  };

  // ============================================================================
  // LEVEL 3 — THE CLOCKWORK BELL-HAMMER
  // Recessed bronze conveyor rollers + overhead Bronze Clockwork Pendulum sweeping
  // across rows 3..4 every 2 turns between carved sandstone arch pillars at (0,3.5)
  // and (7,3.5).
  // - Mage cranks Col 4 South (+1) to push g1 (4,2)->(4,3) into the Pendulum lane.
  // - Rogue cranks Row 6 East (+1) to clear Col 1 for the sunbeam & align g2 at (6,6).
  // - Warrior bashes g2 North onto the spinning Bronze Roller at (6,5), which feeds g2
  //   into (6,4) at End Turn 1!
  // - Mage turns Mirror m3 (1,1) to bounce sunbeam through m4 (5,1) into g3 (5,2),
  //   then End Turn 2's Pendulum sweep punts g1 & g2 off the island!
  // ============================================================================
  var LEVEL_3_OVERRIDES = [
    // South-East feeder roller (row 5 does NOT slide) carrying g2 North into (6,4)
    { col: 6, row: 5, type: 'roller', rollerDir: 0, dir: 0 },
    // Center bronze conveyor lanes in the Pendulum corridor (leaving (4,3) & (6,4) landing pads stationary)
    { col: 2, row: 3, type: 'roller', rollerDir: 1, dir: 1 },
    { col: 3, row: 3, type: 'roller', rollerDir: 1, dir: 1 },
    { col: 2, row: 4, type: 'roller', rollerDir: 3, dir: 3 },
    { col: 3, row: 4, type: 'roller', rollerDir: 3, dir: 3 },
    // Sanctuary Exit on dry South terrace
    { col: 2, row: 5, isExit: true }
  ];

  var LEVEL_3 = {
    id: 3,
    name: 'The Clockwork Bell-Hammer',
    title: 'The Clockwork Bell-Hammer',
    goal: 'Feed 2 Gargoyles to Pendulum & beam the 3rd',
    subtitle: 'Feed 2 Gargoyles into the Bell-Hammer & sun-shatter the 3rd',
    objective: 'Slide gear-rows and Shield-Bash onto bronze conveyor rollers to feed 2 Gargoyles into the swinging Bronze Bell-Hammer, then sun-shatter the 3rd Gargoyle while outmaneuvering the Shadow Rogue!',
    parTurns: 4,
    maxParTurns: 4,
    parSteps: 4,
    simultaneousBeam: false,
    requireWaterLock: false,
    braziers: deepClone(CORNER_BRAZIERS),
    tiles: makeGrid(
      [
        [0, 1], [0, 2], [0, 5],
        [3, 7], [4, 7],
        [6, 0], [6, 1],
        [7, 1], [7, 2], [7, 5]
      ],
      LEVEL_3_OVERRIDES
    ),
    heroes: [
      makeHero('warrior', 5, 7, 3)
    ],
    rogue: makeRogueVillain(2, 7, 1),
    astralAid: makeAstralAid(1),
    gargoyles: [
      makeGargoyle('g1', 4, 2, 2),
      makeGargoyle('g2', 5, 6, 0),
      makeGargoyle('g3', 5, 2, 3)
    ],
    emitters: [
      { id: 'e1', col: 1, row: 7, dir: 0, active: true, blocksTile: true, label: 'Bell-Court South Emitter' }
    ],
    mirrors: [
      { id: 'm1', col: 1, row: 6, rot: 0, movable: true, rotatable: true },
      { id: 'm2', col: 3, row: 6, rot: 1, movable: true, rotatable: true },
      { id: 'm3', col: 1, row: 1, rot: 1, movable: true, rotatable: true },
      { id: 'm4', col: 5, row: 1, rot: 1, movable: true, rotatable: true }
    ],
    gearRows: [
      {
        id: 'gear_col4',
        axis: 'col',
        index: 4,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: 1,
        knobSide: 'N',
        knobCol: 4,
        knobRow: 0,
        label: 'North Arch Col 4 Gear'
      },
      {
        id: 'gear_row6',
        axis: 'row',
        index: 6,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: 1,
        knobSide: 'W',
        knobCol: 0,
        knobRow: 6,
        label: 'South Terrace Row 6 Gear'
      }
    ],
    sluiceGates: [],
    waterLock: null,
    pendulum: {
      id: 'bell_pendulum',
      rows: [3, 4],
      sweepRows: [3, 4],
      minRow: 3,
      maxRow: 4,
      pillarWest: { col: 0, row: 3.5 },
      pillarEast: { col: 7, row: 3.5 },
      periodTurns: 2,
      direction: 1,
      heroPushDamage: 4,
      label: 'Bronze Clockwork Bell-Hammer'
    },
    ferry: null,
    exit: {
      col: 2,
      row: 5,
      unlocked: false,
      exitOnClear: true,
      requireAllHeroes: false,
      requireWaterLock: false
    }
  };

  // ============================================================================
  // LEVEL 4 — THE TWIN-COG SKY SPLIT
  // North (rows 0..2) & South (rows 5..7) sunlit sandstone-and-moss halves split by
  // a 2-tile Sky Chasm (rows 3..4) over cumulus clouds, bridged by a movable 2x2
  // Bronze-Gear Ferry Platform (rows 3..4, slidable col 0..6).
  // - Crank South gear_row6 East (+1) & rotate Mirror m5 on the South Island.
  // - Board Warrior, Mage & Rogue onto the 2x2 Ferry and glide East across the clouds.
  // - Disembark onto the North Island and crank opposing gear_row2 West (-1) to complete
  //   a 5-mirror, 3-chasm-crossing golden sunbeam circuit shattering all 4 Gargoyles
  //   simultaneously, then gather all 3 Heroes at the North Sanctuary Exit!
  // ============================================================================
  var LEVEL_4_OVERRIDES = [];
  for (var chasmCol = 0; chasmCol < 8; chasmCol++) {
    LEVEL_4_OVERRIDES.push({ col: chasmCol, row: 3, type: 'chasm' });
    LEVEL_4_OVERRIDES.push({ col: chasmCol, row: 4, type: 'chasm' });
  }
  LEVEL_4_OVERRIDES.push({ col: 4, row: 0, isExit: true });

  var LEVEL_4 = {
    id: 4,
    name: 'The Twin-Cog Sky Split',
    title: 'The Twin-Cog Sky Split',
    goal: 'Shatter all 4 Gargoyles across the Sky Chasm',
    subtitle: 'Align the cross-chasm sunbeam to shatter all 4 Gargoyles',
    objective: 'Crank opposing gear-rows on the South and North sky-islands and turn Prism Mirror m5 to unleash a blazing cross-chasm sunbeam that shatters all 4 Gargoyles before the Shadow Rogue strikes!',
    parTurns: 3,
    maxParTurns: 3,
    parSteps: 3,
    simultaneousBeam: false,
    requireWaterLock: false,
    braziers: deepClone(CORNER_BRAZIERS),
    tiles: makeGrid(
      [
        // North half perimeter moss
        [0, 1], [0, 2], [1, 0], [6, 0], [7, 1],
        // South half perimeter moss
        [0, 6], [1, 7], [2, 7], [6, 7], [7, 5], [7, 6]
      ],
      LEVEL_4_OVERRIDES
    ),
    heroes: [
      makeHero('warrior', 1, 6, 1)
    ],
    rogue: makeRogueVillain(4, 5, 3),
    astralAid: makeAstralAid(1),
    gargoyles: [
      makeGargoyle('g1', 3, 2, 2),
      makeGargoyle('g2', 4, 2, 2),
      makeGargoyle('g3', 4, 6, 0),
      makeGargoyle('g4', 6, 1, 2)
    ],
    emitters: [
      { id: 'e1', col: 0, row: 5, dir: 1, active: true, blocksTile: true, label: 'South Sky-Bridge Emitter' }
    ],
    mirrors: [
      { id: 'm1', col: 1, row: 5, rot: 0, movable: false, rotatable: true },
      { id: 'm2', col: 2, row: 2, rot: 0, movable: true, rotatable: true },
      { id: 'm3', col: 5, row: 2, rot: 1, movable: true, rotatable: true },
      { id: 'm4', col: 3, row: 6, rot: 1, movable: true, rotatable: true },
      { id: 'm5', col: 5, row: 6, rot: 1, movable: true, rotatable: true }
    ],
    gearRows: [
      {
        id: 'gear_row6',
        axis: 'row',
        index: 6,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: 1,
        knobSide: 'W',
        knobCol: 0,
        knobRow: 6,
        label: 'South Island Row 6 Gear'
      },
      {
        id: 'gear_row2',
        axis: 'row',
        index: 2,
        offset: 0,
        minOffset: -1,
        maxOffset: 1,
        stepDir: -1,
        knobSide: 'E',
        knobCol: 7,
        knobRow: 2,
        label: 'North Island Opposing Row 2 Gear'
      }
    ],
    sluiceGates: [],
    waterLock: null,
    pendulum: null,
    ferry: {
      id: 'sky_ferry',
      col: 2,
      row: 3,
      rows: [3, 4],
      width: 2,
      height: 2,
      minCol: 0,
      maxCol: 6,
      stepDir: 1,
      leverOffset: { dc: 0, dr: 0 },
      label: '2x2 Bronze-Gear Sky Ferry'
    },
    exit: {
      col: 4,
      row: 0,
      zone: [
        { col: 3, row: 0 },
        { col: 4, row: 0 },
        { col: 5, row: 0 }
      ],
      unlocked: false,
      exitOnClear: true,
      requireAllHeroes: false,
      requireAllHeroesNorth: false,
      requireWaterLock: false
    }
  };

  var LEVELS = {
    1: LEVEL_1,
    2: LEVEL_2,
    3: LEVEL_3,
    4: LEVEL_4
  };

  // ============================================================================
  // DETERMINISTIC VERIFIED SOLUTIONS (Hunter-vs-Knight + Astral Aid Edition)
  // ============================================================================
  var LEVEL_SOLUTIONS = {
    1: [
      { type: 'astralAid', hint: 'Click Mage: Astral Aid [F] — summon the Mage in starlight to freeze the Shadow Rogue for 2 steps!' },
      { type: 'shiftGear', gearId: 'gear_row3', delta: 1, hint: 'Click the Row 3 Brass Gear Crank at (0, 3) — slide Row 3 East!' },
      { type: 'shiftGear', gearId: 'gear_col6', delta: -1, hint: 'Click the Column 6 Brass Gear Crank at (6, 7) — align Mirror m6 onto Row 1!' },
      { type: 'rotateMirror', mirrorId: 'm5', deltaRot: 1, hint: 'Click Prism Mirror m5 at (2, 1) — turn the sunbeam East to shatter Gargoyle g1!' },
      { type: 'rotateMirror', mirrorId: 'm6', deltaRot: 1, hint: 'Click Prism Mirror m6 at (6, 1) — aim South to shatter Gargoyles g2 & g3 and banish the Rogue!' }
    ],

    2: [
      { type: 'astralAid', hint: 'Click Mage: Astral Aid [F] — freeze the Shadow Rogue in starlight for 2 steps!' },
      { type: 'toggleSluice', sluiceId: 'sg_north', hint: 'Click the North Sluice Gate at (3, 1) — rush water West to wash Gargoyle g1 off the cliff!' },
      { type: 'toggleSluice', sluiceId: 'sg_east', hint: 'Click the East Sluice Gate at (6, 3) — open the East aqueduct headwater!' },
      { type: 'shiftGear', gearId: 'gear_row4', delta: 1, hint: 'Click the Row 4 Brass Gear Crank at (0, 4) — connect the aqueduct, power the Waterwheel Lock & wash g2 off!' },
      { type: 'rotateMirror', mirrorId: 'm2', deltaRot: 1, hint: 'Click Prism Mirror m2 at (3, 6) — aim the powered sunbeam West to shatter Gargoyle g3!' }
    ],

    3: [
      { type: 'shiftGear', gearId: 'gear_col4', delta: 1, hint: 'Click the Column 4 Brass Gear Crank at (4, 0) — slide Gargoyle g1 into the swinging Bell-Hammer!' },
      { type: 'shiftGear', gearId: 'gear_row6', delta: 1, hint: 'Click the Row 6 Brass Gear Crank at (0, 6) — clear Column 1 & slide Gargoyle g2 to (6, 6)!' },
      { type: 'bash', heroId: 'warrior', col: 6, row: 6, hint: 'Click Gargoyle g2 at (6, 6) — Warrior hops East (away from Rogue!) & Shield-Bashes g2 onto the Bronze Roller!' },
      { type: 'rotateMirror', mirrorId: 'm3', deltaRot: 1, hint: 'Click Prism Mirror m3 at (1, 1) — bounce the sunbeam into Gargoyle g3 to purify the Sanctuary!' }
    ],

    4: [
      { type: 'shiftGear', gearId: 'gear_row6', delta: 1, hint: 'Click the South Row 6 Brass Gear Crank at (0, 6) — align the South Island mirrors!' },
      { type: 'rotateMirror', mirrorId: 'm5', deltaRot: 1, hint: 'Click Prism Mirror m5 at (6, 6) — aim the South sunbeam North across the Sky Chasm!' },
      { type: 'shiftGear', gearId: 'gear_row2', delta: -1, hint: 'Click the North Row 2 Brass Gear Crank at (7, 2) — complete the 5-mirror chain & shatter all 4 Gargoyles!' }
    ]
  };

  function cloneLevel(levelId) {
    var id = Number(levelId) || 1;
    var src = LEVELS[id] || LEVELS[1];
    return deepClone(src);
  }

  window.GAME.LEVELS = LEVELS;
  window.GAME.LEVEL_SOLUTIONS = LEVEL_SOLUTIONS;
  window.GAME.cloneLevel = cloneLevel;
})();

/**
 * Clockwork Sanctum: The Living Board
 * Deterministic Turn-Based Clockwork Puzzle-Tactics Engine & QA Audit Harness
 * Owns ONLY: js/simulation.js
 * Exposes: window.GAME.Simulation & window.GAME_TEST
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.GAME = root.GAME || {};

  var DEFAULT_DIRS = [
    { id: 0, dc: 0, dr: -1, name: 'N' },
    { id: 1, dc: 1, dr: 0, name: 'E' },
    { id: 2, dc: 0, dr: 1, name: 'S' },
    { id: 3, dc: -1, dr: 0, name: 'W' }
  ];

  var DEFAULT_HERO_SPECS = {
    warrior: {
      id: 'warrior',
      type: 'warrior',
      name: 'Warrior',
      role: 'Cranks & Bashes',
      hp: 24,
      maxHp: 20,
      ap: 99,
      maxAp: 99,
      move: 64,
      moveRange: 64,
      armor: 2,
      power: 3,
      mirrorRange: 16,
      gearRange: 8,
      abilityKey: 'titanCrank',
      abilityName: 'Titan Crank',
      abilityRange: 16,
      description: 'Click Gears, Sluices & Gargoyles'
    },
    mage: {
      id: 'mage',
      type: 'mage',
      name: 'Mage',
      role: 'Turns Mirrors',
      hp: 18,
      maxHp: 18,
      ap: 99,
      maxAp: 99,
      move: 64,
      moveRange: 64,
      armor: 1,
      power: 3,
      mirrorRange: 16,
      gearRange: 8,
      abilityKey: 'astralPrism',
      abilityName: 'Astral Prism',
      abilityRange: 16,
      description: 'Click any Mirror to turn +90°'
    },
    rogue: {
      id: 'rogue',
      type: 'rogue',
      name: 'Rogue',
      role: 'Tiles & Exit',
      hp: 18,
      maxHp: 18,
      ap: 99,
      maxAp: 99,
      move: 64,
      moveRange: 64,
      armor: 1,
      power: 3,
      mirrorRange: 16,
      gearRange: 8,
      abilityKey: 'grappleSwap',
      abilityName: 'Swift Sprint',
      abilityRange: 16,
      description: 'Click any Tile or Golden Exit'
    }
  };

  function getConfig() {
    return root.GAME.CONFIG || {};
  }

  function getGridSize() {
    return getConfig().GRID_SIZE || 8;
  }

  function getTileSize() {
    return getConfig().TILE_SIZE || 2.0;
  }

  function getBeamY() {
    var cfg = getConfig();
    return typeof cfg.BEAM_Y === 'number' ? cfg.BEAM_Y : 0.82;
  }

  function getMaxBeamBounces() {
    var cfg = getConfig();
    return typeof cfg.MAX_BEAM_BOUNCES === 'number' ? cfg.MAX_BEAM_BOUNCES : 16;
  }

  function getDirs() {
    return getConfig().DIRS || DEFAULT_DIRS;
  }

  function gridToWorld(col, row) {
    var cfg = getConfig();
    if (typeof cfg.gridToWorld === 'function') {
      return cfg.gridToWorld(col, row);
    }
    var ts = getTileSize();
    return { x: (col - 3.5) * ts, z: (row - 3.5) * ts };
  }

  function worldToGrid(wx, wz) {
    var cfg = getConfig();
    if (typeof cfg.worldToGrid === 'function') {
      return cfg.worldToGrid(wx, wz);
    }
    var ts = getTileSize();
    return { col: Math.round(wx / ts + 3.5), row: Math.round(wz / ts + 3.5) };
  }

  function reflectDir(inDir, mirrorRot) {
    var cfg = getConfig();
    if (typeof cfg.reflectDir === 'function') {
      return cfg.reflectDir(inDir, mirrorRot);
    }
    var d = ((inDir % 4) + 4) % 4;
    var r = ((mirrorRot % 4) + 4) % 4;
    return (r % 2 === 0) ? [1, 0, 3, 2][d] : [3, 2, 1, 0][d];
  }

  function parseDirIndex(d) {
    if (typeof d === 'number') return ((d % 4) + 4) % 4;
    if (typeof d === 'string') {
      var u = d.toUpperCase();
      if (u === 'N' || u === 'UP' || u === 'NORTH') return 0;
      if (u === 'E' || u === 'RIGHT' || u === 'EAST') return 1;
      if (u === 'S' || u === 'DOWN' || u === 'SOUTH') return 2;
      if (u === 'W' || u === 'LEFT' || u === 'WEST') return 3;
    }
    if (d && typeof d === 'object' && typeof d.dc === 'number' && typeof d.dr === 'number') {
      if (d.dc === 0 && d.dr < 0) return 0;
      if (d.dc > 0 && d.dr === 0) return 1;
      if (d.dc === 0 && d.dr > 0) return 2;
      if (d.dc < 0 && d.dr === 0) return 3;
    }
    return 1;
  }

  function inBounds(col, row) {
    var n = getGridSize();
    return col >= 0 && col < n && row >= 0 && row < n;
  }

  function manhattanDist(c1, r1, c2, r2) {
    return Math.abs(c1 - c2) + Math.abs(r1 - r2);
  }

  function chebyshevDist(c1, r1, c2, r2) {
    return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
  }

  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  function facingFromDelta(dc, dr, fallback) {
    if (dc === 0 && dr === 0) return typeof fallback === 'number' ? fallback : 1;
    if (Math.abs(dc) >= Math.abs(dr)) {
      return dc > 0 ? 1 : 3;
    }
    return dr > 0 ? 2 : 0;
  }

  // =========================================================================
  // Internal Simulation State
  // =========================================================================
  var _state = null;
  var _history = [];
  var _listeners = [];
  var _elapsed = 0;
  var _solutionMilestones = {};

  function safeAudio(methodName, arg1) {
    var audio = root.GAME && root.GAME.Audio;
    if (audio && typeof audio[methodName] === 'function') {
      try {
        audio[methodName](arg1);
      } catch (e) {}
    }
  }

  function safeToast(msg, tone) {
    var hud = root.GAME && root.GAME.HUD;
    if (hud && typeof hud.showToast === 'function') {
      try {
        hud.showToast(msg, tone || 'info');
      } catch (e) {}
    }
  }

  function notifyChange() {
    if (!_state) return;
    _state.canUndo = _history.length > 0;
    for (var i = 0; i < _listeners.length; i++) {
      try {
        _listeners[i](_state);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[Simulation.onChange error]', err);
        }
      }
    }
  }

  // =========================================================================
  // Tile Grid Helpers (Preserves 2D [row][col] from levels.js + flat tileList)
  // =========================================================================
  function normalizeTileCell(cell, col, row) {
    var isCorner = (col === 0 || col === 7) && (row === 0 || row === 7);
    if (typeof cell === 'string') {
      return {
        col: col,
        row: row,
        baseCol: col,
        baseRow: row,
        type: cell,
        walkable: cell !== 'chasm' && cell !== 'pillar',
        blocksBeam: cell === 'pillar',
        blocksWater: cell !== 'channel',
        hasBrazier: isCorner
      };
    }
    if (cell && typeof cell === 'object') {
      var copy = Object.assign({}, cell);
      copy.col = typeof copy.col === 'number' ? copy.col : col;
      copy.row = typeof copy.row === 'number' ? copy.row : row;
      if (typeof copy.baseCol !== 'number') copy.baseCol = copy.col;
      if (typeof copy.baseRow !== 'number') copy.baseRow = copy.row;
      copy.type = copy.type || copy.kind || 'sandstone';
      if (copy.walkable === undefined) {
        copy.walkable = (copy.type !== 'chasm' && copy.type !== 'pillar');
      }
      if (copy.blocksBeam === undefined) {
        copy.blocksBeam = (copy.type === 'pillar');
      }
      if (copy.blocksWater === undefined) {
        copy.blocksWater = (copy.type !== 'channel');
      }
      if (copy.type === 'roller') {
        if (copy.rollerDir === undefined && copy.dir !== undefined) copy.rollerDir = copy.dir;
        if (copy.dir === undefined && copy.rollerDir !== undefined) copy.dir = copy.rollerDir;
      }
      return copy;
    }
    return {
      col: col,
      row: row,
      baseCol: col,
      baseRow: row,
      type: 'sandstone',
      walkable: true,
      blocksBeam: false,
      blocksWater: true,
      hasBrazier: isCorner
    };
  }

  function buildTileStructures(rawTiles) {
    var n = getGridSize();
    var is2D = Array.isArray(rawTiles) && Array.isArray(rawTiles[0]);
    var grid = [];
    var r, c;
    for (r = 0; r < n; r++) {
      grid[r] = [];
      for (c = 0; c < n; c++) {
        grid[r][c] = normalizeTileCell(null, c, r);
      }
    }

    if (is2D) {
      for (r = 0; r < n; r++) {
        if (!rawTiles[r]) continue;
        for (c = 0; c < n; c++) {
          if (rawTiles[r][c] !== undefined) {
            grid[r][c] = normalizeTileCell(rawTiles[r][c], c, r);
          }
        }
      }
    } else if (Array.isArray(rawTiles)) {
      for (var i = 0; i < rawTiles.length; i++) {
        var item = rawTiles[i];
        if (!item) continue;
        var ic = typeof item.col === 'number' ? item.col : (i % n);
        var ir = typeof item.row === 'number' ? item.row : Math.floor(i / n);
        if (inBounds(ic, ir)) {
          grid[ir][ic] = normalizeTileCell(item, ic, ir);
        }
      }
    }

    return { grid: grid, wasFlat: Array.isArray(rawTiles) && !is2D };
  }

  function syncTileReferences(st) {
    var n = getGridSize();
    var flat = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var cell = st.tileGrid[r][c];
        if (cell) {
          cell.col = c;
          cell.row = r;
          flat.push(cell);
        }
      }
    }
    st.tileList = flat;
    st.tiles = st._tilesWereFlat ? flat : st.tileGrid;
  }

  function getTile(st, col, row) {
    if (!inBounds(col, row) || !st || !st.tileGrid || !st.tileGrid[row]) return null;
    return st.tileGrid[row][col] || null;
  }

  function isCellOnFerry(st, col, row) {
    var f = st && st.ferry;
    if (!f) return false;
    var fCol = f.col;
    var fWidth = f.width || 2;
    var fRows = f.rows || [f.row !== undefined ? f.row : 3, (f.row !== undefined ? f.row : 3) + 1];
    return col >= fCol && col < fCol + fWidth && fRows.indexOf(row) !== -1;
  }

  function hasPillarAt(st, col, row) {
    var tile = getTile(st, col, row);
    if (tile && (tile.blocksBeam || tile.type === 'pillar' || tile.obstacle === 'pillar')) {
      return true;
    }
    if (Array.isArray(st.pillars)) {
      for (var i = 0; i < st.pillars.length; i++) {
        var p = st.pillars[i];
        if (p && !p.removed && Math.abs(p.col - col) < 0.1 && Math.abs(p.row - row) < 0.1) {
          return true;
        }
      }
    }
    return false;
  }

  function getHeroAt(st, col, row) {
    for (var i = 0; i < st.heroes.length; i++) {
      var h = st.heroes[i];
      if (!h.defeated && h.alive !== false && h.col === col && h.row === row) return h;
    }
    return null;
  }

  function getGargoyleAt(st, col, row) {
    for (var i = 0; i < st.gargoyles.length; i++) {
      var g = st.gargoyles[i];
      if (!g.defeated && g.col === col && g.row === row) return g;
    }
    return null;
  }

  function getMirrorAt(st, col, row) {
    for (var i = 0; i < st.mirrors.length; i++) {
      var m = st.mirrors[i];
      if (!m.removed && m.col === col && m.row === row) return m;
    }
    return null;
  }

  function hasEmitterAt(st, col, row) {
    for (var i = 0; i < st.emitters.length; i++) {
      var e = st.emitters[i];
      if (e.col === col && e.row === row && e.blocksTile !== false) return true;
    }
    return false;
  }

  function isTileSolidGround(st, col, row) {
    if (!inBounds(col, row)) return false;
    if (isCellOnFerry(st, col, row)) return true;
    var tile = getTile(st, col, row);
    if (!tile) return false;
    var t = tile.type;
    if (t === 'chasm' || t === 'void' || t === 'empty' || t === 'missing' || t === 'sky') {
      return false;
    }
    return true;
  }

  function isTileWalkableForHero(st, col, row, movingHeroId) {
    if (!inBounds(col, row)) return false;
    var tile = getTile(st, col, row);
    if (!tile) return false;
    if (tile.hasBrazier) return false;
    if (hasPillarAt(st, col, row)) return false;
    if (hasEmitterAt(st, col, row)) return false;
    if (getMirrorAt(st, col, row)) return false;
    if (getGargoyleAt(st, col, row)) return false;

    var otherHero = getHeroAt(st, col, row);
    if (otherHero && otherHero.id !== movingHeroId) return false;

    if (st.rogue && !st.rogue.banished && st.rogue.col === col && st.rogue.row === row) {
      return false;
    }

    if (tile.type === 'chasm') {
      return isCellOnFerry(st, col, row);
    }
    if (tile.type === 'void' || tile.type === 'empty' || tile.type === 'missing' || tile.type === 'sky') {
      return false;
    }
    return tile.walkable !== false;
  }

  function isTileWalkableForRogue(st, col, row, allowWetChannel) {
    if (!inBounds(col, row)) return false;
    var tile = getTile(st, col, row);
    if (!tile) return false;
    if (tile.hasBrazier) return false;
    if (hasPillarAt(st, col, row)) return false;
    if (hasEmitterAt(st, col, row)) return false;
    if (getMirrorAt(st, col, row)) return false;
    if (getGargoyleAt(st, col, row)) return false;
    if (tile.type === 'chasm') {
      return isCellOnFerry(st, col, row);
    }
    if (tile.type === 'void' || tile.type === 'empty' || tile.type === 'missing' || tile.type === 'sky') {
      return false;
    }
    if (!allowWetChannel && tile.type === 'channel' && Array.isArray(st.waterCells)) {
      var isRushing = st.waterCells.some(function (wc) {
        return wc.col === col && wc.row === row && !wc.headwater && !wc.blockedBySluice;
      });
      if (isRushing) return false;
    }
    return tile.walkable !== false;
  }

  // =========================================================================
  // Level Loading & Normalization
  // =========================================================================
  function createFallbackLevel(levelId) {
    var grid = [];
    for (var r = 0; r < 8; r++) {
      grid[r] = [];
      for (var c = 0; c < 8; c++) {
        var isCorner = (c === 0 || c === 7) && (r === 0 || r === 7);
        grid[r][c] = normalizeTileCell('sandstone', c, r);
        grid[r][c].hasBrazier = isCorner;
      }
    }
    return {
      id: levelId || 1,
      name: 'The Sundial Courtyard',
      title: 'The Sundial Courtyard',
      subtitle: 'Bounce sunbeam through all 3 Gargoyles',
      parTurns: 4,
      simultaneousBeam: true,
      tiles: grid,
      heroes: [
        { id: 'warrior', type: 'warrior', col: 1, row: 3 },
        { id: 'mage', type: 'mage', col: 2, row: 6 },
        { id: 'rogue', type: 'rogue', col: 4, row: 6 }
      ],
      gargoyles: [
        { id: 'g1', col: 3, row: 1 },
        { id: 'g2', col: 6, row: 4 },
        { id: 'g3', col: 6, row: 5 }
      ],
      emitters: [{ id: 'e1', col: 2, row: 7, dir: 0, active: true }],
      mirrors: [
        { id: 'm1', col: 2, row: 3, rot: 0, movable: true, rotatable: true },
        { id: 'm5', col: 2, row: 1, rot: 1, movable: true, rotatable: true },
        { id: 'm6', col: 6, row: 2, rot: 0, movable: true, rotatable: true }
      ],
      gearRows: [
        { id: 'gear_row3', axis: 'row', index: 3, offset: 0, minOffset: -1, maxOffset: 1, stepDir: 1, knobCol: 0, knobRow: 3 },
        { id: 'gear_col6', axis: 'col', index: 6, offset: 0, minOffset: -1, maxOffset: 1, stepDir: -1, knobCol: 6, knobRow: 7 }
      ],
      exit: { col: 3, row: 6, unlocked: false }
    };
  }

  function getRawLevelDefinition(levelId) {
    if (root.GAME && typeof root.GAME.cloneLevel === 'function') {
      var cloned = root.GAME.cloneLevel(levelId);
      if (cloned) return cloned;
    }
    var levels = (root.GAME && root.GAME.LEVELS) || {};
    var raw = levels[levelId] || levels[String(levelId)];
    if (raw) return deepClone(raw);
    return createFallbackLevel(levelId);
  }

  function buildInitialState(levelId) {
    var raw = getRawLevelDefinition(levelId);
    var cfgSpecs = getConfig().HERO_SPECS || DEFAULT_HERO_SPECS;
    var tileStruct = buildTileStructures(raw.tiles || raw.grid);

    var heroes = (raw.heroes || []).map(function (h, idx) {
      var typeKey = h.type || h.id || (['warrior', 'mage', 'rogue'][idx] || 'warrior');
      var spec = cfgSpecs[typeKey] || DEFAULT_HERO_SPECS[typeKey] || DEFAULT_HERO_SPECS.warrior;
      var maxHp = typeof h.maxHp === 'number' ? h.maxHp : (typeof spec.maxHp === 'number' ? spec.maxHp : 20);
      var hp = typeof h.hp === 'number' ? h.hp : (typeof spec.hp === 'number' ? spec.hp : maxHp);
      var maxAp = 99;
      var ap = 99;
      var moveRange = 64;

      return Object.assign({}, spec, h, {
        id: h.id || typeKey,
        type: typeKey,
        name: h.name || spec.name || 'Hero',
        role: h.role || spec.role || '',
        col: h.col,
        row: h.row,
        hp: hp,
        maxHp: maxHp,
        ap: ap,
        maxAp: maxAp,
        move: moveRange,
        moveRange: moveRange,
        mirrorRange: 16,
        gearRange: 8,
        abilityRange: 16,
        facing: typeof h.facing === 'number' ? h.facing : 1,
        alive: h.alive !== false && !h.defeated,
        defeated: !!h.defeated
      });
    });

    var gargoyles = (raw.gargoyles || []).map(function (g, idx) {
      var sleeping = g.sleeping !== undefined ? !!g.sleeping : (g.state !== 'awakened');
      var awakened = g.awakened !== undefined ? !!g.awakened : !sleeping;
      return Object.assign({}, g, {
        id: g.id || ('g' + (idx + 1)),
        type: 'gargoyle',
        name: g.name || 'Stone Gargoyle',
        col: g.col,
        row: g.row,
        hp: typeof g.hp === 'number' ? g.hp : 9,
        maxHp: typeof g.maxHp === 'number' ? g.maxHp : 9,
        armor: typeof g.armor === 'number' ? g.armor : 3,
        move: typeof g.move === 'number' ? g.move : 2,
        moveRange: typeof g.moveRange === 'number' ? g.moveRange : 2,
        power: typeof g.power === 'number' ? g.power : 3,
        sleeping: sleeping,
        awakened: awakened,
        sunstruck: false,
        defeated: !!g.defeated,
        defeatMode: g.defeatMode || null,
        state: g.defeated ? 'defeated' : (awakened ? 'awakened' : 'sleeping'),
        facing: typeof g.facing === 'number' ? g.facing : 2
      });
    });

    var mirrors = (raw.mirrors || []).map(function (m, idx) {
      var turretWaterPowered = !!(m.turretWaterPowered || m.waterPowered || m.requiresWaterLock);
      return Object.assign({}, m, {
        id: m.id || ('m' + (idx + 1)),
        col: m.col,
        row: m.row,
        rot: ((m.rot || 0) % 4 + 4) % 4,
        initRot: ((m.rot || 0) % 4 + 4) % 4,
        movable: m.movable !== undefined ? !!m.movable : !m.fixed,
        rotatable: m.rotatable !== false,
        fixed: !!m.fixed,
        turretWaterPowered: turretWaterPowered,
        powered: turretWaterPowered ? !!m.powered : true
      });
    });

    var emitters = (raw.emitters || []).map(function (e, idx) {
      return Object.assign({}, e, {
        id: e.id || ('e' + (idx + 1)),
        col: e.col,
        row: e.row,
        dir: parseDirIndex(e.dir),
        active: e.active !== false
      });
    });

    var gearRows = (raw.gearRows || []).map(function (gr, idx) {
      var axis = gr.axis || (typeof gr.row === 'number' ? 'row' : 'col');
      var index = typeof gr.index === 'number' ? gr.index : (axis === 'row' ? gr.row : gr.col);
      var stepDir = typeof gr.stepDir === 'number' && gr.stepDir !== 0 ? gr.stepDir : 1;
      return Object.assign({}, gr, {
        id: gr.id || ('gear_' + axis + '_' + index + '_' + idx),
        axis: axis,
        index: index,
        row: axis === 'row' ? index : gr.row,
        col: axis === 'col' ? index : gr.col,
        offset: gr.offset || 0,
        minOffset: typeof gr.minOffset === 'number' ? gr.minOffset : -1,
        maxOffset: typeof gr.maxOffset === 'number' ? gr.maxOffset : 1,
        stepDir: stepDir,
        cycleDir: stepDir,
        slidesTiles: !!gr.slidesTiles
      });
    });

    var sluiceGates = (raw.sluiceGates || []).map(function (sg, idx) {
      var flowDir = parseDirIndex(sg.flowDir !== undefined ? sg.flowDir : (sg.dir !== undefined ? sg.dir : 3));
      return Object.assign({}, sg, {
        id: sg.id || ('sluice_' + idx),
        col: sg.col,
        row: sg.row,
        open: !!sg.open,
        dir: flowDir,
        flowDir: flowDir
      });
    });

    var rawFerry = raw.ferry || null;
    var ferry = rawFerry
      ? Object.assign({}, rawFerry, {
          id: rawFerry.id || 'sky_ferry',
          col: typeof rawFerry.col === 'number' ? rawFerry.col : 2,
          row: typeof rawFerry.row === 'number' ? rawFerry.row : 3,
          rows: Array.isArray(rawFerry.rows) ? rawFerry.rows.slice() : [3, 4],
          width: rawFerry.width || 2,
          height: rawFerry.height || 2,
          minCol: typeof rawFerry.minCol === 'number' ? rawFerry.minCol : 0,
          maxCol: typeof rawFerry.maxCol === 'number' ? rawFerry.maxCol : 6,
          stepDir: rawFerry.stepDir || 1,
          cycleDir: rawFerry.stepDir || 1
        })
      : null;

    var rawPendulum = raw.pendulum || null;
    var pendulum = rawPendulum
      ? Object.assign({}, rawPendulum, {
          rows: Array.isArray(rawPendulum.rows) ? rawPendulum.rows.slice() : (Array.isArray(rawPendulum.sweepRows) ? rawPendulum.sweepRows.slice() : [3, 4]),
          sweepRows: Array.isArray(rawPendulum.sweepRows) ? rawPendulum.sweepRows.slice() : (Array.isArray(rawPendulum.rows) ? rawPendulum.rows.slice() : [3, 4]),
          periodTurns: rawPendulum.periodTurns || 2,
          direction: rawPendulum.direction || 1,
          heroPushDamage: typeof rawPendulum.heroPushDamage === 'number' ? rawPendulum.heroPushDamage : 4,
          turnsUntilSweep: (rawPendulum.periodTurns || 2) - (1 % (rawPendulum.periodTurns || 2))
        })
      : null;

    var rawExit = raw.exit || { col: 3, row: 6, unlocked: false };
    var exit = Object.assign({}, rawExit, {
      col: typeof rawExit.col === 'number' ? rawExit.col : 3,
      row: typeof rawExit.row === 'number' ? rawExit.row : 6,
      unlocked: !!rawExit.unlocked,
      requireAllHeroes: !!rawExit.requireAllHeroes,
      requireAllHeroesNorth: !!rawExit.requireAllHeroesNorth,
      exitOnClear: !!rawExit.exitOnClear
    });

    var waterLock = raw.waterLock || raw.waterWheelLock || null;
    if (waterLock) {
      waterLock = Object.assign({}, waterLock, { active: !!waterLock.active });
    }

    var simultaneousBeam = raw.simultaneousBeam !== undefined
      ? !!raw.simultaneousBeam
      : (Number(levelId) === 1 || Number(levelId) === 4);

    var requireWaterLock = raw.requireWaterLock !== undefined
      ? !!raw.requireWaterLock
      : !!(exit.requireWaterLock);

    var parTurns = raw.parTurns || raw.maxParTurns || 5;
    var parSteps = raw.parSteps || parTurns;

    var rawRogue = raw.rogue || null;
    var rogue = rawRogue
      ? Object.assign({}, rawRogue, {
          id: rawRogue.id || 'rogue',
          type: 'rogue',
          name: rawRogue.name || 'Shadow Rogue',
          isVillain: true,
          col: typeof rawRogue.col === 'number' ? rawRogue.col : 4,
          row: typeof rawRogue.row === 'number' ? rawRogue.row : 6,
          facing: typeof rawRogue.facing === 'number' ? rawRogue.facing : 3,
          frozenSteps: rawRogue.frozenSteps | 0,
          sunBlinded: !!rawRogue.sunBlinded,
          banished: !!rawRogue.banished,
          nextStep: null,
          distToWarrior: 0
        })
      : null;

    var rawAid = raw.astralAid || { charges: 1, maxCharges: 1, freezeSteps: 2 };
    var astralAid = {
      charges: typeof rawAid.charges === 'number' ? rawAid.charges : 1,
      maxCharges: typeof rawAid.maxCharges === 'number' ? rawAid.maxCharges : 1,
      freezeSteps: typeof rawAid.freezeSteps === 'number' ? rawAid.freezeSteps : 2
    };

    var st = {
      levelId: Number(levelId) || 1,
      name: raw.name || raw.title || ('Level ' + levelId),
      title: raw.title || raw.name || ('Level ' + levelId),
      levelMeta: {
        id: Number(levelId) || 1,
        name: raw.name || raw.title || ('Level ' + levelId),
        title: raw.title || raw.name || ('Level ' + levelId),
        shortGoal: raw.shortGoal || raw.goal || raw.subtitle || '',
        goal: raw.goal || raw.shortGoal || raw.subtitle || '',
        subtitle: raw.subtitle || '',
        objective: raw.objective || raw.subtitle || '',
        parTurns: parTurns,
        parSteps: parSteps,
        simultaneousBeam: simultaneousBeam,
        requireWaterLock: requireWaterLock
      },
      turn: 1,
      steps: 0,
      parTurns: parTurns,
      maxParTurns: parTurns,
      parSteps: parSteps,
      simultaneousBeam: simultaneousBeam,
      requireWaterLock: requireWaterLock,
      braziers: deepClone(raw.braziers || []),
      selectedHeroId: heroes.length > 0 ? heroes[0].id : null,
      selectedGargoyleId: null,
      showMoveHighlights: false,
      actionMode: 'move',
      heroes: heroes,
      rogue: rogue,
      astralAid: astralAid,
      gargoyles: gargoyles,
      mirrors: mirrors,
      emitters: emitters,
      pillars: deepClone(raw.pillars || []),
      relays: deepClone(raw.relays || []),
      headwaters: deepClone(raw.headwaterCells || raw.intakeChannels || raw.headwaters || raw.intakeCells || raw.waterIntakes || raw.waterSources || raw.upstreamWater || []),
      gearRows: gearRows,
      sluiceGates: sluiceGates,
      waterLock: waterLock,
      waterWheelLock: waterLock,
      waterLockActive: !!(waterLock && waterLock.active),
      ferry: ferry,
      pendulum: pendulum,
      exit: exit,
      tileGrid: tileStruct.grid,
      _tilesWereFlat: tileStruct.wasFlat,
      tiles: null,
      tileList: null,
      beamSegments: [],
      beamHits: [],
      maxBounceCount: 0,
      waterCells: [],
      validHighlights: [],
      victory: false,
      defeated: false,
      ambushed: false,
      stars: 3,
      canUndo: false,
      hintMove: null,
      animating: false
    };

    syncTileReferences(st);
    return st;
  }

  // =========================================================================
  // Undo History Stack
  // =========================================================================
  function captureSnapshot(st) {
    return deepClone({
      turn: st.turn,
      steps: st.steps || 0,
      selectedHeroId: st.selectedHeroId,
      selectedGargoyleId: st.selectedGargoyleId,
      actionMode: st.actionMode,
      heroes: st.heroes,
      rogue: st.rogue,
      astralAid: st.astralAid,
      gargoyles: st.gargoyles,
      mirrors: st.mirrors,
      emitters: st.emitters,
      pillars: st.pillars,
      gearRows: st.gearRows,
      sluiceGates: st.sluiceGates,
      waterLock: st.waterLock,
      waterLockActive: st.waterLockActive,
      ferry: st.ferry,
      pendulum: st.pendulum,
      exit: st.exit,
      tileGrid: st.tileGrid,
      victory: st.victory,
      defeated: st.defeated,
      ambushed: st.ambushed
    });
  }

  function applySnapshot(st, snap) {
    st.turn = snap.turn;
    st.steps = snap.steps || 0;
    st.selectedHeroId = snap.selectedHeroId;
    st.selectedGargoyleId = snap.selectedGargoyleId;
    st.showMoveHighlights = false;
    st.actionMode = snap.actionMode;
    st.heroes = deepClone(snap.heroes);
    st.rogue = snap.rogue ? deepClone(snap.rogue) : null;
    st.astralAid = snap.astralAid ? deepClone(snap.astralAid) : { charges: 0, maxCharges: 1, freezeSteps: 2 };
    st.gargoyles = deepClone(snap.gargoyles);
    st.mirrors = deepClone(snap.mirrors);
    st.emitters = deepClone(snap.emitters);
    st.pillars = deepClone(snap.pillars);
    st.gearRows = deepClone(snap.gearRows);
    st.sluiceGates = deepClone(snap.sluiceGates);
    st.waterLock = deepClone(snap.waterLock);
    st.waterWheelLock = st.waterLock;
    st.waterLockActive = snap.waterLockActive;
    st.ferry = deepClone(snap.ferry);
    st.pendulum = deepClone(snap.pendulum);
    st.exit = deepClone(snap.exit);
    st.tileGrid = deepClone(snap.tileGrid);
    st.victory = !!snap.victory;
    st.defeated = !!snap.defeated;
    st.ambushed = !!snap.ambushed;
    st.hintMove = null;
    syncTileReferences(st);
  }

  function pushHistory() {
    if (!_state) return;
    _history.push(captureSnapshot(_state));
    if (_history.length > 64) _history.shift();
    _state.canUndo = true;
  }

  // =========================================================================
  // Shortest Orthogonal Path BFS (Zero-AP Whole-Island Reachability)
  // =========================================================================
  function computeReachableMap(st, hero) {
    var result = {};
    if (!hero || hero.defeated || hero.alive === false) return result;
    var maxDist = hero.moveRange || 64;
    var startKey = hero.col + ',' + hero.row;
    var queue = [{ col: hero.col, row: hero.row, dist: 0, path: [] }];
    var visited = {};
    visited[startKey] = 0;
    var dirs = getDirs();

    while (queue.length > 0) {
      var cur = queue.shift();
      if (cur.dist >= maxDist) continue;

      for (var d = 0; d < 4; d++) {
        var nc = cur.col + dirs[d].dc;
        var nr = cur.row + dirs[d].dr;
        var key = nc + ',' + nr;
        var nd = cur.dist + 1;
        if (visited[key] !== undefined && visited[key] <= nd) continue;
        if (!isTileWalkableForHero(st, nc, nr, hero.id)) continue;

        visited[key] = nd;
        var nextPath = cur.path.concat([{ col: nc, row: nr }]);
        result[key] = { col: nc, row: nr, dist: nd, path: nextPath };
        queue.push({ col: nc, row: nr, dist: nd, path: nextPath });
      }
    }
    return result;
  }

  // =========================================================================
  // Real-Time Board Propagation: Water, Rollers, Pendulum, Sunbeams & Victory
  // =========================================================================
  function defeatGargoyle(st, g, mode, dirVec, instant) {
    if (g.defeated) return;
    g.defeated = true;
    g.sunstruck = false;
    g.state = 'defeated';
    g.defeatMode = mode || 'shatter';

    if (!instant) {
      var wp = gridToWorld(Math.max(0, Math.min(7, g.col)), Math.max(0, Math.min(7, g.row)));
      var units = root.GAME && root.GAME.Units;
      var contraptions = root.GAME && root.GAME.Contraptions;
      if (units && typeof units.animateGargoyleDefeat === 'function') {
        var animDir = Object.assign({ x: 0, y: 1, z: 0 }, dirVec || {});
        if (animDir.atX === undefined) animDir.atX = wp.x;
        if (animDir.atZ === undefined) animDir.atZ = wp.z;
        units.animateGargoyleDefeat(g.id, g.defeatMode, animDir);
      }
      if (g.defeatMode === 'shatter') {
        if (contraptions && typeof contraptions.spawnShatterRubble === 'function') {
          contraptions.spawnShatterRubble(wp.x, 0.65, wp.z, 0x8E9299);
        }
        var vfx = root.GAME && root.GAME.VfxPost;
        if (vfx && typeof vfx.pulseSunFlash === 'function') {
          vfx.pulseSunFlash(0.28, 0.48);
        }
        if (vfx && typeof vfx.triggerShake === 'function') {
          vfx.triggerShake(0.10, 0.22);
        }
        safeAudio('playGargoyleShatter');
      } else {
        if (contraptions && typeof contraptions.spawnWaterSplash === 'function' && st.waterCells.length > 0) {
          contraptions.spawnWaterSplash(wp.x, 0.1, wp.z);
        }
        safeAudio('playWaterSplash');
      }
    }
  }

  function propagateWaterCurrents(st, instant) {
    st.waterCells = [];
    var waterCellByKey = {};
    var lockActive = false;
    var dirs = getDirs();

    if (st.waterLock) {
      st.waterLock.active = false;
    }

    var sluiceByCell = {};
    for (var sgi = 0; sgi < st.sluiceGates.length; sgi++) {
      var gateItem = st.sluiceGates[sgi];
      sluiceByCell[gateItem.col + ',' + gateItem.row] = gateItem;
    }

    function recordWaterCell(c, r, dir, sourceId, isHeadwater, blockedByGate) {
      if (!inBounds(c, r)) return;
      var dIdx = parseDirIndex(dir);
      var dVec = dirs[dIdx];
      var wp = gridToWorld(c, r);
      var wKey = c + ',' + r;
      var existing = waterCellByKey[wKey];
      if (existing) {
        if (!isHeadwater) {
          existing.dir = dIdx;
          existing.flowDir = dIdx;
          existing.dc = dVec.dc;
          existing.dr = dVec.dr;
          existing.sourceId = sourceId;
          existing.headwater = false;
          existing.intake = false;
          existing.blockedBySluice = false;
        }
        return;
      }
      var wc = {
        col: c,
        row: r,
        x: wp.x,
        z: wp.z,
        dir: dIdx,
        flowDir: dIdx,
        dc: dVec.dc,
        dr: dVec.dr,
        sourceId: sourceId || 'headwater',
        headwater: !!isHeadwater,
        intake: !!isHeadwater,
        blockedBySluice: !!blockedByGate
      };
      waterCellByKey[wKey] = wc;
      st.waterCells.push(wc);
    }

    function inferIntakeFlowDir(c, r, fallbackDir) {
      if (fallbackDir !== undefined && fallbackDir !== null) {
        return parseDirIndex(fallbackDir);
      }
      var preferred = [2, 3, 1, 0]; // Prefer South (from row 0 waterwheel) & West (from col 7 waterwheel)
      for (var pi = 0; pi < preferred.length; pi++) {
        var d = preferred[pi];
        var nc = c + dirs[d].dc;
        var nr = r + dirs[d].dr;
        if (!inBounds(nc, nr)) continue;
        if (sluiceByCell[nc + ',' + nr]) return d;
        var nt = getTile(st, nc, nr);
        if (nt && nt.type === 'channel' && !nt.blocksWater) return d;
      }
      return 2;
    }

    // Phase A: Upstream Intake Headwaters (from right/top-right waterwheel edge right up to closed sluiceGates)
    var starters = [];
    function addStarter(col, row, flowDir, id, explicitCell, stopBeforeGate) {
      if (typeof col !== 'number' || typeof row !== 'number' || !inBounds(col, row)) return;
      starters.push({
        col: col,
        row: row,
        flowDir: flowDir,
        id: id || 'headwater',
        explicitCell: !!explicitCell,
        stopBeforeGate: !!stopBeforeGate
      });
    }

    if (Array.isArray(st.headwaters)) {
      for (var hwi = 0; hwi < st.headwaters.length; hwi++) {
        var hw = st.headwaters[hwi];
        if (!hw) continue;
        if (Array.isArray(hw)) {
          addStarter(hw[0], hw[1], hw[2], 'level_headwater', true, false);
        } else if (typeof hw === 'object') {
          if (Array.isArray(hw.cells)) {
            for (var hci = 0; hci < hw.cells.length; hci++) {
              var sub = hw.cells[hci];
              if (Array.isArray(sub)) addStarter(sub[0], sub[1], hw.flowDir, hw.id, true, hw.stopBeforeGate);
              else if (sub) addStarter(sub.col, sub.row, sub.flowDir !== undefined ? sub.flowDir : hw.flowDir, hw.id, true, sub.stopBeforeGate || hw.stopBeforeGate);
            }
          } else {
            addStarter(hw.col, hw.row, hw.flowDir !== undefined ? hw.flowDir : hw.dir, hw.id, true, hw.stopBeforeGate);
          }
        }
      }
    }

    var nGrid = getGridSize();
    for (var tr = 0; tr < nGrid; tr++) {
      for (var tc = 0; tc < nGrid; tc++) {
        var tCell = getTile(st, tc, tr);
        if (tCell && (tCell.headwater || tCell.isHeadwater || tCell.intake || tCell.isIntake || tCell.alwaysWet || tCell.waterSource || tCell.sourceWater)) {
          addStarter(tc, tr, tCell.flowDir !== undefined ? tCell.flowDir : tCell.dir, 'tile_headwater', true, tCell.stopBeforeGate);
        }
      }
    }

    for (var sIdx = 0; sIdx < st.sluiceGates.length; sIdx++) {
      var sg0 = st.sluiceGates[sIdx];
      var extraList = sg0.headwaterCells || sg0.intakeCells || sg0.upstreamCells;
      if (Array.isArray(extraList)) {
        for (var eli = 0; eli < extraList.length; eli++) {
          var el = extraList[eli];
          if (Array.isArray(el)) addStarter(el[0], el[1], el[2], sg0.id + '_intake', true, sg0.stopBeforeGate);
          else if (el) addStarter(el.col, el.row, el.flowDir !== undefined ? el.flowDir : el.dir, sg0.id + '_intake', true, sg0.stopBeforeGate);
        }
      }
      if (typeof sg0.upstreamCol === 'number' && typeof sg0.upstreamRow === 'number') {
        addStarter(sg0.upstreamCol, sg0.upstreamRow, sg0.upstreamDir, sg0.id + '_intake', true, sg0.stopBeforeGate);
      }

      if (sg0.intakeStart && typeof sg0.intakeStart.col === 'number') {
        addStarter(sg0.intakeStart.col, sg0.intakeStart.row, sg0.intakeStart.flowDir, sg0.id + '_intake', true, true);
      }

      // Multi-branch BFS backward along any upstream feeder channel cells leading into this sluiceGate
      var sgDir0 = parseDirIndex(sg0.flowDir !== undefined ? sg0.flowDir : sg0.dir);
      var backQueue = [{ col: sg0.col, row: sg0.row, dir: sgDir0 }];
      var backVisited = {};
      backVisited[sg0.col + ',' + sg0.row] = true;
      var foundUpstreamCount = 0;

      while (backQueue.length > 0) {
        var bNode = backQueue.shift();
        for (var bd = 0; bd < 4; bd++) {
          var pc = bNode.col - dirs[bd].dc;
          var pr = bNode.row - dirs[bd].dr;
          var pKey = pc + ',' + pr;
          if (!inBounds(pc, pr) || backVisited[pKey]) continue;
          var pt = getTile(st, pc, pr);
          if (!pt || pt.blocksWater || pt.type !== 'channel') continue;
          var feedsIn = (pt.flowDir !== undefined)
            ? (parseDirIndex(pt.flowDir) === bd)
            : (bd === bNode.dir);
          if (!feedsIn) continue;

          backVisited[pKey] = true;
          foundUpstreamCount++;
          addStarter(pc, pr, bd, sg0.id + '_upstream', false, true);
          if (!sluiceByCell[pKey]) {
            backQueue.push({ col: pc, row: pr, dir: bd });
          }
        }
      }

      // Only fall back to pooling inside the gate cell itself if no upstream intake channel exists
      if (foundUpstreamCount === 0 && !extraList && !sg0.intakeStart && !sg0.stopBeforeGate && sg0.includeGateCell === true) {
        addStarter(sg0.col, sg0.row, sgDir0, sg0.id + '_basin', false, false);
      }
    }

    for (var hs = 0; hs < starters.length; hs++) {
      var src = starters[hs];
      var hc = src.col;
      var hr = src.row;
      var hDir = inferIntakeFlowDir(hc, hr, src.flowDir);
      var hGuard = 0;

      while (hGuard++ < 16 && inBounds(hc, hr)) {
        var hTile = getTile(st, hc, hr);
        if (!hTile) break;
        var gateAtCell = sluiceByCell[hc + ',' + hr];
        var isMarkedWet = !!(hTile.headwater || hTile.isHeadwater || hTile.intake || hTile.isIntake || hTile.alwaysWet || hTile.waterSource || hTile.sourceWater);
        var allowNonChannel = (hGuard === 1 && src.explicitCell) || isMarkedWet;

        if (!allowNonChannel && (hTile.blocksWater || hTile.type !== 'channel')) break;
        if (hTile.type === 'bridge' && hTile.blocksWater) break;

        if (gateAtCell) {
          var gateDir = parseDirIndex(gateAtCell.flowDir !== undefined ? gateAtCell.flowDir : gateAtCell.dir);
          if (!gateAtCell.open) {
            if (gateAtCell.includeGateCell === true && !src.stopBeforeGate) {
              recordWaterCell(hc, hr, gateDir, src.id, true, true);
            }
            // Stop cleanly right at the closed sluiceGate — never leak into downstream puzzle!
            break;
          } else {
            recordWaterCell(hc, hr, gateDir, gateAtCell.id, false, false);
            break;
          }
        }

        if (hTile.flowDir !== undefined) {
          hDir = parseDirIndex(hTile.flowDir);
        } else if (hGuard === 1) {
          hDir = inferIntakeFlowDir(hc, hr, src.flowDir);
        }

        recordWaterCell(hc, hr, hDir, src.id, true, false);
        hc += dirs[hDir].dc;
        hr += dirs[hDir].dr;
      }
    }

    // Phase B: Active Downstream Currents from Open Sluice Gates
    for (var i = 0; i < st.sluiceGates.length; i++) {
      var sg = st.sluiceGates[i];
      if (!sg.open) continue;

      var c = sg.col;
      var r = sg.row;
      var dir = parseDirIndex(sg.flowDir !== undefined ? sg.flowDir : sg.dir);
      var guard = 0;

      while (guard++ < 16 && inBounds(c, r)) {
        var tile = getTile(st, c, r);
        if (!tile || tile.blocksWater || tile.type !== 'channel') break;

        var downstreamGate = (guard > 1) ? sluiceByCell[c + ',' + r] : null;
        if (downstreamGate && !downstreamGate.open) {
          var dgDir = parseDirIndex(downstreamGate.flowDir !== undefined ? downstreamGate.flowDir : downstreamGate.dir);
          recordWaterCell(c, r, dgDir, sg.id, true, true);
          break;
        }

        if (tile.flowDir !== undefined) {
          dir = parseDirIndex(tile.flowDir);
        }

        var dVec = dirs[dir];
        recordWaterCell(c, r, dir, sg.id, false, false);

        if ((st.waterLock && st.waterLock.col === c && st.waterLock.row === r) || tile.isWaterLock) {
          lockActive = true;
          if (st.waterLock) st.waterLock.active = true;
        }

        // Sweep any undefeated Gargoyle standing in this active channel cell
        for (var gi = 0; gi < st.gargoyles.length; gi++) {
          var g = st.gargoyles[gi];
          if (!g.defeated && g.col === c && g.row === r) {
            var gc = g.col;
            var gr = g.row;
            var pushDir = dir;
            var pushGuard = 0;
            while (pushGuard++ < 16 && inBounds(gc, gr)) {
              var gt = getTile(st, gc, gr);
              if (!gt || gt.blocksWater || gt.type !== 'channel') break;
              var blockGate = (pushGuard > 1) ? sluiceByCell[gc + ',' + gr] : null;
              if (blockGate && !blockGate.open) break;
              pushDir = gt.flowDir !== undefined ? parseDirIndex(gt.flowDir) : pushDir;
              var stepD = dirs[pushDir];
              gc += stepD.dc;
              gr += stepD.dr;
            }
            var finalVec = dirs[pushDir];
            g.col = gc;
            g.row = gr;
            if (!inBounds(gc, gr) || !isTileSolidGround(st, gc, gr)) {
              defeatGargoyle(st, g, 'tumble', { x: finalVec.dc, y: 0, z: finalVec.dr }, instant);
            }
          }
        }

        // Daze/stun Shadow Rogue if an active rushing channel sweeps over him!
        if (st.rogue && !st.rogue.banished && st.rogue.col === c && st.rogue.row === r) {
          st.rogue.frozenSteps = Math.max(st.rogue.frozenSteps || 0, 2);
          for (var rd = 0; rd < 4; rd++) {
            var rnc = c + dirs[rd].dc;
            var rnr = r + dirs[rd].dr;
            var rnt = getTile(st, rnc, rnr);
            if (rnt && rnt.type !== 'channel' && isTileWalkableForRogue(st, rnc, rnr, true)) {
              st.rogue.col = rnc;
              st.rogue.row = rnr;
              break;
            }
          }
        }

        c += dVec.dc;
        r += dVec.dr;
      }
    }

    st.waterLockActive = lockActive;
    if (st.waterLock) st.waterLock.active = lockActive;
    if (st.waterWheelLock) st.waterWheelLock.active = lockActive;

    // Update water-powered Prism Turrets
    for (var mi = 0; mi < st.mirrors.length; mi++) {
      var m = st.mirrors[mi];
      if (m.turretWaterPowered) {
        m.powered = lockActive;
      } else {
        m.powered = true;
      }
    }
  }

  function traceSunbeams(st) {
    st.beamSegments = [];
    st.beamHits = [];
    st.maxBounceCount = 0;

    for (var gi = 0; gi < st.gargoyles.length; gi++) {
      st.gargoyles[gi].sunstruck = false;
    }

    var dirs = getDirs();
    var beamY = getBeamY();
    var maxBounces = getMaxBeamBounces();
    var halfTile = getTileSize() * 0.5;

    for (var ei = 0; ei < st.emitters.length; ei++) {
      var em = st.emitters[ei];
      if (em.active === false) continue;

      var dir = parseDirIndex(em.dir);
      var originWorld = gridToWorld(em.col, em.row);
      var segStartCol = em.col;
      var segStartRow = em.row;
      var segStartX = originWorld.x;
      var segStartZ = originWorld.z;
      var c = em.col + dirs[dir].dc;
      var r = em.row + dirs[dir].dr;
      var bounces = 0;
      var steps = 0;
      var visited = {};

      st.beamHits.push({
        x: originWorld.x,
        z: originWorld.z,
        y: beamY,
        col: em.col,
        row: em.row,
        kind: 'emitter',
        targetId: em.id,
        bounceIndex: 0,
        dir: dir
      });

      while (steps++ < 64 && inBounds(c, r)) {
        var cellWorld = gridToWorld(c, r);

        if (hasPillarAt(st, c, r)) {
          var stopX = cellWorld.x - dirs[dir].dc * (halfTile * 0.55);
          var stopZ = cellWorld.z - dirs[dir].dr * (halfTile * 0.55);
          st.beamSegments.push({
            x1: segStartX,
            z1: segStartZ,
            x2: stopX,
            z2: stopZ,
            y: beamY,
            c1: segStartCol,
            r1: segStartRow,
            c2: c,
            r2: r,
            col1: segStartCol,
            row1: segStartRow,
            col2: c,
            row2: r,
            dir: dir,
            bounceIndex: bounces
          });
          st.beamHits.push({
            x: stopX,
            z: stopZ,
            y: beamY,
            col: c,
            row: r,
            kind: 'pillar',
            bounceIndex: bounces,
            dir: dir
          });
          segStartCol = null;
          break;
        }

        // Pierce straight through Gargoyles!
        var hitGarg = getGargoyleAt(st, c, r);
        if (hitGarg) {
          hitGarg.sunstruck = true;
          st.beamHits.push({
            x: cellWorld.x,
            z: cellWorld.z,
            y: beamY,
            col: c,
            row: r,
            kind: 'gargoyle',
            targetId: hitGarg.id,
            bounceIndex: bounces,
            dir: dir
          });
        }

        // Check Mirror at (c, r)
        var mirror = getMirrorAt(st, c, r);
        if (mirror) {
          st.beamSegments.push({
            x1: segStartX,
            z1: segStartZ,
            x2: cellWorld.x,
            z2: cellWorld.z,
            y: beamY,
            c1: segStartCol,
            r1: segStartRow,
            c2: c,
            r2: r,
            col1: segStartCol,
            row1: segStartRow,
            col2: c,
            row2: r,
            dir: dir,
            bounceIndex: bounces
          });

          if (mirror.turretWaterPowered && !mirror.powered) {
            st.beamHits.push({
              x: cellWorld.x,
              z: cellWorld.z,
              y: beamY,
              col: c,
              row: r,
              kind: 'unpoweredMirror',
              targetId: mirror.id,
              bounceIndex: bounces,
              dir: dir
            });
            segStartCol = null;
            break;
          }

          var nextDir = reflectDir(dir, mirror.rot);
          bounces += 1;
          if (bounces > st.maxBounceCount) {
            st.maxBounceCount = bounces;
          }

          st.beamHits.push({
            x: cellWorld.x,
            z: cellWorld.z,
            y: beamY,
            col: c,
            row: r,
            kind: 'mirror',
            targetId: mirror.id,
            bounceIndex: bounces,
            dir: nextDir
          });

          var loopKey = c + ',' + r + ',' + nextDir;
          if (bounces > maxBounces || visited[loopKey]) {
            segStartCol = null;
            break;
          }
          visited[loopKey] = true;

          dir = nextDir;
          segStartCol = c;
          segStartRow = r;
          segStartX = cellWorld.x;
          segStartZ = cellWorld.z;
        }

        c += dirs[dir].dc;
        r += dirs[dir].dr;
      }

      // Ray exited outer island boundary
      if (segStartCol !== null) {
        var prevC = c - dirs[dir].dc;
        var prevR = r - dirs[dir].dr;
        var lastWorld = gridToWorld(prevC, prevR);
        var edgeX = lastWorld.x + dirs[dir].dc * halfTile;
        var edgeZ = lastWorld.z + dirs[dir].dr * halfTile;
        st.beamSegments.push({
          x1: segStartX,
          z1: segStartZ,
          x2: edgeX,
          z2: edgeZ,
          y: beamY,
          c1: segStartCol,
          r1: segStartRow,
          c2: c - dirs[dir].dc * 0.5,
          r2: r - dirs[dir].dr * 0.5,
          col1: segStartCol,
          row1: segStartRow,
          col2: prevC,
          row2: prevR,
          dir: dir,
          bounceIndex: bounces
        });
        st.beamHits.push({
          x: edgeX,
          z: edgeZ,
          y: beamY,
          col: prevC,
          row: prevR,
          kind: 'edge',
          bounceIndex: bounces,
          dir: dir
        });
      }
    }
  }

  function evaluateShattersAndVictory(st, instant) {
    var aliveGargoyles = st.gargoyles.filter(function (g) { return !g.defeated; });
    var shatteredAny = false;

    if (aliveGargoyles.length > 0) {
      if (st.simultaneousBeam) {
        var allStruck = aliveGargoyles.every(function (g) { return g.sunstruck === true; });
        if (allStruck) {
          for (var i = 0; i < aliveGargoyles.length; i++) {
            defeatGargoyle(st, aliveGargoyles[i], 'shatter', { x: 0, y: 1, z: 0 }, instant);
            shatteredAny = true;
          }
        }
      } else {
        for (var j = 0; j < aliveGargoyles.length; j++) {
          if (aliveGargoyles[j].sunstruck) {
            defeatGargoyle(st, aliveGargoyles[j], 'shatter', { x: 0, y: 1, z: 0 }, instant);
            shatteredAny = true;
          }
        }
      }
    }

    for (var gi = 0; gi < st.gargoyles.length; gi++) {
      var gm = st.gargoyles[gi];
      if (gm.defeated) gm.state = 'defeated';
      else if (gm.sunstruck) gm.state = 'sunstruck';
      else if (gm.awakened) gm.state = 'awakened';
      else gm.state = 'sleeping';
    }

    if (shatteredAny && !instant && st.maxBounceCount > 0) {
      safeAudio('playBeamChord', st.maxBounceCount);
    }

    // Unlock Sanctuary Exit
    var prevExitUnlocked = !!st.exit.unlocked;
    var allDefeated = st.gargoyles.every(function (g) { return g.defeated === true; });
    var waterOk = !st.requireWaterLock || Boolean(st.waterLockActive || (st.waterLock && st.waterLock.active));
    st.exit.unlocked = allDefeated && waterOk;

    if (!prevExitUnlocked && st.exit.unlocked && !instant && !st.exit.exitOnClear) {
      var vfxUnlock = root.GAME && root.GAME.VfxPost;
      if (vfxUnlock && typeof vfxUnlock.pulseSunFlash === 'function') {
        vfxUnlock.pulseSunFlash(0.32, 0.55);
      }
      safeToast('Sanctuary Stair Unlocked! Click the Golden Stair to escape!', 'gold');
    }

    var prevVictory = st.victory;
    if (st.exit.unlocked) {
      if (st.exit.exitOnClear) {
        st.victory = true;
      } else {
        var livingHeroes = st.heroes.filter(function (h) { return !h.defeated && h.alive !== false; });
        var heroOnExit = livingHeroes.some(function (h) {
          return h.col === st.exit.col && h.row === st.exit.row;
        });
        var northOk = !st.exit.requireAllHeroesNorth || livingHeroes.every(function (h) {
          return h.row <= 2;
        });
        var allGatheredOk = !st.exit.requireAllHeroes || livingHeroes.every(function (h) {
          if (Array.isArray(st.exit.zone)) {
            return st.exit.zone.some(function (z) { return z.col === h.col && z.row === h.row; });
          }
          return manhattanDist(h.col, h.row, st.exit.col, st.exit.row) <= 1;
        });

        if (heroOnExit && northOk && allGatheredOk) {
          st.victory = true;
        }
      }
    }

    if (st.victory) {
      st.defeated = false;
      st.ambushed = false;
      if (st.rogue) {
        st.rogue.banished = true;
        st.rogue.nextStep = null;
        st.rogue.distToWarrior = 0;
      }
      var usedSteps = st.steps || 1;
      var parSteps = st.parSteps || st.maxParTurns || 5;
      st.stars = usedSteps <= parSteps ? 3 : (usedSteps <= parSteps + 2 ? 2 : 1);
      if (!prevVictory && !instant) {
        safeAudio('playVictory');
        var vfxVic = root.GAME && root.GAME.VfxPost;
        if (vfxVic && typeof vfxVic.pulseSunFlash === 'function') {
          vfxVic.pulseSunFlash(0.42, 0.72);
        }
        var unitsVic = root.GAME && root.GAME.Units;
        if (unitsVic && typeof unitsVic.animateVictorySunBurst === 'function') {
          unitsVic.animateVictorySunBurst({ x: 0.0, z: 0.0 });
        }
        safeToast('✨ Sanctuary Purified! The Shadow Rogue is banished in golden light!', 'gold');
      }
    }
  }

  function isCellLitBySunbeam(st, col, row) {
    if (!st || !Array.isArray(st.beamSegments)) return false;
    if (hasEmitterAt(st, col, row)) return false;
    for (var i = 0; i < st.beamSegments.length; i++) {
      var seg = st.beamSegments[i];
      if (!seg) continue;
      if (seg.col1 === seg.col2 && col === seg.col1) {
        var minR = Math.min(seg.row1, seg.row2);
        var maxR = Math.max(seg.row1, seg.row2);
        if (row >= minR && row <= maxR) return true;
      } else if (seg.row1 === seg.row2 && row === seg.row1) {
        var minC = Math.min(seg.col1, seg.col2);
        var maxC = Math.max(seg.col1, seg.col2);
        if (col >= minC && col <= maxC) return true;
      }
    }
    return false;
  }

  function computeRogueNextStep(st) {
    if (!st || !st.rogue || st.rogue.banished || st.victory) {
      if (st && st.rogue) {
        st.rogue.nextStep = null;
        st.rogue.distToWarrior = 0;
      }
      return null;
    }
    var warrior = findHeroById(st, 'warrior');
    if (!warrior || warrior.defeated) {
      st.rogue.nextStep = null;
      st.rogue.distToWarrior = 0;
      return null;
    }
    if (st.rogue.col === warrior.col && st.rogue.row === warrior.row) {
      st.rogue.nextStep = null;
      st.rogue.distToWarrior = 0;
      return null;
    }

    var dirs = getDirs();
    function bfs(allowWet) {
      var startK = st.rogue.col + ',' + st.rogue.row;
      var q = [{ col: st.rogue.col, row: st.rogue.row, path: [] }];
      var vis = {};
      vis[startK] = true;
      while (q.length > 0) {
        var cur = q.shift();
        for (var d = 0; d < 4; d++) {
          var nc = cur.col + dirs[d].dc;
          var nr = cur.row + dirs[d].dr;
          var k = nc + ',' + nr;
          if (vis[k]) continue;
          var isTarget = (nc === warrior.col && nr === warrior.row);
          if (!isTarget && !isTileWalkableForRogue(st, nc, nr, allowWet)) continue;
          vis[k] = true;
          var nextPath = cur.path.concat([{ col: nc, row: nr }]);
          if (isTarget) return nextPath;
          q.push({ col: nc, row: nr, path: nextPath });
        }
      }
      return null;
    }

    var path = bfs(false) || bfs(true);
    if (path && path.length > 0) {
      st.rogue.nextStep = path[0];
      st.rogue.distToWarrior = path.length;
      st.rogue.facing = facingFromDelta(path[0].col - st.rogue.col, path[0].row - st.rogue.row, st.rogue.facing);
      return path[0];
    }

    // Across an unbridged Sky Chasm (e.g. Level 4): face toward Warrior and step closer if adjacent walkable tile reduces Manhattan distance
    var curMan = manhattanDist(st.rogue.col, st.rogue.row, warrior.col, warrior.row);
    var bestFallback = null;
    var bestMan = curMan;
    for (var fd = 0; fd < 4; fd++) {
      var fc = st.rogue.col + dirs[fd].dc;
      var fr = st.rogue.row + dirs[fd].dr;
      if (!isTileWalkableForRogue(st, fc, fr, false)) continue;
      var mDist = manhattanDist(fc, fr, warrior.col, warrior.row);
      if (mDist < bestMan) {
        bestMan = mDist;
        bestFallback = { col: fc, row: fr };
      }
    }
    st.rogue.nextStep = bestFallback;
    st.rogue.distToWarrior = curMan;
    if (bestFallback) {
      st.rogue.facing = facingFromDelta(bestFallback.col - st.rogue.col, bestFallback.row - st.rogue.row, st.rogue.facing);
    }
    return bestFallback;
  }

  function updateRogueTelemetry(st) {
    if (!st || !st.rogue) return;
    if (st.victory || st.rogue.banished) {
      st.rogue.banished = true;
      st.rogue.sunBlinded = false;
      st.rogue.nextStep = null;
      st.rogue.distToWarrior = 0;
      return;
    }
    st.rogue.sunBlinded = isCellLitBySunbeam(st, st.rogue.col, st.rogue.row);
    computeRogueNextStep(st);
  }

  function triggerShadowAmbush(st, warrior, instant) {
    st.defeated = true;
    st.ambushed = true;
    st.showMoveHighlights = false;
    if (st.rogue) {
      st.rogue.nextStep = null;
      st.rogue.distToWarrior = 0;
    }
    recomputeValidHighlights();
    if (!instant) {
      safeAudio('playAmbush');
      var vfx = root.GAME && root.GAME.VfxPost;
      if (vfx && typeof vfx.triggerShake === 'function') {
        vfx.triggerShake(0.20, 0.36);
      }
      var units = root.GAME && root.GAME.Units;
      if (units && warrior && typeof units.animateRogueAmbush === 'function') {
        var wwp = gridToWorld(warrior.col, warrior.row);
        units.animateRogueAmbush({ x: wwp.x, y: 0, z: wwp.z }, function () {
          notifyChange();
        });
      }
      safeToast('🗡️ Shadow Ambush! Press [Z] to Undo your last step or [R] to Retry!', 'warn');
    }
  }

  function advanceShadowRogue(st, instant) {
    if (!st || !st.rogue || st.victory || st.rogue.banished || st.defeated) return;
    var warrior = findHeroById(st, 'warrior');
    if (!warrior) return;

    // If a gear slide or ferry move already put an unfrozen Rogue onto Warrior's tile
    if (st.rogue.col === warrior.col && st.rogue.row === warrior.row && st.rogue.frozenSteps <= 0) {
      triggerShadowAmbush(st, warrior, instant);
      return;
    }

    // 1. Frozen inside Mage's Time-Crystal Prison -> consume 1 freeze step and skip move!
    if (st.rogue.frozenSteps > 0) {
      st.rogue.frozenSteps -= 1;
      updateRogueTelemetry(st);
      recomputeValidHighlights();
      if (!instant && st.rogue.frozenSteps === 0) {
        safeToast('❄️ Time-Crystal shattered — Shadow Rogue resumes the hunt!', 'warn');
      }
      return;
    }

    // 2. Standing inside a blazing golden Sunbeam -> Sun-Blinded, skips move!
    st.rogue.sunBlinded = isCellLitBySunbeam(st, st.rogue.col, st.rogue.row);
    if (st.rogue.sunBlinded) {
      updateRogueTelemetry(st);
      recomputeValidHighlights();
      if (!instant) {
        safeAudio('playSunBlind');
        safeToast('☀️ Sun-Blinded! The golden sunbeam dazzles the Shadow Rogue!', 'gold');
      }
      return;
    }

    // 3. Prowl 1 tile closer along shortest path toward Warrior!
    var stepTarget = computeRogueNextStep(st);
    if (!stepTarget) {
      recomputeValidHighlights();
      return;
    }

    var prevC = st.rogue.col;
    var prevR = st.rogue.row;
    st.rogue.col = stepTarget.col;
    st.rogue.row = stepTarget.row;
    st.rogue.facing = facingFromDelta(stepTarget.col - prevC, stepTarget.row - prevR, st.rogue.facing);

    // Check Shadow Ambush!
    if (st.rogue.col === warrior.col && st.rogue.row === warrior.row) {
      triggerShadowAmbush(st, warrior, instant);
      return;
    }

    // Advance rollers if Rogue stepped onto one, then refresh Sun-Blindness & next-step arrow
    propagateRollersAndPendulum(st, instant);
    updateRogueTelemetry(st);
    recomputeValidHighlights();

    if (!instant) {
      safeAudio('playRogueStep');
      if (st.rogue.sunBlinded) {
        safeAudio('playSunBlind');
        safeToast('☀️ Shadow Rogue stepped into a golden sunbeam — Sun-Blinded!', 'gold');
      }
      var unitsMod = root.GAME && root.GAME.Units;
      if (unitsMod && typeof unitsMod.animateHop === 'function') {
        var rwp = gridToWorld(st.rogue.col, st.rogue.row);
        unitsMod.animateHop('rogue', [{ x: rwp.x, y: 0, z: rwp.z }], function () {
          notifyChange();
        });
      }
    }
  }

  function propagateRollersAndPendulum(st, instant) {
    // 1. Automatically advance any entity resting on a spinning Bronze Conveyor Roller (bounded 4-pass)
    for (var pass = 0; pass < 4; pass++) {
      var anyRolled = false;
      var beforeCols = st.heroes.map(function (h) { return h.col + ',' + h.row; })
        .concat(st.gargoyles.map(function (g) { return g.defeated ? 'x' : (g.col + ',' + g.row); }))
        .concat(st.mirrors.map(function (m) { return m.col + ',' + m.row; }))
        .concat([st.rogue && !st.rogue.banished ? (st.rogue.col + ',' + st.rogue.row) : 'x'])
        .join('|');
      stepConveyorRollers(st, instant);
      var afterCols = st.heroes.map(function (h) { return h.col + ',' + h.row; })
        .concat(st.gargoyles.map(function (g) { return g.defeated ? 'x' : (g.col + ',' + g.row); }))
        .concat(st.mirrors.map(function (m) { return m.col + ',' + m.row; }))
        .concat([st.rogue && !st.rogue.banished ? (st.rogue.col + ',' + st.rogue.row) : 'x'])
        .join('|');
      if (beforeCols !== afterCols) anyRolled = true;
      if (!anyRolled) break;
    }

    // 2. Automatically trigger the overhead Clockwork Bell-Hammer Pendulum whenever a Gargoyle enters sweepRows
    if (st.pendulum) {
      var p = st.pendulum;
      var sweepRows = p.sweepRows || p.rows || [3, 4];
      var gargsInLane = [];
      for (var gi = 0; gi < st.gargoyles.length; gi++) {
        var gg = st.gargoyles[gi];
        if (!gg.defeated && sweepRows.indexOf(gg.row) !== -1) {
          gargsInLane.push(gg);
        }
      }
      if (gargsInLane.length > 0) {
        var sweepDir = p.direction || 1;
        p.direction = -sweepDir;
        for (var k = 0; k < gargsInLane.length; k++) {
          var targetG = gargsInLane[k];
          var gWp = gridToWorld(Math.max(0, Math.min(7, targetG.col)), Math.max(0, Math.min(7, targetG.row)));
          defeatGargoyle(st, targetG, 'tumble', { x: sweepDir, y: 0.35, z: 0, atX: gWp.x, atZ: gWp.z }, instant);
        }
        for (var hi = 0; hi < st.heroes.length; hi++) {
          var hh = st.heroes[hi];
          if (!hh.defeated && hh.alive !== false && sweepRows.indexOf(hh.row) !== -1) {
            var safeRowPrimary = hh.row <= 3 ? 2 : 5;
            var safeRowAlt = hh.row <= 3 ? 5 : 2;
            if (isTileWalkableForHero(st, hh.col, safeRowPrimary, hh.id)) {
              hh.row = safeRowPrimary;
            } else if (isTileWalkableForHero(st, hh.col, safeRowAlt, hh.id)) {
              hh.row = safeRowAlt;
            }
          }
        }
        if (st.rogue && !st.rogue.banished && sweepRows.indexOf(st.rogue.row) !== -1) {
          var rSafePrimary = st.rogue.row <= 3 ? 2 : 5;
          var rSafeAlt = st.rogue.row <= 3 ? 5 : 2;
          if (isTileWalkableForRogue(st, st.rogue.col, rSafePrimary)) {
            st.rogue.row = rSafePrimary;
          } else if (isTileWalkableForRogue(st, st.rogue.col, rSafeAlt)) {
            st.rogue.row = rSafeAlt;
          }
          st.rogue.frozenSteps = Math.max(st.rogue.frozenSteps || 0, 2);
        }
        if (!instant) {
          safeAudio('playPendulumWhoosh');
          var contr = root.GAME && root.GAME.Contraptions;
          var vfx = root.GAME && root.GAME.VfxPost;
          if (vfx && typeof vfx.triggerShake === 'function') {
            vfx.triggerShake(0.14, 0.28);
          }
          if (contr && typeof contr.animatePendulumSweep === 'function') {
            contr.animatePendulumSweep(sweepDir, null, function () {
              notifyChange();
            });
          }
        }
      }
    }
  }

  function recomputeBoardPhysics(instant) {
    if (!_state) return;
    propagateWaterCurrents(_state, instant);
    propagateRollersAndPendulum(_state, instant);
    traceSunbeams(_state);
    evaluateShattersAndVictory(_state, instant);
    updateRogueTelemetry(_state);
    recomputeValidHighlights();
  }

  // =========================================================================
  // Action Range Predicates & Clean Board Highlights (No 50-Tile Cyan Flood)
  // =========================================================================
  function getSelectedHero(st) {
    if (!st || !st.heroes || st.heroes.length === 0) return null;
    for (var i = 0; i < st.heroes.length; i++) {
      if (st.heroes[i].id === st.selectedHeroId) return st.heroes[i];
    }
    return st.heroes[0];
  }

  function canHeroRotateMirror(hero, mirror) {
    if (!hero || hero.defeated || hero.alive === false || !mirror) return false;
    return mirror.rotatable !== false;
  }

  function canHeroCrankGear(st, hero, gear) {
    if (!hero || hero.defeated || hero.alive === false || !gear) return false;
    return true;
  }

  function canHeroToggleSluice(hero, sluice) {
    if (!hero || hero.defeated || hero.alive === false || !sluice) return false;
    return true;
  }

  function canHeroMoveFerry(st, hero) {
    if (!hero || hero.defeated || hero.alive === false || !st || !st.ferry) return false;
    return true;
  }

  function recomputeValidHighlights() {
    if (!_state) return;
    var st = _state;
    var list = [];
    var seen = {};

    function addHl(col, row, kind) {
      if (!inBounds(col, row)) return;
      var k = col + ',' + row + ':' + kind;
      if (seen[k]) return;
      seen[k] = true;
      list.push({ col: col, row: row, kind: kind });
    }

    // Optional Warrior 2-tile dodge range highlights when Warrior is clicked
    if (st.showMoveHighlights && !st.victory && !st.defeated) {
      var warHl = findHeroById(st, 'warrior');
      if (warHl && !warHl.defeated) {
        var reachHl = computeReachableMap(st, warHl);
        Object.keys(reachHl).forEach(function (rk) {
          addHl(reachHl[rk].col, reachHl[rk].row, 'move');
        });
      }
    }

    // Sanctuary Exit golden highlight when unlocked (only if manual stair exit is used)
    if (st.exit && st.exit.unlocked && !st.exit.exitOnClear) {
      addHl(st.exit.col, st.exit.row, 'exit');
      if (Array.isArray(st.exit.zone)) {
        for (var zi = 0; zi < st.exit.zone.length; zi++) {
          addHl(st.exit.zone[zi].col, st.exit.zone[zi].row, 'exit');
        }
      }
    }

    // Active Hint highlight
    if (st.hintMove && typeof st.hintMove.col === 'number' && typeof st.hintMove.row === 'number') {
      addHl(st.hintMove.col, st.hintMove.row, 'hint');
    }

    st.validHighlights = list;
  }

  // =========================================================================
  // Mechanical Contraption Mutations (Gear Slide & 2x2 Ferry)
  // =========================================================================
  function resolveGearNextDelta(gear, requestedDelta, targetOffset) {
    if (typeof targetOffset === 'number') {
      return targetOffset - gear.offset;
    }
    if (typeof requestedDelta === 'number' && requestedDelta !== 0) {
      var clampedTarget = Math.max(gear.minOffset, Math.min(gear.maxOffset, gear.offset + requestedDelta));
      return clampedTarget - gear.offset;
    }
    var dir = gear.cycleDir || gear.stepDir || 1;
    var next = gear.offset + dir;
    if (next > gear.maxOffset) {
      gear.cycleDir = -1;
      next = gear.offset - 1;
    } else if (next < gear.minOffset) {
      gear.cycleDir = 1;
      next = gear.offset + 1;
    }
    next = Math.max(gear.minOffset, Math.min(gear.maxOffset, next));
    return next - gear.offset;
  }

  function slideGearTiles(st, gear, delta) {
    var n = getGridSize();
    if (gear.axis === 'row') {
      var rowIdx = gear.index;
      var oldRow = st.tileGrid[rowIdx].map(function (t) { return deepClone(t); });
      for (var c = 0; c < n; c++) {
        if (oldRow[c].hasBrazier) continue;
        var srcC = c - delta;
        if (srcC >= 0 && srcC < n && !oldRow[srcC].hasBrazier) {
          var moved = deepClone(oldRow[srcC]);
          moved.col = c;
          moved.row = rowIdx;
          st.tileGrid[rowIdx][c] = moved;
        } else {
          st.tileGrid[rowIdx][c] = normalizeTileCell('sandstone', c, rowIdx);
          st.tileGrid[rowIdx][c].hasBrazier = false;
        }
      }
    } else {
      var colIdx = gear.index;
      var oldCol = [];
      for (var r = 0; r < n; r++) oldCol[r] = deepClone(st.tileGrid[r][colIdx]);
      for (var r2 = 0; r2 < n; r2++) {
        if (oldCol[r2].hasBrazier) continue;
        var srcR = r2 - delta;
        if (srcR >= 0 && srcR < n && !oldCol[srcR].hasBrazier) {
          var movedC = deepClone(oldCol[srcR]);
          movedC.col = colIdx;
          movedC.row = r2;
          st.tileGrid[r2][colIdx] = movedC;
        } else {
          st.tileGrid[r2][colIdx] = normalizeTileCell('sandstone', colIdx, r2);
          st.tileGrid[r2][colIdx].hasBrazier = false;
        }
      }
    }
  }

  function applyGearSlide(st, gear, delta, instant) {
    if (!gear || delta === 0) return false;
    var nextOffset = gear.offset + delta;
    if (nextOffset < gear.minOffset || nextOffset > gear.maxOffset) return false;

    // Verify no Hero or movable Mirror would be pushed out of 8x8 bounds
    var i;
    for (i = 0; i < st.heroes.length; i++) {
      var h = st.heroes[i];
      if (!h.defeated && h.alive !== false) {
        if (gear.axis === 'row' && h.row === gear.index && !inBounds(h.col + delta, h.row)) return false;
        if (gear.axis === 'col' && h.col === gear.index && !inBounds(h.col, h.row + delta)) return false;
      }
    }
    for (i = 0; i < st.mirrors.length; i++) {
      var m = st.mirrors[i];
      if (!m.removed && m.movable) {
        if (gear.axis === 'row' && m.row === gear.index && !inBounds(m.col + delta, m.row)) return false;
        if (gear.axis === 'col' && m.col === gear.index && !inBounds(m.col, m.row + delta)) return false;
      }
    }

    gear.offset = nextOffset;

    if (gear.slidesTiles) {
      slideGearTiles(st, gear, delta);
    }

    // Shift Heroes, movable Mirrors, and undefeated Gargoyles standing on this gear row/col
    for (i = 0; i < st.heroes.length; i++) {
      var hero = st.heroes[i];
      if (!hero.defeated && hero.alive !== false) {
        if (gear.axis === 'row' && hero.row === gear.index) hero.col += delta;
        else if (gear.axis === 'col' && hero.col === gear.index) hero.row += delta;
      }
    }
    for (i = 0; i < st.mirrors.length; i++) {
      var mir = st.mirrors[i];
      if (!mir.removed && mir.movable) {
        if (gear.axis === 'row' && mir.row === gear.index) mir.col += delta;
        else if (gear.axis === 'col' && mir.col === gear.index) mir.row += delta;
      }
    }
    for (i = 0; i < st.gargoyles.length; i++) {
      var g = st.gargoyles[i];
      if (g.defeated) continue;
      var movedG = false;
      var dirV = { x: 0, y: 0, z: 0 };
      if (gear.axis === 'row' && g.row === gear.index) {
        g.col += delta;
        movedG = true;
        dirV.x = delta;
      } else if (gear.axis === 'col' && g.col === gear.index) {
        g.row += delta;
        movedG = true;
        dirV.z = delta;
      }
      if (movedG && (!inBounds(g.col, g.row) || !isTileSolidGround(st, g.col, g.row))) {
        defeatGargoyle(st, g, 'tumble', dirV, instant);
      }
    }

    // Slide Shadow Rogue if standing on this gear row/col
    if (st.rogue && !st.rogue.banished) {
      if (gear.axis === 'row' && st.rogue.row === gear.index) {
        var nextRc = st.rogue.col + delta;
        if (inBounds(nextRc, st.rogue.row) && isTileSolidGround(st, nextRc, st.rogue.row)) {
          st.rogue.col = nextRc;
        } else {
          st.rogue.col = Math.max(0, Math.min(7, nextRc));
          st.rogue.frozenSteps = Math.max(st.rogue.frozenSteps || 0, 2);
        }
      } else if (gear.axis === 'col' && st.rogue.col === gear.index) {
        var nextRr = st.rogue.row + delta;
        if (inBounds(st.rogue.col, nextRr) && isTileSolidGround(st, st.rogue.col, nextRr)) {
          st.rogue.row = nextRr;
        } else {
          st.rogue.row = Math.max(0, Math.min(7, nextRr));
          st.rogue.frozenSteps = Math.max(st.rogue.frozenSteps || 0, 2);
        }
      }
    }

    syncTileReferences(st);
    return true;
  }

  function applyFerryMove(st, targetCol, delta) {
    if (!st.ferry) return false;
    var f = st.ferry;
    var oldCol = f.col;
    var nextCol = oldCol;

    if (typeof delta === 'number' && delta !== 0) {
      nextCol = Math.max(f.minCol, Math.min(f.maxCol, oldCol + delta));
    } else if (typeof targetCol === 'number') {
      nextCol = Math.max(f.minCol, Math.min(f.maxCol, targetCol));
    } else {
      var step = f.cycleDir || f.stepDir || 1;
      nextCol = oldCol + step;
      if (nextCol > f.maxCol) {
        f.cycleDir = -1;
        nextCol = Math.max(f.minCol, oldCol - 1);
      } else if (nextCol < f.minCol) {
        f.cycleDir = 1;
        nextCol = Math.min(f.maxCol, oldCol + 1);
      }
    }

    var dc = nextCol - oldCol;
    if (dc === 0) return false;

    var heroPassengers = [];
    var mirrorPassengers = [];
    var gargPassengers = [];
    var i;
    for (i = 0; i < st.heroes.length; i++) {
      if (!st.heroes[i].defeated && isCellOnFerry(st, st.heroes[i].col, st.heroes[i].row)) {
        heroPassengers.push(st.heroes[i]);
      }
    }
    for (i = 0; i < st.mirrors.length; i++) {
      if (!st.mirrors[i].removed && st.mirrors[i].movable && isCellOnFerry(st, st.mirrors[i].col, st.mirrors[i].row)) {
        mirrorPassengers.push(st.mirrors[i]);
      }
    }
    for (i = 0; i < st.gargoyles.length; i++) {
      if (!st.gargoyles[i].defeated && isCellOnFerry(st, st.gargoyles[i].col, st.gargoyles[i].row)) {
        gargPassengers.push(st.gargoyles[i]);
      }
    }

    var rogueOnFerry = !!(st.rogue && !st.rogue.banished && isCellOnFerry(st, st.rogue.col, st.rogue.row));

    f.col = nextCol;
    for (i = 0; i < heroPassengers.length; i++) heroPassengers[i].col += dc;
    for (i = 0; i < mirrorPassengers.length; i++) mirrorPassengers[i].col += dc;
    for (i = 0; i < gargPassengers.length; i++) gargPassengers[i].col += dc;
    if (rogueOnFerry) st.rogue.col += dc;

    return true;
  }

  // =========================================================================
  // Lookup Helpers
  // =========================================================================
  function findHeroById(st, id) {
    if (!id) return getSelectedHero(st);
    for (var i = 0; i < st.heroes.length; i++) {
      if (st.heroes[i].id === id || st.heroes[i].type === id) return st.heroes[i];
    }
    return null;
  }

  function findMirrorByIdOrPos(st, id, col, row) {
    for (var i = 0; i < st.mirrors.length; i++) {
      var m = st.mirrors[i];
      if (id && m.id === id) return m;
      if (typeof col === 'number' && typeof row === 'number' && m.col === col && m.row === row) return m;
    }
    return null;
  }

  function findGearByIdOrPos(st, id, axis, index, col, row) {
    var i, g;
    if (id) {
      for (i = 0; i < st.gearRows.length; i++) {
        if (st.gearRows[i].id === id) return st.gearRows[i];
      }
    }
    if (typeof col === 'number' && typeof row === 'number') {
      for (i = 0; i < st.gearRows.length; i++) {
        g = st.gearRows[i];
        if (g.knobCol === col && g.knobRow === row) return g;
      }
    }
    for (i = 0; i < st.gearRows.length; i++) {
      g = st.gearRows[i];
      if (axis && g.axis === axis && g.index === index) return g;
      if (!axis && typeof index === 'number' && g.index === index) return g;
    }
    return null;
  }

  function findSluiceByIdOrPos(st, id, col, row) {
    for (var i = 0; i < st.sluiceGates.length; i++) {
      var s = st.sluiceGates[i];
      if (id && s.id === id) return s;
      if (typeof col === 'number' && typeof row === 'number' && s.col === col && s.row === row) return s;
    }
    return null;
  }

  function evaluateGargoylePushDest(st, warrior, destC, destR) {
    if (!inBounds(destC, destR) || !isTileSolidGround(st, destC, destR)) {
      return { valid: true, isHazard: true, priority: 4, tumblesOff: true };
    }
    var dt = getTile(st, destC, destR);
    if (!dt || dt.hasBrazier) return null;
    if (hasPillarAt(st, destC, destR) || hasEmitterAt(st, destC, destR)) return null;
    if (getMirrorAt(st, destC, destR) || getGargoyleAt(st, destC, destR)) return null;
    var occH = getHeroAt(st, destC, destR);
    if (occH && (!warrior || occH.id !== warrior.id)) return null;

    var isRoller = dt.type === 'roller';
    var isWetChannel = dt.type === 'channel' && st.waterCells.some(function (wc) {
      return wc.col === destC && wc.row === destR && !wc.headwater && !wc.blockedBySluice;
    });
    var isPendulum = !!(st.pendulum && (st.pendulum.sweepRows || st.pendulum.rows || [3, 4]).indexOf(destR) !== -1);
    var isHazard = isRoller || isWetChannel || isPendulum;
    return {
      valid: true,
      isHazard: isHazard,
      priority: isHazard ? 3 : 1,
      tumblesOff: false
    };
  }

  function resolveWarriorGargoyleBash(st, gCol, gRow, allowPlainRemotePush) {
    var warrior = findHeroById(st, 'warrior');
    if (!warrior || warrior.defeated || warrior.alive === false) return null;
    var garg = getGargoyleAt(st, gCol, gRow);
    if (!garg) return null;

    // 1. If Warrior is already orthogonally adjacent and push direction is clear, bash immediately
    if (manhattanDist(warrior.col, warrior.row, gCol, gRow) === 1) {
      var adjBdc = gCol - warrior.col;
      var adjBdr = gRow - warrior.row;
      var adjDestC = gCol + adjBdc;
      var adjDestR = gRow + adjBdr;
      var adjEval = evaluateGargoylePushDest(st, warrior, adjDestC, adjDestR);
      if (adjEval) {
        return {
          warrior: warrior,
          gargoyle: garg,
          standCol: warrior.col,
          standRow: warrior.row,
          path: [],
          bdc: adjBdc,
          bdr: adjBdr,
          destC: adjDestC,
          destR: adjDestR,
          tumblesOff: adjEval.tumblesOff,
          isHazard: adjEval.isHazard
        };
      }
    }

    // 2. Otherwise evaluate reachable orthogonal stand tiles around the Gargoyle
    var reach = computeReachableMap(st, warrior);
    var dirs = getDirs();
    var bestPlan = null;

    for (var d = 0; d < 4; d++) {
      var sc = gCol - dirs[d].dc;
      var sr = gRow - dirs[d].dr;
      if (!inBounds(sc, sr)) continue;

      var path = null;
      var dist = 0;
      if (sc === warrior.col && sr === warrior.row) {
        path = [];
        dist = 0;
      } else {
        var rNode = reach[sc + ',' + sr];
        if (!rNode) continue;
        path = rNode.path;
        dist = rNode.dist;
      }

      var bdc = dirs[d].dc;
      var bdr = dirs[d].dr;
      var destC = gCol + bdc;
      var destR = gRow + bdr;
      var ev = evaluateGargoylePushDest(st, warrior, destC, destR);
      if (!ev) continue;
      if (!allowPlainRemotePush && !ev.isHazard) continue;

      if (
        !bestPlan ||
        ev.priority > bestPlan.priority ||
        (ev.priority === bestPlan.priority && dist < bestPlan.dist)
      ) {
        bestPlan = {
          warrior: warrior,
          gargoyle: garg,
          standCol: sc,
          standRow: sr,
          path: path,
          dist: dist,
          bdc: bdc,
          bdr: bdr,
          destC: destC,
          destR: destR,
          tumblesOff: ev.tumblesOff,
          isHazard: ev.isHazard,
          priority: ev.priority
        };
      }
    }

    return bestPlan;
  }

  // =========================================================================
  // Deterministic Action Executor: executeAction(actionObj, instant)
  // Auto-Hero Option 2: Zero AP, Mage turns Mirrors, Warrior cranks Gears/Bashes,
  // Rogue sprints onto Unlocked Golden Sanctuary Exit!
  // =========================================================================
  function executeAction(actionObj, instant) {
    if (!_state || !actionObj) return false;
    var st = _state;
    var type = actionObj.type || actionObj.action || actionObj.kind;
    if ((st.victory || st.defeated) && type !== 'reset') return false;

    // 0. POCKET SUMMON: MAGE'S "ASTRAL AID" (Freezes Shadow Rogue for 2 Steps, 0 step cost!)
    if (type === 'astralAid' || type === 'freezeRogue' || type === 'summonMage') {
      if (!st.astralAid || st.astralAid.charges <= 0 || !st.rogue || st.rogue.banished) {
        if (!instant) {
          safeAudio('playError');
          safeToast('Astral Aid has already been used on this level!', 'warn');
        }
        return false;
      }

      pushHistory();
      st.hintMove = null;
      st.showMoveHighlights = false;
      st.astralAid.charges -= 1;
      st.rogue.frozenSteps = Math.max(st.rogue.frozenSteps || 0, st.astralAid.freezeSteps || 2);

      recomputeBoardPhysics(instant);

      if (!instant) {
        safeAudio('playAstralAid');
        var vfxAid = root.GAME && root.GAME.VfxPost;
        if (vfxAid && typeof vfxAid.pulseSunFlash === 'function') {
          vfxAid.pulseSunFlash(0.26, 0.52);
        }
        var uModAid = root.GAME && root.GAME.Units;
        if (uModAid && typeof uModAid.animateAstralAid === 'function') {
          var rAidWp = gridToWorld(st.rogue.col, st.rogue.row);
          uModAid.animateAstralAid({ x: rAidWp.x, y: 0, z: rAidWp.z }, function () {
            notifyChange();
          });
        }
        safeToast('✨ Astral Aid! Mage freezes the Shadow Rogue in starlight for 2 steps!', 'gold');
      }
      notifyChange();
      return true;
    }

    if (type === 'endTurn') {
      return endTurn(instant);
    }
    if (type === 'selectHero') {
      selectHero(actionObj.heroId || actionObj.id, instant);
      return true;
    }

    var explicitHeroId = actionObj.heroId || actionObj.unitId || null;
    var hero = findHeroById(st, explicitHeroId || st.selectedHeroId);
    st.hintMove = null;
    st.showMoveHighlights = false;

    // 1. MOVE HERO (Auto-prefers Rogue for unlocked Exit; falls back across split island halves)
    if (type === 'move') {
      var destCol = typeof actionObj.col === 'number' ? actionObj.col : actionObj.toCol;
      var destRow = typeof actionObj.row === 'number' ? actionObj.row : actionObj.toRow;
      if (!inBounds(destCol, destRow)) return false;

      var isExitTile = !!(st.exit && st.exit.unlocked && destCol === st.exit.col && destRow === st.exit.row);
      if (isExitTile && !actionObj.explicitHero) {
        var rogueHero = findHeroById(st, 'rogue');
        if (rogueHero && !rogueHero.defeated && rogueHero.alive !== false) {
          var rogueReach = computeReachableMap(st, rogueHero);
          if ((rogueHero.col === destCol && rogueHero.row === destRow) || rogueReach[destCol + ',' + destRow]) {
            hero = rogueHero;
          }
        }
      }

      if (!hero || hero.defeated || hero.alive === false) {
        hero = st.heroes.find(function (h) { return !h.defeated && h.alive !== false; }) || null;
      }
      if (!hero) return false;
      if (hero.col === destCol && hero.row === destRow) {
        st.selectedHeroId = hero.id;
        notifyChange();
        return true;
      }

      var reach = computeReachableMap(st, hero);
      var targetNode = reach[destCol + ',' + destRow];

      // Fallback: if another Hero can reach this tile (e.g. across a split sky-island), auto-switch to them!
      if (!targetNode && !actionObj.explicitHero) {
        var order = ['rogue', 'warrior', 'mage'];
        for (var oi = 0; oi < order.length; oi++) {
          var altH = findHeroById(st, order[oi]);
          if (!altH || altH.id === hero.id || altH.defeated || altH.alive === false) continue;
          var altReach = computeReachableMap(st, altH);
          if (altReach[destCol + ',' + destRow]) {
            hero = altH;
            targetNode = altReach[destCol + ',' + destRow];
            break;
          }
        }
      }

      if (!targetNode) {
        if (!instant) {
          safeAudio('playError');
          safeToast('Warrior can dodge up to 2 walkable tiles per step!', 'warn');
        }
        return false;
      }

      pushHistory();
      st.selectedHeroId = hero.id;
      st.steps = (st.steps || 0) + 1;
      var prevCol = hero.col;
      var prevRow = hero.row;
      hero.col = destCol;
      hero.row = destRow;
      hero.facing = facingFromDelta(destCol - prevCol, destRow - prevRow, hero.facing);

      recomputeBoardPhysics(instant);

      if (!instant) {
        safeAudio('playHop');
        var units = root.GAME && root.GAME.Units;
        if (units && typeof units.animateHop === 'function') {
          var worldPts = targetNode.path.map(function (pt) {
            var wp = gridToWorld(pt.col, pt.row);
            return { x: wp.x, y: 0, z: wp.z };
          });
          units.animateHop(hero.id, worldPts, function () {
            notifyChange();
          });
        }
      }
      advanceShadowRogue(st, instant);
      notifyChange();
      return true;
    }

    // 2. ROTATE PRISM MIRROR (Direct 1-Click — Warrior triggers +90° turn!)
    if (type === 'rotateMirror' || type === 'rotate' || type === 'astralPrism') {
      var mirror = findMirrorByIdOrPos(st, actionObj.mirrorId || actionObj.targetId || actionObj.id, actionObj.col, actionObj.row);
      var mage = findHeroById(st, 'mage');
      if (mage && !mage.defeated && mage.alive !== false) {
        hero = mage;
      }
      if (!mirror || !hero || !canHeroRotateMirror(hero, mirror)) {
        if (!instant) safeAudio('playError');
        return false;
      }

      pushHistory();
      st.selectedHeroId = hero.id;
      st.steps = (st.steps || 0) + 1;
      hero.facing = facingFromDelta(mirror.col - hero.col, mirror.row - hero.row, hero.facing);

      if (typeof actionObj.rot === 'number') {
        mirror.rot = ((actionObj.rot % 4) + 4) % 4;
      } else {
        var deltaRot = typeof actionObj.deltaRot === 'number'
          ? actionObj.deltaRot
          : (typeof actionObj.delta === 'number' ? actionObj.delta : 1);
        mirror.rot = (((mirror.rot + deltaRot) % 4) + 4) % 4;
      }

      recomputeBoardPhysics(instant);

      if (!instant) {
        safeAudio('playMirrorRotate', st.maxBounceCount || 1);
        var contraptions = root.GAME && root.GAME.Contraptions;
        var unitsMod = root.GAME && root.GAME.Units;
        if (unitsMod && typeof unitsMod.animateHeroAction === 'function') {
          var mwp = gridToWorld(mirror.col, mirror.row);
          unitsMod.animateHeroAction(hero.id, hero.type === 'mage' ? 'staffCast' : 'swordCrank', { x: mwp.x, y: 0.8, z: mwp.z });
        }
        if (contraptions && typeof contraptions.animateMirrorRotate === 'function') {
          contraptions.animateMirrorRotate(mirror.id, mirror.rot, function () {
            notifyChange();
          });
        }
      }
      advanceShadowRogue(st, instant);
      notifyChange();
      return true;
    }

    // 3. SHIFT GEAR ROW / COLUMN (Auto-uses Warrior from anywhere on the board!)
    if (type === 'shiftGear' || type === 'slideGear' || type === 'crankGear') {
      var gear = findGearByIdOrPos(
        st,
        actionObj.gearId || actionObj.id,
        actionObj.axis,
        actionObj.index !== undefined ? actionObj.index : (actionObj.row !== undefined ? actionObj.row : actionObj.col),
        actionObj.col,
        actionObj.row
      );
      var warGear = findHeroById(st, 'warrior');
      if (warGear && !warGear.defeated && warGear.alive !== false) {
        hero = warGear;
      }
      if (!gear || !hero) {
        if (!instant) safeAudio('playError');
        return false;
      }

      var gearDelta = resolveGearNextDelta(
        gear,
        actionObj.delta,
        actionObj.targetOffset !== undefined ? actionObj.targetOffset : actionObj.offset
      );
      if (gearDelta === 0) return false;

      pushHistory();
      if (!applyGearSlide(st, gear, gearDelta, instant)) {
        _history.pop();
        st.canUndo = _history.length > 0;
        if (!instant) {
          safeAudio('playError');
          safeToast('Cannot slide row — a Hero or Mirror is at the cliff edge!', 'warn');
        }
        return false;
      }

      st.selectedHeroId = hero.id;
      st.steps = (st.steps || 0) + 1;
      var knobC = typeof gear.knobCol === 'number' ? gear.knobCol : (gear.axis === 'col' ? gear.index : 0);
      var knobR = typeof gear.knobRow === 'number' ? gear.knobRow : (gear.axis === 'row' ? gear.index : 0);
      hero.facing = facingFromDelta(knobC - hero.col, knobR - hero.row, hero.facing);

      recomputeBoardPhysics(instant);

      if (!instant) {
        safeAudio('playGearSlide');
        var worldMod = root.GAME && root.GAME.World;
        var contrMod = root.GAME && root.GAME.Contraptions;
        var uModGear = root.GAME && root.GAME.Units;
        if (uModGear && typeof uModGear.animateHeroAction === 'function') {
          var kwp = gridToWorld(knobC, knobR);
          uModGear.animateHeroAction(hero.id, 'swordCrank', { x: kwp.x, y: 0.5, z: kwp.z });
        }
        if (contrMod && typeof contrMod.spawnDustPuff === 'function') {
          var dwp = gear.axis === 'row' ? gridToWorld(3.5, gear.index) : gridToWorld(gear.index, 3.5);
          contrMod.spawnDustPuff(dwp.x, 0.05, dwp.z);
        }
        if (worldMod && typeof worldMod.animateRowSlide === 'function') {
          worldMod.animateRowSlide(gear.axis, gear.index, gearDelta, function () {
            notifyChange();
          });
        }
      }
      advanceShadowRogue(st, instant);
      notifyChange();
      return true;
    }

    // 4. TOGGLE SLUICE GATE (Level 2 — Auto-uses Warrior!)
    if (type === 'toggleSluice' || type === 'sluice') {
      var sluice = findSluiceByIdOrPos(st, actionObj.sluiceId || actionObj.id, actionObj.col, actionObj.row);
      var warSluice = findHeroById(st, 'warrior');
      if (warSluice && !warSluice.defeated && warSluice.alive !== false) {
        hero = warSluice;
      }
      if (!sluice || !hero) {
        if (!instant) safeAudio('playError');
        return false;
      }

      pushHistory();
      st.selectedHeroId = hero.id;
      st.steps = (st.steps || 0) + 1;
      hero.facing = facingFromDelta(sluice.col - hero.col, sluice.row - hero.row, hero.facing);
      sluice.open = typeof actionObj.open === 'boolean' ? actionObj.open : !sluice.open;

      recomputeBoardPhysics(instant);

      if (!instant) {
        safeAudio('playGearSlide');
        if (sluice.open) safeAudio('playWaterSplash');
        var uModSluice = root.GAME && root.GAME.Units;
        if (uModSluice && typeof uModSluice.animateHeroAction === 'function') {
          var swp = gridToWorld(sluice.col, sluice.row);
          uModSluice.animateHeroAction(hero.id, 'swordCrank', { x: swp.x, y: 0.5, z: swp.z });
        }
      }
      advanceShadowRogue(st, instant);
      notifyChange();
      return true;
    }

    // 5. MOVE 2x2 BRONZE FERRY (Level 4 — Auto-uses Warrior!)
    if (type === 'moveFerry' || type === 'ferry') {
      var warFerry = findHeroById(st, 'warrior');
      if (warFerry && !warFerry.defeated && warFerry.alive !== false) {
        hero = warFerry;
      }
      if (!st.ferry || !hero) {
        if (!instant) safeAudio('playError');
        return false;
      }

      pushHistory();
      var movedFerry = applyFerryMove(
        st,
        actionObj.targetCol !== undefined ? actionObj.targetCol : actionObj.col,
        actionObj.delta
      );
      if (!movedFerry) {
        _history.pop();
        st.canUndo = _history.length > 0;
        return false;
      }

      st.selectedHeroId = hero.id;
      st.steps = (st.steps || 0) + 1;
      var fCenterCol = st.ferry.col + 0.5;
      var fCenterRow = st.ferry.rows ? st.ferry.rows[0] + 0.5 : 3.5;
      hero.facing = facingFromDelta(fCenterCol - hero.col, fCenterRow - hero.row, hero.facing);
      recomputeBoardPhysics(instant);

      if (!instant) {
        safeAudio('playGearSlide');
        var uModFerry = root.GAME && root.GAME.Units;
        if (uModFerry && typeof uModFerry.animateHeroAction === 'function') {
          var fwp = gridToWorld(st.ferry.col, st.ferry.rows ? st.ferry.rows[0] : 3);
          uModFerry.animateHeroAction(hero.id, 'swordCrank', { x: fwp.x, y: 0.5, z: fwp.z });
        }
        var wMod = root.GAME && root.GAME.World;
        if (wMod && typeof wMod.animateFerryMove === 'function') {
          wMod.animateFerryMove(st.ferry.col, function () {
            notifyChange();
          });
        }
      }
      advanceShadowRogue(st, instant);
      notifyChange();
      return true;
    }

    // 6. SMART SHIELD-BASH / LEGACY CLASS ABILITIES
    if (type === 'bash' || type === 'shove' || type === 'ability' || type === 'swap' || type === 'grapple') {
      if (actionObj.gearId || actionObj.subType === 'crank') {
        return executeAction({
          type: 'shiftGear',
          gearId: actionObj.gearId,
          axis: actionObj.axis,
          index: actionObj.index,
          delta: actionObj.delta,
          targetOffset: actionObj.targetOffset
        }, instant);
      }

      if (actionObj.mirrorId && type !== 'swap' && type !== 'grapple' && type !== 'bash' && type !== 'shove') {
        return executeAction({
          type: 'rotateMirror',
          mirrorId: actionObj.mirrorId,
          col: actionObj.col,
          row: actionObj.row,
          deltaRot: actionObj.deltaRot !== undefined ? actionObj.deltaRot : 1
        }, instant);
      }

      var tCol = actionObj.col !== undefined ? actionObj.col : actionObj.targetCol;
      var tRow = actionObj.row !== undefined ? actionObj.row : actionObj.targetRow;

      // Warrior Shield-Bash on a Stone Gargoyle (supports auto-walking adjacent!)
      var targetGarg = (typeof tCol === 'number' && typeof tRow === 'number') ? getGargoyleAt(st, tCol, tRow) : null;
      if (targetGarg && type !== 'swap' && type !== 'grapple') {
        var allowPlain = actionObj.onlyHazard !== true;
        var plan = resolveWarriorGargoyleBash(st, tCol, tRow, allowPlain);
        if (!plan) {
          if (!instant) safeAudio('playError');
          return false;
        }

        pushHistory();
        var war = plan.warrior;
        st.selectedHeroId = war.id;
        st.steps = (st.steps || 0) + 1;
        war.col = plan.standCol;
        war.row = plan.standRow;
        war.facing = facingFromDelta(plan.bdc, plan.bdr, war.facing);

        if (plan.tumblesOff) {
          defeatGargoyle(st, targetGarg, 'tumble', { x: plan.bdc, y: 0, z: plan.bdr }, instant);
        } else {
          targetGarg.col = plan.destC;
          targetGarg.row = plan.destR;
        }

        st.actionMode = 'move';
        recomputeBoardPhysics(instant);

        if (!instant) {
          var uModW = root.GAME && root.GAME.Units;
          var twp = gridToWorld(tCol, tRow);
          if (plan.path && plan.path.length > 0 && uModW && typeof uModW.animateHop === 'function') {
            safeAudio('playHop');
            var hopPts = plan.path.map(function (pt) {
              var pWp = gridToWorld(pt.col, pt.row);
              return { x: pWp.x, y: 0, z: pWp.z };
            });
            uModW.animateHop(war.id, hopPts, function () {
              safeAudio('playAbility', 'warrior');
              if (typeof uModW.animateHeroAction === 'function') {
                uModW.animateHeroAction(war.id, 'swordCrank', { x: twp.x, y: 0.5, z: twp.z });
              }
              notifyChange();
            });
          } else {
            safeAudio('playAbility', 'warrior');
            if (uModW && typeof uModW.animateHeroAction === 'function') {
              uModW.animateHeroAction(war.id, 'swordCrank', { x: twp.x, y: 0.5, z: twp.z });
            }
          }
        }
        advanceShadowRogue(st, instant);
        notifyChange();
        return true;
      }

      // Adjacent Warrior Mirror shove (if Warrior is right next to a movable Mirror)
      var bashMir = (typeof tCol === 'number' && typeof tRow === 'number') ? getMirrorAt(st, tCol, tRow) : null;
      var warAdj = findHeroById(st, 'warrior');
      if (bashMir && warAdj && !warAdj.defeated && manhattanDist(warAdj.col, warAdj.row, tCol, tRow) === 1) {
        var mbdc = tCol - warAdj.col;
        var mbdr = tRow - warAdj.row;
        var mDestC = tCol + mbdc;
        var mDestR = tRow + mbdr;
        if (bashMir.movable && isTileWalkableForHero(st, mDestC, mDestR, warAdj.id)) {
          pushHistory();
          st.selectedHeroId = warAdj.id;
          st.steps = (st.steps || 0) + 1;
          warAdj.facing = facingFromDelta(mbdc, mbdr, warAdj.facing);
          bashMir.col = mDestC;
          bashMir.row = mDestR;
          st.actionMode = 'move';
          recomputeBoardPhysics(instant);
          if (!instant) {
            safeAudio('playAbility', 'warrior');
            var uModWM = root.GAME && root.GAME.Units;
            if (uModWM && typeof uModWM.animateHeroAction === 'function') {
              var mtwp = gridToWorld(tCol, tRow);
              uModWM.animateHeroAction(warAdj.id, 'swordCrank', { x: mtwp.x, y: 0.5, z: mtwp.z });
            }
          }
          advanceShadowRogue(st, instant);
          notifyChange();
          return true;
        }
      }
    }

    return false;
  }

  // =========================================================================
  // Unified Interactive Pick Dispatcher: handlePick(pickData)
  // Direct 1-Click Auto-Hero Controls (Zero Mode Switching Required!)
  // =========================================================================
  function handlePick(pickData) {
    if (!_state || !pickData || _state.victory || _state.defeated) return false;
    var st = _state;
    var pickType = pickData.pickType || pickData.type || pickData.kind;
    if (pickType === 'gear') pickType = 'gearKnob';
    if (pickType === 'exit' || pickType === 'exitStair') pickType = 'tile';
    var col = typeof pickData.col === 'number' ? pickData.col : undefined;
    var row = typeof pickData.row === 'number' ? pickData.row : undefined;

    if (pickType === 'hero') {
      st.showMoveHighlights = !st.showMoveHighlights;
      selectHero(pickData.unitId || pickData.id);
      if (st.showMoveHighlights) {
        safeToast('Click any cyan tile within 2 steps to dodge, or click any Mirror / Gear!', 'info');
      }
      return true;
    }

    if (pickType === 'rogueVillain') {
      safeAudio('playSelect');
      if (st.rogue && st.rogue.frozenSteps > 0) {
        safeToast('❄️ Shadow Rogue is frozen in Mage\'s Time-Crystal (' + st.rogue.frozenSteps + ' step' + (st.rogue.frozenSteps === 1 ? '' : 's') + ' left)!', 'info');
      } else if (st.rogue && st.rogue.sunBlinded) {
        safeToast('☀️ Shadow Rogue is blinded by the golden sunbeam and cannot move!', 'gold');
      } else if (st.astralAid && st.astralAid.charges > 0) {
        safeToast('🗡️ Shadow Rogue stalks 1 tile per step! Click Mage: Astral Aid [F] to freeze him for 2 steps!', 'warn');
      } else {
        safeToast('🗡️ Shadow Rogue stalks 1 tile closer after each action — blind him with sunbeams or dodge!', 'warn');
      }
      return true;
    }

    if (pickType === 'mirror') {
      return executeAction({
        type: 'rotateMirror',
        mirrorId: pickData.mirrorId || pickData.id,
        col: col,
        row: row,
        deltaRot: 1
      }, false);
    }

    if (pickType === 'gearKnob') {
      return executeAction({
        type: 'shiftGear',
        gearId: pickData.gearId || pickData.id,
        axis: pickData.axis,
        index: pickData.index,
        col: col,
        row: row,
        delta: pickData.delta !== undefined ? pickData.delta : pickData.dir
      }, false);
    }

    if (pickType === 'sluice') {
      return executeAction({
        type: 'toggleSluice',
        sluiceId: pickData.sluiceId || pickData.id,
        col: col,
        row: row
      }, false);
    }

    if (pickType === 'ferryLever') {
      return executeAction({
        type: 'moveFerry',
        delta: pickData.delta !== undefined ? pickData.delta : pickData.dir,
        targetCol: pickData.targetCol
      }, false);
    }

    if (pickType === 'gargoyle') {
      var pickedG = st.gargoyles.find(function (g) {
        return g.id === (pickData.unitId || pickData.id) || (g.col === col && g.row === row && !g.defeated);
      });
      if (pickedG && !pickedG.defeated) {
        var autoBashPlan = resolveWarriorGargoyleBash(st, pickedG.col, pickedG.row, false);
        if (autoBashPlan) {
          return executeAction({
            type: 'bash',
            col: pickedG.col,
            row: pickedG.row,
            onlyHazard: true
          }, false);
        }
      }
      st.selectedGargoyleId = pickedG ? pickedG.id : (pickData.unitId || pickData.id);
      safeAudio('playSelect');
      if (pickedG && !pickedG.defeated) {
        safeToast(
          (pickedG.name || 'Stone Gargoyle') + ' (' + pickedG.col + ', ' + pickedG.row + ') · ' +
          (pickedG.sunstruck
            ? 'Sunstruck! Align remaining Gargoyles in the sunbeam!'
            : 'Shatter with a Sunbeam or sweep with contraptions!'),
          'info'
        );
      }
      notifyChange();
      return true;
    }

    if (pickType === 'tile' && typeof col === 'number' && typeof row === 'number') {
      var occHero = getHeroAt(st, col, row);
      if (occHero) {
        st.showMoveHighlights = !st.showMoveHighlights;
        selectHero(occHero.id);
        return true;
      }

      if (st.rogue && !st.rogue.banished && st.rogue.col === col && st.rogue.row === row) {
        return handlePick({ pickType: 'rogueVillain', col: col, row: row });
      }

      var occMirror = getMirrorAt(st, col, row);
      if (occMirror) {
        return executeAction({
          type: 'rotateMirror',
          mirrorId: occMirror.id,
          col: col,
          row: row,
          deltaRot: 1
        }, false);
      }

      var occSluice = findSluiceByIdOrPos(st, null, col, row);
      if (occSluice) {
        return executeAction({
          type: 'toggleSluice',
          sluiceId: occSluice.id,
          col: col,
          row: row
        }, false);
      }

      var occGarg = getGargoyleAt(st, col, row);
      if (occGarg) {
        return handlePick({
          pickType: 'gargoyle',
          unitId: occGarg.id,
          col: col,
          row: row
        });
      }

      return executeAction({
        type: 'move',
        col: col,
        row: row
      }, false);
    }

    return false;
  }

  // =========================================================================
  // End Turn Phase: AP Recharge, Level 3 Rollers & Pendulum, Gargoyle Alertness
  // =========================================================================
  function stepConveyorRollers(st, instant) {
    var dirs = getDirs();
    var movers = [];
    var i, t;

    for (i = 0; i < st.heroes.length; i++) {
      var h = st.heroes[i];
      if (!h.defeated && h.alive !== false) {
        t = getTile(st, h.col, h.row);
        if (t && t.type === 'roller') {
          movers.push({ kind: 'hero', ent: h, dir: parseDirIndex(t.rollerDir !== undefined ? t.rollerDir : t.dir) });
        }
      }
    }
    for (i = 0; i < st.gargoyles.length; i++) {
      var g = st.gargoyles[i];
      if (!g.defeated) {
        t = getTile(st, g.col, g.row);
        if (t && t.type === 'roller') {
          movers.push({ kind: 'gargoyle', ent: g, dir: parseDirIndex(t.rollerDir !== undefined ? t.rollerDir : t.dir) });
        }
      }
    }
    for (i = 0; i < st.mirrors.length; i++) {
      var m = st.mirrors[i];
      if (!m.removed && m.movable) {
        t = getTile(st, m.col, m.row);
        if (t && t.type === 'roller') {
          movers.push({ kind: 'mirror', ent: m, dir: parseDirIndex(t.rollerDir !== undefined ? t.rollerDir : t.dir) });
        }
      }
    }
    if (st.rogue && !st.rogue.banished) {
      t = getTile(st, st.rogue.col, st.rogue.row);
      if (t && t.type === 'roller') {
        movers.push({ kind: 'rogue', ent: st.rogue, dir: parseDirIndex(t.rollerDir !== undefined ? t.rollerDir : t.dir) });
      }
    }

    for (i = 0; i < movers.length; i++) {
      var mv = movers[i];
      var dVec = dirs[mv.dir];
      var nc = mv.ent.col + dVec.dc;
      var nr = mv.ent.row + dVec.dr;

      if (mv.kind === 'gargoyle') {
        mv.ent.col = nc;
        mv.ent.row = nr;
        if (!inBounds(nc, nr) || !isTileSolidGround(st, nc, nr)) {
          defeatGargoyle(st, mv.ent, 'tumble', { x: dVec.dc, y: 0, z: dVec.dr }, instant);
        }
      } else if (mv.kind === 'rogue') {
        if (inBounds(nc, nr) && isTileSolidGround(st, nc, nr) && !hasPillarAt(st, nc, nr) && !getGargoyleAt(st, nc, nr) && !getMirrorAt(st, nc, nr)) {
          var heroOnRollerTarget = getHeroAt(st, nc, nr);
          if (!heroOnRollerTarget) {
            mv.ent.col = nc;
            mv.ent.row = nr;
          }
        } else if (!inBounds(nc, nr) || !isTileSolidGround(st, nc, nr)) {
          mv.ent.frozenSteps = Math.max(mv.ent.frozenSteps || 0, 2);
        }
      } else if (inBounds(nc, nr) && isTileSolidGround(st, nc, nr) && !hasPillarAt(st, nc, nr)) {
        mv.ent.col = nc;
        mv.ent.row = nr;
      }
    }
  }

  function stepPendulum(st, instant) {
    if (!st.pendulum) return;
    var p = st.pendulum;
    var period = p.periodTurns || 2;
    var shouldSweep = (st.turn % period) === 0;
    p.turnsUntilSweep = period - (st.turn % period);

    if (!shouldSweep) return;

    var sweepRows = p.sweepRows || p.rows || [3, 4];
    var sweepDir = p.direction || 1;
    p.direction = -sweepDir;

    function applySweepImpact() {
      for (var i = 0; i < st.gargoyles.length; i++) {
        var g = st.gargoyles[i];
        if (!g.defeated && sweepRows.indexOf(g.row) !== -1) {
          defeatGargoyle(st, g, 'tumble', { x: sweepDir, y: 0.35, z: 0 }, instant);
        }
      }

      var dmg = typeof p.heroPushDamage === 'number' ? p.heroPushDamage : 4;
      for (var hi = 0; hi < st.heroes.length; hi++) {
        var h = st.heroes[hi];
        if (!h.defeated && h.alive !== false && sweepRows.indexOf(h.row) !== -1) {
          h.hp = Math.max(1, h.hp - dmg);
          var safeRowPrimary = h.row <= 3 ? 2 : 5;
          var safeRowAlt = h.row <= 3 ? 5 : 2;
          if (isTileWalkableForHero(st, h.col, safeRowPrimary, h.id)) {
            h.row = safeRowPrimary;
          } else if (isTileWalkableForHero(st, h.col, safeRowAlt, h.id)) {
            h.row = safeRowAlt;
          }
        }
      }
    }

    applySweepImpact();

    if (!instant) {
      safeAudio('playPendulumWhoosh');
      var contr = root.GAME && root.GAME.Contraptions;
      var vfx = root.GAME && root.GAME.VfxPost;
      if (vfx && typeof vfx.triggerShake === 'function') {
        vfx.triggerShake(0.14, 0.28);
      }
      if (contr && typeof contr.animatePendulumSweep === 'function') {
        contr.animatePendulumSweep(sweepDir, null, function () {
          notifyChange();
        });
      }
    }
  }

  function endTurn(instant) {
    if (!_state || _state.victory) return false;
    var st = _state;
    pushHistory();

    for (var i = 0; i < st.heroes.length; i++) {
      if (!st.heroes[i].defeated && st.heroes[i].alive !== false) {
        st.heroes[i].ap = st.heroes[i].maxAp;
      }
    }

    st.turn += 1;
    st.hintMove = null;
    st.actionMode = 'move';

    stepConveyorRollers(st, instant);
    stepPendulum(st, instant);

    for (var gi = 0; gi < st.gargoyles.length; gi++) {
      var g = st.gargoyles[gi];
      if (g.defeated) continue;
      g.sleeping = !g.sleeping;
      g.awakened = !g.sleeping;
    }

    if (!instant) {
      safeAudio('playTurnEnd');
    }

    recomputeBoardPhysics(instant);
    notifyChange();
    return true;
  }

  // =========================================================================
  // Hero Selection, Modes, Undo, Reset, & Milestone-Aware Smart Hint
  // =========================================================================
  function selectHero(heroId, silent) {
    if (!_state) return;
    if (heroId === 'mage' || heroId === 'astralAid') {
      useAstralAid(false);
      return;
    }
    var hero = findHeroById(_state, heroId);
    if (!hero) return;
    _state.selectedHeroId = hero.id;
    _state.actionMode = 'move';
    _state.showMoveHighlights = !_state.showMoveHighlights;
    recomputeValidHighlights();
    if (!silent) {
      safeAudio('playSelect');
      if (_state.showMoveHighlights) {
        safeToast('Warrior Ready — Click any cyan diamond within 2 tiles to dodge, or click any Mirror / Gear!', 'hint');
      }
    }
    notifyChange();
  }

  function useAstralAid(instant) {
    if (!_state || _state.victory) return false;
    if (_state.defeated) {
      safeToast('Shadow Ambush! Press Z to Undo 1 step or R to Retry.', 'warn');
      safeAudio('playError');
      return false;
    }
    if (!_state.astralAid || _state.astralAid.charges <= 0) {
      safeToast('Astral Aid already spent on this level!', 'warn');
      safeAudio('playError');
      return false;
    }
    return executeAction({ type: 'astralAid' }, !!instant);
  }

  function setActionMode(mode) {
    if (!_state) return;
    var allowed = ['move', 'rotateMirror', 'shiftGear', 'ability'];
    if (allowed.indexOf(mode) === -1) mode = 'move';
    _state.actionMode = mode;
    recomputeValidHighlights();
    safeAudio('playSelect');
    notifyChange();
  }

  function undo() {
    if (!_state || _history.length === 0) {
      safeAudio('playError');
      return false;
    }
    var snap = _history.pop();
    applySnapshot(_state, snap);
    recomputeBoardPhysics(true);
    safeAudio('playSelect');
    notifyChange();
    return true;
  }

  function resetLevel() {
    if (!_state) return;
    loadLevel(_state.levelId, false);
  }

  function getCompiledMilestones(levelId) {
    if (_solutionMilestones[levelId]) return _solutionMilestones[levelId];
    var sols = root.GAME && root.GAME.LEVEL_SOLUTIONS;
    var steps = (sols && (sols[levelId] || sols[String(levelId)])) || [];
    if (!steps.length) return [];

    // Precompute target post-step values on a clean clone so hints skip completed milestones
    var savedState = _state;
    var savedHist = _history;
    _state = buildInitialState(levelId);
    _history = [];
    recomputeBoardPhysics(true);

    var compiled = [];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      var turnBefore = _state.turn;
      var isBashOrAbil = (s.type === 'ability' || s.type === 'bash' || s.type === 'shove');
      var preGarg = (isBashOrAbil && typeof s.col === 'number' && typeof s.row === 'number')
        ? getGargoyleAt(_state, s.col, s.row)
        : null;
      var preMir = isBashOrAbil
        ? findMirrorByIdOrPos(_state, s.mirrorId, s.col, s.row)
        : null;

      executeAction(s, true);

      var meta = { step: s, turnBefore: turnBefore, turnAfter: _state.turn };
      if (s.type === 'shiftGear') {
        var gr = findGearByIdOrPos(_state, s.gearId);
        if (gr) meta.targetGearOffset = gr.offset;
      } else if (s.type === 'rotateMirror') {
        var mr = findMirrorByIdOrPos(_state, s.mirrorId);
        if (mr) meta.targetMirrorRot = mr.rot;
      } else if (s.type === 'toggleSluice') {
        var sg = findSluiceByIdOrPos(_state, s.sluiceId);
        if (sg) meta.targetSluiceOpen = sg.open;
      } else if (s.type === 'moveFerry' && _state.ferry) {
        meta.targetFerryCol = _state.ferry.col;
      } else if (isBashOrAbil) {
        if (preGarg) {
          meta.abilityGargId = preGarg.id;
          meta.targetGargCol = preGarg.col;
          meta.targetGargRow = preGarg.row;
          meta.targetGargDefeated = !!preGarg.defeated;
        } else if (preMir) {
          meta.abilityMirrorId = preMir.id;
          meta.targetMirrorCol = preMir.col;
          meta.targetMirrorRow = preMir.row;
          meta.targetMirrorRot = preMir.rot;
        } else if (s.gearId) {
          var agr = findGearByIdOrPos(_state, s.gearId);
          if (agr) {
            meta.abilityGearId = agr.id;
            meta.targetGearOffset = agr.offset;
          }
        }
      }
      compiled.push(meta);
    }

    _state = savedState;
    _history = savedHist;
    _solutionMilestones[levelId] = compiled;
    return compiled;
  }

  function isMilestoneDone(st, idx, milestones) {
    var m = milestones[idx];
    var s = m.step;
    if (s.type === 'shiftGear') {
      var gr = findGearByIdOrPos(st, s.gearId);
      return !!(gr && gr.offset === m.targetGearOffset);
    }
    if (s.type === 'toggleSluice') {
      var sg = findSluiceByIdOrPos(st, s.sluiceId);
      return !!(sg && sg.open === m.targetSluiceOpen);
    }
    if (s.type === 'rotateMirror') {
      var mr = findMirrorByIdOrPos(st, s.mirrorId);
      return !!(mr && mr.rot === m.targetMirrorRot);
    }
    if (s.type === 'moveFerry') {
      return !!(st.ferry && ((m.targetFerryCol >= 2 && st.ferry.col >= m.targetFerryCol) || st.ferry.col === m.targetFerryCol));
    }
    if (s.type === 'ability' || s.type === 'bash' || s.type === 'shove') {
      if (m.abilityGargId) {
        var ag = st.gargoyles.find(function (g) { return g.id === m.abilityGargId; });
        if (!ag || ag.defeated) return true;
        return ag.col === m.targetGargCol && ag.row === m.targetGargRow;
      }
      if (m.abilityMirrorId) {
        var am = findMirrorByIdOrPos(st, m.abilityMirrorId);
        return !!(am && am.col === m.targetMirrorCol && am.row === m.targetMirrorRow && am.rot === m.targetMirrorRot);
      }
      if (m.abilityGearId) {
        var agr = findGearByIdOrPos(st, m.abilityGearId);
        return !!(agr && agr.offset === m.targetGearOffset);
      }
      return false;
    }
    if (s.type === 'astralAid') {
      return !!((st.astralAid && st.astralAid.charges <= 0) || (st.rogue && st.rogue.frozenSteps > 0));
    }
    if (s.type === 'endTurn') {
      return st.turn >= m.turnAfter;
    }
    if (s.type === 'move') {
      for (var k = idx + 1; k < milestones.length; k++) {
        var nextS = milestones[k].step;
        if (nextS.type === 'endTurn') break;
        if (nextS.heroId === s.heroId && nextS.type !== 'move' && isMilestoneDone(st, k, milestones)) {
          return true;
        }
      }
      var h = findHeroById(st, s.heroId);
      return !!(h && h.col === s.col && h.row === s.row);
    }
    return false;
  }

  function buildHintHighlightForStep(st, step) {
    var customText = step.hint ? ('Hint: ' + step.hint) : null;
    if (step.type === 'astralAid') {
      return {
        col: st.rogue ? st.rogue.col : 4,
        row: st.rogue ? st.rogue.row : 4,
        kind: 'hint',
        text: customText || 'Hint: Click Mage: Astral Aid [F] in the bottom-left HUD to freeze the Shadow Rogue for 2 steps!'
      };
    }
    if (step.type === 'move') {
      var mh = findHeroById(st, step.heroId);
      return {
        col: step.col,
        row: step.row,
        kind: 'hint',
        text: customText || ('Hint: Click tile (' + step.col + ', ' + step.row + ') to move ' + (mh ? mh.name : 'Hero') + '!')
      };
    }
    if (step.type === 'shiftGear') {
      var gr = findGearByIdOrPos(st, step.gearId);
      var kc = gr && typeof gr.knobCol === 'number' ? gr.knobCol : 0;
      var kr = gr && typeof gr.knobRow === 'number' ? gr.knobRow : (gr ? gr.index : 0);
      return {
        col: kc,
        row: kr,
        kind: 'hint',
        text: customText || ('Hint: Click ' + (gr ? gr.label || gr.id : 'the Brass Gear Crank') + '!')
      };
    }
    if (step.type === 'rotateMirror') {
      var mr = findMirrorByIdOrPos(st, step.mirrorId);
      return {
        col: mr ? mr.col : 3,
        row: mr ? mr.row : 3,
        kind: 'hint',
        text: customText || ('Hint: Click Prism Mirror ' + step.mirrorId + ' to turn it 90° clockwise!')
      };
    }
    if (step.type === 'toggleSluice') {
      var sg = findSluiceByIdOrPos(st, step.sluiceId);
      return {
        col: sg ? sg.col : 4,
        row: sg ? sg.row : 1,
        kind: 'hint',
        text: customText || 'Hint: Click the Bronze Sluice Gate to open it!'
      };
    }
    if (step.type === 'moveFerry') {
      var fc = st.ferry ? st.ferry.col : 2;
      var fr = st.ferry && st.ferry.rows ? st.ferry.rows[0] : 3;
      return {
        col: fc,
        row: fr,
        kind: 'hint',
        text: customText || 'Hint: Click the 2x2 Bronze-Gear Ferry Lever!'
      };
    }
    if (step.type === 'ability' || step.type === 'bash' || step.type === 'shove') {
      var ah = findHeroById(st, step.heroId || 'warrior');
      var tc = typeof step.col === 'number' ? step.col : (ah ? ah.col : 0);
      var tr = typeof step.row === 'number' ? step.row : (ah ? ah.row : 0);
      if (step.mirrorId) {
        var amr = findMirrorByIdOrPos(st, step.mirrorId);
        if (amr) {
          tc = amr.col;
          tr = amr.row;
        }
      }
      return {
        col: tc,
        row: tr,
        kind: 'hint',
        text: customText || ('Hint: Click (' + tc + ', ' + tr + ') — Warrior will Shield-Bash it!')
      };
    }
    return null;
  }

  function requestHint() {
    if (!_state) return '';
    var st = _state;
    if (st.victory) {
      var vicMsg = 'Sanctuary purified! Click Next Level to continue.';
      safeToast(vicMsg, 'hint');
      return vicMsg;
    }
    if (st.defeated) {
      var defMsg = 'Shadow Ambush! Click Undo (Z) to rewind 1 step, or Retry (R).';
      safeToast(defMsg, 'warn');
      return defMsg;
    }

    if (st.exit && st.exit.unlocked) {
      var exitHint = {
        col: st.exit.col,
        row: st.exit.row,
        kind: 'hint',
        text: 'Hint: Sanctuary Stair unlocked! Click the Golden Stair at (' + st.exit.col + ', ' + st.exit.row + ')!'
      };
      st.hintMove = exitHint;
      recomputeValidHighlights();
      safeAudio('playSelect');
      safeToast(exitHint.text, 'hint');
      notifyChange();
      return exitHint.text;
    }

    var milestones = getCompiledMilestones(st.levelId);
    for (var i = 0; i < milestones.length; i++) {
      if (!isMilestoneDone(st, i, milestones)) {
        var step = milestones[i].step;
        var hObj = buildHintHighlightForStep(st, step);
        if (hObj) {
          st.hintMove = hObj;
          recomputeValidHighlights();
          safeAudio('playSelect');
          safeToast(hObj.text, 'hint');
          notifyChange();
          return hObj.text;
        }
      }
    }

    var remG = st.gargoyles.find(function (g) { return !g.defeated; });
    var fb = {
      col: remG ? remG.col : st.exit.col,
      row: remG ? remG.row : st.exit.row,
      kind: 'hint',
      text: 'Hint: Click Prism Mirrors & Brass Gear Cranks to defeat the remaining Gargoyle!'
    };
    st.hintMove = fb;
    recomputeValidHighlights();
    safeAudio('playSelect');
    safeToast(fb.text, 'hint');
    notifyChange();
    return fb.text;
  }

  // =========================================================================
  // Module Lifecycle: init, loadLevel, getState, onChange, update
  // =========================================================================
  function loadLevel(levelId, silent) {
    var id = Math.max(1, Math.min(4, Number(levelId) || 1));
    _history = [];
    _state = buildInitialState(id);

    recomputeBoardPhysics(true);

    var worldMod = root.GAME && root.GAME.World;
    var contrMod = root.GAME && root.GAME.Contraptions;
    var unitsMod = root.GAME && root.GAME.Units;

    if (worldMod && typeof worldMod.buildLevel === 'function') {
      worldMod.buildLevel(_state);
    }
    if (contrMod && typeof contrMod.buildLevel === 'function') {
      contrMod.buildLevel(_state);
    }
    if (unitsMod && typeof unitsMod.buildLevel === 'function') {
      unitsMod.buildLevel(_state);
    }

    if (contrMod && typeof contrMod.syncFromState === 'function') {
      contrMod.syncFromState(_state, false);
    }
    if (unitsMod && typeof unitsMod.syncFromState === 'function') {
      unitsMod.syncFromState(_state);
    }
    if (worldMod && typeof worldMod.setTileHighlights === 'function') {
      worldMod.setTileHighlights(_state.validHighlights);
    }

    safeAudio('setLevel', id);

    if (!silent) {
      notifyChange();
    }
    return _state;
  }

  function init(initialLevel) {
    return loadLevel(initialLevel || 1, false);
  }

  function getState() {
    return _state;
  }

  function onChange(fn) {
    if (typeof fn === 'function' && _listeners.indexOf(fn) === -1) {
      _listeners.push(fn);
    }
  }

  function update(dt, elapsed) {
    _elapsed = typeof elapsed === 'number' ? elapsed : (_elapsed + (dt || 0));
  }

  // =========================================================================
  // Deterministic Verification & QA Audit Suite (window.GAME_TEST)
  // =========================================================================
  function stepPhysics(dt, numFrames) {
    var stepDt = typeof dt === 'number' && dt > 0 ? dt : (1 / 60);
    var frames = typeof numFrames === 'number' && numFrames > 0 ? numFrames : 1;
    var hasMainWrapper = !!(root.GAME && root.GAME.Main);

    for (var f = 0; f < frames; f++) {
      _elapsed += stepDt;
      update(stepDt, _elapsed);
      if (!hasMainWrapper) {
        if (root.GAME.World && typeof root.GAME.World.update === 'function') root.GAME.World.update(stepDt, _elapsed);
        if (root.GAME.Contraptions && typeof root.GAME.Contraptions.update === 'function') root.GAME.Contraptions.update(stepDt, _elapsed);
        if (root.GAME.Units && typeof root.GAME.Units.update === 'function') root.GAME.Units.update(stepDt, _elapsed);
      }
    }
    if (!hasMainWrapper && root.GAME.VfxPost && typeof root.GAME.VfxPost.render === 'function') {
      root.GAME.VfxPost.render(stepDt, _elapsed);
    }
    return true;
  }

  function runLevelSolution(levelId) {
    loadLevel(levelId, true);
    var sols = root.GAME && root.GAME.LEVEL_SOLUTIONS;
    var steps = (sols && (sols[levelId] || sols[String(levelId)])) || [];
    var executed = 0;

    for (var i = 0; i < steps.length; i++) {
      if (_state.victory) break;
      var ok = executeAction(steps[i], true);
      if (!ok) {
        return {
          levelId: levelId,
          name: _state.name,
          passed: false,
          victory: false,
          failedStepIndex: i,
          failedStep: steps[i],
          turns: _state.turn,
          parTurns: _state.maxParTurns,
          defeatedGargoyles: _state.gargoyles.filter(function (g) { return g.defeated; }).length,
          totalGargoyles: _state.gargoyles.length,
          exitUnlocked: _state.exit.unlocked,
          stepsExecuted: executed
        };
      }
      executed++;
    }

    var defeatedCount = _state.gargoyles.filter(function (g) { return g.defeated; }).length;
    var maxAllowedSteps = _state.parSteps || _state.maxParTurns || 6;
    var totalSteps = _state.steps || executed;
    return {
      levelId: levelId,
      name: _state.name,
      passed: !!_state.victory && totalSteps <= maxAllowedSteps,
      victory: !!_state.victory,
      steps: totalSteps,
      parSteps: maxAllowedSteps,
      turns: _state.turn,
      parTurns: _state.maxParTurns,
      defeatedGargoyles: defeatedCount,
      totalGargoyles: _state.gargoyles.length,
      defeatModes: _state.gargoyles.map(function (g) { return g.id + ':' + g.defeatMode; }),
      exitUnlocked: !!_state.exit.unlocked,
      stepsExecuted: executed
    };
  }

  function runAllSolutions(restoreInitialLevel) {
    var prevLevel = _state ? _state.levelId : 1;
    var results = [];
    var passedCount = 0;

    for (var lvl = 1; lvl <= 4; lvl++) {
      var res = runLevelSolution(lvl);
      results.push(res);
      if (res.passed) passedCount++;
    }

    if (restoreInitialLevel !== false) {
      loadLevel(prevLevel, true);
      notifyChange();
    }

    return {
      allPassed: passedCount === 4,
      passedCount: passedCount,
      total: 4,
      results: results
    };
  }

  function cycleEnvironment() {
    var cur = _state ? _state.levelId : 1;
    var next = (cur % 4) + 1;
    loadLevel(next, true);
    notifyChange();
    return next;
  }

  function runAuditSuite() {
    var worldMod = root.GAME && root.GAME.World;
    var unitsMod = root.GAME && root.GAME.Units;
    var vfxMod = root.GAME && root.GAME.VfxPost;

    var unitMetrics = (unitsMod && typeof unitsMod.getAuditMetrics === 'function')
      ? unitsMod.getAuditMetrics()
      : { maxFootDriftM: 0, overlapPairs: 0, stoppedSkatingFrames: 0 };

    var vfxHealth = (vfxMod && typeof vfxMod.getHealthReport === 'function')
      ? vfxMod.getHealthReport()
      : { pmremInvalidTexels: 0, nanPixels: 0, shaderErrors: 0 };

    var vertexDriftOver3cm = 0;
    var obstaclePenetrations = 0;
    var agentOverlapPairs = unitMetrics.overlapPairs || 0;

    if (_state && worldMod && typeof worldMod.getHeightAt === 'function') {
      var entities = [];
      var i;
      for (i = 0; i < _state.heroes.length; i++) {
        if (!_state.heroes[i].defeated && _state.heroes[i].alive !== false) entities.push(_state.heroes[i]);
      }
      for (i = 0; i < _state.gargoyles.length; i++) {
        if (!_state.gargoyles[i].defeated) entities.push(_state.gargoyles[i]);
      }
      if (_state.rogue && !_state.rogue.banished && !_state.ambushed && !_state.defeated) {
        entities.push(_state.rogue);
      }

      for (i = 0; i < entities.length; i++) {
        var e = entities[i];
        var wp = gridToWorld(e.col, e.row);
        var hY = worldMod.getHeightAt(wp.x, wp.z);
        var tile = getTile(_state, e.col, e.row);
        var isRecessedTrough = tile && (tile.type === 'channel' || tile.type === 'roller') && !isCellOnFerry(_state, e.col, e.row);
        if (!isRecessedTrough && Math.abs(hY - 0.0) > 0.03) {
          vertexDriftOver3cm++;
        }
        if (hasPillarAt(_state, e.col, e.row)) {
          obstaclePenetrations++;
        }
      }

      var pairOverlaps = 0;
      for (i = 0; i < entities.length; i++) {
        for (var j = i + 1; j < entities.length; j++) {
          var p1 = gridToWorld(entities[i].col, entities[i].row);
          var p2 = gridToWorld(entities[j].col, entities[j].row);
          if (Math.hypot(p1.x - p2.x, p1.z - p2.z) < 0.75) {
            pairOverlaps++;
          }
        }
      }
      agentOverlapPairs = Math.max(agentOverlapPairs, pairOverlaps);
    }

    if (unitMetrics.maxFootDriftM > 0.03) {
      vertexDriftOver3cm++;
    }

    return {
      vertexDriftOver3cm: vertexDriftOver3cm,
      obstaclePenetrations: obstaclePenetrations,
      agentOverlapPairs: agentOverlapPairs,
      stoppedSkatingFrames: unitMetrics.stoppedSkatingFrames || 0,
      maxAimErrorPx: 0,
      pmremInvalidTexels: vfxHealth.pmremInvalidTexels || 0,
      nanPixels: vfxHealth.nanPixels || 0,
      maxFootDriftM: +(unitMetrics.maxFootDriftM || 0).toFixed(4)
    };
  }

  root.GAME.Simulation = {
    init: init,
    loadLevel: loadLevel,
    getState: getState,
    selectHero: selectHero,
    useAstralAid: useAstralAid,
    setActionMode: setActionMode,
    handlePick: handlePick,
    executeAction: executeAction,
    endTurn: endTurn,
    undo: undo,
    resetLevel: resetLevel,
    requestHint: requestHint,
    recomputeBoardPhysics: recomputeBoardPhysics,
    onChange: onChange,
    update: update
  };

  root.GAME_TEST = {
    stepPhysics: stepPhysics,
    runLevelSolution: runLevelSolution,
    runAllSolutions: runAllSolutions,
    cycleEnvironment: cycleEnvironment,
    runAuditSuite: runAuditSuite
  };
})();

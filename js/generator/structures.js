/* Necesse structures other than villages, built with the preset engine from village-gen.js.
 * NecesseStructures.install(G) adds BiomeStack.prototype.structureAt(level, px, py, id, x, y): the overlay of tiles and
 * layer-0 objects the structure leaves (-2 where the ground shows through), or null when it is not ported.
 */
(function (root) {
  'use strict';
  function install(G) {
    var E = G.PresetEngine, Preset = E.Preset, TID = E.TID, OID = E.OID, TN = E.TN, ON = E.ON;
    var f = Math.fround;
    var BUILDERS = {}, PD = G.PresetData || {};
    function chanceD(r, d) { return d >= 1 || r.nextDouble() < d; }
    // a preset loaded from the game's script for class `name`
    function scripted(name, p) {
      var d = PD[name]; if (!d) throw new Error('no preset ' + name);
      if (!p) p = new Preset(d.w, d.h);
      p.tiles.set(d.tiles); p.obj.set(d.obj); p.rot.set(d.rot); p.kind = name;
      return p;
    }
    // VillagePreset(sectionW, sectionH, isPath, path, grass, random)
    function villageBase(sw, sh, isPath, r) {
      var p = new Preset(sw * 3, sh * 3); p.sw = sw; p.sh = sh; p.res = 3; p.isPath = isPath;
      if (r) r.nextLong48();
      p.pre.push({ kind: 'shore', area: true, x0: 0, y0: 0, x1: p.w - 1, y1: p.h - 1, dir: 0 });
      return p;
    }
    E.EXTRA_APPLY.coin = function (a, L, x, y, r) { if (r.getChance(f(a.chance))) L.setObject(x + a.x, y + a.y, OID.coinstack); };
    E.EXTRA_APPLY.mob = function () {};

    // ---------- ModularGeneration fill presets ----------
    E.MG.prototype.addFillPreset = function (p, tickets, max) {
      this.fill = this.fill || []; this.fusage = this.fusage || new Map(); this.fmax = this.fmax || new Map();
      for (var i = 0; i < tickets; i++) this.fill.push(p); this.fusage.set(p, 0); this.fmax.set(p, max === undefined ? -1 : max);
    };
    E.MG.prototype.removeAllFill = function (p) { this.fill = this.fill.filter(function (q) { return q !== p; }); };
    E.MG.prototype.applyFill = function (p, cell, xm, ym) {
      var x = cell[0] * this.res + this.ox, y = cell[1] * this.res + this.oy;
      if (cell[0] < 0 || cell[0] + p.sw > this.cw || cell[1] < 0 || cell[1] + p.sh > this.ch) return false;
      for (var a = 0; a < p.sw; a++) for (var b = 0; b < p.sh; b++) if (this.placed.has((cell[0] + a) + ',' + (cell[1] + b))) return false;
      var q = p; if (xm) q = q.mirror('x'); if (ym) q = q.mirror('y');
      var snap = this.L.snapshot(x, y, p.w, p.h);
      E.applyToLevel(q, this.L, x, y, this.r);
      for (a = 0; a < p.sw; a++) for (b = 0; b < p.sh; b++) {
        var c = [cell[0] + a, cell[1] + b];
        this.placed.set(c[0] + ',' + c[1], { cell: c, preset: p, rx: a, ry: b, x: xm ? Math.abs(a - (p.sw - 1)) : a, y: ym ? Math.abs(b - (p.sh - 1)) : b, xm: xm, ym: ym, from: null, snap: snap, sx: a * this.res, sy: b * this.res, h: 0 });
      }
      return true;
    };
    E.MG.prototype.tickFill = function () {
      if (!this.fill || !this.fill.length) return;
      var p = this.fill[this.r.nextInt(this.fill.length)], mx = this.fmax.get(p);
      if (mx > 0 && this.fusage.get(p) >= mx) { this.removeAllFill(p); this.tickFill(); return; }
      var v4 = this.cw - p.w, v5 = this.ch - p.h;
      if (v4 < 1 || v5 < 1) { this.removeAllFill(p); this.tickFill(); return; }
      var xm = this.r.nextBoolean(), ym = this.r.nextBoolean(), a = Math.abs(this.r.nextInt()), b = Math.abs(this.r.nextInt()), found = false;
      for (var i = 0; i < this.cw - p.w && !found; i++) {
        var cx = ((a + i) | 0) % v4;
        for (var j = 0; j < this.cw - p.h; j++) {
          var cy = ((b + j) | 0) % v5;
          if (this.applyFill(p, [cx, cy], xm, ym)) { this.fusage.set(p, this.fusage.get(p) + 1); found = true; break; }
        }
      }
      if (!found) this.removeAllFill(p);
    };
    E.MG.prototype.fillTicks = function (n) { for (var i = 0; i < n; i++) { if (!this.fill || !this.fill.length) break; this.tickFill(); } };

    // ---------- generic level overlay over a rectangle ----------
    function overlay(stack, level, x, y, w, h, pad) {
      pad = pad || 0;
      var n = Math.max(w, h) + pad * 2;
      var L = new E.Level(stack, x - pad, y - pad, n, stack._shared ? stack._shared[level] : null);
      L.level = level;
      if (level === 'cave' || level === 'deepcave') {
        var deep = level === 'deepcave';
        L.ground = function (gx, gy) { return stack.caveTileObject(gx, gy, deep, 1)[0]; };
        var dob = stack._wantDeco ? decoObj(stack, level) : null;
        L.groundObj = dob || function (gx, gy) { return stack.caveTileObject(gx, gy, deep, 1)[1]; };
      } else { var sob = stack._wantDeco ? decoObj(stack, level) : null; L.groundObj = sob || function () { return 0; }; }
      return L;
    }
    // Cave presets are placed after the natural decoration (grass, crates, small rocks), so they see it.
    function decoObj(stack, level) {
      if (!G.decoReady || !stack.decoratedRegion) return null;
      var deep = level === 'deepcave', C = stack._decoCache || (stack._decoCache = {}), cache = C[level] || (C[level] = new Map());
      var base = level === 'surface' ? function (x, y) { return [SURF_T[stack.surfaceIndex(x, y, 1)], 'air']; }
                                     : function (x, y) { var to = stack.caveTileObject(x, y, deep, 1); return [TN[to[0]], ON[to[1]]]; };
      // the finished decoration where the viewer already worked it out, else the region's own pass (no neighbours: ten times cheaper)
      var ids = C['ids:' + level] || (C['ids:' + level] = new Map());
      return function (gx, gy) {
        var rx = gx >> 4, ry = gy >> 4, key = rx + ',' + ry, e = ids.get(key);
        var f2;
        if (!e || (!e.fin && (f2 = cache.get('f' + key)) && f2.final)) {
          var fin = cache.get('f' + key), r = fin && fin.final ? fin.final : cache.get(key);
          if (!r) { r = stack.decorateRegion(level, rx, ry, base); cache.set(key, r); }
          var a = new Int32Array(256); for (var k = 0; k < 256; k++) { var o = r.O[k]; a[k] = o === 'air' ? 0 : (OID[o] === undefined ? 0 : OID[o]); }
          if (ids.size > 4000) ids.clear();
          e = { a: a, fin: fin && fin.final ? fin : null }; ids.set(key, e);
        }
        return e.a[((gy & 15) << 4) | (gx & 15)];
      };
    }
    var SURF_T = ['watertile', 'watertile', 'grasstile', 'plainsgrasstile', 'sandtile', 'swampgrasstile', 'snowtile', 'icetile'];
    // the parts of the decoration's multi-tile objects (StaticMultiTile, as the biomes place them): id -> [master id, dx, dy, w, h]
    var MPART = null;
    function multiParts() {
      if (MPART) return MPART; MPART = {};
      var M = (G.decoRules && G.decoRules.multi) || {};
      Object.keys(M).forEach(function (n) { var m = M[n], id = OID[n]; if (id === undefined || m[0] !== 'StaticMultiTile') return;
        for (var j = 0; j < m[2]; j++) for (var i = 0; i < m[1]; i++) MPART[id + j * m[1] + i] = [id, i - m[3], j - m[4], m[1], m[2]]; });
      return MPART;
    }
    var NO_LIQ_O = {}; ((E.VD.oflags || {}).noLiquid || []).forEach(function (i) { NO_LIQ_O[i] = 1; });
    var LIQ_T = {}; ((E.VD.oflags || {}).liquid || []).forEach(function (i) { LIQ_T[i] = 1; });
    function objAt(L, x, y) { var o = L.getObject(x, y); if (o !== -2) return o; return L.groundObj(x, y); }
    var SOLID = {}; ((E.VD.oflags || {}).solid || []).forEach(function (i) { SOLID[i] = 1; });

    // ---------- preset sets (ChestRoomSet, WallSet, FurnitureSet, ...) ----------
    var SD = G.SetData || { sets: {}, rotate: {} }, PSETS = {};
    function parseOps(ops) {
      var s = { o: [], t: [], n: [] };
      ops.forEach(function (e) {
        var k = e[0];
        if (k === 'oNULL') s.o = null; else if (k === 'tNULL') s.t = null;
        else if (k === 'oN') s.o.push(null); else if (k === 'tN') s.t.push(null);
        else if (k === 'o') s.o.push(e.slice(1)); else if (k === 't') s.t.push(e.slice(1));
        else if (k === 'n') s.n.push(e[1] === null ? null : e[1].map(function (x) { var c = parseOps(x.ops); c.cls = x.cls; c.ref = x.ref; return c; }));
      });
      if (!s.n.length) s.n = null;
      return s;
    }
    Object.keys(SD.sets).forEach(function (k) { var d = SD.sets[k]; var p = parseOps(d.ops); p.name = k; p.cls = k.split('.')[0]; p.f = d.fields; PSETS[k] = p; });
    function setReplace(from, to, p) {      // PresetSet.replaceWith, with identity by name
      if (typeof from === 'string') from = PSETS[from]; if (typeof to === 'string') to = PSETS[to];
      var fa = from.name || from.ref, ta = to.name || to.ref;
      if (fa && fa !== '?' && fa === ta) return p;
      pairs(from.o, to.o, function (a, b) { p.replaceNonEmptyObjects(a, b); });
      pairs(from.t, to.t, function (a, b) { p.replaceNonEmptyTiles(a, b); });
      if (from.n && to.n) for (var i = 0; i < from.n.length && i < to.n.length; i++) {
        var A = from.n[i], Bn = to.n[i]; if (!A || !Bn) continue;
        for (var j = 0; j < A.length && j < Bn.length; j++) if (A[j].cls === Bn[j].cls) setReplace(A[j], Bn[j], p);
      }
      return p;
    }
    function pairs(A, Bv, fn) {
      if (!A || !Bv) return;
      for (var i = 0; i < A.length && i < Bv.length; i++) { var a = A[i], b = Bv[i]; if (!a || !b) continue;
        for (var j = 0; j < a.length && j < b.length; j++) fn(a[j], b[j]); }
    }

    // ---------- rotation (Preset.rotate) and the try* variants that fall back to a copy ----------
    var ROT = SD.rotate, ROTS = { cw: [0, 1], acw: [1, 3], half: [2, 2] };   // [index in export, dirOffset]
    function rotPoint(x, y, w, h, rot) {      // PresetUtils.getRotatedPointInSpace
      if (rot === 'cw') return [-y + (h - 1), x];
      if (rot === 'half') return [-x + (w - 1), -y + (h - 1)];
      if (rot === 'acw') return [y, -x + (w - 1)];
      return [x, y];
    }
    function rotApply(a, rot, w, h) {
      var c = Object.assign({}, a), off = ROTS[rot][1];
      c.dir = (a.dir + off) % 4;
      if (a.area) { var p0 = rotPoint(a.x0, a.y0, w, h, rot), p1 = rotPoint(a.x1, a.y1, w, h, rot); c.x0 = p0[0]; c.y0 = p0[1]; c.x1 = p1[0]; c.y1 = p1[1]; }
      else if (a.x !== undefined) { var q = rotPoint(a.x, a.y, w, h, rot); c.x = q[0]; c.y = q[1]; }
      return c;
    }
    Preset.prototype.rotate = function (rot) {
      if (!rot) return this.clone();
      var w = this.w, h = this.h, nw = rot === 'half' ? w : h, nh = rot === 'half' ? h : w, p = new Preset(nw, nh), mark = new Uint8Array(nw * nh), k = ROTS[rot][0];
      p.sw = this.sw; p.sh = this.sh; p.res = this.res; p.isPath = this.isPath; p.kind = this.kind; p.noMirror = this.noMirror;
      for (var x = 0; x < w; x++) for (var y = 0; y < h; y++) {
        var q = rotPoint(x, y, w, h, rot), si = x + y * w, di = q[0] + q[1] * nw;
        p.tiles[di] = this.tiles[si];
        var id = this.obj[si];
        if (id !== -1) {
          var info = ROT[id], r = this.rot[si] & 3, ox = 0, oy = 0, nr = (r + ROTS[rot][1]) % 4;
          if (info) { var e = info[r]; ox = e[k * 3]; oy = e[k * 3 + 1]; nr = e[k * 3 + 2]; if (ox === null) throw new Error('rotate'); }
          var ti = (q[0] + ox) + (q[1] + oy) * nw;
          p.obj[ti] = id; p.rot[ti] = nr; mark[di] = 1;
        } else if (!mark[di]) p.obj[di] = -1;
      }
      p.pre = this.pre.map(function (a) { return rotApply(a, rot, w, h); });
      p.apply = this.apply.map(function (a) { return a.noRotate ? a : rotApply(a, rot, w, h); });
      return p;
    };
    Preset.prototype.tryMirror = function (axis) { try { return this.mirror(axis); } catch (e) { return this.clone(); } };
    Preset.prototype.tryRotate = function (rot) { try { return this.rotate(rot); } catch (e) { return this.clone(); } };
    function randomizeRotationAndMirror(p, r) {
      if (r.nextBoolean()) p = p.tryMirror('x');
      if (r.nextBoolean()) p = p.tryMirror('y');
      return p.tryRotate(['cw', 'acw', 'half', null][r.nextInt(4)]);
    }

    // ---------- surface: dungeon entrance (DungeonEntrancePreset) ----------
    BUILDERS.dungeonentrance = function (stack, p, r) {
      var size = 20, c = 10, R = 320, pr = new Preset(size, size), floor = TID.dungeonfloor, wall = OID.dungeonwall;
      for (var x = 0; x < size; x++) for (var y = 0; y < size; y++) {
        var dx = (c * 32 + 16) - (x * 32 + 16), dy = (c * 32 + 16) - (y * 32 + 16);
        var d = f(Math.sqrt(dx * dx + dy * dy)), v = f(d / f(R)), i = x + y * size;
        if (v < f(0.4)) { pr.tiles[i] = floor; pr.obj[i] = 0; }
        else if (v <= 1) {
          var ch = f(f(Math.abs(f(f(f(v - f(0.5)) * 2) - 1))) * 2);
          if (r.getChance(ch)) { pr.tiles[i] = floor; pr.obj[i] = 0; }
        }
        if (d < f(R) && d >= f(R - 40) && r.getChance(f(0.4))) pr.obj[i] = wall;
      }
      function chalice(x, y) { pr.setObject(x, y, OID.firechalice); pr.setObject(x + 1, y, OID.firechalice2); pr.setObject(x, y + 1, OID.firechalice3); pr.setObject(x + 1, y + 1, OID.firechalice4); }
      chalice(c - 4, c - 4); chalice(c - 4, c + 3); chalice(c + 3, c - 4); chalice(c + 3, c + 3);
      pr.setObject(c, c, OID.dungeonentrance);
      var L = overlay(stack, 'surface', p.rects[0][0], p.rects[0][1], size, size);
      E.applyToLevel(pr, L, p.rects[0][0], p.rects[0][1], r);
      return L;
    };

    // ---------- surface: ruins (RandomRuinsPreset) ----------
    BUILDERS.surfaceruins = function (stack, p, r) {
      var pr = new Preset(9, 9), wall = r.nextInt(2) ? OID.woodwall : OID.stonewall, tile = r.nextInt(2) ? TID.stonefloor : TID.woodfloor;
      function w(x, y) { if (r.getChance(f(0.5))) pr.setObject(x, y, wall); }
      for (var i = 2; i <= 6; i++) { w(i, 0); w(i, 8); }
      for (i = 2; i <= 6; i++) { w(0, i); w(8, i); }
      for (i = 0; i <= 1; i++) { w(i + 1, 1); w(i + 6, 1); w(i + 1, 7); w(i + 6, 7); }
      w(1, 2); w(7, 2); w(1, 6); w(7, 6);
      for (var x = 1; x < 8; x++) for (var y = 1; y < 8; y++) {
        if ((y === 1 || y === 7) && (x <= 2 || x >= 6)) continue;
        if ((y === 2 || y === 6) && (x <= 1 || x >= 7)) continue;
        if (r.getChance(f(0.65))) { pr.tiles[x + y * 9] = tile; pr.obj[x + y * 9] = 0; }
      }
      var chest = r.nextInt(2) ? OID.barrel : OID.storagebox; pr.setObject(4, 4, chest, r.nextInt(4));
      pr.apply.push({ kind: 'loot', table: 'surfaceRuinsChest', x: 4, y: 4, dir: 0 });
      var x0 = p.rects[0][0], y0 = p.rects[0][1], L = overlay(stack, 'surface', x0, y0, 9, 9);
      E.applyToLevel(pr, L, x0, y0, r);
      return L;
    };

    // ---------- surface: pirate villages (SurfacePirateVillageWorldPreset$2) ----------
    function pirateBase(name, sw, sh, isPath, r) { var p = villageBase(sw, sh, isPath, r); if (name) scripted(name, p); return p; }
    function coin(p, x, y) { p.setObject(x, y, 0); p.apply.push({ kind: 'coin', chance: 0.6, x: x, y: y, dir: 0 }); }
    function pirateLoot(p, table, x, y, rot) { p.apply.push({ kind: 'loot', table: table, rot: rot, x: x, y: y, dir: 0 }); }
    function piratePath(t, rr, b, l) {
      var p = villageBase(1, 1, true, null); p.tiles.fill(TID.graveltile); p.obj.fill(0); p.kind = 'path';
      if (t) p.open(0, 0, 0); if (rr) p.open(0, 0, 1); if (b) p.open(0, 0, 2); if (l) p.open(0, 0, 3);
      return p;
    }
    BUILDERS.piratevillages = function (stack, pr, r) {
      var x = pr.rects[0][0], y = pr.rects[0][1], size = pr.rects[0][2], a4 = { v: 0 }, a5 = { v: 0 };
      var L = overlay(stack, 'surface', x, y, size, size), cw = (size / 3) | 0, mg = new E.MG(L, cw, cw, x, y, r);
      var boss = pirateBase('PirateVillageBossPreset', 3, 3, false, r);
      coin(boss, 3, 2); coin(boss, 6, 4); coin(boss, 4, 7); coin(boss, 8, 6);
      boss.apply.push({ kind: 'mob', x: 4, y: 4, dir: 0 });
      var pt = [[3, 3], [5, 5], [3, 5], [5, 3]][r.nextInt(4)]; boss.apply.push({ kind: 'mob', x: pt[0], y: pt[1], dir: 0 });
      boss.open(1, 0, 0); boss.open(2, 1, 1); boss.open(1, 2, 2); boss.open(0, 1, 3);
      mg.addPreset(piratePath(1, 1, 1, 1), 6); mg.addPreset(piratePath(1, 0, 1, 0), 3); mg.addPreset(piratePath(0, 1, 0, 1), 3);
      var p;
      p = pirateBase('PirateVillageRoom1HPreset', 4, 3, true, r); coin(p, 2, 5); coin(p, 8, 3); coin(p, 9, 5); pirateLoot(p, 'pirateChest', 7, 3, a4); p.open(1, 2, 2); p.open(2, 2, 2); mg.addPreset(p, 3);
      p = pirateBase('PirateVillageRoom1VPreset', 3, 4, true, r); coin(p, 5, 8); coin(p, 3, 3); coin(p, 2, 7); pirateLoot(p, 'pirateChest', 5, 7, a4); p.open(0, 1, 3); p.open(0, 2, 3); mg.addPreset(p, 3);
      p = pirateBase('PirateVillageWalkway1HPreset', 3, 3, true, r); coin(p, 2, 2); coin(p, 6, 6); pirateLoot(p, 'pirateChest', 4, 2, a4); p.open(0, 1, 3); p.open(2, 1, 1); mg.addPreset(p, 2);
      p = pirateBase('PirateVillageWalkway1VPreset', 3, 3, true, r); coin(p, 6, 2); coin(p, 2, 6); pirateLoot(p, 'pirateChest', 2, 4, a4); p.open(1, 0, 0); p.open(1, 2, 2); mg.addPreset(p, 2);
      p = pirateBase('PirateVillageRoom2Preset', 4, 4, false, r); coin(p, 2, 4); coin(p, 6, 6); coin(p, 9, 9); p.apply.push({ kind: 'flower', x: 9, y: 6, dir: 0 });
      pirateLoot(p, 'pirateChest', 4, 2, a4); p.open(0, 1, 3); p.open(2, 3, 2); mg.addPreset(p, 4);
      p = pirateBase('PirateVillageRoom3Preset', 5, 4, false, r); coin(p, 5, 2); coin(p, 12, 6); coin(p, 6, 5);
      p.apply.push({ kind: 'flower', x: 2, y: 2, dir: 0 }); p.apply.push({ kind: 'flower', x: 12, y: 9, dir: 0 });
      p.setObject(4, 8, OID.pinesapling); p.setObject(2, 9, OID.pinesapling);
      pirateLoot(p, 'pirateDisplayStand', 11, 6, a5); p.open(2, 0, 0); p.open(3, 3, 2); mg.addPreset(p, 10, 2);
      mg.applyPreset(boss, [(cw / 2) | 0, (cw / 2) | 0], false, false, null);
      mg.ticks(size * 3);
      mg.addFillPreset(pirateBase('PirateVillageWall1Preset', 1, 3, false, r), 5);
      mg.addFillPreset(pirateBase('PirateVillageWall2Preset', 3, 1, false, r), 5);
      mg.fillTicks((size / 10) | 0);
      E.validityPass(L, stack);
      return L;
    };

    // ---------- cave and deep cave: chest rooms (Biome.getNewCaveChestRoomPreset, RandomCaveChestRoom) ----------
    var BIO = G.PresetEngine.VD.biomeIDs || { forest: 1, plains: 2, desert: 3, swamp: 4, snow: 5 };
    var CHESTROOM = {
      cave: { def: [['stone', 'wood'], 'basicCaveChest', [['stonefloor', 'stonebrickfloor']]],
        2: [['dryad', 'granite'], 'plainsCaveChest', [['stonefloor', 'stonebrickfloor']]],
        3: [['sandstone', 'wood'], 'desertCaveChest', [['stonefloor', 'stonebrickfloor'], ['sandstonefloor', 'sandstonebrickfloor']]],
        4: [['swampStone', 'wood'], 'swampCaveChest', [['stonefloor', 'stonebrickfloor'], ['swampstonefloor', 'swampstonebrickfloor']]],
        5: [['snowStone', 'ice', 'wood'], 'snowCaveChest', [['stonefloor', 'stonebrickfloor'], ['snowstonefloor', 'snowstonebrickfloor']]] },
      deepcave: { def: [['deepStone', 'obsidian'], 'deepCaveChest', [['deepstonefloor', 'deepstonebrickfloor']]],
        2: [['basalt'], 'deepPlainsCaveChest', [['basaltfloor', 'basaltpathtile']]],
        3: [['deepSandstone', 'obsidian'], 'deepDesertCaveChest', [['deepstonefloor', 'deepstonebrickfloor']]],
        4: [['deepSwampStone', 'deepStone'], 'deepSwampCaveChest', [['deepstonefloor', 'deepstonebrickfloor'], ['deepswampstonefloor', 'deepswampstonebrickfloor']]],
        5: [['deepStone', 'deepSnowStone'], 'deepSnowCaveChest', [['deepstonefloor', 'deepstonebrickfloor'], ['deepsnowstonefloor', 'deepsnowstonebrickfloor']]] }
    };
    E.EXTRA_APPLY.chestroom = function (a, L, x, y, r) {
      var set = PSETS['ChestRoomSet.' + a.set].f, wall = PSETS[set.wallSet].f, traps = set.traps || [];
      var trap = traps.length ? traps[r.nextInt(traps.length)] : -1;
      var trapped = trap !== -1 && r.getChance(f(0.9)), side = trapped && r.nextBoolean();
      function plate(px, py, dir) {
        if (!trapped || set.pressureplate < 0 || trap < 0) return;
        L.setObject(px, py, set.pressureplate); dir %= 4;
        if (dir === 0) L.setObject(px, py - 2, trap); else if (dir === 1) L.setObject(px + 2, py, trap); else if (dir === 2) L.setObject(px, py + 2, trap); else L.setObject(px - 2, py, trap);
      }
      var opts = [
        function () { L.setObject(x + 3, y + 3, set.inventoryObject); L.setObject(x + 3, y, wall.doorClosed); plate(x + 3, y + 1, side ? 1 : 3); },
        function () { L.setObject(x + 3, y + 3, set.inventoryObject); L.setObject(x + 6, y + 3, wall.doorClosed); plate(x + 5, y + 3, side ? 0 : 2); },
        function () { L.setObject(x + 3, y + 3, set.inventoryObject); L.setObject(x + 3, y + 6, wall.doorClosed); plate(x + 3, y + 5, side ? 1 : 3); },
        function () { L.setObject(x + 3, y + 3, set.inventoryObject); L.setObject(x, y + 3, wall.doorClosed); plate(x + 1, y + 3, side ? 0 : 2); }
      ];
      var open = [];
      if (!SOLID[objAt(L, x + 3, y - 1)]) open.push(opts[0]);
      if (!SOLID[objAt(L, x + 7, y + 3)]) open.push(opts[1]);
      if (!SOLID[objAt(L, x + 3, y + 7)]) open.push(opts[2]);
      if (!SOLID[objAt(L, x - 1, y + 3)]) open.push(opts[3]);
      if (!open.length) opts[r.nextInt(4)](); else open[r.nextInt(open.length)]();
      if (r.getChance(f(0.1))) { L.setObject(x + 3, y + 3, OID.trialentrance); return; }
      if (L.level === 'deepcave' && r.getChance(f(0.1))) { L.setObject(x + 3, y + 3, 0); return; }
      L.chests[(x + 3) + ',' + (y + 3)] = { x: x + 3, y: y + 3, table: a.table, items: G.Chests.rollTable(a.table, r, { level: L.level, rotation: a.rot }) };
    };
    function chestRoom(level) {
      return function (stack, p, r) {
        var x = p.rects[0][0], y = p.rects[0][1], biome = stack.getExpensiveBiomeID(x + 3, y + 3), cfg = CHESTROOM[level][biome] || CHESTROOM[level].def;
        var pr = scripted('RandomCaveChestRoom'), set = cfg[0][r.nextInt(cfg[0].length)];
        setReplace('ChestRoomSet.stone', 'ChestRoomSet.' + set, pr);
        pr.apply.push({ kind: 'chestroom', set: set, table: cfg[1], rot: { v: p.data.i }, noRotate: true });
        cfg[2].forEach(function (fl) { pr.replaceTile(TID[fl[0]], TID[fl[r.nextInt(2)]]); });
        var L = overlay(stack, level, x, y, 7, 7, 1);
        E.applyToLevel(pr, L, x, y, r);
        return L;
      };
    }
    BUILDERS.chestrooms = { cave: chestRoom('cave'), deepcave: chestRoom('deepcave') };

    // ---------- cave and deep cave: ruins (Biome.getNewCaveRuinsPreset, CaveRuins1..10) ----------
    var PARTS = SD.parts || {};
    function partsOf(id, rot) { var e = PARTS[id]; if (!e) return { master: true, parts: [0, 0, id] }; e = e[rot & 3]; return { master: !!e[0], parts: e.slice(1) }; }
    var RUINS = {
      cave: { def: [['stone', 'wood'], ['oak', 'spruce'], ['woodfloor', 'woodfloor', 'stonefloor', 'stonebrickfloor'], 'basicCaveRuinsChest'],
        2: [['granite', 'dryad'], ['oak', 'spruce'], ['dryadfloor', 'dryadfloor', 'graniterock', 'granitefloor'], 'plainsCaveRuinsChest'],
        3: [['sandstone', 'wood'], ['palm', 'spruce'], ['woodfloor', 'woodfloor', 'sandstonefloor', 'sandstonebrickfloor'], 'desertCaveRuinsChest'],
        4: [['swampStone', 'wood'], ['oak', 'spruce'], ['woodfloor', 'woodfloor', 'swampstonefloor', 'swampstonebrickfloor'], 'swampCaveRuinsChest'],
        5: [['snowStone', 'wood'], ['pine', 'spruce'], ['woodfloor', 'woodfloor', 'snowstonefloor', 'snowstonebrickfloor'], 'snowCaveRuinsChest'] },
      deepcave: { def: [['deepStone', 'obsidian'], ['oak', 'spruce'], ['deepstonefloor', 'deepstonebrickfloor'], 'basicDeepCaveRuinsChest'],
        2: [['basalt'], ['birch', 'maple'], ['basaltfloor', 'basaltpath'], 'plainsDeepCaveRuinsChest', true],
        3: [['deepSandstone', 'obsidian'], ['palm', 'spruce'], ['deepstonefloor', 'deepstonebrickfloor'], 'desertDeepCaveRuinsChest'],
        4: [['deepSwampStone', 'deepStone'], ['oak', 'spruce'], ['deepswampstonefloor', 'deepswampstonebrickfloor'], 'swampDeepCaveRuinsChest'],
        5: [['deepStone', 'deepSnowStone'], ['pine', 'spruce'], ['deepsnowstonefloor', 'deepsnowstonebrickfloor'], 'snowDeepCaveRuinsChest'] }
    };
    var RUIN_CHEST = [[2, 1], [3, 1], [1, 3], [3, 1], [2, 1], [1, 2], [4, 1], [2, 1], [5, 4], [3, 2]];
    function caveRuins(level) {
      return function (stack, p, r) {
        var x = p.rects[0][0], y = p.rects[0][1], biome = stack.getExpensiveBiomeID(x + 5, y + 5), cfg = RUINS[level][biome] || RUINS[level].def;
        var wall = cfg[4] ? cfg[0][0] : cfg[0][r.nextInt(cfg[0].length)], furn = cfg[1][r.nextInt(2)], floor = cfg[2][r.nextInt(cfg[2].length)], n = r.nextInt(10);
        var pr = scripted('CaveRuins' + (n + 1));
        setReplace('FurnitureSet.oak', 'FurnitureSet.' + furn, pr);
        setReplace('WallSet.wood', 'WallSet.' + wall, pr);
        pr.replaceTile(TID.stonefloor, TID[floor] === undefined ? -1 : TID[floor]);
        var chest = PSETS['FurnitureSet.' + furn].f.chest;
        var v5 = r.getFloatBetween(f(0.4), f(0.8)), v6 = r.getFloatBetween(f(v5 - f(0.05)), f(v5 + f(0.2)));
        for (var cx = 0; cx < pr.w; cx++) for (var cy = 0; cy < pr.h; cy++) {
          var i = cx + cy * pr.w, o = pr.obj[i], removed = true;
          if (o !== -1) {
            if (o === chest) continue;
            var mt = partsOf(o, pr.rot[i]);
            if (mt.master && r.getChance(v5)) {
              for (var j = 0; j < mt.parts.length; j += 3) { var tx = cx + mt.parts[j], ty = cy + mt.parts[j + 1];
                if (tx >= 0 && ty >= 0 && tx < pr.w && ty < pr.h && pr.obj[tx + ty * pr.w] === mt.parts[j + 2]) pr.obj[tx + ty * pr.w] = -1; }
            } else removed = false;
          }
          if (removed && pr.tiles[i] !== -1 && r.getChance(v6)) pr.tiles[i] = -1;
        }
        pr.apply.push({ kind: 'loot', table: cfg[3], rot: { v: p.data.i }, x: RUIN_CHEST[n][0], y: RUIN_CHEST[n][1], dir: 0 });
        pr = randomizeRotationAndMirror(pr, r);
        var ox = 10 - pr.w > 0 ? r.nextInt(10 - pr.w) : 0, oy = 10 - pr.h > 0 ? r.nextInt(10 - pr.h) : 0;
        var L = overlay(stack, level, x, y, 10, 10);
        E.applyToLevel(pr, L, x + ox, y + oy, r);
        return L;
      };
    }
    BUILDERS.caveruins = { cave: caveRuins('cave'), deepcave: caveRuins('deepcave') };

    // ---------- boss arenas ----------
    function fixedArena(name, level, after) {
      return function (stack, p, r) {
        var q = p.rects[0], pr = scripted(name);
        if (after) after(pr);
        var x = q[0] + (q[2] / 2 | 0) - (pr.w / 2 | 0), y = q[1] + (q[3] / 2 | 0) - (pr.h / 2 | 0);
        var L = overlay(stack, level, Math.min(x, q[0]), Math.min(y, q[1]), Math.max(q[2], pr.w), Math.max(q[3], pr.h), 2);
        E.applyToLevel(pr, L, x, y, r);
        return L;
      };
    }
    BUILDERS.cursedcronearena = fixedArena('TheCursedCroneArenaPreset', 'deepcave');
    BUILDERS.chieftainarena = fixedArena('ChieftainsArenaPreset', 'cave', function (pr) {
      var spike = OID.chieftainbonespikewall;
      for (var x = 0; x < pr.w; x++) for (var y = 7; y < pr.h; y++) if (pr.obj[x + y * pr.w] === spike) pr.obj[x + y * pr.w] = 0;
    });
    // AncientVultureArenaPreset(size, random)
    BUILDERS.vulturearenas = function (stack, p, r) {
      var size = 36, c = 18, R = 18 * 32, pr = new Preset(size, size);
      var wood = TID.woodfloor, sst = TID.sandstonetile, brick = TID.sandbrick, props = [OID.crate, OID.vase];
      for (var x = 0; x < size; x++) for (var y = 0; y < size; y++) {
        var dx = (c * 32 + 16) - (x * 32 + 16), dy = (c * 32 + 16) - (y * 32 + 16), i = x + y * size;
        var v = f(f(Math.sqrt(dx * dx + dy * dy)) / f(R));
        if (v < f(0.5)) { pr.tiles[i] = wood; if (r.getChance(f(0.8))) pr.tiles[i] = brick; pr.obj[i] = 0; }
        else if (v <= 1) {
          var ch = f(f(Math.abs(f(f(f(v - f(0.5)) * 2) - 1))) * 2);
          if (r.getChance(ch)) {
            if (r.getChance(f(0.75))) pr.tiles[i] = r.getChance(f(0.75)) ? brick : wood; else pr.tiles[i] = sst;
            pr.obj[i] = 0;
          }
        }
        if (v <= 1 && pr.obj[i] !== -1 && r.getChance(f(0.1))) pr.obj[i] = props[r.nextInt(2)];
      }
      var n = r.nextInt(3) + 8, ang = f(r.nextInt(360)), step = f(f(360) / f(n)), col = OID.sandstonecolumn;
      for (var k = 0; k < n; k++) {
        ang = f(ang + r.getFloatBetween(f(step - f(step / 10)), f(step + f(step / 10))));
        var dist = f(f(size) / f(3));
        var px = Math.trunc(f(f(c) + f(G.Cave.cos(ang) * dist))), py = Math.trunc(f(f(c) + f(G.Cave.sin(ang) * dist)));
        pr.setObject(px, py, col);
      }
      pr.setObject(c, c, OID.ancienttotem);
      var q = p.rects[0], x0 = q[0] + 18 - 18, y0 = q[1] + 18 - 18;
      var L = overlay(stack, 'cave', x0, y0, size, size);
      E.applyToLevel(pr, L, x0, y0, r);
      return L;
    };

    // ---------- lines mini-biomes: bear caves, spider nests, crystals (LinesGenerationWorldPreset + CellAutomaton) ----------
    function caPoints(lg, r) {
      var ca = lg.lg.doCellularAutomaton(r);
      return { ca: ca, pts: ca.alive.values().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }) };
    }
    function linesOverlay(stack, level, p) { var q = p.rects[0], L = overlay(stack, level, q[0], q[1], q[2], q[3], 2); L.direct = true; return L; }
    function bearCave(stack, p, r) {
      var L = linesOverlay(stack, 'cave', p), c = caPoints(p.data.lg, r), list = [];
      c.pts.forEach(function (pt) {
        L.setTile(pt[0], pt[1], TID.mudtile); L.setObject(pt[0], pt[1], 0); list.push(pt);
        if (r.getChance(f(0.3))) L.setTile(pt[0], pt[1], TID.graveltile);   // gravel can always go on mud
      });
      var b = list.length ? list[r.nextInt(list.length)] : null;
      if (b) L.setObject(b[0], b[1], OID.barrel);
      return L;
    }
    BUILDERS.forestbearcave = BUILDERS.plainsbearcave = bearCave;
    function spiderNest(level, egg) {
      return function (stack, p, r) {
        var L = linesOverlay(stack, level, p), c = caPoints(p.data.lg, r);
        c.pts.forEach(function (pt) { L.setTile(pt[0], pt[1], TID.spidernesttile); L.setObject(pt[0], pt[1], r.getChance(f(0.95)) ? OID.cobweb : 0); });
        if (egg && r.getChance(f(0.5))) { var lg = p.data.lg; L.setObject(lg.startTileX, lg.startTileY, OID.royaleggobject); L.setObject(lg.startTileX, lg.startTileY + 1, 0); }
        return L;
      };
    }
    BUILDERS.forestspidernests = BUILDERS.swampspidernests = spiderNest('cave', false);
    BUILDERS.snowspidernests = spiderNest('cave', true);
    BUILDERS.deepswampspidernests = spiderNest('deepcave', false);
    var ROT_PT = [function (x, y) { return [x, y]; }, function (x, y) { return [-y, x]; }, function (x, y) { return [-x, -y]; }, function (x, y) { return [y, -x]; }];
    function crystals(level, gem) {
      return function (stack, p, r) {
        var L = linesOverlay(stack, level, p), c = caPoints(p.data.lg, r), gravel = TID[gem + 'gravel'], small = OID[gem + 'clustersmall'], big = OID[gem + 'cluster'], bigR = OID[gem + 'clusterr'];
        c.pts.forEach(function (pt) { L.setTile(pt[0], pt[1], gravel); L.setObject(pt[0], pt[1], 0); });
        var o = function (x, y) { return objAt(L, x, y); };
        c.pts.forEach(function (pt) {
          var x = pt[0], y = pt[1];
          if (o(x, y) === 0 && o(x - 1, y) === 0 && o(x + 1, y) === 0 && o(x, y - 1) === 0 && o(x, y + 1) === 0 && r.getChance(f(0.08))) {
            var rot = r.nextInt(4), a = ROT_PT[rot](-1, -1), b = ROT_PT[rot](1, -1);
            if (c.ca.alive.has(x + a[0], y + a[1]) && o(x + a[0], y + a[1]) === 0 && c.ca.alive.has(x + b[0], y + b[1]) && o(x + b[0], y + b[1]) === 0) {
              L.setObject(x, y, big); L.setObject(x + 1, y, bigR);
            }
          }
          if (r.getChance(f(0.3)) && o(x, y) === 0) L.setObject(x, y, small);
        });
        return L;
      };
    }
    BUILDERS.forestsapphirecrystals = crystals('cave', 'sapphire');
    BUILDERS.desertamethystcrystals = crystals('cave', 'amethyst');
    BUILDERS.deepforestrubycrystals = crystals('deepcave', 'ruby');
    BUILDERS.deepplainstopazcrystals = crystals('deepcave', 'topaz');
    BUILDERS.deepswampemeralcrystals = crystals('deepcave', 'emerald');

    // ---------- swamp spores, mud and ancient roots, snow ice openings ----------
    function forEachIn(L, pts, fn) { pts.forEach(function (pt) { fn(pt[0], pt[1]); }); }
    BUILDERS.swampcavespores = function (stack, p, r) {
      var L = linesOverlay(stack, 'cave', p), c = caPoints(p.data.lg, r);
      forEachIn(L, c.pts, function (x, y) { L.setObject(x, y, r.getChance(f(0.03)) ? OID.swampcrate : r.getChance(f(0.6)) ? OID.swampgrass : 0); });
      p.data.lg.lg.lines.forEach(function (l) { L.setObject(l.x2, l.y2, OID.swampspore); });
      return L;
    };
    BUILDERS.swampmudareas = function (stack, p, r) {
      var L = linesOverlay(stack, 'cave', p), c = caPoints(p.data.lg, r), thorns = r.getChance(f(0.75));
      forEachIn(L, c.pts, function (x, y) {
        L.setTile(x, y, TID.mudtile);
        if (objAt(L, x, y) !== 0) return;
        if (thorns) { if (r.getChance(f(0.85))) L.setObject(x, y, OID.thorns); }
        else if (r.getChance(f(0.05))) L.setObject(x, y, OID.wildmushroom);
      });
      return L;
    };
    BUILDERS.ancientrootsareas = function (stack, p, r) {
      var L = linesOverlay(stack, 'deepcave', p), c = caPoints(p.data.lg, r);
      forEachIn(L, c.pts, function (x, y) {
        L.setTile(x, y, TID.ancientrootstile); L.setObject(x, y, 0);
        if (r.getChance(f(0.4))) L.setObject(x, y, OID.wildancientroots); else if (r.getChance(f(0.02))) L.setObject(x, y, OID.mosscoveredskull);
      });
      return L;
    };
    BUILDERS.snowcaveiceopenings = function (stack, p, r) {
      var water = r.getChance(f(0.5)), L = linesOverlay(stack, 'cave', p), c = caPoints(p.data.lg, r), snow = TID.snowrocktile;
      var tileAt = function (x, y) { var t = L.getTile(x, y); return t === -2 ? L.ground(x, y) : t; };
      var ice = new c.ca.constructor();
      forEachIn(L, c.pts, function (x, y) {
        if (tileAt(x, y) !== snow) return;
        L.setTile(x, y, TID.icetile); if (objAt(L, x, y) > 0) L.setObject(x, y, 0);   // rocks are cleared
        if (water) ice.alive.add(x, y);
      });
      if (water) {
        forEachIn(L, c.pts, function (x, y) { if (edge8(c.ca, x, y)) ice.alive.m.delete(x + ',' + y); });
        ice.step(4, 100, 2, N8);
        ice.alive.values().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (pt) { L.setTile(pt[0], pt[1], TID.watertile); });
      }
      return L;
    };

    // ---------- vampire crypts ----------
    var N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    function edge8(ca, x, y) { for (var i = 0; i < 8; i++) if (!ca.alive.has(x + N8[i][0], y + N8[i][1])) return true; return false; }
    // CoffinObject's two parts for each rotation: [dx, dy, part] (part 1 = the foot)
    var COFFIN = [[[0, -1, 1], [0, 0, 0]], [[0, 0, 0], [1, 0, 1]], [[0, 0, 0], [0, 1, 1]], [[-1, 0, 1], [0, 0, 0]]];
    function crypt(stack, p, r) {
      var L = linesOverlay(stack, 'cave', p), c = caPoints(p.data.lg, r), ca = c.ca, grass = OID.cryptgrass, wall = OID.stonewall;
      var o = function (x, y) { return objAt(L, x, y); };
      c.pts.forEach(function (pt) { L.setTile(pt[0], pt[1], TID.cryptash); L.setObject(pt[0], pt[1], 0); });
      c.pts.forEach(function (pt) { if (edge8(ca, pt[0], pt[1])) { L.setObject(pt[0], pt[1], 0); L.setObject(pt[0], pt[1], wall); } });
      var coffins = [];
      c.pts.forEach(function (pt) {
        var x = pt[0], y = pt[1];
        if (r.getChance(f(0.2)) && o(x, y) === 0) {   // CryptGrassObject.canPlace: at most one grass next to it
          var n = 0; for (var i = 0; i < 8; i++) { var q = o(x + N8[i][0], y + N8[i][1]); if (q === grass) n++; }
          if (n <= 1) L.setObject(x, y, grass);
        }
        if (o(x, y) !== 0 || o(x - 1, y) !== 0 || o(x + 1, y) !== 0 || o(x, y - 1) !== 0 || o(x, y + 1) !== 0) return;
        if (r.getChance(f(0.2))) {
          var rot = r.nextInt(4), pts = [[-1, -1], [1, -1], [0, -2]], ok = true;
          for (var k = 0; k < 3; k++) { var d = ROT_PT[rot](pts[k][0], pts[k][1]); if (!ca.alive.has(x + d[0], y + d[1]) || o(x + d[0], y + d[1]) !== 0) { ok = false; break; } }
          if (ok) { COFFIN[rot].forEach(function (e) { L.setObject(x + e[0], y + e[1], e[2] ? OID.stonecoffin + 1 : OID.stonecoffin); }); coffins.push([x, y]); }
        } else if (r.getChance(f(0.06))) L.setObject(x, y, OID.stonecolumn);
        else if (r.getChance(f(0.3))) { var g = r.nextInt(2); r.nextInt(4); L.setObject(x, y, g ? OID.gravestone2 : OID.gravestone1); }
      });
      return L;
    }
    BUILDERS.forestvampirecrypts = BUILDERS.snowvampirecrypts = crypt;

    // ---------- fixed-layout structures: the game's preset script, built at the found tile, maybe mirrored ----------
    function fixedPreset(name, level, mirror, ctor) {
      return function (stack, p, r) {
        var q = p.rects[0], pr = scripted(name);
        if (ctor) ctor(pr, r);
        if (mirror.indexOf('x') >= 0 && r.nextBoolean()) pr = pr.tryMirror('x');
        if (mirror.indexOf('y') >= 0 && r.nextBoolean()) pr = pr.tryMirror('y');
        var L = overlay(stack, level, q[0], q[1], Math.max(q[2], pr.w), Math.max(q[3], pr.h));
        E.applyToLevel(pr, L, q[0], q[1], r);
        return L;
      };
    }
    function rarePainting(pr, x, y, dir, r) { pr.apply.push({ kind: 'painting', name: E.fromMap(E.PAINT.rarePaintings).random(r), x: x, y: y, dir: dir }); }
    BUILDERS.frenchhorn = fixedPreset('FrenchHornPreset', 'cave', 'x');
    BUILDERS.snowmusicplayer = fixedPreset('MusicPlayerPreset1', 'cave', 'xy');
    BUILDERS.deepsnowmusicplayer = fixedPreset('MusicPlayerPreset2', 'deepcave', 'xy');
    BUILDERS.deepswampagedchampion = fixedPreset('AgedChampionArenaPreset', 'deepcave', 'xy', function (pr) { pr.obj[8 + 8 * pr.w] = 0; });
    BUILDERS.shrineofthemoon = fixedPreset('ShrineOfTheMoonPreset', 'deepcave', 'x');
    BUILDERS.desertcavelingoasis = fixedPreset('CavelingOasisPreset', 'cave', '', function (pr, r) {
      [[9, 3, 2], [14, 6, 2], [15, 7, 3], [15, 9, 0], [13, 12, 3], [8, 13, 0], [6, 12, 1], [5, 11, 0], [3, 9, 1], [4, 7, 2], [8, 4, 1]].forEach(function (e) { rarePainting(pr, e[0], e[1], e[2], r); });
    });

    // EvilWitchCastlePreset(random)
    var LIQUID = {}; ((E.VD.oflags || {}).liquid || []).forEach(function (i) { LIQUID[i] = 1; });
    var FLOOR = {}; ((E.VD.oflags || {}).floor || []).forEach(function (i) { FLOOR[i] = 1; });
    function everyX(r, n) { return r.getChance(f(1 / n)); }
    BUILDERS.swampwitchcastle = function (stack, p, r) {
      var q = p.rects[0], pr = scripted('EvilWitchCastlePreset'), w = pr.w, h = pr.h;
      var set = function (x, y, o) { pr.obj[x + y * w] = o; };
      var a = r.getIntBetween(12, 16); set(17, a, 0);   // the witches' spots are cleared
      var b = r.getIntBetween(18, 24); set(b, 11, 0);
      var c = r.getIntBetween(12, 21); set(25, c, 0);
      var rooms = [[12, 4, 3, 3, 14, 7], [10, 9, 3, 7, 12, 12], [32, 11, 3, 3, 31, 12], [32, 15, 3, 3, 31, 15]], rm = rooms[r.nextInt(4)];
      for (var i = 0; i < rm[2]; i++) for (var j = 0; j < rm[3]; j++) { var oi = (rm[0] + i) + (rm[1] + j) * w, on = pr.obj[oi] >= 0 ? ON[pr.obj[oi]] : 'air'; if (!/bed|display/.test(on)) pr.obj[oi] = 0; }
      set(rm[4], rm[5], OID.swampstonewall);
      set(r.nextInt(2) ? 22 : 21, 12, 0);
      var floors = [TID.swamprocktile, TID.swampstonebrickfloor, TID.dungeonfloor];
      for (var x = 0; x < w; x++) for (var y = 0; y < h; y++) {
        var k = x + y * w, t = pr.tiles[k], o = pr.obj[k];
        if (t === TID.sandstonetile) pr.tiles[k] = floors[r.getIntBetween(0, 2)];
        if (o === OID.dungeonbench && everyX(r, 5)) pr.obj[k] = 0;
        if (o === OID.swampcandlepedestal && everyX(r, 10)) pr.obj[k] = 0;
        if (o === OID.dungeoncandelabra && everyX(r, 8)) pr.obj[k] = 0;
        if (o === OID.swampstonewall) { pr.tiles[k] = TID.swampstonebrickfloor; if (everyX(r, 4)) pr.obj[k] = OID.stonewall; }
        if (o === OID.swampstonecolumn) { pr.tiles[k] = TID.swampstonebrickfloor; if (everyX(r, 3)) pr.obj[k] = OID.stonecolumn; if (everyX(r, 5)) pr.obj[k] = 0; }
      }
      for (x = 0; x < w; x++) for (y = 0; y < h; y++) {   // a removed bench takes its other half with it
        var o2 = pr.obj[x + y * w]; if (o2 !== OID.dungeonbench2) continue;
        var keep = false; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var xx = x + d[0], yy = y + d[1]; if (xx >= 0 && yy >= 0 && xx < w && yy < h && pr.obj[xx + yy * w] === OID.dungeonbench) keep = true; });
        if (!keep) pr.obj[x + y * w] = 0;
      }
      var L = overlay(stack, 'cave', q[0], q[1], w, h);
      E.applyToLevel(pr, L, q[0], q[1], r);
      for (x = 0; x < w; x++) for (y = 0; y < h; y++) { var tx = q[0] + x, ty = q[1] + y, tt = L.getTile(tx, ty); if (tt === -2) tt = L.ground(tx, ty); if (LIQUID[tt]) L.setTile(tx, ty, TID.swamprocktile); }
      return L;
    };

    // ---------- procedural presets built from LinesGeneration smooth points (iterated in the game's HashMap order) ----------
    var JH = (typeof JHashMapOrder !== 'undefined') ? JHashMapOrder : (typeof require !== 'undefined' ? require('./jhashmap.js') : null);
    function smoothEntries(lg) { var m = lg.getSmoothPoints(), keys = Array.from(m.values()).map(function (e) { return [e.x, e.y]; }); return JH.order(keys).map(function (k) { return m.get(k[0] + ',' + k[1]); }); }
    function multiArm(from, r, angle, angOff, maxDist, minL, maxL, minW, maxW, stop) {
      var dist = 0, cur = from;
      while (dist < maxDist) {
        angle = r.getIntOffset(angle, angOff);
        var len = r.getFloatBetween(minL, maxL), w = r.getFloatBetween(minW, maxW);
        dist = f(dist + len); cur = cur.addArm(angle, len, w);
        if (stop && stop(cur)) break;
      }
      return cur;
    }
    function armsLG(pr, r, cx, cy, arms, angOff, maxDist, minL, maxL, minW, maxW) {
      var lg = new G.Cave.LG(null, cx, cy, cx, cy, 0), angle = r.nextInt(360), step = (360 / arms) | 0;
      var out = function (l) { return l.x2 < 0 || l.x2 >= pr.w || l.y2 < 0 || l.y2 >= pr.h; };
      for (var i = 0; i < arms; i++) { angle += step; multiArm(lg, r, angle, angOff, maxDist, minL, maxL, minW, maxW, out); }
      return lg;
    }
    function inP(pr, e) { return e.x >= 0 && e.y >= 0 && e.x < pr.w && e.y < pr.h; }
    function pick(r, arr) { return arr[r.nextInt(arr.length)]; }
    // CoreKeeperCorePreset(random)
    BUILDERS.corekeepercore = function (stack, p, r) {
      var q = p.rects[0], pr = new Preset(30, 30), cw = 6, x0 = 12, y0 = 12, W = pr.w, set = function (x, y, t, o) { if (t != null) pr.tiles[x + y * W] = t; if (o != null) pr.obj[x + y * W] = o; };
      for (var x = x0 - 1; x < x0 + cw + 1; x++) for (var y = y0 - 1; y < y0 + cw + 1; y++) set(x, y, TID.deepsandstonetile);
      var lg = armsLG(pr, r, 15, 15, r.getIntBetween(5, 8), 35, 14, 2, 4, 1.5, 3);
      smoothEntries(lg).forEach(function (e) {
        if (!inP(pr, e) || chanceD(r, e.dist / 3)) return;
        set(e.x, e.y, TID.deepsandstonetile);
        if (r.getChance(f(0.075))) set(e.x, e.y, null, OID.swampcrate);
        else if (r.getChance(f(0.15))) set(e.x, e.y, null, OID[pick(r, ['seashell', 'seasnail', 'seastar'])]);
        else if (r.getChance(f(0.2))) set(e.x, e.y, null, OID[pick(r, ['mossysteppingstones', 'largemossysteppingstone'])]);
        else set(e.x, e.y, null, 0);
      });
      lg = armsLG(pr, r, 15, 15, r.getIntBetween(4, 5), 25, 14, 2, 4, 1.5, 3);
      smoothEntries(lg).forEach(function (e) {
        if (!inP(pr, e) || chanceD(r, e.dist / 3)) return;
        set(e.x, e.y, TID.ancientrootstile);
        if (r.getChance(f(0.3))) set(e.x, e.y, null, OID.wildancientroots);
        else if (r.getChance(f(0.05))) set(e.x, e.y, null, OID.swampcrate);
        else if (r.getChance(f(0.8))) set(e.x, e.y, null, OID.deepswamptallgrass);
        else set(e.x, e.y, null, 0);
        r.getChance(f(0.05));   // firefly
      });
      var core = PD.CoreKeeperCorePreset;
      for (x = 0; x < core.w; x++) for (y = 0; y < core.h; y++) { var si = x + y * core.w, di = (x0 + x) + (y0 + y) * W; if (core.tiles[si] !== -1) pr.tiles[di] = core.tiles[si]; pr.obj[di] = core.obj[si]; pr.rot[di] = core.rot[si]; }
      var L = overlay(stack, 'deepcave', q[0], q[1], 30, 30);
      E.applyToLevel(pr, L, q[0], q[1], r);
      return L;
    };

    // PalworldGrizzboltPreset(random)
    function JSet() { this.m = new Map(); this.seq = []; }   // a PointHashSet: membership plus the game's iteration order (no removals needed)
    JSet.prototype.add = function (x, y) { var k = x + ',' + y; if (!this.m.has(k)) { this.m.set(k, 1); this.seq.push([x, y]); } };
    JSet.prototype.has = function (x, y) { return this.m.get(x + ',' + y) === 1; };
    JSet.prototype.remove = function (x, y) { var k = x + ',' + y; if (this.m.has(k)) this.m.set(k, 0); };
    JSet.prototype.list = function () { var self = this; return JH.order(this.seq, 'put').filter(function (k) { return self.has(k[0], k[1]); }); };
    var N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // Level.adjacentGettersNotDiagonal
    BUILDERS.palworldgrizzbolt = function (stack, p, r) {
      var q = p.rects[0], pr = new Preset(32, 32), W = 32, H = 32;
      var inb = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; };
      var setT = function (x, y, t) { if (inb(x, y)) pr.tiles[x + y * W] = t; }, setO = function (x, y, o) { if (inb(x, y)) pr.obj[x + y * W] = o; }, getO = function (x, y) { return inb(x, y) ? pr.obj[x + y * W] : -1; };
      var base = new G.Cave.LGWP(16, 16).addRandomArms(r, 7, 8, 10, 3, 4.5).lg, sm = base.getSmoothPoints();
      var inside = new JSet(), edge = new JSet(), walls = new JSet();
      smoothEntries(base).forEach(function (e) {
        if (!inb(e.x, e.y)) return;
        setT(e.x, e.y, TID.deepsandstonetile); setO(e.x, e.y, 0); inside.add(e.x, e.y);
        for (var i = 0; i < 8; i++) if (!sm.has((e.x + N8[i][0]) + ',' + (e.y + N8[i][1]))) { edge.add(e.x, e.y); break; }
      });
      var wall = OID.arcanicwall, path = TID.arcanicpath;
      var stopOut = function (l) { return !inside.has(l.x2, l.y2); };
      function lines(arms, angOff, minW, maxW) {
        var lg = new G.Cave.LG(null, 16, 16, 16, 16, 0), angle = r.nextInt(360), step = (360 / arms) | 0;
        for (var i = 0; i < arms; i++) { angle += step; multiArm(lg, r, angle, angOff, 15, 2, 4, minW, maxW, stopOut); }
        return lg;
      }
      var lg2 = lines(r.getIntBetween(4, 5), 0, 2, 3);
      lg2.getDiamondPoints().javaValues().forEach(function (pt) {
        if (!edge.has(pt[0], pt[1])) return;
        walls.add(pt[0], pt[1]); inside.remove(pt[0], pt[1]); setO(pt[0], pt[1], wall); setT(pt[0], pt[1], path);
      });
      for (var it = 0; it < 2; it++) {
        var added = new JSet();
        walls.list().forEach(function (pt) { N4.forEach(function (d) { var x = pt[0] + d[0], y = pt[1] + d[1];
          if (edge.has(x, y)) { setO(x, y, wall); setT(x, y, path); added.add(x, y); inside.remove(x, y); } }); });
        added.list().forEach(function (pt) { walls.add(pt[0], pt[1]); });
      }
      edge.list().forEach(function (pt) { if (getO(pt[0], pt[1]) !== wall) setO(pt[0], pt[1], OID.jailfence); });
      var lg3 = lines(r.getIntBetween(4, 5), 35, 1.5, 2.5);
      smoothEntries(lg3).forEach(function (e) {
        if (!inside.has(e.x, e.y)) return;
        if (chanceD(r, e.dist / 3)) return;
        if (r.getChance(f(0.8))) setT(e.x, e.y, TID.arcanicfloor);
      });
      var adj = new JSet();
      walls.list().forEach(function (pt) { N4.forEach(function (d) { var x = pt[0] + d[0], y = pt[1] + d[1]; if (inside.has(x, y) && !walls.has(x, y) && !edge.has(x, y)) adj.add(x, y); }); });
      var tk = [[100, 'crate'], [100, 'arcaniccrate'], [10, 'arcanicmachinery'], [30, 'arcaniccolumn'], [20, 'arcaniclamp'], [50, 'topazclustersmall'], [50, 'topazclusterpure'], [10, 'tikitorch']];
      var tickets = new E.Tickets(); tk.forEach(function (e) { tickets.add(e[0], e[1]); });
      var WIDE = { arcanicmachinery: 1, topazclusterpure: 1 };
      adj.list().forEach(function (pt) {
        if (!r.getChance(f(0.9))) return;
        var name = tickets.random(r), wdt = WIDE[name] ? 2 : 1, ok = true;
        for (var dx = 0; dx < wdt; dx++) if (getO(pt[0] + dx, pt[1]) !== 0) { ok = false; break; }
        if (!ok) return;
        setO(pt[0], pt[1], OID[name]); if (wdt === 2) setO(pt[0] + 1, pt[1], OID[name] + 1);
      });
      for (var x = 14; x < 19; x++) for (var y = 14; y < 19; y++) setT(x, y, x === 14 || x === 18 || y === 14 || y === 18 ? path : TID.arcanicfloor);
      var L = overlay(stack, 'deepcave', q[0], q[1], 32, 32);
      E.applyToLevel(pr, L, q[0], q[1], r);
      return L;
    };

    // ---------- runebound tribes (ModularGeneration of 12x12 houses round a runic boulder) ----------
    E.EXTRA_APPLY.rbmob = function (a, L, x, y, r) { r.nextInt(3); };   // a runebound mob picked from three
    E.EXTRA_APPLY.liqgranite = function (a, L, x, y) {
      for (var i = x + Math.min(a.x0, a.x1); i <= x + Math.max(a.x0, a.x1); i++) for (var j = y + Math.min(a.y0, a.y1); j <= y + Math.max(a.y0, a.y1); j++)
        if (L.isLiquid(i, j)) { L.setTile(i, j, TID.graniterocktile); L.setObject(i, j, 0); }
    };
    function tribePreset(name, opens, loot, mob, granite, r) {
      var pr = scripted(name); pr.sw = 1; pr.sh = 1; pr.res = 12;
      opens.forEach(function (d) { pr.open(0, 0, d); });
      if (loot) { var n = loot[0] === 'all' ? 1 : r.getIntBetween(0, loot[0]); for (var i = 0; i < n; i++) pr.apply.push({ kind: 'loot', table: 'runeboundCosmeticArmorLootTable', x: loot[1], y: loot[2], dir: 0 }); }
      if (granite) pr.pre.push({ kind: 'liqgranite', area: true, x0: -1, y0: -1, x1: pr.w, y1: pr.h, dir: 0 });
      if (mob) pr.apply.push({ kind: 'rbmob', x: mob[0], y: mob[1], dir: 0 });
      return pr;
    }
    BUILDERS.plainsruneboundtribes = function (stack, p, r) {
      var q = p.rects[0], gx = p.data.gx, gy = p.data.gy;
      var L = overlay(stack, 'cave', q[0], q[1], q[2], q[3], 1);
      var mg = new E.MG(L, gx, gy, q[0], q[1], r, 12);
      mg.applyPreset(tribePreset('RuneboundTribeRunicBoulder1Preset', [0, 1, 2, 3], null, null, false, r), [(gx - 1) / 2 | 0, (gy - 1) / 2 | 0], false, false, null);
      [['RuneboundTribeCaveHouse1Preset', [2], [2, 4, 4], [5, 6]], ['RuneboundTribeCaveHouse2Preset', [2], [2, 5, 5], [5, 6]], ['RuneboundTribeCaveHouse3Preset', [1], [2, 3, 4], [6, 6]],
       ['RuneboundTribeCaveHouse4Preset', [2], null, [6, 6]], ['RuneboundTribeCaveHouse5Preset', [1], null, [4, 4]], ['RuneboundTribeCaveHouse6Preset', [2], [2, 5, 3], [5, 5]],
       ['RuneboundTribeHouse1Preset', [2], [3, 8, 3], [6, 7], true], ['RuneboundTribeHouse2Preset', [2], ['all', 8, 4], [6, 4], true], ['RuneboundTribeHouse3Preset', [2], [2, 5, 3], [5, 5], true]]
        .forEach(function (e) { mg.addPreset(tribePreset(e[0], e[1], e[2], e[3], !!e[4], r), 75); });
      mg.ticks(1e9);
      return L;
    };

    // ---------- runebound tombs: a ModularGeneration whose random is seeded from the level, not the place ----------
    function tombPreset(name, sw, opens, coffins) {
      var pr = scripted(name); pr.sw = sw; pr.sh = 1; pr.res = 10;
      (coffins || []).forEach(function (c) { pr.apply.push({ kind: 'loot', table: 'runeboundTombCoffin', x: c[0], y: c[1], dir: 0 }); });
      opens.forEach(function (d) { pr.open(0, 0, d); });
      return pr;
    }
    BUILDERS.deepplainsruneboundtombs = function (stack, p, r) {
      var q = p.rects[0], gx = p.data.gx, gy = p.data.gy, seed = G.javaStringHash('deepcave');
      var L = overlay(stack, 'deepcave', q[0], q[1], q[2], q[3]);
      var mg = new E.MG(L, gx, gy, q[0], q[1], G.gameRandom(seed), 10);
      var start = tombPreset('RuneboundTombCrossPreset', 1, [0, 1, 2, 3]);
      mg.r = G.gameRandom(seed);   // initGeneration starts a fresh random from the level seed
      mg.applyPreset(start, [(gx - 1) / 2 | 0, (gy - 1) / 2 | 0], false, false, null);
      [['RuneboundTombCrossPreset', 1, [0, 1, 2, 3]], ['RuneboundTombHallway1Preset', 1, [1, 3]], ['RuneboundTombHallway2Preset', 1, [1, 3], [[4, 2], [5, 7]]],
       ['RuneboundTombLongHallwayPreset', 2, [1, 3], [[6, 2], [7, 7], [12, 2], [13, 7]]], ['RuneboundTombHallwayT1Preset', 1, [1, 2, 3]], ['RuneboundTombHallwayT2Preset', 1, [1, 2, 3], [[4, 2]]],
       ['RuneboundTombDeadEnd1Preset', 1, [2], [[2, 4], [2, 6], [4, 2], [7, 3], [7, 5]]], ['RuneboundTombDeadEnd2Preset', 1, [2], [[2, 5], [7, 4]]]]
        .forEach(function (e) { mg.addPreset(tombPreset(e[0], e[1], e[2], e[3]), 75); });
      mg.ticks(1e9);
      return L;
    };

    // the desert temple's middle: columns round a pedestal (the halls are region tiles)
    BUILDERS.deserttemple = function (stack, p, r) {
      var cx = p.data.cx, cy = p.data.cy, n = r.getIntBetween(6, 8), step = (360 / n) | 0, angle = r.nextInt(360), dist = f(15.5 - f(15.5 / 3));
      var L = overlay(stack, 'deepcave', cx - 20, cy - 20, 40, 40);
      for (var i = 0; i < n; i++) {
        angle += r.getIntOffset(step, (step / 5) | 0);
        L.setObject(cx + Math.trunc(f(G.Cave.cos(angle) * dist)), cy + Math.trunc(f(G.Cave.sin(angle) * dist)), OID.deepsandstonecolumn);
      }
      L.setObject(cx, cy, OID.templepedestal);
      L.direct = true;
      return L;
    };

    // Fishian houses inside the biome: FishianHousePreset1/2, randomly rotated and mirrored, centred in a 10x10 spot
    BUILDERS.deepswampfishianbiome = function (stack, p, r) {
      if (!p.data || p.data.house == null) return null;
      var q = p.rects[0], pr = scripted(p.data.house === 0 ? 'FishianHousePreset1' : 'FishianHousePreset2');
      pr = randomizeRotationAndMirror(pr, r);
      var x = q[0] + ((10 / 2 | 0) - (pr.w / 2 | 0)), y = q[1] + ((10 / 2 | 0) - (pr.h / 2 | 0));
      var L = overlay(stack, 'deepcave', Math.min(q[0], x), Math.min(q[1], y), 14, 14);
      E.applyToLevel(pr, L, x, y, r);
      return L;
    };

    // ---------- one-off surface spots ----------
    BUILDERS.mimegarden = fixedPreset('MimeGardenPreset', 'surface', '');
    // WitchCabinMadsPreset(random): its dungeon floor is mixed with wood floor, swamp grass and mud; water under it becomes ground
    BUILDERS.swampwitchcabins = function (stack, p, r) {
      var q = p.rects[0], pr = scripted('WitchCabinMadsPreset'), t = new E.Tickets();
      t.add(120, TID.dungeonfloor).add(80, TID.woodfloor).add(30, TID.swampgrasstile).add(20, TID.mudtile);
      for (var x = 0; x < pr.w; x++) for (var y = 0; y < pr.h; y++) if (pr.tiles[x + y * pr.w] === TID.dungeonfloor) pr.tiles[x + y * pr.w] = t.random(r);
      pr.pre.push({ kind: 'shoreground', area: true, x0: 0, y0: -1, x1: pr.w - 1, y1: pr.h - 2, dir: 0 });
      var L = overlay(stack, 'surface', q[0], q[1] - 1, pr.w, pr.h + 1);
      E.applyToLevel(pr, L, q[0], q[1], r);
      return L;
    };
    E.EXTRA_APPLY.shoreground = function (a, L, x, y) {
      for (var i = x + Math.min(a.x0, a.x1); i <= x + Math.max(a.x0, a.x1); i++) for (var j = y + Math.min(a.y0, a.y1); j <= y + Math.max(a.y0, a.y1); j++)
        if (L.isLiquid(i, j)) L.setTile(i, j, L.st.getLazyBiomeID(i, j) === G._internal.C().biomeIDs.swamp ? TID.swampgrasstile : TID.sandtile);
    };
    // KatanaRuinsWorldPreset: the katana stone, a gravel patch round it and up to ten small rocks
    BUILDERS.katanaruins = function (stack, p, r) {
      var q = p.rects[0], cx = q[0] + 4, cy = q[1] + 4, L = overlay(stack, 'surface', q[0] - 8, q[1] - 8, 25, 25);
      L.setObject(cx, cy, OID.katanastone);
      var lg = new G.Cave.LGWP(cx, cy).addRandomArms(r, 6, 6, 9, 2, 3), c = caPoints(lg, r);
      c.pts.forEach(function (pt) { var o = objAt(L, pt[0], pt[1]); if ((o === 0 || GF[o]) && !L.isLiquid(pt[0], pt[1]) && r.getChance(f(0.3))) L.setTile(pt[0], pt[1], TID.graveltile); });
      var spots = [];
      for (var dx = -5; dx <= 5; dx++) for (var dy = -5; dy <= 5; dy++) { var o = objAt(L, cx + dx, cy + dy), t = L.getTile(cx + dx, cy + dy);
        if ((o === 0 || GF[o]) && !FLOOR[t]) spots.push([cx + dx, cy + dy]); }
      for (var i = 0; i < 10 && spots.length; i++) { var s2 = spots.splice(r.nextInt(spots.length), 1)[0]; L.setObject(s2[0], s2[1], OID.surfacerocksmall); }
      L.direct = true;
      return L;
    };
    // ValheimHuginPreset(random): the statue's clearing, grass and flowers over its fog range
    var HUGIN = [-7,-7,-7,6,-6,-6,-6,5,-5,-5,-5,4,-4,-4,-4,3,-3,2,-2,1,-1,0,0,-1,1,-2,2,-3,3,-4,4,-5,5,-6,6,-7,7,-8,-3,-3,-2,-2,-1,-1,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,-8,6,-6,-5,-6,4,-7,7,-5,-6,-5,5,-4,-3,-2,-1,0,1,2,3,4,5,6,7,7,6,5,4,3,2,1,0,-1,-2,-4,2,-2,0,0,-2,2,-4,4,-6,6,-8,7,-7,5,-5,3,-3,1,-1,-1,1,-3,3,-3,-4,-6,-8,-8,5,-8,-6,-7,-5,-2,-4,-1,-3,-7,4,-2,3,-1,2,-4,1,-3,0,2,-1,3,-2,0,-3,1,-4,6,-5,7,-6,4,-7,5,-8,-6,7,-5,-7,-5,6,-4,-2,-3,-1,2,0,3,1,0,2,1,3,6,4,7,5,4,6,5,7,-5,-8,-8,-5,-2,-3,-1,-4,-8,4,-2,2,-1,3,-4,0,2,-2,3,-1,0,-4,6,-6,7,-5,4,-8,5,-7,1,-3,-3,1,-7,-6,-7,5,-6,-7,-6,6,-5,7,-4,-1,2,1,3,0,0,3,6,5,7,4,4,7,5,6,1,2,-3,-2,-4,7,-8,-4,-8,3,-1,4,-3,6,-2,5,-7,-3,-7,2,-6,-2,-6,1,-5,-1,4,0,5,1,6,2,7,3,0,4,1,5,2,6,3,7,-5,0,0,-5,6,-3,7,-4,4,-1,5,-2,1,-6,2,-7,3,-8,-4,-8,-3,-7,-2,-6,-1,-5,-4,6,-7,-4,-8,-3,-8,2,-7,3,-2,4,-1,5,-6,-1,4,1,6,3,7,2,5,0,0,5,2,7,3,6,1,4,-6,0,0,-6,2,-8,3,-7,1,-5,6,-4,7,-3,4,-2,5,-1,-5,-2,-5,1,-4,-7,-2,-5,-1,-6,-3,-8,-3,7,-6,3,-6,-4,-8,-2,-8,1,-7,-1,6,0,7,1,4,2,5,3,2,4,3,5,0,6,1,7,-7,0,6,-1,7,-2,4,-3,5,-4,2,-5,3,-6,0,-7,1,-8,-5,-3,-5,2,-4,-6,-3,-5,-4,5,-2,-8,-1,-7,-2,7,-1,6,-3,4,-5,3,-5,-4,-8,-1,6,1,7,0,4,3,5,2,2,5,3,4,0,7,1,6,-8,0,6,-2,7,-1,4,-4,5,-3,2,-6,3,-5,0,-8,1,-7,-7,-2,-7,1,-6,-3,-6,2,-4,-5,-4,4,-3,5,-2,-7,-2,6,-1,7,-1,-8,-3,-6,-3,10,-10,-2,-9,-1,8,0,9,1,10,2,11,3,0,8,1,9,2,10,-9,0,8,-1,9,-2,10,-3,0,-9,1,-10,-10,1,-2,-10,-2,9,-1,-9,-1,8,-1,-10,-9,-2,-10,-1,8,1,10,3,11,2,9,0,0,9,3,10,1,8,-10,0,8,-2,10,-4,11,-3,9,-1,-9,1,-2,-9,-2,8,-1,9,0,-10,1,-9,-3,-9,-10,3,-9,-3,10,0,11,1,8,2,9,3,-9,2,10,-1,11,-2,8,-3,9,-4,-4,9,-3,8,-1,10,0,10,3,9,2,8,2,-9,3,-10,-3,9,-10,-3,11,0,9,2,10,1,3,8,8,3,1,10,2,9,-10,2,10,-2,11,-1,8,-4,9,-3,2,-10,3,-9,-9,3,-9,-4,-4,-9,-4,8,-3,-10,-2,10,-5,8,-9,-5,-9,4,-5,-9,4,-9,9,-6,4,8,5,9,8,-5,8,4,9,5,-6,8,-9,5,-5,9,4,-10,4,9,5,-9,5,8,8,-6,9,-5,8,5,9,4,4,10,6,-9,6,8,8,-7,8,6,10,-5,10,4,6,9,7,8,8,7,9,6,10,5];
    BUILDERS.valheimhugin = function (stack, p, r) {
      var q = p.rects[0], pr = new Preset(22, 22), base = PD.ValheimHuginPreset, W = 22;
      for (var x = 0; x < base.w; x++) for (var y = 0; y < base.h; y++) { var si = x + y * base.w, di = x + (y + 1) * W;
        if (base.tiles[si] !== -1) pr.tiles[di] = base.tiles[si]; if (base.obj[si] !== -1) { pr.obj[di] = base.obj[si]; pr.rot[di] = base.rot[si]; } }
      var lg = armsLG(pr, r, 11, 11, r.getIntBetween(5, 7), 35, 10, 2, 4, 1.5, 2.5);
      smoothEntries(lg).forEach(function (e) { if (!inP(pr, e)) return; if (pr.tiles[e.x + e.y * W] > 0) return; if (chanceD(r, e.dist / 3)) return; pr.tiles[e.x + e.y * W] = TID.overgrowngrasstile; });
      for (var i = 0; i < HUGIN.length; i += 2) { var tx = 11 + HUGIN[i], ty = 11 + HUGIN[i + 1]; if (tx < 0 || ty < 0 || tx >= W || ty >= W) continue; var k = tx + ty * W;
        if (!(pr.tiles[k] > 0)) pr.tiles[k] = TID.grasstile;
        if (pr.obj[k] > 0) continue;
        if (r.getChance(f(0.3))) pr.obj[k] = OID.grass; else if (r.getChance(f(0.1))) pr.obj[k] = OID.yellowflowerpatch; }
      var L = overlay(stack, 'surface', q[0], q[1], 22, 22);
      E.applyToLevel(pr, L, q[0], q[1], r);
      return L;
    };
    // RimworldThrumboDangerPreset(random, sand): a walled ruin of rock tiles with coffins, crates and columns
    function Zone() { this.t = new Map(); }
    Zone.prototype.has = function (x, y) { return this.t.has(x + ',' + y); };
    Zone.prototype.addRect = function (x0, y0, w, h) { for (var a = 0; a < w; a++) for (var b = 0; b < h; b++) this.t.set((x0 + a) + ',' + (y0 + b), [x0 + a, y0 + b]); };
    Zone.prototype.removeRect = function (x0, y0, w, h) { for (var a = 0; a < w; a++) for (var b = 0; b < h; b++) this.t.delete((x0 + a) + ',' + (y0 + b)); };
    Zone.prototype.tiles = function () { return Array.from(this.t.values()).sort(function (p, q) { return p[1] - q[1] || p[0] - q[0]; }); };
    Zone.prototype.edge = function (x, y) { if (!this.has(x, y)) return false; for (var i = 0; i < 8; i++) if (!this.has(x + N8[i][0], y + N8[i][1])) return true; return false; };
    BUILDERS.thrumbodanger = function (stack, p, r) {
      var q = p.rects[0], W = 30, H = 30, pr = new Preset(W, H), z = new Zone(), cx0 = 13, cy0 = 13;
      var setO = function (x, y, o) { if (x >= 0 && y >= 0 && x < W && y < H) pr.obj[x + y * W] = o; }, getO = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H ? pr.obj[x + y * W] : -1; };
      var setT = function (x, y, t) { if (x >= 0 && y >= 0 && x < W && y < H) pr.tiles[x + y * W] = t; };
      function addRect() {
        var w = r.getIntBetween((W - 4) / 4 | 0, (W - 4) / 2 | 0), h = r.getIntBetween((H - 4) / 4 | 0, (H - 4) / 2 | 0);
        var x = r.getIntBetween(cx0 - w + 1, cx0 + 4 - 1), y = r.getIntBetween(cy0 - h + 1, cy0 + 4 - 1);
        if (w > 0 && h > 0) z.addRect(x, y, w, h);
      }
      z.addRect(cx0 - 1, cy0 - 1, 6, 6);
      var n = r.getIntBetween(4, 6); for (var i = 0; i < n; i++) addRect();
      var target = (W * H) / 4 | 0, rx = 0, ry = 0, rw = 10, rh = 10;
      for (var hits = 0; hits < 3;) { if (z.has(rx + rw - 1, ry + rh - 1)) hits++; rx++; ry++; }
      for (i = 0; i < 10; i++) { z.removeRect(0, 0, rx + rw - 1, ry + rh - 1); if (z.t.size >= target) break; addRect(); }
      var fence = OID.woodfence;
      for (var x = rx; x < rx + rw; x++) { if (r.getChance(f(0.6)) && !z.has(x, ry)) setO(x, ry, fence); if (r.getChance(f(0.6)) && !z.has(x, ry + rh - 1)) setO(x, ry + rh - 1, fence); }
      for (var y = ry; y < ry + rh; y++) { if (r.getChance(f(0.6)) && !z.has(rx, y)) setO(rx, y, fence); if (r.getChance(f(0.6)) && !z.has(rx + rw - 1, y)) setO(rx + rw - 1, y, fence); }
      var tiles = z.tiles();
      tiles.forEach(function (t) { setT(t[0], t[1], TID.rocktile); setO(t[0], t[1], 0); });
      pr.pre.push({ kind: 'thrumbopre', area: true, x0: rx, y0: ry, x1: rx + rw - 1, y1: ry + rh - 1, dir: 0 });
      var lg = new G.Cave.LG(null, 15, 15, 15, 15, 0), arms = r.getIntBetween(6, 7), ang = r.nextInt(360), step = (360 / arms) | 0;
      for (i = 0; i < arms; i++) { ang += step; multiArm(lg, r, ang, 35, 14, 2, 4, 1.5, 2.5, function (l) { return !z.has(l.x2, l.y2); }); }
      smoothEntries(lg).forEach(function (e) { if (!z.has(e.x, e.y)) return; if (chanceD(r, e.dist / 3)) return; if (r.getChance(f(0.8))) setT(e.x, e.y, TID.stonefloor); });
      var used = new Set();
      function place(tk, chance, adjacent, tile, test) {
        tiles.forEach(function (t) {
          if (!r.getChance(f(chance))) return;
          var name = tk.random(r), rot = r.getIntBetween(0, 3), parts = name === 'stonecoffin' ? COFFIN[rot] : [[0, 0, 0]];
          var xs = parts.map(function (e) { return t[0] + e[0]; }), ys = parts.map(function (e) { return t[1] + e[1]; });
          var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
          if (adjacent) { x0--; y0--; x1++; y1++; }
          if (x0 < 0 || y0 < 0 || x1 >= W || y1 >= H) return;
          for (var a = x0; a <= x1; a++) for (var b = y0; b <= y1; b++) if (!test(a, b)) return;
          parts.forEach(function (e) { setO(t[0] + e[0], t[1] + e[1], OID[name] + e[2]); });
          for (a = x0; a <= x1; a++) for (b = y0; b <= y1; b++) { used.add(a + ',' + b); if (tile !== -1) setT(a, b, tile); }
        });
      }
      var tk1 = new E.Tickets(); tk1.add(10, 'stonecoffin');
      place(tk1, 0.1, true, TID.stonepathtile, function (a, b) { return !z.edge(a, b) && getO(a, b) === 0; });
      var tk2 = new E.Tickets(); tk2.add(40, 'crate').add(30, 'stonecolumn').add(20, 'surfacerocksmall');
      var used1 = new Set(used);
      place(tk2, 0.2, false, -1, function (a, b) { return !z.edge(a, b) && getO(a, b) === 0 && !used1.has(a + ',' + b); });
      tiles.forEach(function (t) { if (z.edge(t[0], t[1])) { setO(t[0], t[1], OID.stonewall); setT(t[0], t[1], TID.woodpathtile); } });
      pr = randomizeRotationAndMirror(pr, r);
      var L = overlay(stack, 'surface', q[0], q[1], 30, 30);
      E.applyToLevel(pr, L, q[0], q[1], r);
      return L;
    };
    E.EXTRA_APPLY.thrumbopre = function (a, L, x, y) {
      for (var i = x + Math.min(a.x0, a.x1); i <= x + Math.max(a.x0, a.x1); i++) for (var j = y + Math.min(a.y0, a.y1); j <= y + Math.max(a.y0, a.y1); j++) {
        if (L.isLiquid(i, j)) L.setTile(i, j, TID.sandtile);
        var o = L.getObject(i, j); if (o > 0 && SOLID[o]) L.setObject(i, j, 0);
      }
    };

    // ---------- small spots from GenerationPresetsWorldPreset: the game's preset script with the drawn sets, then mirrored and rotated as placed ----------
    var GPKEY = { surface: 'surfacepresets', cave: 'cavepresets', deepcave: 'deepcavepresets' }, GP_EXTRA = {};
    function shoreTile(L, level, x, y) {
      var C = G._internal.C(), st = L.st, b;
      if (level === 'cave' || level === 'deepcave') { b = C.caveBiomes[st.getLazyBiomeID(x, y)]; return level === 'cave' ? b.caveTile : b.deepTile; }
      b = C.surface.biomes[st.getExpensiveBiomeID(x, y)] || C.surface.biomes[1];
      return TID[E.GROUND_NAMES[b.preventsBeach ? b.terrain : b.beach]];
    }
    E.EXTRA_APPLY.gpshore = function (a, L, x, y) {
      for (var i = x + Math.min(a.x0, a.x1); i <= x + Math.max(a.x0, a.x1); i++) for (var j = y + Math.min(a.y0, a.y1); j <= y + Math.max(a.y0, a.y1); j++)
        if (L.isLiquid(i, j)) L.setTile(i, j, shoreTile(L, L.level, i, j));
    };
    function gpBuild(level) {
      return function (stack, p, r) {
        var key = GPKEY[level], cls = p.data.gp, inst = (G.GPSets[key] || [])[p.data.i], spec = G.GPSpec[cls];
        if (cls === 'FishingHut' && inst) return fishingHut(stack, p, r, inst, level);
        if (!inst || !spec) return null;
        var q = {}, args = [];
        spec.draws.forEach(function (f) { var l = inst[f] || []; (q[f] || (q[f] = [])).push(l[r.nextInt(l.length)]); });
        spec.args.forEach(function (a) { args.push(a.indexOf('set:') === 0 ? (q[a.slice(4)] || []).shift() : a === 'r' ? r : inst[a]); });
        var pr = scripted(spec.preset), ctx = { args: args, level: level, inst: inst, stack: stack, p: p };
        if (GP_EXTRA[cls] && GP_EXTRA[cls].before) GP_EXTRA[cls].before(pr, r, ctx);
        spec.reps.forEach(function (e) {
          var to = args[e[1] - 1]; if (!to || !/Set\./.test(to)) return;
          if (/^CropSet\./.test(e[0])) return;   // CropSet.replaceWith leaves the crops as they are in the game
          if (GP_EXTRA[cls] && GP_EXTRA[cls].skip && GP_EXTRA[cls].skip(e[0], ctx)) return;
          setReplace(e[0], to, pr);
        });
        if (GP_EXTRA[cls]) { var res = (GP_EXTRA[cls].after || GP_EXTRA[cls])(pr, r, ctx); if (res) pr = res; }
        if (spec.shore) { var W = pr.w, H = pr.h, ev = function (s) { return Function('W', 'H', 'return ' + s)(W, H); };
          var sx = ev(spec.shore[0]), sy = ev(spec.shore[1]), sw = ev(spec.shore[2]), sh = ev(spec.shore[3]);
          pr.pre.push({ kind: 'gpshore', area: true, x0: sx, y0: sy, x1: sx + sw - 1, y1: sy + sh - 1, dir: 0 }); }
        try {
          if (p.data.mx) pr = pr.mirror('x');
          if (p.data.my) pr = pr.mirror('y');
          if (p.data.rot) pr = pr.rotate(p.data.rot === 1 ? 'cw' : p.data.rot === 2 ? 'half' : 'acw');
        } catch (e) { return null; }   // PresetMirrorException: the game skips the spot
        var x = p.rects[0][0], y = p.rects[0][1];
        var L = overlay(stack, level, x - 1, y - 1, Math.max(pr.w, pr.h) + 2, Math.max(pr.w, pr.h) + 2);
        E.applyToLevel(pr, L, x, y, r);
        return L;
      };
    }
    function biomeOf(ctx) { return (ctx.inst.biome || '').replace('biome:', ''); }
    function repTiles(pr, a, b) { pr.replaceNonEmptyTiles(TID[a], TID[b]); }
    function repObj(pr, a, b) { var ia = OID[a], ib = b === 0 ? 0 : OID[b]; if (ia === undefined || ib === undefined) return; pr.replaceObject(ia, ib); }
    function oreToRock(pr, r, set) {   // iteratePreset: ores turn to rock one time in three
      var rock = PSETS[set] && PSETS[set].f ? PSETS[set].f.rock : null;
      for (var x = 0; x < pr.w; x++) for (var y = 0; y < pr.h; y++) { var o = pr.obj[x + y * pr.w]; if (o === -1) continue;
        if (ON[o] && ON[o].indexOf('ore') >= 0 && r.getChance(f(1 / 3)) && rock != null) pr.obj[x + y * pr.w] = rock; }
    }
    var ORE_SUFFIX = { cave: { swamp: 'swamp', snow: 'snow', desert: 'sandstone', plains: 'graniterock', forest: 'rock' }, deepcave: { swamp: 'deepswamprock', snow: 'deepsnowrock', desert: 'deepsandstone', plains: 'basaltrock', forest: 'deeprock' } };
    E.EXTRA_APPLY.gpcarpet = function (a, L, x, y, r) {
      var name = a.table ? a.table.random(r) : E.fromMap(E.CARPETS).random(r);
      for (var i = x + Math.min(a.x0, a.x1); i <= x + Math.max(a.x0, a.x1); i++) for (var j = y + Math.min(a.y0, a.y1); j <= y + Math.max(a.y0, a.y1); j++) {
        var cur = L.getObject(i, j); if (cur === 0 || (cur > 0 && /carpet$/.test(ON[cur]))) L.setObject(i, j, OID[name]); }
    };
    E.EXTRA_APPLY.gppot = function (a, L, x, y, r) {
      var rr = a.seed != null ? new G.JRandom().setSeed48(a.seed) : r, pn = E.POTS[rr.nextInt(E.POTS.length)], tx = x + a.x, ty = y + a.y, po = L.getObject(tx, ty);
      if (po === 0 || po === -2) L.setObject(tx, ty, OID[pn]);
    };
    function gpCarpet(pr, x, y, w, h, table) { pr.apply.push({ kind: 'gpcarpet', area: true, x0: x, y0: y, x1: x + w - 1, y1: y + h - 1, dir: 0, table: table || null }); }
    // PresetUtils.applyRandomPainting: picked while the preset is built, swapped in for the preset's painting when placed
    function gpPainting(pr, r, table, x, y, dir) { var name = E.fromMap(E.PAINT[table]).random(r); if (x != null) pr.apply.push({ kind: 'painting', name: name, x: x, y: y, dir: dir }); }
    function lootItem(id, amount) { return { t: 'item', cls: 'LootItem', id: id, amount: amount || ['const', 1], split: [1, 1], nomult: false }; }
    function chanceItem(chance, id, amount) { return { t: 'chanceitem', chance: chance, id: id, amount: amount || ['const', 1], split: [1, 1], nomult: false }; }
    function gpLoot(pr, x, y, items) { pr.apply.push({ kind: 'loot', table: 'preset', node: { t: 'table', cls: 'LootTable', items: items }, x: x, y: y, dir: 0 }); }
    function gpPot(pr, x, y, seed) { pr.apply.push({ kind: 'gppot', x: x, y: y, dir: 0, seed: seed }); }
    // HashMap<String, Integer> iteration order for a small map (16 buckets), as a fromMap table
    function strMapTable(entries) {
      var h = function (s) { var v = G.javaStringHash(s); return (v ^ (v >>> 16)) & 15; };
      var sorted = entries.map(function (e, i) { return { e: e, b: h(e[0]), i: i }; }).sort(function (a, b) { return a.b - b.b || a.i - b.i; });
      var t = new E.Tickets(); sorted.forEach(function (o) { t.add(o.e[1], o.e[0]); }); return t;
    }
    GP_EXTRA.VillagerCamp = function (pr, r, ctx) { if (biomeOf(ctx) === 'desert') { repTiles(pr, 'graveltile', 'sandgraveltile'); repTiles(pr, 'stonebrickfloor', 'sandstonefloor'); repTiles(pr, 'stonepathtile', 'sandstonepathtile'); } };
    GP_EXTRA.CaveHoboHome = function (pr, r, ctx) {
      repObj(pr, 'ironfence', 0);
      if (ctx.level === 'deepcave') repTiles(pr, 'deeprocktile', 'puddlecobble');
      else { setReplace('CrystalSet.ruby', 'CrystalSet.sapphire', pr); repTiles(pr, 'snowrocktile', 'puddlecobble'); repTiles(pr, 'deeprocktile', 'snowrocktile'); }
      r.nextInt(2);
    };
    GP_EXTRA.FairyTreeCircle = function (pr, r, ctx) {
      var b = biomeOf(ctx);
      if (b === 'snow') { repObj(pr, 'redflowerpatch', 0); repObj(pr, 'purpleflowerpatch', 'blueflowerpatch'); repObj(pr, 'whiteflowerpatch', 0); repObj(pr, 'appletree', 'sprucetree'); }
      if (b === 'swamp') repObj(pr, 'blueflowerpatch', 0);
    };
    GP_EXTRA.SmallCaveHomeRuin = function (pr, r, ctx) { var b = biomeOf(ctx); if (b === 'snow') repObj(pr, 'crate', 'snowcrate'); else if (b === 'swamp') repObj(pr, 'crate', 'swampcrate'); };
    GP_EXTRA.CaveFountainHall = function (pr, r, ctx) {
      var b = biomeOf(ctx), to = b === 'forest' || b === 'plains' ? 'fountain' : b === 'swamp' ? 'overgrownfountain' : null;
      r.nextInt(1);   // getRandomHostileMobNameForBiomeLevelExcept draws a mob
      if (to) ['', '2', '3', '4', '5', '6', '7', '8'].forEach(function (n) { repObj(pr, 'bloodfountain' + n, to + n); });
    };
    GP_EXTRA.LargeTempleRuins = { skip: function (base, ctx) { return base === 'FloorSet.sandstone' && biomeOf(ctx) === 'desert' && ctx.level === 'deepcave'; }, after: function () {} };
    GP_EXTRA.CaveBoomPrank = function (pr, r, ctx) { oreToRock(pr, r, ctx.args[3]); };
    GP_EXTRA.MinersOffice = function (pr, r, ctx) {
      var b = biomeOf(ctx), lv = ctx.level, rocks = PSETS[ctx.args[3]];
      if (lv !== 'surface') {
        var ores = ['ironore', 'goldore', 'copperore'];
        if (lv === 'cave') { if (b === 'swamp') ores.push('ivyore'); else if (b === 'desert') ores.push('quartz'); }
        else { ores.push('tungstenore', 'lifequartz'); if (b === 'swamp') ores.push('myceliumore'); else if (b === 'snow') ores.push('glacialore'); else if (b === 'desert') ores.push('ancientfossilore'); }
        var ore = ores[r.nextInt(ores.length)] + (ORE_SUFFIX[lv][b] || ''), gold = rocks && rocks.f ? rocks.f.goldOre : null;
        if (gold != null) pr.replaceObject(gold, OID[ore] === undefined ? -1 : OID[ore]);
      }
      oreToRock(pr, r, ctx.args[3]);
      var air = OID.air || 0;
      var crystal = ((b === 'forest' || b === 'desert') && lv === 'cave') || ((b === 'forest' || b === 'plains' || b === 'swamp') && lv === 'deepcave');
      for (var y = 4; y < 6; y++) { var c1 = r.getIntBetween(0, 1) === 1; if (y === 4 && c1 && crystal) continue;
        pr.obj[2 + y * pr.w] = air; pr.obj[3 + y * pr.w] = air; if (y === 4 && !c1 && crystal) break; }
      if (r.getIntBetween(0, 2) === 1) { pr.obj[4 + 4 * pr.w] = air; pr.obj[5 + 4 * pr.w] = air; }
      if (r.getIntBetween(0, 2) === 1) pr.obj[5 + 6 * pr.w] = air; else pr.obj[6 + 5 * pr.w] = air;
    };
    GP_EXTRA.FarmersRefuge = function (pr, r) {
      gpCarpet(pr, 8, 3, 3, 2); gpCarpet(pr, 13, 2, 4, 2); gpPainting(pr, r, 'uncommonPaintings', 2, 3, 2);
      var seed = r.nextLong48(); gpPot(pr, 13, 2, seed); gpPot(pr, 16, 2, seed); gpPot(pr, 9, 1); gpPot(pr, 7, 5);
      r.getChance(f(0.5));
    };
    GP_EXTRA.UndergroundBlacksmithShop = function (pr, r, ctx) {
      gpCarpet(pr, 13, 10, 3, 2); gpPainting(pr, r, 'uncommonPaintings', 2, 3, 2);
      // ore shelves: each has a 35% chance of one item taken from a fresh roll of the biome's deep-cave ore table
      var b = biomeOf(ctx), ores = { snow: 'deepSnowOres', plains: 'deepPlainsOres', swamp: 'deepSwampOres', desert: 'deepDesertOres' }[b] || 'deepForestOres';
      [[6, 7], [4, 9], [4, 11], [4, 13], [4, 15], [16, 11], [16, 13], [16, 15]].forEach(function (q) {
        if (!r.getChance(f(0.35))) return;
        var list = []; G.Chests.addItems(G.Chests.table(ores), list, r, 1, { level: ctx.level });
        if (!list.length) return;
        gpLoot(pr, q[0], q[1], [lootItem(list[r.nextInt(list.length)].id)]);
      });
      [[10, 10], [11, 10], [12, 10]].forEach(function (q) {   // armour stands
        if (r.getChance(f(0.25))) gpLoot(pr, q[0], q[1], ['tungstenhelmet', 'tungstenchestplate', 'tungstenboots'].map(function (id) { return chanceItem(0.25, id); }));
      });
      pr.apply.push({ kind: 'loot', table: 'blacksmithChest', x: 11, y: 7, dir: 0 });
    };
    GP_EXTRA.MageShop = function (pr, r) {
      gpPainting(pr, r, 'largeRarePaintings', 9, 5, 3); gpPainting(pr, r, 'uncommonPaintings', 9, 11, 2);
      var m1 = [['leathercarpet', 100], ['bluecarpet', 100], ['goldgridcarpet', 100], ['greencarpet', 100], ['steelgreycarpet', 100], ['purplecarpet', 80], ['velourcarpet', 80]];
      gpCarpet(pr, 4, 3, 3, 5, strMapTable(m1));
      gpCarpet(pr, 7, 12, 2, 4, strMapTable(m1.concat([['brownbearcarpet', 100], ['heartcarpet', 80], ['woolcarpet', 100]])));
      // the shelves' loot: the first item is picked now, while the shop is built; everything is rolled when it is placed
      gpLoot(pr, 8, 2, [lootItem(['sparegemstones', 'magicmanual', 'dreamcatcher'][r.nextInt(3)])]);
      [[3, 4], [7, 4], [3, 6], [7, 6]].forEach(function (q) { gpLoot(pr, q[0], q[1], [lootItem('enchantingscroll')]); });
      gpLoot(pr, 9, 11, [lootItem('coin', ['between', 10, 50]), chanceItem(0.5, 'manapotion', ['between', 1, 3]), chanceItem(0.5, 'manaregenpotion', ['between', 1, 3])]);
    };
    GP_EXTRA.DesertTavern = function (pr, r) { gpPainting(pr, r, 'commonPaintings', 10, 5, 2); gpPainting(pr, r, 'largeRarePaintings', 7, 5, 2); r.getChance(f(0.5)); };
    // PresetSet.replaceWithRandomly: every object of this set becomes a random one of the matching objects of the given sets
    function replaceRandomly(fromName, toNames, pr, r) {
      var from = PSETS[fromName]; if (!from || !from.o) return;
      for (var g = 0; g < from.o.length; g++) {
        var grp = from.o[g]; if (!grp || !grp.length) continue;
        var cand = []; toNames.forEach(function (n) { var t = PSETS[n]; if (t && t.o && t.o[g]) t.o[g].forEach(function (id) { cand.push(id); }); });
        grp.forEach(function (id) { if (id === -1) return; for (var i = 0; i < pr.obj.length; i++) if (pr.obj[i] === id) pr.obj[i] = cand[r.nextInt(cand.length)]; });
      }
    }
    GP_EXTRA.TrainingDummyPicnic = function (pr, r, ctx) { replaceRandomly('FlowerPatchSet.white', ctx.inst.flowers || [], pr, r); };
    GP_EXTRA.MageShop = (function (old) { return function (pr, r, ctx) { old(pr, r, ctx); pr.obj[3] = OID.sign; }; })(GP_EXTRA.MageShop);
    E.EXTRA_APPLY.liqsand = function (a, L, x, y) {
      for (var i = x + Math.min(a.x0, a.x1); i <= x + Math.max(a.x0, a.x1); i++) for (var j = y + Math.min(a.y0, a.y1); j <= y + Math.max(a.y0, a.y1); j++)
        if (L.isLiquid(i, j)) { L.setTile(i, j, TID.sandtile); L.setObject(i, j, 0); }
    };
    // FishingHutPreset(random, wall, floor): a hut on the shore with a jetty
    function fishingHut(stack, p, r, inst, level) {
      var wall = inst.wallSets[r.nextInt(inst.wallSets.length)], floor = +inst.floorTileIDs[r.nextInt(inst.floorTileIDs.length)], pr = scripted('FishingHutPreset');
      setReplace('WallSet.wood', wall, pr); pr.replaceTile(TID.woodpathtile, floor); r.getIntBetween(16, 32);
      pr.pre.push({ kind: 'liqsand', area: true, x0: -1, y0: -1, x1: 7, y1: pr.h, dir: 0 });
      try { if (p.data.mx) pr = pr.mirror('x'); if (p.data.my) pr = pr.mirror('y'); if (p.data.rot) pr = pr.rotate(p.data.rot === 1 ? 'cw' : p.data.rot === 2 ? 'half' : 'acw'); } catch (e) { return null; }
      var x = p.rects[0][0], y = p.rects[0][1], L = overlay(stack, level, x - 1, y - 1, 17, 17);
      E.applyToLevel(pr, L, x, y, r);
      return L;
    }
    var GPB = { surface: gpBuild('surface'), cave: gpBuild('cave'), deepcave: gpBuild('deepcave') };
    Object.keys(G.GPSpec || {}).concat(['FishingHut']).forEach(function (c) { BUILDERS['gp:' + c] = GPB; });

    // ---------- abandoned mines: hallways walked out from the middle, then rooms by ModularGeneration; both randoms seeded from the level ----------
    E.EXTRA_APPLY.skelminer = function (a, L, x, y, r) { (a.rand || r).getChance(f(a.chance)); };
    function minePreset(name, opens, kind, rand, r1, floor) {
      var pr = scripted(name); pr.sw = 1; pr.sh = 1; pr.res = 7; pr.mine = kind;
      if (kind === 'hall') { pr.replaceObject(OID.deepstonewall, 0); pr.replaceObject(OID.stonewall, OID.air || 0); pr.replaceTile(TID.stonefloor, TID.deepstonefloor); }
      else { pr.replaceObject(OID.stonewall, OID.deepstonewall); pr.replaceTile(TID.stonefloor, floor); }
      opens.forEach(function (d) { pr.open(0, 0, d); });
      return pr;
    }
    var MINE_ROOMS = [   // name, openings, chest spot, painting spot, painting drawn before the openings
      ['AbandonedMineBedroomPreset', [2, 3], [5, 4], [1, 4]], ['AbandonedMineBedroomRPreset', [0, 3], [2, 5], [2, 1]], ['AbandonedMineBlacksmithPreset', [1, 2, 3], null, [4, 5]],
      ['AbandonedMineBlacksmithRPreset', [0, 2, 3], null, [4, 1]], ['AbandonedMineCrateRoomPreset', [2, 3], null, [2, 1]], ['AbandonedMineDiningPreset', [1, 2, 3], null, null],
      ['AbandonedMineDiningRPreset', [0, 2, 3], null, [2, 1]], ['AbandonedMineLibraryPreset', [2, 3], [5, 3], [1, 4]], ['AbandonedMineLibraryRPreset', [0, 3], [3, 5], [4, 1]]];
    var MINE_PAINTINGS = E.fromMap([['paintingstonecaveling', 20], ['paintingdagger', 20], ['paintingbroken', 250], ['paintingcastle', 20], ['paintingparrot', 20], ['paintingeye', 20]]);
    E.EXTRA_APPLY.setobj = function (a, L, x, y) { L.setObject(x + a.x, y + a.y, a.id); };
    BUILDERS.deepforestabandonedmines = function (stack, p, r) {
      var q = p.rects[0], gx = p.data.gx, gy = p.data.gy, seed = G.javaStringHash('deepcave'), R0 = G.gameRandom(seed), R1 = G.gameRandom(seed);
      var L = overlay(stack, 'deepcave', q[0], q[1], q[2], q[3]);
      var mg = new E.MG(L, gx, gy, q[0], q[1], R1, 6);
      var hall = minePreset('AbandonedMineHallwayPreset', [0, 1, 2, 3], 'hall');
      hall.apply.push({ kind: 'skelminer', x: 3, y: 3, dir: 0, chance: 0.05, rand: R0 });
      function cellXY(pp) { return [q[0] + pp.cell[0] * 6, q[1] + pp.cell[1] * 6]; }
      function openDir(pp, d) {
        pp.opened[d] = true;
        if (pp.preset.mine !== 'room') return;   // hallways open onto nothing
        var c = cellXY(pp), pos = d === 0 ? [c[0] + 3, c[1]] : d === 1 ? [c[0] + 6, c[1] + 3] : d === 2 ? [c[0] + 3, c[1] + 6] : [c[0], c[1] + 3];
        L.setObject(pos[0], pos[1], R1.nextBoolean() ? OID.deepstonedoor : OID.deepstonedooropen);
      }
      function dirTo(a, b) { return a.cell[0] !== b.cell[0] ? (a.cell[0] < b.cell[0] ? 1 : 3) : (a.cell[1] < b.cell[1] ? 2 : 0); }
      function openDirs(pp, other) {
        if (!other) return;
        var d1 = dirTo(other, pp); if (!other.opened[d1]) openDir(other, d1);
        var d2 = dirTo(pp, other); if (!pp.opened[d2]) openDir(pp, d2);
      }
      mg.onApplied = function (pp) {
        for (var d = 0; d < 4; d++) {
          if (!E.placedOpen(pp, d)) continue;
          var n = mg.next(pp.cell, d), nb = mg.get(n[0], n[1]);
          if (nb && E.placedOpen(nb, d + 2)) openDirs(pp, nb);
        }
      };
      mg.onPlaced = function (nc) { var pp = mg.get(nc[0], nc[1]); if (pp) openDirs(pp, pp.from); };
      var sc = [(gx - 1) / 2 | 0, (gy - 1) / 2 | 0];
      mg.applyPreset(hall, sc, false, false, null);
      var cells = [], done = [], count = 0;
      for (var d = 0; d < 4; d++) cells.push({ c: sc, d: d });
      while (cells.length) {
        var hc = cells.splice(R1.nextInt(cells.length), 1)[0], cur = hc.c;
        for (;;) {
          var n1 = mg.next(cur, hc.d), n2 = mg.next(n1, hc.d);
          if (done.some(function (e) { return (e.c[0] === n2[0] && e.c[1] === n2[1]) || (e.c[0] === n1[0] && e.c[1] === n1[1]); })) break;
          if (n1[0] < 0 || n1[0] >= gx || n1[1] < 0 || n1[1] >= gy) break;
          if (hc.d === 0 || hc.d === 2) { if (Math.abs(n1[1] - sc[1]) % 2 === 0) { if (R1.getChance(f(0.1))) cells.push({ c: n1, d: 1 }); if (R1.getChance(f(0.1))) cells.push({ c: n1, d: 3 }); } }
          else if (Math.abs(n1[0] - sc[0]) % 2 === 0) { if (R1.getChance(f(0.1))) cells.push({ c: n1, d: 0 }); if (R1.getChance(f(0.1))) cells.push({ c: n1, d: 2 }); }
          mg.applyPreset(hall, n1, false, false, cur); count++; cur = n1;
        }
        done.push(hc);
      }
      MINE_ROOMS.forEach(function (e) {
        var pr = minePreset(e[0], e[1], 'room', R1, R1, TID.deepstonebrickfloor);
        if (e[2]) pr.apply.push({ kind: 'loot', table: 'abandonedMineChest', x: e[2][0], y: e[2][1], dir: 0 });
        if (e[3]) pr.apply.push({ kind: 'setobj', x: e[3][0], y: e[3][1], dir: 0, id: OID[MINE_PAINTINGS.random(R1)] });
        pr.apply.push({ kind: 'skelminer', x: 3, y: 3, dir: 0, chance: 0.3 });
        mg.addPreset(pr, e[0] === 'AbandonedMineCrateRoomPreset' ? 150 : 100);
      });
      mg.ticks((count * 1.5) | 0);
      mg.placed.forEach(function (pp) {
        if (pp.preset.mine !== 'hall') return;
        var c = cellXY(pp);
        for (var d = 0; d < 4; d++) {
          var n = mg.next(pp.cell, d); if (mg.get(n[0], n[1])) continue;
          for (var i = 0; i < 7; i++) { if (d === 0) L.setObject(c[0] + i, c[1], OID.deepstonewall); else if (d === 2) L.setObject(c[0] + i, c[1] + 6, OID.deepstonewall);
            else if (d === 1) L.setObject(c[0] + 6, c[1] + i, OID.deepstonewall); else L.setObject(c[0], c[1] + i, OID.deepstonewall); }
        }
      });
      return L;
    };

    // ---------- loot areas (RandomLootAreaPreset) ----------
    function lootArea(column) {
      return function (stack, p, r) {
        var q = p.rects[0], size = q[2], pr = new Preset(size, size), half = size / 2 | 0, rad = half * 32, wood = TID.woodfloor;
        var items = [OID.crate, OID.vase, OID.coinstack], cx = half * 32 + 16;
        for (var x = 0; x < size; x++) for (var y = 0; y < size; y++) {
          var dx = cx - (x * 32 + 16), dy = cx - (y * 32 + 16), d = f(Math.sqrt(dx * dx + dy * dy)), v = f(d / f(rad)), i = x + y * size;
          if (v < 0.5) { pr.tiles[i] = wood; pr.obj[i] = 0; }
          else if (v <= 1 && r.getChance(f(Math.abs(f(f(f(v - 0.5) * 2) - 1)) * 2))) { if (r.getChance(f(0.75))) pr.tiles[i] = wood; pr.obj[i] = 0; }
          if (v <= 1 && pr.obj[i] !== -1 && r.getChance(f(0.12))) pr.obj[i] = items[r.nextInt(3)];
        }
        var n = r.getIntBetween(3, 4), ang = f(r.nextInt(360)), step = f(360 / n), col = OID[column];
        for (var k = 0; k < n; k++) {
          ang = f(ang + r.getFloatBetween(f(step - f(step / 10)), f(step + f(step / 10))));
          var dist = f(size / 4), px = Math.trunc(f(half + f(G.Cave.cos(ang) * dist))), py = Math.trunc(f(half + f(G.Cave.sin(ang) * dist)));
          if (px >= 0 && py >= 0 && px < size && py < size) pr.obj[px + py * size] = col;
        }
        var L = overlay(stack, 'cave', q[0], q[1], size, size);
        E.applyToLevel(pr, L, q[0], q[1], r);
        return L;
      };
    }
    BUILDERS.forestlootareas = lootArea('stonecolumn');
    BUILDERS.snowlootareas = lootArea('snowstonecolumn');

    // ---------- region tiles (RegionTileWorldPresetGenerator): per 16x16 region, tile functions in insertion order ----------
    var TILEFN = {
      cursedcronearena: function (r, L, x, y) {
        L.setTile(x, y, TID.spiritwatertile); L.setObject(x, y, 0);
        if (r.getChance(f(0.1))) L.setObject(x, y, OID.watergrass);
        else if (r.getChance(f(0.01))) L.setObject(x, y, OID.dryadtree);
        else if (r.getChance(f(0.02))) L.setObject(x, y, OID.waterlantern);
        else if (r.getChance(f(0.02))) L.setObject(x, y, OID.crate);
      },
      chieftainarena: function (r, L, x, y) {
        L.setTile(x, y, r.getChance(f(0.25)) ? TID.graveltile : TID.graniterocktile);
        var o = objAt(L, x, y);
        if (!(o > 0 && /minecarttrack|track$/.test(ON[o]))) { L.setObject(x, y, 0); if (r.getChance(f(0.04))) L.setObject(x, y, OID.crate); }
      }
    };
    TILEFN.minecarttracks = function (r, L, x, y, fn) {
      if (fn === 1) {
        if (SOLID[objAt(L, x, y)]) L.setObject(x, y, 0);
        else if (L.getObject(x, y) === -2) (L.clearSolid || (L.clearSolid = new Set())).add(x + ',' + y);   // the decoration's rocks and crates: see packOverlay
        if (chanceD(r, 0.05)) { var co = objAt(L, x, y); if ((co === 0 || GF[co]) && !L.isLiquid(x, y)) L.setObject(x, y, OID.crate); }   // grass gives way
      } else if (fn === 2) L.setObject(x, y, OID.minecarttrack);
      else if (fn === 6) { if (SOLID[objAt(L, x, y)]) L.setObject(x, y, 0); else if (L.getObject(x, y) === -2) (L.clearSolid || (L.clearSolid = new Set())).add(x + ',' + y); }
      else if (fn === 7) L.setObject(x, y, OID.rocklever);
      else if (fn === 8) L.setObject(x, y, OID.tnt);
    };
    TILEFN.deserttemple = function (r, L, x, y, fn, ctx) {
      if (fn === 5) { if (ctx) templeFurniture(r, L, x, y, ctx); return; }
      if (fn === 1) { L.setTile(x, y, r.getChance(f(0.75)) ? TID.sandbrick : TID.woodfloor); L.setObject(x, y, 0); }
      else if (fn === 2) L.setObject(x, y, OID.deepsandstonewall);
      else if (fn === 3 || fn === 4) {
        if (!r.getChance(f(fn === 3 ? 0.02 : 0.05))) return;
        var o = r.nextInt(2) ? OID.vase : OID.crate;
        if (objAt(L, x, y) === 0 && !L.isLiquid(x, y)) L.setObject(x, y, o);
      }
    };
    // ---------- desert temple furniture (CellAutomaton.placeFurnitureGettersPresets with GenerationTools.generateFurnitureGetters) ----------
    // The 11 palm presets (BedDresser, Bench, BookshelfClock, Bookshelves 3, Cabinets 3, DeskBookshelf, DinnerTable, DisplayStandClock,
    // ModularDinnerTable 1, ModularTables 2 with chairs, SingleChest), exported from the game for x-mirror {no, yes} x rotation
    // {none, clockwise, anti-clockwise, half}: objects [x, y, name, rotation] and the rows that must be wall ("pred" areas).
    var FURN = [[{"w":3,"h":3,"o":[[0,0,"palmbed2",3],[1,0,"palmbed",3],[2,0,"palmdresser",2]],"pred":[[0,-1,2,-1]]},{"w":3,"h":3,"o":[[2,0,"palmbed2",0],[2,1,"palmbed",0],[2,2,"palmdresser",3]],"pred":[[3,0,3,2]]},{"w":3,"h":3,"o":[[0,0,"palmdresser",1],[0,1,"palmbed",2],[0,2,"palmbed2",2]],"pred":[[-1,2,-1,0]]},{"w":3,"h":3,"o":[[0,2,"palmdresser",0],[1,2,"palmbed",1],[2,2,"palmbed2",1]],"pred":[[2,3,0,3]]},{"w":3,"h":3,"o":[[0,0,"palmdresser",2],[1,0,"palmbed",1],[2,0,"palmbed2",1]],"pred":[[2,-1,0,-1]]},{"w":3,"h":3,"o":[[2,0,"palmdresser",3],[2,1,"palmbed",2],[2,2,"palmbed2",2]],"pred":[[3,2,3,0]]},{"w":3,"h":3,"o":[[0,0,"palmbed2",0],[0,1,"palmbed",0],[0,2,"palmdresser",1]],"pred":[[-1,0,-1,2]]},{"w":3,"h":3,"o":[[0,2,"palmbed2",3],[1,2,"palmbed",3],[2,2,"palmdresser",0]],"pred":[[0,3,2,3]]}],[{"w":2,"h":3,"o":[[0,0,"palmbench",1],[1,0,"palmbench2",1]],"pred":[[0,-1,1,-1]]},{"w":3,"h":2,"o":[[2,0,"palmbench",2],[2,1,"palmbench2",2]],"pred":[[3,0,3,1]]},{"w":3,"h":2,"o":[[0,0,"palmbench2",0],[0,1,"palmbench",0]],"pred":[[-1,1,-1,0]]},{"w":2,"h":3,"o":[[0,2,"palmbench2",3],[1,2,"palmbench",3]],"pred":[[1,3,0,3]]},{"w":2,"h":3,"o":[[0,0,"palmbench",1],[1,0,"palmbench2",1]],"pred":[[1,-1,0,-1]]},{"w":3,"h":2,"o":[[2,0,"palmbench",2],[2,1,"palmbench2",2]],"pred":[[3,1,3,0]]},{"w":3,"h":2,"o":[[0,0,"palmbench2",0],[0,1,"palmbench",0]],"pred":[[-1,0,-1,1]]},{"w":2,"h":3,"o":[[0,2,"palmbench2",3],[1,2,"palmbench",3]],"pred":[[0,3,1,3]]}],[{"w":3,"h":3,"o":[[0,0,"palmbookshelf",2],[1,0,"palmclock",2],[2,0,"palmbookshelf",2]],"pred":[[0,-1,2,-1]]},{"w":3,"h":3,"o":[[2,0,"palmbookshelf",3],[2,1,"palmclock",3],[2,2,"palmbookshelf",3]],"pred":[[3,0,3,2]]},{"w":3,"h":3,"o":[[0,0,"palmbookshelf",1],[0,1,"palmclock",1],[0,2,"palmbookshelf",1]],"pred":[[-1,2,-1,0]]},{"w":3,"h":3,"o":[[0,2,"palmbookshelf",0],[1,2,"palmclock",0],[2,2,"palmbookshelf",0]],"pred":[[2,3,0,3]]},{"w":3,"h":3,"o":[[0,0,"palmbookshelf",2],[1,0,"palmclock",2],[2,0,"palmbookshelf",2]],"pred":[[2,-1,0,-1]]},{"w":3,"h":3,"o":[[2,0,"palmbookshelf",3],[2,1,"palmclock",3],[2,2,"palmbookshelf",3]],"pred":[[3,2,3,0]]},{"w":3,"h":3,"o":[[0,0,"palmbookshelf",1],[0,1,"palmclock",1],[0,2,"palmbookshelf",1]],"pred":[[-1,0,-1,2]]},{"w":3,"h":3,"o":[[0,2,"palmbookshelf",0],[1,2,"palmclock",0],[2,2,"palmbookshelf",0]],"pred":[[0,3,2,3]]}],[{"w":3,"h":3,"o":[[0,0,"palmbookshelf",2],[1,0,"palmbookshelf",2],[2,0,"palmbookshelf",2]],"pred":[[0,-1,2,-1]]},{"w":3,"h":3,"o":[[2,0,"palmbookshelf",3],[2,1,"palmbookshelf",3],[2,2,"palmbookshelf",3]],"pred":[[3,0,3,2]]},{"w":3,"h":3,"o":[[0,0,"palmbookshelf",1],[0,1,"palmbookshelf",1],[0,2,"palmbookshelf",1]],"pred":[[-1,2,-1,0]]},{"w":3,"h":3,"o":[[0,2,"palmbookshelf",0],[1,2,"palmbookshelf",0],[2,2,"palmbookshelf",0]],"pred":[[2,3,0,3]]},{"w":3,"h":3,"o":[[0,0,"palmbookshelf",2],[1,0,"palmbookshelf",2],[2,0,"palmbookshelf",2]],"pred":[[2,-1,0,-1]]},{"w":3,"h":3,"o":[[2,0,"palmbookshelf",3],[2,1,"palmbookshelf",3],[2,2,"palmbookshelf",3]],"pred":[[3,2,3,0]]},{"w":3,"h":3,"o":[[0,0,"palmbookshelf",1],[0,1,"palmbookshelf",1],[0,2,"palmbookshelf",1]],"pred":[[-1,0,-1,2]]},{"w":3,"h":3,"o":[[0,2,"palmbookshelf",0],[1,2,"palmbookshelf",0],[2,2,"palmbookshelf",0]],"pred":[[0,3,2,3]]}],[{"w":3,"h":3,"o":[[0,0,"palmcabinet",2],[1,0,"palmcabinet",2],[2,0,"palmcabinet",2]],"pred":[[0,-1,2,-1]]},{"w":3,"h":3,"o":[[2,0,"palmcabinet",3],[2,1,"palmcabinet",3],[2,2,"palmcabinet",3]],"pred":[[3,0,3,2]]},{"w":3,"h":3,"o":[[0,0,"palmcabinet",1],[0,1,"palmcabinet",1],[0,2,"palmcabinet",1]],"pred":[[-1,2,-1,0]]},{"w":3,"h":3,"o":[[0,2,"palmcabinet",0],[1,2,"palmcabinet",0],[2,2,"palmcabinet",0]],"pred":[[2,3,0,3]]},{"w":3,"h":3,"o":[[0,0,"palmcabinet",2],[1,0,"palmcabinet",2],[2,0,"palmcabinet",2]],"pred":[[2,-1,0,-1]]},{"w":3,"h":3,"o":[[2,0,"palmcabinet",3],[2,1,"palmcabinet",3],[2,2,"palmcabinet",3]],"pred":[[3,2,3,0]]},{"w":3,"h":3,"o":[[0,0,"palmcabinet",1],[0,1,"palmcabinet",1],[0,2,"palmcabinet",1]],"pred":[[-1,0,-1,2]]},{"w":3,"h":3,"o":[[0,2,"palmcabinet",0],[1,2,"palmcabinet",0],[2,2,"palmcabinet",0]],"pred":[[0,3,2,3]]}],[{"w":2,"h":4,"o":[[0,0,"palmdesk",2],[1,0,"palmbookshelf",2],[0,1,"palmchair",0],[1,1,"air",0]],"pred":[[0,-1,1,-1]]},{"w":4,"h":2,"o":[[2,0,"palmchair",1],[3,0,"palmdesk",3],[2,1,"air",1],[3,1,"palmbookshelf",3]],"pred":[[4,0,4,1]]},{"w":4,"h":2,"o":[[0,0,"palmbookshelf",1],[1,0,"air",3],[0,1,"palmdesk",1],[1,1,"palmchair",3]],"pred":[[-1,1,-1,0]]},{"w":2,"h":4,"o":[[0,2,"air",2],[1,2,"palmchair",2],[0,3,"palmbookshelf",0],[1,3,"palmdesk",0]],"pred":[[1,4,0,4]]},{"w":2,"h":4,"o":[[0,0,"palmbookshelf",2],[1,0,"palmdesk",2],[0,1,"air",0],[1,1,"palmchair",0]],"pred":[[1,-1,0,-1]]},{"w":4,"h":2,"o":[[2,0,"air",1],[3,0,"palmbookshelf",3],[2,1,"palmchair",1],[3,1,"palmdesk",3]],"pred":[[4,1,4,0]]},{"w":4,"h":2,"o":[[0,0,"palmdesk",1],[1,0,"palmchair",3],[0,1,"palmbookshelf",1],[1,1,"air",3]],"pred":[[-1,0,-1,1]]},{"w":2,"h":4,"o":[[0,2,"palmchair",2],[1,2,"air",2],[0,3,"palmdesk",0],[1,3,"palmbookshelf",0]],"pred":[[0,4,1,4]]}],[{"w":3,"h":4,"o":[[0,0,"palmchair",1],[1,0,"palmdinnertable",2],[2,0,"palmchair",3],[0,1,"palmchair",1],[1,1,"palmdinnertable2",2],[2,1,"palmchair",3]],"pred":[[0,-1,2,-1]]},{"w":4,"h":3,"o":[[2,0,"palmchair",2],[3,0,"palmchair",2],[2,1,"palmdinnertable2",3],[3,1,"palmdinnertable",3],[2,2,"palmchair",0],[3,2,"palmchair",0]],"pred":[[4,0,4,2]]},{"w":4,"h":3,"o":[[0,0,"palmchair",2],[1,0,"palmchair",2],[0,1,"palmdinnertable",1],[1,1,"palmdinnertable2",1],[0,2,"palmchair",0],[1,2,"palmchair",0]],"pred":[[-1,2,-1,0]]},{"w":3,"h":4,"o":[[0,2,"palmchair",1],[1,2,"palmdinnertable2",0],[2,2,"palmchair",3],[0,3,"palmchair",1],[1,3,"palmdinnertable",0],[2,3,"palmchair",3]],"pred":[[2,4,0,4]]},{"w":3,"h":4,"o":[[0,0,"palmchair",1],[1,0,"palmdinnertable",2],[2,0,"palmchair",3],[0,1,"palmchair",1],[1,1,"palmdinnertable2",2],[2,1,"palmchair",3]],"pred":[[2,-1,0,-1]]},{"w":4,"h":3,"o":[[2,0,"palmchair",2],[3,0,"palmchair",2],[2,1,"palmdinnertable2",3],[3,1,"palmdinnertable",3],[2,2,"palmchair",0],[3,2,"palmchair",0]],"pred":[[4,2,4,0]]},{"w":4,"h":3,"o":[[0,0,"palmchair",2],[1,0,"palmchair",2],[0,1,"palmdinnertable",1],[1,1,"palmdinnertable2",1],[0,2,"palmchair",0],[1,2,"palmchair",0]],"pred":[[-1,0,-1,2]]},{"w":3,"h":4,"o":[[0,2,"palmchair",1],[1,2,"palmdinnertable2",0],[2,2,"palmchair",3],[0,3,"palmchair",1],[1,3,"palmdinnertable",0],[2,3,"palmchair",3]],"pred":[[0,4,2,4]]}],[{"w":2,"h":3,"o":[[0,0,"palmdisplay",2],[1,0,"palmclock",2]],"pred":[[0,-1,1,-1]]},{"w":3,"h":2,"o":[[2,0,"palmdisplay",3],[2,1,"palmclock",3]],"pred":[[3,0,3,1]]},{"w":3,"h":2,"o":[[0,0,"palmclock",1],[0,1,"palmdisplay",1]],"pred":[[-1,1,-1,0]]},{"w":2,"h":3,"o":[[0,2,"palmclock",0],[1,2,"palmdisplay",0]],"pred":[[1,3,0,3]]},{"w":2,"h":3,"o":[[0,0,"palmclock",2],[1,0,"palmdisplay",2]],"pred":[[1,-1,0,-1]]},{"w":3,"h":2,"o":[[2,0,"palmclock",3],[2,1,"palmdisplay",3]],"pred":[[3,1,3,0]]},{"w":3,"h":2,"o":[[0,0,"palmdisplay",1],[0,1,"palmclock",1]],"pred":[[-1,0,-1,1]]},{"w":2,"h":3,"o":[[0,2,"palmdisplay",0],[1,2,"palmclock",0]],"pred":[[0,3,1,3]]}],[{"w":3,"h":3,"o":[[0,0,"palmchair",1],[1,0,"palmmodulartable",2],[2,0,"palmchair",3]],"pred":[[0,-1,2,-1]]},{"w":3,"h":3,"o":[[2,0,"palmchair",2],[2,1,"palmmodulartable",3],[2,2,"palmchair",0]],"pred":[[3,0,3,2]]},{"w":3,"h":3,"o":[[0,0,"palmchair",2],[0,1,"palmmodulartable",1],[0,2,"palmchair",0]],"pred":[[-1,2,-1,0]]},{"w":3,"h":3,"o":[[0,2,"palmchair",1],[1,2,"palmmodulartable",0],[2,2,"palmchair",3]],"pred":[[2,3,0,3]]},{"w":3,"h":3,"o":[[0,0,"palmchair",1],[1,0,"palmmodulartable",2],[2,0,"palmchair",3]],"pred":[[2,-1,0,-1]]},{"w":3,"h":3,"o":[[2,0,"palmchair",2],[2,1,"palmmodulartable",3],[2,2,"palmchair",0]],"pred":[[3,2,3,0]]},{"w":3,"h":3,"o":[[0,0,"palmchair",2],[0,1,"palmmodulartable",1],[0,2,"palmchair",0]],"pred":[[-1,0,-1,2]]},{"w":3,"h":3,"o":[[0,2,"palmchair",1],[1,2,"palmmodulartable",0],[2,2,"palmchair",3]],"pred":[[0,3,2,3]]}],[{"w":2,"h":4,"o":[[0,0,"palmmodulartable",2],[1,0,"palmmodulartable",2],[0,1,"palmchair",0],[1,1,"palmchair",0]],"pred":[[0,-1,1,-1]]},{"w":4,"h":2,"o":[[2,0,"palmchair",1],[3,0,"palmmodulartable",3],[2,1,"palmchair",1],[3,1,"palmmodulartable",3]],"pred":[[4,0,4,1]]},{"w":4,"h":2,"o":[[0,0,"palmmodulartable",1],[1,0,"palmchair",3],[0,1,"palmmodulartable",1],[1,1,"palmchair",3]],"pred":[[-1,1,-1,0]]},{"w":2,"h":4,"o":[[0,2,"palmchair",2],[1,2,"palmchair",2],[0,3,"palmmodulartable",0],[1,3,"palmmodulartable",0]],"pred":[[1,4,0,4]]},{"w":2,"h":4,"o":[[0,0,"palmmodulartable",2],[1,0,"palmmodulartable",2],[0,1,"palmchair",0],[1,1,"palmchair",0]],"pred":[[1,-1,0,-1]]},{"w":4,"h":2,"o":[[2,0,"palmchair",1],[3,0,"palmmodulartable",3],[2,1,"palmchair",1],[3,1,"palmmodulartable",3]],"pred":[[4,1,4,0]]},{"w":4,"h":2,"o":[[0,0,"palmmodulartable",1],[1,0,"palmchair",3],[0,1,"palmmodulartable",1],[1,1,"palmchair",3]],"pred":[[-1,0,-1,1]]},{"w":2,"h":4,"o":[[0,2,"palmchair",2],[1,2,"palmchair",2],[0,3,"palmmodulartable",0],[1,3,"palmmodulartable",0]],"pred":[[0,4,1,4]]}],[{"w":3,"h":3,"o":[[0,0,"air",2],[1,0,"palmchest",2],[2,0,"air",2]],"pred":[[0,-1,2,-1]]},{"w":3,"h":3,"o":[[2,0,"air",3],[2,1,"palmchest",3],[2,2,"air",3]],"pred":[[3,0,3,2]]},{"w":3,"h":3,"o":[[0,0,"air",1],[0,1,"palmchest",1],[0,2,"air",1]],"pred":[[-1,2,-1,0]]},{"w":3,"h":3,"o":[[0,2,"air",0],[1,2,"palmchest",0],[2,2,"air",0]],"pred":[[2,3,0,3]]},{"w":3,"h":3,"o":[[0,0,"air",2],[1,0,"palmchest",2],[2,0,"air",2]],"pred":[[2,-1,0,-1]]},{"w":3,"h":3,"o":[[2,0,"air",3],[2,1,"palmchest",3],[2,2,"air",3]],"pred":[[3,2,3,0]]},{"w":3,"h":3,"o":[[0,0,"air",1],[0,1,"palmchest",1],[0,2,"air",1]],"pred":[[-1,0,-1,2]]},{"w":3,"h":3,"o":[[0,2,"air",0],[1,2,"palmchest",0],[2,2,"air",0]],"pred":[[0,3,2,3]]}]];
    var WALLS = {}; ["woodwall","woodwindow","pinewall","pinewindow","palmwall","palmwindow","willowwall","willowwindow","dryadwall","dryadwindow","bamboowall","bamboowindow","stonewall","stonewindow","sandstonewall","sandstonewindow","swampstonewall","swampstonewindow","snowstonewall","snowstonewindow","granitewall","granitewindow","icewall","icewindow","brickwall","brickwindow","dungeonwall","dungeonwindow","deepstonewall","deepstonewindow","obsidianwall","obsidianwindow","deepsnowstonewall","deepsnowstonewindow","basaltwall","basaltwindow","deepswampstonewall","deepswampstonewindow","deepsandstonewall","deepsandstonewindow","cryptwall","cryptwindow","spidercastlewall","spidercastlewindow","dawnwall","dawnwindow","duskwall","duskwindow","ancientruinwall","ancientruinwindow","ravenwall","ravenwindow","arcanicwall","arcanicwindow","factorywall","factorywindow","woodarrowtrap","woodsawtrap","dryadarrowtrap","stoneflametrap","stonearrowtrap","stonesawtrap","sandstoneflametrap","sandstonearrowtrap","sandstonesawtrap","swampstoneflametrap","swampstonearrowtrap","swampstonesawtrap","snowstonearrowtrap","snowstonesawtrap","icearrowtrap","icesawtrap","graniteflametrap","granitearrowtrap","granitesawtrap","dungeonflametrap","dungeonarrowtrap","dungeonvoidtrap","dungeonsawtrap","deepstoneflametrap","deepstonearrowtrap","deepstonesawtrap","obsidianflametrap","obsidianarrowtrap","obsidiansawtrap","deepsnowstoneflametrap","deepsnowstonearrowtrap","deepsnowstonesawtrap","basaltflametrap","basaltarrowtrap","basaltsawtrap","deepswampstoneflametrap","deepswampstonearrowtrap","deepswampstonesawtrap","deepsandstoneflametrap","deepsandstonearrowtrap","deepsandstonesawtrap","spidercastlearrowtrap","factoryflametrap","factoryexplosivebarreltrap"].forEach(function (n) { if (OID[n] !== undefined) WALLS[OID[n]] = 1; });
    function templeFurniture(r, L, x, y, ctx) {
      if (!r.getChance(f(0.2))) return;
      function free(gx, gy) { return objAt(L, gx, gy) === 0 && ctx.alive.has(gx, gy); }
      function tryPlace(v) {
        for (var a = 0; a < v.w; a++) for (var b = 0; b < v.h; b++) if (!free(x + a, y + b)) return false;
        for (var i = 0; i < v.pred.length; i++) {
          var q = v.pred[i];
          for (var px = Math.min(q[0], q[2]); px <= Math.max(q[0], q[2]); px++) for (var py = Math.min(q[1], q[3]); py <= Math.max(q[1], q[3]); py++)
            if (!WALLS[objAt(L, x + px, y + py)]) return false;
        }
        v.o.forEach(function (e) {
          var id = OID[e[2]]; L.setObject(x + e[0], y + e[1], id);
          if (e[2] === 'palmchest') { var cx = x + e[0], cy = y + e[1]; L.chests[cx + ',' + cy] = { x: cx, y: cy, table: 'desertTempleChest', items: G.Chests.rollTable('desertTempleChest', r, { level: 'deepcave' }) }; }
        });
        return true;
      }
      var left = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      while (left.length) {
        var pi = left.splice((r.nextInt(left.length * 100) / 100) | 0, 1)[0], sup = [0, 1, 2, 3];   // equal tickets of 100
        while (sup.length) {
          var k = sup.splice(r.nextInt(sup.length), 1)[0], m = r.nextBoolean() ? 1 : 0;   // PresetUtils.randomizeXMirror, then the supplier's rotation
          if (tryPlace(FURN[pi][m * 4 + k])) return;
        }
      }
    }
    // The temple is generated region by region, and furniture can reach over a region's edge, so the whole temple is worked out
    // once (its regions in listed order, each with its own random) and every region shows its part of it.
    function wholeTemple(stack, p) {
      var g = p.data.group.filter(function (q) { return !q.skip; });
      if (p.data.group._L && p.data.group._seed === stack.seed) return p.data.group._L;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      g.forEach(function (q) { var e = q.rects[0]; x0 = Math.min(x0, e[0]); y0 = Math.min(y0, e[1]); x1 = Math.max(x1, e[0] + 16); y1 = Math.max(y1, e[1] + 16); });
      var prev = stack._shared; stack._shared = null;
      try { var BL = overlay(stack, 'deepcave', x0, y0, x1 - x0, y1 - y0, 4); } finally { stack._shared = prev; }
      // Regions load in rows here (the order a fresh map loads them). In the game, reading an object in a region that is not
      // loaded yet gives air without loading it, while setting one loads (and so generates) that region first.
      var byKey = {}, state = {}, TL = Object.create(BL);
      g.forEach(function (q) { byKey[(q.rects[0][0] >> 4) + ',' + (q.rects[0][1] >> 4)] = q; });
      function rk(x, y) { return (x >> 4) + ',' + (y >> 4); }
      var loaded = {};   // regions generated so far: the run of the temple's area generates all of its regions before placing
      TL.getObject = function (x, y) { var k = rk(x, y); return byKey[k] && !state[k] && !loaded[k] ? 0 : BL.getObject(x, y); };
      TL.setObject = function (x, y, id) { var k = rk(x, y); if (byKey[k] && !state[k] && !loaded[k]) start(byKey[k]); BL.setObject(x, y, id); };
      function run(q) {
        var k = rk(q.rects[0][0], q.rects[0][1]); if (state[k]) return; state[k] = 1;
        var r = G.Chests.placeRandom(stack.seed, q), t = q.data.tiles;
        for (var i = 0; i < t.length; i += 3) TILEFN.deserttemple(r, TL, t[i], t[i + 1], t[i + 2], q.data.ctx);
      }
      // The pieces in the temple's own 40 x 40 area share regions with it, so they form one generation run: the first of
      // those regions to be generated places them all, in listed order. Every other piece is placed when its own region is.
      var main = g[0].data.ctx && g[0].data.ctx.main, inMain = {}, mainRun = [];
      if (main) for (var mx = main[0] >> 4; mx <= (main[0] + main[2] - 1) >> 4; mx++) for (var my = main[1] >> 4; my <= (main[1] + main[3] - 1) >> 4; my++) inMain[mx + ',' + my] = 1;
      g.forEach(function (q) { if (inMain[rk(q.rects[0][0], q.rects[0][1])]) mainRun.push(q); });
      var mainDone = false;
      function startMain() { if (mainDone) return; mainDone = true; Object.keys(inMain).forEach(function (k) { loaded[k] = 1; }); mainRun.forEach(run); }
      function start(q) {
        if (inMain[rk(q.rects[0][0], q.rects[0][1])]) startMain();
        else run(q);
      }
      var order = g.slice(); if (G.TEMPLE_ORDER !== 'list') order.sort(function (a, b) { return a.rects[0][1] - b.rects[0][1] || a.rects[0][0] - b.rects[0][0]; });
      // the regions of the temple's area that hold no piece still start its run when the game reaches them
      Object.keys(inMain).forEach(function (k) { if (!byKey[k]) { var c = k.split(','); order.push({ rects: [[+c[0] * 16, +c[1] * 16, 16, 16]], _mainOnly: true }); } });
      order.sort(function (a, b) { return (a.rects[0][1] >> 4) - (b.rects[0][1] >> 4) || (a.rects[0][0] >> 4) - (b.rects[0][0] >> 4); });
      order.forEach(function (q) { if (q._mainOnly) startMain(); else start(q); });
      p.data.group._L = BL; p.data.group._seed = stack.seed;
      return BL;
    }
    function templeRegion(stack, p) {
      if (!p.data.group) return regionTiles('deepcave', 'deserttemple')(stack, p, G.Chests.placeRandom(stack.seed, p));
      var BL = wholeTemple(stack, p), q = p.rects[0], L = overlay(stack, 'deepcave', q[0], q[1], 16, 16);
      for (var x = q[0]; x < q[0] + 16; x++) for (var y = q[1]; y < q[1] + 16; y++) {
        var t = BL.getTile(x, y), o = BL.getObject(x, y);
        if (t !== -2) L.setTile(x, y, t); if (o !== -2) L.setObject(x, y, o);
      }
      Object.keys(BL.chests).forEach(function (k) { var c = BL.chests[k]; if (c.x >= q[0] && c.x < q[0] + 16 && c.y >= q[1] && c.y < q[1] + 16) L.chests[k] = c; });
      L.direct = true;   // walls and crates are set directly, as the game does; the validity pass would remove some
      return L;
    }
    // GameObject.canPlace for generated objects: free spot, not on liquid (unless it may be), grass on its own tiles and not too crowded
    function canPlaceObj(L, id, x, y) {
      if (objAt(L, x, y) !== 0) return false;
      var t = L.getTile(x, y); if (t === -2) t = L.ground ? L.ground(x, y) : TID[E.groundTile(L.st, x, y)];
      var g = GF[id];
      if (g) {
        if (!GRASS[id][t]) return false;
        if (g[2] > 0) { var n = 0; for (var i = 0; i < 8; i++) if (GF[objAt(L, x + N8[i][0], y + N8[i][1])] && ++n > g[2]) return false; }
        return true;
      }
      return !LIQUID[t];
    }
    TILEFN.deepswampfishianbiome = function (r, L, x, y, fn) {
      if (fn === 1) { L.setTile(x, y, TID.puddlecobble); L.setObject(x, y, 0); }
      else if (fn === 2) { if (r.getChance(f(0.8))) L.setTile(x, y, TID.deepswampstonefloor); L.setObject(x, y, 0); }
      else if (fn === 3) {
        L.setTile(x, y, TID.watertile); L.setObject(x, y, 0);
        if (r.getChance(f(0.1)) && canPlaceObj(L, OID.reeds, x, y)) L.setObject(x, y, OID.reeds);
        if (r.getChance(f(0.1)) && canPlaceObj(L, OID.cattail, x, y)) L.setObject(x, y, OID.cattail);
      } else if (fn === 4) L.setTile(x, y, TID.puddlecobble);
      else if (fn === 5) { var o = FISH_DECOR.random(r); if (canPlaceObj(L, o, x, y)) L.setObject(x, y, o); }
    };
    var CHARRED = new E.Tickets(); [[20, 'burnedtree'], [30, 'burnedbush'], [5, 'burnedtreestump'], [2, 'burnedlogbench'], [10, 'burnedleafpile'], [10, 'charredrock'], [20, 'charredrocksmall']].forEach(function (e) { CHARRED.add(e[0], e[1]); });
    var CHARRED_PARTS = { burnedlogbench: [[[0, -1, 1], [0, 0, 0]], [[0, 0, 0], [1, 0, 1]], [[0, 0, 0], [0, 1, 1]], [[-1, 0, 1], [0, 0, 0]]], charredrock: [[[0, 0, 0], [1, 0, 1]]] };
    TILEFN.charredforest = function (r, L, x, y, fn) {
      if (fn === 1) { L.setTile(x, y, L.isLiquid(x, y) ? (r.getChance(f(0.1)) ? TID.ashtile : TID.graveltile) : TID.ashtile); L.setObject(x, y, 0); }
      else if (fn === 2) { if (!L.isLiquid(x, y) && r.getChance(f(0.8))) L.setTile(x, y, TID.graveltile); }
      else if (fn === 3) {
        if (L.getTile(x, y) !== TID.ashtile) return;
        var name = CHARRED.random(r), rot = r.nextInt(4), parts = CHARRED_PARTS[name] ? CHARRED_PARTS[name][CHARRED_PARTS[name].length > 1 ? rot : 0] : [[0, 0, 0]], id = OID[name];
        for (var i = 0; i < parts.length; i++) if (!canPlaceObj(L, id + parts[i][2], x + parts[i][0], y + parts[i][1])) return;
        parts.forEach(function (e) { L.setObject(x + e[0], y + e[1], id + e[2]); });
      }
    };
    function regionTiles(level, id) {
      return function (stack, p, r) {
        var q = p.rects[0], L = overlay(stack, level, q[0], q[1], 16, 16), t = (p.data && p.data.tiles) || [], fn = TILEFN[id];
        for (var i = 0; i < t.length; i += 3) fn(r, L, t[i], t[i + 1], t[i + 2]);
        return L;
      };
    }
    var REGION_BUILDERS = { cursedcronearena: { deepcave: regionTiles('deepcave', 'cursedcronearena') }, chieftainarena: { cave: regionTiles('cave', 'chieftainarena') }, minecarttracks: { cave: regionTiles('cave', 'minecarttracks') }, deserttemple: { deepcave: templeRegion }, deepswampfishianbiome: { deepcave: regionTiles('deepcave', 'deepswampfishianbiome') }, charredforest: { surface: regionTiles('surface', 'charredforest') } };

    var LEVEL_OF = { surface: 'surfacePresetsFull', cave: 'cavePresets', deepcave: 'deepPresets' };
    // Every ported structure of a preset region is built in placement order on one shared level, so later ones see earlier ones.
    // Structures are placed after the natural decoration and some of them work round it (or leave grass on a floor that
    // the level then removes). Working out the decoration under every structure costs too much for the viewer, so only
    // these look at it; the rest see the bare ground.
    var DECO_IDS = { swampmudareas: 1, forestsapphirecrystals: 1, desertamethystcrystals: 1, deepforestrubycrystals: 1, deepplainstopazcrystals: 1,
      deepswampemeralcrystals: 1, surfaceruins: 1, katanaruins: 1 };
    var DECO_RT = {};
    function buildOne(stack, level, p) {
      var b = p.regionTile ? REGION_BUILDERS[p.id] : BUILDERS[p.id];
      if (b && typeof b === 'object') b = b[level];
      if (!b) return null;
      stack._wantDeco = !!(p.regionTile ? DECO_RT[p.id] : DECO_IDS[p.id]);
      try { var L = b(stack, p, G.Chests.placeRandom(stack.seed, p)); } finally { stack._wantDeco = false; }
      if (L && !L.direct) E.validityPass(L, stack);
      if (L) grassPass(L);
      return L;
    }
    // GrassObject.isValid: grass, cobwebs and the like only stay on their own tiles
    var GRASS = {}; var GF = (E.VD.oflags || {}).grass || {}; Object.keys(GF).forEach(function (k) { var m = {}; (GF[k][1] || []).forEach(function (t) { m[t] = 1; }); GRASS[k] = m; });
    // CustomWildFlowerObject: only on its grow tiles
    [['wildsunflower', 'plainsgrasstile,overgrownplainsgrasstile'], ['wildfiremone', 'grasstile,overgrowngrasstile'], ['wildiceblossom', 'snowtile'],
     ['wildmushroom', 'swampgrasstile,overgrownswampgrasstile,mudtile'], ['wildcaveglow', 'deeprocktile'],
     ['wildancientroots', 'overgrowngrasstile,overgrownplainsgrasstile,overgrownswampgrasstile,ancientrootstile']].forEach(function (e) {
      if (OID[e[0]] === undefined) return; var m = {}; e[1].split(',').forEach(function (t) { if (TID[t] !== undefined) m[TID[t]] = 1; }); GRASS[OID[e[0]]] = m; });
    var FISH_DECOR = new E.Tickets(); [[20, 'seashell'], [20, 'seasnail'], [20, 'seastar'], [25, 'bamboodebris'], [25, 'bambootree'], [100, 'glowcoral']].forEach(function (e) { FISH_DECOR.add(e[0], OID[e[1]]); });
    var ORGANIC = {}; ((E.VD.oflags || {}).organic || []).forEach(function (i) { ORGANIC[i] = 1; });
    var FLOWERPATCH = {}; ON.forEach(function (n, i) { if (/flowerpatch$/.test(n)) FLOWERPATCH[i] = 1; });
    function grassPass(L) {
      // a decoration object a structure built over in part goes entirely (MultiTile isValid: every part must be there),
      // and one left standing on a tile the structure turned to liquid goes too
      var MP = multiParts();
      for (var j0 = 0; j0 < L.o.length; j0++) {
        var x = L.x0 + j0 % L.n, y = L.y0 + ((j0 / L.n) | 0);
        if (L.o[j0] === -2) {
          if (L.t[j0] !== -2 && LIQ_T[L.t[j0]]) { var u = objAt(L, x, y); if (u > 0 && NO_LIQ_O[u]) L.setObject(x, y, 0); }
          continue;
        }
        var under = L.groundObj(x, y), mp = under > 0 && MP[under];
        if (!mp || L.o[j0] === under) continue;
        var mx = x - mp[1], my = y - mp[2];
        for (var b = 0; b < mp[4]; b++) for (var a = 0; a < mp[3]; a++) { var px = mx + a, py = my + b, k = L.idx(px, py);
          if (k >= 0 && L.o[k] !== -2) continue;
          if (objAt(L, px, py) === mp[0] + b * mp[3] + a) L.setObject(px, py, 0); }
      }
      for (var j = 0; j < L.t.length; j++) {   // grass left (by the decoration or an earlier structure) on a tile this one changed
        if (L.t[j] === -2 || L.o[j] !== -2) continue;
        var gx = L.x0 + j % L.n, gy = L.y0 + ((j / L.n) | 0), go = objAt(L, gx, gy), gm = go > 0 && GRASS[go];
        if (gm && !gm[L.t[j]]) L.setObject(gx, gy, 0);
      }
      for (var k = 0; k < L.o.length; k++) { var o = L.o[k], m = o > 0 && GRASS[o]; if (!m) continue;
        var x = L.x0 + k % L.n, y = L.y0 + ((k / L.n) | 0), t = L.getTile(x, y); if (t === -2) t = L.ground ? L.ground(x, y) : TID[E.groundTile(L.st, x, y)];
        if (!m[t]) L.setObject(x, y, 0); }
      for (k = 0; k < L.o.length; k++) { o = L.o[k]; if (!(o > 0) || !FLOWERPATCH[o]) continue;   // FlowerPatchObject: organic ground or snow
        x = L.x0 + k % L.n; y = L.y0 + ((k / L.n) | 0); t = L.getTile(x, y); if (t === -2) t = L.ground ? L.ground(x, y) : TID[E.groundTile(L.st, x, y)];
        if (!ORGANIC[t] && t !== TID.snowtile) L.setObject(x, y, 0); }
    }
    function keyOf(level, p) { return level + ':' + p.id + ':' + p.rects[0][0] + ',' + p.rects[0][1] + (p.regionTile ? ':rt' + (p.index + 1) : ''); }
    G.BiomeStack.prototype.composeRegion = function (level, px, py) {
      var rk = level + ':' + px + ',' + py, regs = this._composed || (this._composed = new Map());
      if (regs.has(rk)) return regs.get(rk);
      var S = { t: new Map(), o: new Map() }, built = new Map(), list = this.edgeFlags ? this.edgeFlags(LEVEL_OF[level], px, py) : this[LEVEL_OF[level]](px, py);
      var prev = this._shared; this._shared = {}; this._shared[level] = S;
      try {
        for (var i = 0; i < list.length; i++) {
          var p = list[i]; if ((p.regionOnly && !p.regionTile) || p.skip) continue;
          var L = null;
          try { L = p.id === 'surfacevillages' ? (this.villageLayoutFresh ? this.villageLayoutFresh(p) : null) : buildOne(this, level, p); } catch (e) { L = null; if (G.DEBUG) console.log(p.id, e); }
          if (L && p.covered) p.covered.forEach(function (k) {   // a neighbour's piece is built over these tiles afterwards
            var c = k.split(','), i = (+c[1] - L.y0) * L.n + (+c[0] - L.x0);
            if (+c[0] >= L.x0 && +c[1] >= L.y0 && +c[0] < L.x0 + L.n && +c[1] < L.y0 + L.n) { L.t[i] = -2; L.o[i] = -2; }
          });
          if (L) built.set(keyOf(level, p), L);
        }
      } finally { this._shared = prev; }
      if (regs.size > 6) regs.delete(regs.keys().next().value);
      regs.set(rk, built);
      return built;
    };
    G.BiomeStack.prototype.structureAt = function (level, px, py, id, x, y, rt) {
      var built = this.composeRegion(level, px, py);
      return built.get(level + ':' + id + ':' + x + ',' + y + (rt ? ':rt' + rt : '')) || null;
    };
    // the overlay packed for drawing: tiles under objects filled in from the ground
    G.BiomeStack.prototype.packOverlay = function (L) {
      if (!L) return null;
      var t = new Int16Array(L.t.length), o = new Int16Array(L.o.length), st = this, lv = L.level || 'surface', deep = lv === 'deepcave';
      var DC = st._decoCache && st._decoCache[lv], fins = {};
      // what stands on a tile the structure only re-floored: whatever the area's structures left there, else the decoration
      // (as far as the viewer has worked it out), else the bare ground's rock; grass that cannot grow on the new floor goes
      function under(x, y) {
        if (L.S) { var v = L.S.o.get(E.skey(x, y)); if (v !== undefined) return v; }
        var key = (x >> 4) + ',' + (y >> 4), f = fins[key];
        if (f === undefined) { var e = DC && DC.get('f' + key); f = fins[key] = e && e.final ? e.final.O : null; }
        if (f) { var n = f[((y & 15) << 4) | (x & 15)]; return n === 'air' ? 0 : (OID[n] === undefined ? 0 : OID[n]); }
        return lv === 'surface' ? 0 : st.caveTileObject(x, y, deep, 1)[1];
      }
      function underTile(x, y) {   // the floor under an object the structure set: the area's structures, the decoration, else the ground
        if (L.S) { var v = L.S.t.get(E.skey(x, y)); if (v !== undefined) return v; }
        var key = (x >> 4) + ',' + (y >> 4), e = DC && DC.get('f' + key);
        if (e && e.final) { var n = e.final.T[((y & 15) << 4) | (x & 15)]; if (TID[n] !== undefined) return TID[n]; }
        return L.ground ? L.ground(x, y) : TID[E.groundTile(st, x, y)];
      }
      for (var k = 0; k < t.length; k++) {
        t[k] = L.t[k]; o[k] = L.o[k];
        var x = L.x0 + k % L.n, y = L.y0 + ((k / L.n) | 0);
        if (t[k] === -2 && o[k] === -2 && L.clearSolid && L.clearSolid.has(x + ',' + y) && SOLID[under(x, y)]) o[k] = 0;   // cleared for the tracks
        if (t[k] === -2 && o[k] !== -2) t[k] = underTile(x, y);
        else if (t[k] !== -2 && o[k] === -2) {
          var u = under(x, y);
          if (u > 0 && ((GRASS[u] && !GRASS[u][t[k]]) || (LIQ_T[t[k]] && NO_LIQ_O[u]))) u = 0;
          if (u > 0) o[k] = u;
        }
      }
      return { x0: L.x0, y0: L.y0, n: L.n, t: t, o: o };
    };
    // chests of the ported surface structures join the generated surface chests
    var baseSurfaceChests = G.BiomeStack.prototype.surfaceChests;
    if (baseSurfaceChests) G.BiomeStack.prototype.surfaceChests = function (px, py, spawn) {
      var out = baseSurfaceChests.call(this, px, py, spawn);
      if (out._structs) return out;
      var list = this.surfacePresetsFull(px, py);
      for (var i = 0; i < list.length; i++) { var p = list[i];
        if (!BUILDERS[p.id] || p.regionOnly || p.regionTile || (spawn && G.Chests.spawnRemoved(p, spawn))) continue;
        var L = this.structureAt('surface', px, py, p.id, p.rects[0][0], p.rects[0][1]); if (!L) continue;
        Object.keys(L.chests).forEach(function (k) { var c = L.chests[k], oi = L.idx(c.x, c.y), id = oi >= 0 ? L.o[oi] : -2;
          if (id > 0) out.push({ x: c.x, y: c.y, obj: ON[id], items: c.items, kind: p.id }); });
      }
      out._structs = true;
      return out;
    };
    G.Structures = { builders: BUILDERS, overlay: overlay,
      has: function (level, p) { var b = p.regionTile ? REGION_BUILDERS[p.id] : BUILDERS[p.id]; if (b && typeof b === 'object') b = b[level]; return !!b; } };
  }
  var api = { install: install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NecesseStructures = api;
})(typeof self !== 'undefined' ? self : this);

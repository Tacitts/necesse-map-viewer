/* Necesse surface villages, following SurfaceVillageWorldPreset -> VillageGeneration -> VillageModularGeneration.
 * NecesseVillage.install(G, villageData, lootEngine) adds BiomeStack.prototype.villageLayout(p) for a preset
 * from surfacePresetsFull. The result is the village area with the tile and layer-0 object the village leaves on
 * every cell it changed (-2 where the ground generation shows through), plus its chests.
 */
(function (root) {
  'use strict';
  function install(G, VD, chests) {
    var TN = VD.tiles, ON = VD.objects, TID = {}, OID = {};
    TN.forEach(function (n, i) { TID[n] = i; }); ON.forEach(function (n, i) { OID[n] = i; });
    var MULTI = VD.multi, LAYERS = VD.layers;

    // ---------- sets (PresetSet.replaceWith) ----------
    function parseOps(ops) {
      var s = { o: [], t: [], n: [] }, sawO = false, sawT = false, sawN = false;
      ops.forEach(function (e) {
        var k = e[0];
        if (k === 'oNULL') s.o = null; else if (k === 'tNULL') s.t = null;
        else if (k === 'oN') s.o.push(null); else if (k === 'tN') s.t.push(null);
        else if (k === 'o') s.o.push(e.slice(1)); else if (k === 't') s.t.push(e.slice(1));
        else if (k === 'n') s.n.push(e[1] === null ? null : e[1].map(function (x) { var c = parseOps(x.ops); c.cls = x.cls; return c; }));
      });
      if (!s.n.length) s.n = null;
      return s;
    }
    var SETS = {};
    Object.keys(VD.sets).forEach(function (k) { SETS[k] = parseOps(VD.sets[k].ops); SETS[k].name = k; SETS[k].pathTile = VD.sets[k].path; });
    function replaceWith(from, to, p) {
      if (from === to) return p;
      pairs(from.o, to.o, function (a, b) { p.replaceNonEmptyObjects(a, b); });
      pairs(from.t, to.t, function (a, b) { p.replaceNonEmptyTiles(a, b); });
      if (from.n && to.n) for (var i = 0; i < from.n.length && i < to.n.length; i++) {
        var A = from.n[i], Bn = to.n[i]; if (!A || !Bn) continue;
        for (var j = 0; j < A.length && j < Bn.length; j++) if (A[j].cls === Bn[j].cls) replaceWith(A[j], Bn[j], p);
      }
      return p;
    }
    function pairs(A, Bv, f) {
      if (!A || !Bv) return;
      for (var i = 0; i < A.length && i < Bv.length; i++) { var a = A[i], b = Bv[i]; if (!a || !b) continue;
        for (var j = 0; j < a.length && j < b.length; j++) f(a[j], b[j]); }
    }

    // ---------- ticket lists (ProtectedTicketSystemList) ----------
    function Tickets() { this.list = []; this.total = 0; }
    Tickets.prototype.add = function (n, o) { this.list.push({ t: n, s: this.total, e: this.total + n, o: o }); this.total += n; return this; };
    Tickets.prototype.random = function (r) {
      if (!this.list.length) return null;
      var v = r.nextInt(this.total);
      for (var i = 0; i < this.list.length; i++) if (this.list[i].s <= v && v < this.list[i].e) return this.list[i].o;
      return null;
    };
    Tickets.prototype.mostCommon = function (r) {
      var best = -1, l = [];
      this.list.forEach(function (e) { if (e.t > best) { l = [e]; best = e.t; } else if (e.t === best) l.push(e); });
      return l[r.nextInt(l.length)].o;
    };
    function fromMap(arr) { var t = new Tickets(); arr.forEach(function (e) { t.add(e[1], e[0]); }); return t; }
    var PAINT = {}; Object.keys(VD.paintings).forEach(function (k) { PAINT[k] = VD.paintings[k]; });
    var CARPETS = VD.carpets;

    // ---------- presets ----------
    // Only layer 0 of the objects is kept: that is what the map shows. Custom applies are kept in order, with their draws.
    function Preset(w, h) {
      this.w = w; this.h = h;
      this.tiles = new Int32Array(w * h).fill(-1); this.obj = new Int32Array(w * h).fill(-1); this.rot = new Int8Array(w * h);
      this.pre = []; this.apply = []; this.openings = [];
    }
    Preset.prototype.clone = function () {
      var p = new Preset(this.w, this.h);
      p.tiles.set(this.tiles); p.obj.set(this.obj); p.rot.set(this.rot);
      p.pre = this.pre.slice(); p.apply = this.apply.slice(); p.openings = this.openings.slice();
      p.sw = this.sw; p.sh = this.sh; p.res = this.res; p.isPath = this.isPath; p.kind = this.kind; p.noMirror = this.noMirror;
      return p;
    };
    Preset.prototype.setObject = function (x, y, id, rot) { var i = x + y * this.w; this.obj[i] = id; if (rot !== undefined) this.rot[i] = rot; };
    Preset.prototype.replaceTile = function (a, b) { for (var i = 0; i < this.tiles.length; i++) if (this.tiles[i] === a) this.tiles[i] = b; };
    Preset.prototype.replaceObject = function (a, b) { for (var i = 0; i < this.obj.length; i++) if (this.obj[i] === a) this.obj[i] = b; };
    Preset.prototype.replaceNonEmptyTiles = function (a, b) { if (a > 0 && b >= 0) this.replaceTile(a, b); };
    Preset.prototype.replaceNonEmptyObjects = function (a, b) { if (a > 0 && b >= 0) this.replaceObject(a, b); };
    Preset.prototype.open = function (x, y, dir) { this.openings.push([x, y, dir]); };
    Preset.prototype.isOpen = function (x, y, dir) { for (var i = 0; i < this.openings.length; i++) { var o = this.openings[i]; if (o[0] === x && o[1] === y && o[2] === dir) return true; } return false; };
    function openSide(p, v, dir) {          // getOpenTop/Right/Bottom/Left(v)
      var n = p.openings.length;
      for (var i = 0; i < n; i++) {
        var o = p.openings[(i + Math.abs(v)) % n];
        if (dir === 0 && o[1] === 0 && o[2] === 0) return o[0];
        if (dir === 1 && o[0] === p.sw - 1 && o[2] === 1) return o[1];
        if (dir === 2 && o[1] === p.sh - 1 && o[2] === 2) return o[0];
        if (dir === 3 && o[0] === 0 && o[2] === 3) return o[1];
      }
      return -1;
    }
    Preset.prototype.randomOpenDir = function (v, dir) { return openSide(this, v, Math.abs(dir) % 4); };
    function mirrorApply(a, axis, size) {
      var m = function (v) { return size - 1 - v; }, c = Object.assign({}, a);
      if (axis === 'x') { if (a.dir === 1 || a.dir === 3) c.dir = (a.dir + 2) % 4; if (a.area) { c.x0 = m(a.x0); c.x1 = m(a.x1); } else c.x = m(a.x); }
      else { if (a.dir === 0 || a.dir === 2) c.dir = (a.dir + 2) % 4; if (a.area) { c.y0 = m(a.y0); c.y1 = m(a.y1); } else c.y = m(a.y); }
      return c;
    }
    Preset.prototype.mirror = function (axis) {
      var w = this.w, h = this.h, p = new Preset(w, h), mark = new Uint8Array(w * h);
      p.sw = this.sw; p.sh = this.sh; p.res = this.res; p.isPath = this.isPath; p.kind = this.kind; p.noMirror = this.noMirror;
      for (var x = 0; x < w; x++) for (var y = 0; y < h; y++) {
        var mx = axis === 'x' ? w - 1 - x : x, my = axis === 'y' ? h - 1 - y : y, si = x + y * w, di = mx + my * w;
        p.tiles[di] = this.tiles[si];
        var id = this.obj[si];
        if (id !== -1) {
          var info = MULTI[id], r = this.rot[si] & 3, ox = 0, oy = 0, nr;
          if (info) { var e = info[r]; if (axis === 'x') { ox = e[0]; oy = e[1]; nr = e[2]; } else { ox = e[3]; oy = e[4]; nr = e[5]; } if (ox === null) throw new Error('mirror'); }
          else nr = axis === 'x' ? (r === 1 ? 3 : r === 3 ? 1 : r) : (r === 0 ? 2 : r === 2 ? 0 : r);
          var ti = (mx + ox) + (my + oy) * w;
          p.obj[ti] = id; p.rot[ti] = nr; mark[di] = 1;
        } else if (!mark[di]) p.obj[di] = id;
      }
      p.pre = this.pre.map(function (a) { return mirrorApply(a, axis, axis === 'x' ? w : h); });
      p.apply = this.apply.map(function (a) { return mirrorApply(a, axis, axis === 'x' ? w : h); });
      var sw = this.sw, sh = this.sh;
      p.openings = this.openings.map(function (o) {
        if (axis === 'x') return [sw - 1 - o[0], o[1], o[2] === 1 ? 3 : o[2] === 3 ? 1 : o[2]];
        return [o[0], sh - 1 - o[1], o[2] === 0 ? 2 : o[2] === 2 ? 0 : o[2]];
      });
      return p;
    };

    // VillagePreset(sectionW, sectionH, isPath, random)
    function villagePreset(sw, sh, isPath, r) {
      var p = new Preset(sw * 3, sh * 3);
      p.sw = sw; p.sh = sh; p.res = 3; p.isPath = isPath;
      if (r) r.nextLong48();                 // its own GameRandom, only used for villagers
      p.pre.push({ kind: 'shore', area: true, x0: 0, y0: 0, x1: p.w - 1, y1: p.h - 1, dir: 0 });
      return p;
    }
    function scripted(name, sw, sh, r) {
      var p = villagePreset(sw, sh, false, r), d = VD.presets[name];
      p.tiles.set(d.tiles); p.obj.set(d.objects[0]); p.rot.set(d.rot); p.kind = name;
      return p;
    }
    function pathPreset(t, rr, b, l) {
      var p = villagePreset(1, 1, true, null);
      p.tiles.fill(TID.stonepathtile); p.obj.fill(0);
      if (t) p.open(0, 0, 0); if (rr) p.open(0, 0, 1); if (b) p.open(0, 0, 2); if (l) p.open(0, 0, 3);
      p.kind = 'path';
      return p;
    }
    // PresetUtils helpers. Draws made while building happen now; the others happen when the preset is applied.
    function flower(p, x, y) { p.apply.push({ kind: 'flower', x: x, y: y, dir: 0 }); }
    function pot(p, x, y) { p.apply.push({ kind: 'pot', x: x, y: y, dir: 0 }); }
    function painting(p, x, y, dir, r, table) { var name = fromMap(PAINT[table]).random(r); p.apply.push({ kind: 'painting', name: name, x: x, y: y, dir: dir }); }
    function carpet(p, x, y, w, h, dir, key) { p.apply.push({ kind: 'carpet', area: true, x0: x, y0: y, x1: x + w - 1, y1: y + h - 1, dir: dir, key: key || null }); }
    function seedArea(p, x, y, w, h) { p.apply.push({ kind: 'seeds', area: true, x0: x, y0: y, x1: x + w - 1, y1: y + h - 1, dir: 0 }); }
    function inventory(p, table, x, y) { p.apply.push({ kind: 'loot', table: table, x: x, y: y, dir: 0 }); }
    function sign(p, x, y) { p.obj[x + y * p.w] = OID.sign; }
    function human(p, x, y) { p.apply.push({ kind: 'none', x: x, y: y, dir: 0 }); }
    function husbandry(p) { p.apply.push({ kind: 'animals', area: true, x0: 4, y0: 4, x1: p.w - 4, y1: p.h - 4, dir: 0 }); }
    function sapling(p, r, pts) { var id = r.nextBoolean() ? OID.oaksapling : OID.sprucesapling; pts.forEach(function (q) { p.setObject(q[0], q[1], id); }); }

    var BUILD = {
      House1: function (r) { var p = scripted('VillageHouse1Preset', 4, 3, r);
        flower(p, 2, 3); pot(p, 6, 4); painting(p, 3, 2, 2, r, 'commonPaintings'); painting(p, 8, 6, 0, r, 'commonPaintings'); carpet(p, 8, 3, 2, 1, 0);
        p.open(2, 2, 2); human(p, 5, 5); human(p, 7, 6); return p; },
      House2: function (r) { var p = scripted('VillageHouse2Preset', 5, 5, r);
        inventory(p, 'alchemistChest', 5, 2); sapling(p, r, [[1, 9], [1, 11], [1, 13]]);
        seedArea(p, 9, 2, 4, 4); flower(p, 7, 4); pot(p, 7, 6); pot(p, 9, 8);
        painting(p, 7, 2, 2, r, 'commonPaintings'); painting(p, 4, 7, 1, r, 'uncommonPaintings'); painting(p, 7, 9, 3, r, 'largeRarePaintings'); painting(p, 11, 12, 0, r, 'largeRarePaintings');
        carpet(p, 3, 3, 4, 3, 0); carpet(p, 5, 8, 2, 3, 0); p.open(0, 1, 3); human(p, 5, 4); human(p, 6, 10); human(p, 3, 4); return p; },
      House3: function (r) { var p = scripted('VillageHouse3Preset', 5, 5, r);
        sign(p, 8, 14); p.apply.push({ kind: 'none', x: 8, y: 14, dir: 0 }); pot(p, 3, 3); pot(p, 11, 3);
        painting(p, 2, 5, 1, r, 'largeRarePaintings'); painting(p, 12, 6, 3, r, 'largeRarePaintings'); carpet(p, 6, 5, 3, 6, 0);
        p.open(2, 4, 2); human(p, 7, 6); human(p, 7, 10); return p; },
      House4: function (r) { var p = scripted('VillageHouse4Preset', 3, 3, r);
        painting(p, 4, 2, 2, r, 'rarePaintings'); p.open(1, 2, 2); human(p, 4, 4); human(p, 4, 6); return p; },
      House5: function (r) { var p = scripted('VillageHouse5Preset', 4, 4, r);
        inventory(p, 'carpenterChest', 2, 2); pot(p, 9, 7);
        painting(p, 8, 2, 2, r, 'largeRarePaintings'); painting(p, 2, 8, 1, r, 'uncommonPaintings'); painting(p, 9, 4, 3, r, 'commonPaintings');
        carpet(p, 4, 3, 4, 2, 0); carpet(p, 4, 7, 4, 2, 0); p.open(0, 1, 3); human(p, 4, 4); human(p, 4, 7); return p; },
      House6: function (r) { var p = scripted('VillageHouse6Preset', 4, 3, r);
        inventory(p, 'hunterChest', 6, 2); flower(p, 3, 2); pot(p, 6, 6);
        painting(p, 2, 3, 1, r, 'uncommonPaintings'); painting(p, 9, 4, 3, r, 'commonPaintings'); carpet(p, 4, 3, 2, 2, 0);
        p.open(0, 1, 3); human(p, 4, 4); human(p, 7, 4); return p; },
      House7: function (r) { var p = scripted('VillageHouse7Preset', 5, 5, r);
        sapling(p, r, [[10, 10], [12, 10], [10, 12], [12, 12]]); flower(p, 9, 7); pot(p, 6, 9); inventory(p, 'blacksmithChest', 3, 7);
        painting(p, 11, 2, 2, r, 'largeRarePaintings'); painting(p, 2, 5, 1, r, 'uncommonPaintings'); painting(p, 12, 6, 3, r, 'commonPaintings');
        carpet(p, 5, 4, 3, 2, 0); carpet(p, 4, 10, 3, 2, 0); p.open(0, 1, 3); human(p, 4, 4); human(p, 8, 4); return p; },
      House8: function (r) { var p = scripted('VillageHouse8Preset', 5, 5, r);
        seedArea(p, 7, 2, 6, 2); seedArea(p, 7, 5, 6, 2); seedArea(p, 7, 8, 6, 2); seedArea(p, 7, 11, 6, 2); inventory(p, 'farmerChest', 2, 6);
        painting(p, 2, 7, 1, r, 'uncommonPaintings'); painting(p, 5, 8, 3, r, 'commonPaintings'); painting(p, 3, 12, 0, r, 'uncommonPaintings');
        carpet(p, 2, 10, 3, 2, 0); p.open(1, 0, 0); human(p, 4, 5); human(p, 4, 8); return p; },
      House9: function (r) { var p = scripted('VillageHouse9Preset', 5, 5, r);
        inventory(p, 'anglerChest', 2, 2); flower(p, 7, 12); flower(p, 9, 10); pot(p, 7, 4); pot(p, 5, 12);
        painting(p, 5, 2, 2, r, 'uncommonPaintings'); painting(p, 2, 5, 1, r, 'uncommonPaintings'); painting(p, 9, 12, 0, r, 'commonPaintings'); painting(p, 7, 9, 3, r, 'largeRarePaintings');
        carpet(p, 4, 10, 3, 2, 0); carpet(p, 10, 11, 2, 2, 0); carpet(p, 3, 4, 2, 2, 0, 'carpet1'); carpet(p, 4, 5, 2, 2, 0, 'carpet1'); carpet(p, 5, 6, 2, 2, 0, 'carpet1');
        p.open(0, 1, 3); human(p, 6, 5); human(p, 6, 10); return p; },
      Farm1: function (r) { var p = scripted('VillageFarm1Preset', 3, 4, r);
        seedArea(p, 2, 2, 1, 8); seedArea(p, 4, 2, 1, 8); seedArea(p, 6, 2, 1, 8); sign(p, 4, 10); p.apply.push({ kind: 'none', x: 4, y: 10, dir: 0 });
        p.open(1, 3, 2); return p; },
      Farm2: function (r) { var p = scripted('VillageFarm2Preset', 4, 4, r); p.open(1, 0, 0); p.open(2, 0, 0); husbandry(p); return p; },
      Farm3: function (r) { var p = scripted('VillageFarm3Preset', 4, 4, r); p.open(0, 1, 3); p.open(0, 2, 3); husbandry(p); return p; },
      Painting: function (r) { var p = scripted('VillageFlatgrassPaintingPreset', 3, 4, r); p.open(2, 2, 1); human(p, 4, 7); human(p, 6, 7); return p; },
      Dog: function (r) { var p = scripted('VillageDogStatuePreset', 3, 2, r); p.open(1, 1, 2);
        var v = ['freyastatue', 'zithastatue'][r.nextInt(2)];
        p.setObject(3, 2, OID[v]); p.setObject(4, 2, OID[v + '2']); p.setObject(3, 3, OID[v + '3']); p.setObject(4, 3, OID[v + '4']);
        p.noMirror = true; return p; }
    };
    // getIntBetween(0, 1) is nextInt(2)

    // ---------- the level the village is built on ----------
    // A dense overlay over the village square: -2 = untouched ground.
    // S, when given, is the level shared by every structure of the area: {t: Map, o: Map} keyed by skey(x, y)
    function skey(x, y) { return (x + 1048576) * 2097152 + (y + 1048576); }
    function Level(stack, x0, y0, n, S) {
      this.st = stack; this.x0 = x0; this.y0 = y0; this.n = n; this.S = S || null;
      this.t = new Int32Array(n * n).fill(-2); this.o = new Int32Array(n * n).fill(-2); this.chests = {};
    }
    Level.prototype.idx = function (x, y) { x -= this.x0; y -= this.y0; return x < 0 || y < 0 || x >= this.n || y >= this.n ? -1 : x + y * this.n; };
    Level.prototype.getTile = function (x, y) {
      var i = this.idx(x, y); if (i >= 0 && this.t[i] !== -2) return this.t[i];
      if (this.S) { var v = this.S.t.get(skey(x, y)); if (v !== undefined) return v; }
      return -2;
    };
    Level.prototype.getObject = function (x, y) {
      var i = this.idx(x, y); if (i >= 0 && this.o[i] !== -2) return this.o[i];
      if (this.S) { var v = this.S.o.get(skey(x, y)); if (v !== undefined) return v; }
      return -2;
    };
    Level.prototype.isLiquid = function (x, y) {
      var t = this.getTile(x, y);
      if (t !== -2) return LIQUID[t] === true;
      if (this.ground) return LIQUID[this.ground(x, y)] === true;
      return this.st.surfaceIndex(x, y, 1) <= 1;
    };
    Level.prototype.setTile = function (x, y, id) { var i = this.idx(x, y); if (i >= 0) this.t[i] = id; if (this.S) this.S.t.set(skey(x, y), id); };
    Level.prototype.setObject = function (x, y, id) { var i = this.idx(x, y); if (i >= 0) this.o[i] = id; if (this.S) this.S.o.set(skey(x, y), id); };
    Level.prototype.snapshot = function (x, y, w, h) {
      var s = { x: x, y: y, w: w, h: h, t: new Int32Array(w * h), o: new Int32Array(w * h) };
      for (var a = 0; a < w; a++) for (var b = 0; b < h; b++) { s.t[a + b * w] = this.getTile(x + a, y + b); s.o[a + b * w] = this.getObject(x + a, y + b); }
      return s;
    };
    Level.prototype.restore = function (s, sx, sy, w, h, x, y) {
      for (var a = 0; a < w; a++) for (var b = 0; b < h; b++) {
        var k = (sx + a) + (sy + b) * s.w, gx = x + a, gy = y + b, i = this.idx(gx, gy);
        if (i >= 0) { this.t[i] = s.t[k]; this.o[i] = s.o[k]; }
        if (this.S) { var key = skey(gx, gy);
          if (s.t[k] === -2) this.S.t.delete(key); else this.S.t.set(key, s.t[k]);
          if (s.o[k] === -2) this.S.o.delete(key); else this.S.o.set(key, s.o[k]); }
      }
    };
    var LIQUID = {}; ['watertile', 'deepwatertile', 'lavatile', 'spiritwatertile'].forEach(function (n) { if (TID[n] !== undefined) LIQUID[TID[n]] = true; });

    // Preset.applyToLevel
    function applyToLevel(p, L, x, y, r) {
      var bb = {};
      p.pre.forEach(function (a) { runApply(a, L, x, y, r, bb); });
      for (var a = 0; a < p.w; a++) for (var b = 0; b < p.h; b++) {
        var i = a + b * p.w;
        if (p.tiles[i] !== -1) L.setTile(x + a, y + b, p.tiles[i]);
        if (p.obj[i] !== -1) L.setObject(x + a, y + b, p.obj[i]);
      }
      p.apply.forEach(function (a) { runApply(a, L, x, y, r, bb); });
    }
    var POTS = ['decorativepot1', 'decorativepot2', 'decorativepot3', 'decorativepot4', 'pottedcactus1', 'pottedcactus2', 'pottedcactus3', 'pottedcactus4', 'pottedflower1', 'pottedflower2', 'pottedflower3', 'pottedflower4', 'pottedflower5', 'pottedflower6', 'pottedplant1', 'pottedplant2', 'pottedplant3', 'pottedplant4', 'pottedplant5', 'pottedplant6', 'pottedplant7'], FLOWERS = ['sunflower', 'firemone', 'iceblossom', 'mushroomflower'];
    var SEEDS = ['sunflowerseed', 'firemoneseed', 'iceblossomseed', 'mushroom', 'wheatseed', 'cornseed', 'tomatoseed', 'chilipepperseed', 'sugarbeetseed', 'beetseed'];
    var ANIMALS = [[['cow', 100], ['bull', 20]], [['sheep', 100], ['ram', 20]], [['chicken', 100], ['rooster', 20]]];
    var EXTRA_APPLY = {};
    function runApply(a, L, x, y, r, bb) {
      var k = a.kind;
      if (k === 'none') return;
      if (EXTRA_APPLY[k]) return EXTRA_APPLY[k](a, L, x, y, r, bb);
      if (a.area) {
        var x0 = x + Math.min(a.x0, a.x1), x1 = x + Math.max(a.x0, a.x1), y0 = y + Math.min(a.y0, a.y1), y1 = y + Math.max(a.y0, a.y1);
        if (k === 'shore') { for (var i = x0; i <= x1; i++) for (var j = y0; j <= y1; j++) if (L.isLiquid(i, j)) L.setTile(i, j, TID.sandtile); return; }
        if (k === 'seeds') { var s = OID[SEEDS[r.nextInt(SEEDS.length)]]; for (i = x0; i <= x1; i++) for (j = y0; j <= y1; j++) L.setObject(i, j, s); return; }
        if (k === 'carpet') {
          var cname;
          if (a.key) { if (bb[a.key] == null) bb[a.key] = fromMap(CARPETS).random(r); cname = bb[a.key]; }
          else cname = fromMap(CARPETS).random(r);
          for (i = x0; i <= x1; i++) for (j = y0; j <= y1; j++) { var cur = L.getObject(i, j); if (cur === 0 || (cur > 0 && /carpet$/.test(ON[cur]))) L.setObject(i, j, OID[cname]); }
          return;
        }
        if (k === 'animals') {
          var kind = ANIMALS[r.nextInt(3)], n = r.nextInt(5) + 5;
          for (i = 0; i < n; i++) { fromMap(kind).random(r); r.nextInt(101); r.nextInt(x1 - x0 + 1); r.nextInt(y1 - y0 + 1); }
          return;
        }
        return;
      }
      var tx = x + a.x, ty = y + a.y;
      if (k === 'flower') { L.setObject(tx, ty, OID[FLOWERS[r.nextInt(4)]]); return; }
      if (k === 'pot') { var pn = POTS[r.nextInt(POTS.length)], po = L.getObject(tx, ty); if (po === 0 || (po > 0 && /^(potted|decorativepot)/.test(ON[po]))) L.setObject(tx, ty, OID[pn]); return; }
      if (k === 'painting') {
        var cur = L.getObject(tx, ty); if (cur < 0 || !/^painting/.test(ON[cur])) return;
        var base = ON[cur].replace(/2$/, '');
        L.setObject(tx, ty, OID[ON[cur] === base ? a.name : a.name + '2']);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var o = L.getObject(tx + d[0], ty + d[1]);
          if (o >= 0 && (ON[o] === base + '2' || (ON[cur] !== base && ON[o] === base))) L.setObject(tx + d[0], ty + d[1], OID[ON[o] === base ? a.name : a.name + '2']); });
        return;
      }
      if (k === 'loot') {
        var ex = { level: L.level || 'surface', rotation: a.rot }, items = [];
        if (chests && a.node) { var raw = []; chests.addItems(a.node, raw, r, 1, ex); items = chests.toInventory(raw, 40); }   // a table written in the preset itself
        else if (chests) items = chests.rollTable(a.table, r, ex);
        L.chests[tx + ',' + ty] = { x: tx, y: ty, table: a.table, items: items }; return;
      }
    }

    // ---------- ModularGeneration ----------
    function MG(L, cw, chh, ox, oy, r, res) {
      this.L = L; this.cw = cw; this.ch = chh; this.res = res || 3; this.ox = ox; this.oy = oy; this.r = r;
      this.presets = []; this.usage = new Map(); this.max = new Map(); this.placed = new Map(); this.open = [];
    }
    function key(x, y) { return x + ',' + y; }
    MG.prototype.get = function (x, y) { return this.placed.get(key(x, y)) || null; };
    MG.prototype.next = function (c, d) { d = ((d % 4) + 4) % 4; return d === 0 ? [c[0], c[1] - 1] : d === 1 ? [c[0] + 1, c[1]] : d === 2 ? [c[0], c[1] + 1] : [c[0] - 1, c[1]]; };
    MG.prototype.addPreset = function (p, tickets, max) { for (var i = 0; i < tickets; i++) this.presets.push(p); this.usage.set(p, 0); this.max.set(p, max === undefined ? -1 : max); };
    MG.prototype.removeAll = function (p) { this.presets = this.presets.filter(function (q) { return q !== p; }); };
    function placedOpen(pp, dir) {
      dir %= 4;
      var d = dir === 0 ? (pp.ym ? 2 : 0) : dir === 1 ? (pp.xm ? 3 : 1) : dir === 2 ? (pp.ym ? 0 : 2) : (pp.xm ? 1 : 3);
      return pp.preset.isOpen(pp.x, pp.y, d);
    }
    MG.prototype.cellOpen = function (c, d) { var pp = this.get(c[0], c[1]); return pp ? placedOpen(pp, d % 4) : false; };
    MG.prototype.canApply = function (p, cell, xm, ym, from) {
      if (p.noMirror && (xm || ym)) return false;
      if (!from) return true;
      if (p.isPath) for (var d = 0; d < 4; d++) {
        var n = this.next(cell, d);
        if (n[0] === from[0] && n[1] === from[1]) continue;
        if (this.get(n[0], n[1])) return false;      // the game tests the preset being placed, so any neighbour blocks a path
      }
      return true;
    };
    MG.prototype.applyPreset = function (p, cell, xm, ym, from, count) {
      var x = cell[0] * this.res + this.ox, y = cell[1] * this.res + this.oy;
      if (cell[0] < 0 || cell[0] + p.sw > this.cw || cell[1] < 0 || cell[1] + p.sh > this.ch) return false;
      for (var a = 0; a < p.sw; a++) for (var b = 0; b < p.sh; b++) if (this.placed.has(key(cell[0] + a, cell[1] + b))) return false;
      if (!this.canApply(p, cell, xm, ym, from)) return false;
      var q = p;
      if (xm) { try { q = q.mirror('x'); } catch (e) { xm = false; } }   // PresetMirrorException: placed unmirrored
      if (ym) { try { q = q.mirror('y'); } catch (e) { ym = false; } }
      var snap = this.L.snapshot(x, y, p.w, p.h);
      applyToLevel(q, this.L, x, y, this.r);
      var fromPP = from ? this.get(from[0], from[1]) : null;
      for (a = 0; a < p.sw; a++) for (b = 0; b < p.sh; b++) {
        var c = [cell[0] + a, cell[1] + b];
        var pp = { cell: c, preset: p, rx: a, ry: b, x: xm ? Math.abs(a - (p.sw - 1)) : a, y: ym ? Math.abs(b - (p.sh - 1)) : b, xm: xm, ym: ym, from: fromPP,
          snap: snap, sx: a * this.res, sy: b * this.res, h: fromPP ? fromPP.h + 1 : 0, opened: [false, false, false, false] };
        this.placed.set(key(c[0], c[1]), pp);
        this.open.push(c);
      }
      if (this.onApplied) for (a = 0; a < p.sw; a++) for (b = 0; b < p.sh; b++) this.onApplied(this.get(cell[0] + a, cell[1] + b));
      if (count !== false) this.usage.set(p, (this.usage.get(p) || 0) + 1);
      return true;
    };
    MG.prototype.removeOpen = function (c) { for (var i = 0; i < this.open.length; i++) if (this.open[i][0] === c[0] && this.open[i][1] === c[1]) { this.open.splice(i, 1); return; } };
    MG.prototype.openCell = function (c) { for (var i = 0; i < this.open.length; i++) if (this.open[i][0] === c[0] && this.open[i][1] === c[1]) return; this.open.push(c); };
    MG.prototype.tick = function () {
      if (!this.open.length) return;
      var cur = this.open[this.open.length - 1], placedAny = false, close = true, first = true;
      for (var i = 0; i < this.presets.length; i++) {
        var n = this.presets.length, rnd = this.r.nextInt(n), idx = (rnd + i) % n, p = this.presets[idx];
        var mx = this.max.get(p);
        if (mx > 0 && this.usage.get(p) >= mx) { this.removeAll(p); i = 0; continue; }
        if (!first && p === this.presets[((rnd + i) - 1) % n]) continue;
        first = false;
        var d0 = this.r.nextInt(4);
        for (var k = 0; k < 4; k++) {
          var dir = (k + d0) % 4, nc = this.next(cur, dir);
          if (this.placed.has(key(nc[0], nc[1])) || !this.cellOpen(cur, dir)) continue;
          var o1 = p.randomOpenDir(this.r.nextInt(), dir), o2 = p.randomOpenDir(this.r.nextInt(), dir + 2);
          if (o1 !== -1 || o2 !== -1) {
            var pos = [nc[0], nc[1]], useFirst = o1 !== -1;
            if (useFirst && o2 !== -1) useFirst = this.r.nextBoolean();
            if (dir === 0 || dir === 2) {
              if (dir === 0) pos[1] -= p.sh - 1;
              pos[0] -= useFirst ? o1 : o2;
              if (this.applyPreset(p, pos, false, useFirst, cur)) { close = false; placedAny = true; if (this.onPlaced) this.onPlaced(nc); }
            } else {
              if (dir === 3) pos[0] -= p.sw - 1;
              pos[1] -= useFirst ? o1 : o2;
              if (this.applyPreset(p, pos, useFirst, false, cur)) { close = false; placedAny = true; if (this.onPlaced) this.onPlaced(nc); }
            }
          }
          if (placedAny) break;
        }
        if (placedAny) break;
      }
      if (close) this.removeOpen(cur);
    };
    MG.prototype.ticks = function (n) { for (var i = 0; i < n; i++) { if (!this.open.length) break; this.tick(); } };

    // ---------- VillageGeneration ----------
    function generate(stack, size, sets, r, cx, cy) {
      var n = (size / 3) | 0, ox = cx - ((3 * n) / 2 | 0), oy = cy - ((3 * n) / 2 | 0);
      var L = new Level(stack, ox, oy, n * 3, stack._shared ? stack._shared.surface : null), def = SETS.defaultSet;
      var basic = [], edge = [];
      function added(list, p, t, m) {
        p.replaceObject(OID.storagebox, OID.sprucechest);
        var set = sets.random(r);
        list.push({ preset: replaceWith(def, set, p), set: set, t: t, m: m });
      }
      ['House1', 'House2', 'House5', 'House6', 'House7', 'House8', 'House9'].forEach(function (k) { added(basic, BUILD[k](r), 8, 1); });
      ['House1', 'House2', 'House5', 'House6', 'House7', 'House8', 'House9'].forEach(function (k) { added(basic, BUILD[k](r), 3, 2); });
      added(edge, BUILD.Farm1(r), 8, 2); added(edge, BUILD.Farm2(r), 25, 1); added(edge, BUILD.Farm3(r), 25, 1);
      added(edge, BUILD.Farm2(r), 5, 1); added(edge, BUILD.Farm3(r), 5, 1); added(edge, BUILD.House3(r), 50, 1);
      if (r.getChance(Math.fround(0.1))) added(edge, BUILD.Painting(r), 50, 1); else added(edge, BUILD.House4(r), 50, 1);
      if (r.getChance(Math.fround(0.2))) added(basic, BUILD.Dog(r), 50, 1);

      var mg = new MG(L, n, n, ox, oy, r);
      var pathSet = sets.mostCommon(r);
      var start = replaceWith(def, pathSet, pathPreset(true, true, true, true));
      var sc = [(n / 2) | 0, (n / 2) | 0];
      mg.applyPreset(start, sc, false, false, null);
      basic.concat(edge).forEach(function (a) { a.preset.replaceTile(a.set.pathTile, pathSet.pathTile); });
      var arms = Math.max(intBetween(r, (n / 6) | 0, (n / 3) | 0), 2);
      for (var i = 1; i <= arms; i++) {
        mg.applyPreset(start, [sc[0] - i, sc[1]], false, false, [sc[0] - (i - 1), sc[1]]);
        mg.applyPreset(start, [sc[0] + i, sc[1]], false, false, [sc[0] + (i - 1), sc[1]]);
        mg.applyPreset(start, [sc[0], sc[1] - i], false, false, [sc[0], sc[1] - (i - 1)]);
        mg.applyPreset(start, [sc[0], sc[1] + i], false, false, [sc[0], sc[1] + (i - 1)]);
      }
      var p4 = replaceWith(def, pathSet, pathPreset(true, true, true, true)); mg.addPreset(p4, 6);
      var pV = replaceWith(def, pathSet, pathPreset(true, false, true, false)); mg.addPreset(pV, 3);
      var pH = replaceWith(def, pathSet, pathPreset(false, true, false, true)); mg.addPreset(pH, 3);
      mg.ticks(4);
      basic.forEach(function (a) { mg.addPreset(a.preset, a.t, a.m); });
      mg.ticks((size / 2) | 0);
      edge.forEach(function (a) { mg.addPreset(a.preset, a.t, a.m); });
      mg.ticks(size * 5);

      // remove path ends that lead nowhere
      var done = [], todo = [], root = { parent: null, pp: mg.get(sc[0], sc[1]), goes: false };
      function mark(l) { l.goes = true; if (l.parent) mark(l.parent); }
      mark(root); todo.push(root);
      function tickRemove(l, x, y) {
        var pp = mg.get(x, y); if (!pp) return;
        if (pp.preset.isPath) { if (!done.some(function (d) { return d.pp.cell[0] === x && d.pp.cell[1] === y; })) todo.push({ parent: l, pp: pp, goes: false }); }
        else mark(l);
      }
      while (todo.length) {
        var l = todo.shift(), c = l.pp.cell;
        if (placedOpen(l.pp, 0)) tickRemove(l, c[0], c[1] - 1);
        if (placedOpen(l.pp, 2)) tickRemove(l, c[0], c[1] + 1);
        if (placedOpen(l.pp, 1)) tickRemove(l, c[0] + 1, c[1]);
        if (placedOpen(l.pp, 3)) tickRemove(l, c[0] - 1, c[1]);
        done.push(l);
      }
      done.forEach(function (l) {
        if (l.goes) return;
        var pp = l.pp, x = pp.cell[0] * 3 + ox, y = pp.cell[1] * 3 + oy;
        L.restore(pp.snap, pp.sx, pp.sy, 3, 3, x, y);
        for (var q = l.parent; q && q.goes; q = q.parent) mg.openCell(l.parent.pp.cell);
        mg.placed.delete(key(pp.cell[0], pp.cell[1]));
      });
      mg.removeAll(p4); mg.removeAll(pV); mg.removeAll(pH);
      mg.ticks(size * 5);
      validityPass(L, stack);
      // saplings only survive on the tiles they can grow on
      for (var k = 0; k < L.o.length; k++) {
        if (L.o[k] !== OID.oaksapling && L.o[k] !== OID.sprucesapling) continue;
        var tx = L.x0 + k % L.n, ty = L.y0 + ((k / L.n) | 0), t = L.t[k] !== -2 ? TN[L.t[k]] : groundTile(stack, tx, ty);
        if (SAPLING_TILES.indexOf(t) < 0) L.o[k] = 0;
      }
      return L;
    }
    // GameObject.isValid: objects that cannot stand on liquid, or on a shore next to liquid, are removed
    var OF = VD.oflags || null, NO_LIQ = {}, NO_SHORE = {}, LIQ = {}, OV_LIQ = {}, OV_SHORE = {};
    if (OF) { OF.noLiquid.forEach(function (i) { NO_LIQ[i] = 1; }); OF.noShore.forEach(function (i) { NO_SHORE[i] = 1; }); OF.liquid.forEach(function (i) { LIQ[i] = 1; });
      OF.ovLiquid.forEach(function (i) { OV_LIQ[i] = 1; }); OF.ovShore.forEach(function (i) { OV_SHORE[i] = 1; }); }
    function tileAt(L, stack, x, y) { var t = L.getTile(x, y); if (t !== -2) return t; return L.ground ? L.ground(x, y) : TID[groundTile(stack, x, y)]; }
    function origTile(L, stack, x, y) { return L.ground ? L.ground(x, y) : TID[groundTile(stack, x, y)]; }
    function origShore(L, stack, x, y) {
      if (LIQ[origTile(L, stack, x, y)]) return false;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) if ((dx || dy) && LIQ[origTile(L, stack, x + dx, y + dy)]) return true;
      return false;
    }
    // in the caves the shore flags are not worked out yet when generation checks objects, so only liquid counts there
    var CAVE_LV = { cave: 1, deepcave: 1 };
    function validityPass(L, stack) {
      if (!OF) return;
      for (var k = 0; k < L.o.length; k++) {
        var o = L.o[k]; if (o <= 0) continue;
        var x = L.x0 + k % L.n, y = L.y0 + ((k / L.n) | 0), t = tileAt(L, stack, x, y);
        if (NO_LIQ[o] && LIQ[t] && !OV_LIQ[t]) { L.o[k] = 0; continue; }
        if (NO_SHORE[o] && !OV_SHORE[t] && !CAVE_LV[L.level] && origShore(L, stack, x, y)) {
          for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue;
            var u = tileAt(L, stack, x + dx, y + dy); if (LIQ[u] && !OV_LIQ[u]) { L.o[k] = 0; dx = 2; break; } }
        }
      }
    }
    var SAPLING_TILES = ['grasstile', 'overgrowngrasstile', 'swampgrasstile', 'overgrownswampgrasstile', 'plainsgrasstile', 'overgrownplainsgrasstile', 'dirttile', 'farmland', 'snowtile'];
    var GROUND = ['watertile', 'watertile', 'grasstile', 'plainsgrasstile', 'sandtile', 'swampgrasstile', 'snowtile', 'icetile'];
    function groundTile(stack, x, y) { return GROUND[stack.surfaceIndex(x, y, 1)] || 'grasstile'; }
    function intBetween(r, a, b) { if (a === b) return a; var lo = Math.min(a, b), hi = Math.max(a, b); return r.nextInt(hi - lo + 1) + lo; }

    // The village's sets: what the placement check counted, as SurfaceVillageWorldPreset$1 does
    function villageSets(stack, x, y, size) {
      var counts = {};
      function f(a, b) { var id = stack.getLazyBiomeID(a, b); counts[id] = (counts[id] || 0) + 1; }
      var pts = [[x, y], [x + size - 1, y], [x, y + size - 1], [x + size - 1, y + size - 1]];
      pts.forEach(function (q) { f(q[0], q[1]); });
      var nx = ((size - 16) / 16) | 0, ox = (((size - 16) % 16) / 2) | 0;
      for (var i = 0; i < nx; i++) for (var j = 0; j < nx; j++) f(x + ox + i * 16, y + ox + j * 16);
      var t = new Tickets();
      Object.keys(counts).map(Number).sort(function (a, b) { return a - b; }).forEach(function (id) {
        var vs = VD.biomeSets[id]; if (!vs || !vs.length) return;
        var each = Math.max(1, (counts[id] / vs.length) | 0);
        vs.forEach(function (s) { t.add(each, SETS[s]); });
      });
      return t;
    }

    G.BiomeStack.prototype.villageLayoutFresh = function (p) {
      var q = p.rects[0], x = q[0], y = q[1], size = q[2];
      return generate(this, size, villageSets(this, x, y, size), chests.placeRandom(this.seed, p), x + (size / 2 | 0), y + (size / 2 | 0));
    };
    G.BiomeStack.prototype.villageLayout = function (p) {
      var c = this._villageCache || (this._villageCache = new Map()), k = p.rects[0].join(',');
      if (c.has(k)) return c.get(k);
      var q = p.rects[0], x = q[0], y = q[1], size = q[2];
      var r = chests.placeRandom(this.seed, p);
      var L = generate(this, size, villageSets(this, x, y, size), r, x + (size / 2 | 0), y + (size / 2 | 0));
      if (c.size > 40) c.clear();
      c.set(k, L);
      return L;
    };
    // the village at tile (x, y) of preset region (px, py), with every unset tile under an object filled in from the ground
    G.BiomeStack.prototype.villageAt = function (px, py, x, y) {
      var list = this.surfacePresetsFull(px, py);
      for (var i = 0; i < list.length; i++) { var p = list[i];
        if (p.id !== 'surfacevillages' || p.rects[0][0] !== x || p.rects[0][1] !== y) continue;
        var L = this.villageLayout(p), t = new Int16Array(L.t.length), o = new Int16Array(L.o.length);
        for (var k = 0; k < t.length; k++) {
          t[k] = L.t[k]; o[k] = L.o[k];
          if (t[k] === -2 && o[k] !== -2) t[k] = TID[groundTile(this, L.x0 + k % L.n, L.y0 + ((k / L.n) | 0))];
        }
        return { x0: L.x0, y0: L.y0, n: L.n, t: t, o: o };
      }
      return null;
    };
    // village chests join the surface chests worked out from the seed
    var baseSurfaceChests = G.BiomeStack.prototype.surfaceChests;
    if (baseSurfaceChests) G.BiomeStack.prototype.surfaceChests = function (px, py, spawn) {
      var out = baseSurfaceChests.call(this, px, py, spawn);
      if (out._villages) return out;
      var list = this.surfacePresetsFull(px, py);
      for (var i = 0; i < list.length; i++) { var p = list[i];
        if (p.id !== 'surfacevillages' || (spawn && chests.spawnRemoved(p, spawn))) continue;
        var L = this.villageLayout(p);
        Object.keys(L.chests).forEach(function (k) { var c = L.chests[k], oi = L.idx(c.x, c.y), id = oi >= 0 ? L.o[oi] : -2;
          out.push({ x: c.x, y: c.y, obj: id > 0 ? ON[id] : 'sprucechest', items: c.items, kind: 'village' }); });
      }
      out._villages = true;
      return out;
    };
    G.Village = { names: { tiles: TN, objects: ON }, generate: generate, villageSets: villageSets };
    G.PresetEngine = { Preset: Preset, Level: Level, skey: skey, applyToLevel: applyToLevel, runApply: runApply, EXTRA_APPLY: EXTRA_APPLY, MG: MG, Tickets: Tickets, fromMap: fromMap,
      replaceWith: replaceWith, SETS: SETS, TID: TID, OID: OID, TN: TN, ON: ON, MULTI: MULTI, groundTile: groundTile, validityPass: validityPass, placedOpen: placedOpen, intBetween: intBetween,
      GROUND_NAMES: GROUND, PAINT: PAINT, CARPETS: CARPETS, POTS: POTS, FLOWERS: FLOWERS, SEEDS: SEEDS, VD: VD };
  }
  var api = { install: install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NecesseVillage = api;
})(typeof self !== 'undefined' ? self : this);

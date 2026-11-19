/*
 * Necesse cave world presets (structure placement), JavaScript port.
 * Translated from Necesse 1.3.3's necesse.engine.world.worldPresets package.
 * Install with NecesseCave.install(NecesseGen) after NecesseGen.init(constants).
 */
(function (root) {
  'use strict';
  function install(G) {
    var I = G._internal, C = I.C(), JR = G.JRandom.prototype, PR = I.PresetRegion;
    var fr = Math.fround;
    var CAVE_HASH = 3046285, DEEP_HASH = 628957817, SURF_HASH = -1853231955;

    // ---------- GameRandom helpers ----------
    JR.getIntBetween = function (a, b) { if (a === b) return a; var lo = Math.min(a, b), hi = Math.max(a, b); return this.nextInt(hi - lo + 1) + lo; };
    JR.getFloatBetween = function (a, b) { a = fr(a); b = fr(b); if (a === b) return a; var lo = Math.min(a, b), hi = Math.max(a, b); return fr(fr(this.nextFloat() * fr(hi - lo)) + lo); };
    JR.getIntOffset = function (v, off) { return this.getIntBetween(v - off, v + off); };
    if (!JR.nextBoolean) JR.nextBoolean = function () { return this.next(1) !== 0; };
    JR.getOneOf = function (arr) { return arr.length ? arr[this.nextInt(arr.length)] : null; };
    // getOneOfWeighted(Integer.class, w0, v0, w1, v1, ...)
    JR.getWeighted = function (pairs) {
      var total = 0, i; for (i = 0; i < pairs.length; i += 2) total += pairs[i];
      if (!total) return null;
      var t = this.nextInt(total), acc = 0;
      for (i = 0; i < pairs.length; i += 2) { if (t >= acc && t < acc + pairs[i]) return pairs[i + 1]; acc += pairs[i]; }
      return null;
    };

    // ---------- GameMath trig tables (3600 steps of 0.1 degrees) ----------
    var COS = new Float32Array(3600), SIN = new Float32Array(3600);
    for (var i = 0; i < 3600; i++) { var r = fr(fr(0.1) * i) * 0.017453292519943295; COS[i] = Math.cos(r); SIN[i] = Math.sin(r); }   // Math.toRadians (Java 9+)
    function fixAngle(a) { a = fr(a); var m = fr(a % 360); if (a >= 0) return m; var v = fr(360 + m); return v === 360 ? 0 : v; }
    function tIndex(a) { return Math.trunc(fixAngle(a) / 0.1); }
    function cos(a) { return COS[tIndex(a)]; }
    function sin(a) { return SIN[tIndex(a)]; }
    function f2i(f) { if (f !== f) return 0; if (f >= 2147483647) return 2147483647; if (f <= -2147483648) return -2147483648; return Math.trunc(f); }

    // ---------- LinesGeneration (only the parts placement needs) ----------
    function LG(rootLG, x1, y1, x2, y2, w) { this.root = rootLG; this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2; this.width = fr(w); this.lines = []; }
    LG.prototype.getRoot = function () { return this.root || this; };
    LG.prototype.addLine = function (x1, y1, x2, y2, w) {
      if (this.root) return this.root.addLine(x1, y1, x2, y2, w);
      var l = new LG(this, x1, y1, x2, y2, w); this.lines.push(l); return l;
    };
    LG.prototype.addLineTo = function (x, y, w) {
      if (this.root) return this.root.addLine(this.x2, this.y2, x, y, w);
      var l = new LG(this, this.x2, this.y2, x, y, w); this.lines.push(l); return l;
    };
    LG.prototype.addLineToDelta = function (dx, dy, w) { return this.addLineTo(this.x2 + dx, this.y2 + dy, w); };
    LG.prototype.addArm = function (angle, len, w) {
      var dx = cos(angle), dy = sin(angle);
      return this.addLineToDelta(f2i(fr(dx * fr(len))), f2i(fr(dy * fr(len))), w);
    };
    LG.prototype.removeLastLine = function () { if (this.root) this.root.removeLastLine(); else if (this.lines.length) this.lines.pop(); };
    LG.prototype.isEmpty = function () { return this.lines.length === 0; };

    // ---------- LinesGenerationWorldPreset ----------
    function LGWP(x, y) {
      this.startTileX = x; this.startTileY = y; this.lg = new LG(null, x, y, x, y, 0);
      this.b = { minX: x, minY: y, maxX: x, maxY: y };
    }
    function boundsPoint(b, x, y) {
      if (x < b.minX) b.minX = x; else if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y; else if (y > b.maxY) b.maxY = y;
    }
    function boundsMerge(b, o) {
      if (o.minX < b.minX) b.minX = o.minX; if (o.maxX > b.maxX) b.maxX = o.maxX;
      if (o.minY < b.minY) b.minY = o.minY; if (o.maxY > b.maxY) b.maxY = o.maxY;
    }
    LGWP.prototype.updateBounds = function (l) {
      var nb;
      if (l.width === 0) { nb = { minX: l.x1, minY: l.y1, maxX: l.x1, maxY: l.y1 }; boundsPoint(nb, l.x2, l.y2); }
      else {
        var x0 = Math.min(l.x1, l.x2), x1 = Math.max(l.x1, l.x2), y0 = Math.min(l.y1, l.y2), y1 = Math.max(l.y1, l.y2);
        nb = { minX: Math.floor(fr(x0 - l.width)), minY: Math.floor(fr(y0 - l.width)), maxX: Math.ceil(fr(x1 + l.width)), maxY: Math.ceil(fr(y1 + l.width)) };
      }
      boundsMerge(this.b, nb);
      (this.armBounds || (this.armBounds = [])).push(nb);   // RegionPointsSet.addTileBounds for each arm
    };
    LGWP.prototype.addArm = function (angle, len, w) { var l = this.lg.addArm(angle, len, w); this.updateBounds(l); return l; };
    LGWP.prototype.addRandomArms = function (r, arms, minR, maxR, minW, maxW) {
      var angle = r.nextInt(360), step = (360 / arms) | 0;
      for (var i = 0; i < arms; i++) {
        angle = angle + r.getIntOffset(step, (step / 2) | 0);
        var len = r.getFloatBetween(minR, maxR), w = r.getFloatBetween(minW, maxW);
        this.addArm(angle, len, w);
      }
      return this;
    };
    LGWP.prototype.inBounds = function (reg) {
      var b = this.b;
      return b.minX >= reg.x0 && b.maxX < reg.x0 + reg.w && b.minY >= reg.y0 && b.maxY < reg.y0 + reg.h;
    };
    LGWP.prototype.rect = function () { var b = this.b; return [b.minX, b.minY, b.maxX - b.minX + 1, b.maxY - b.minY + 1]; };

    // ---------- the cave level's preset region ----------
    function CaveRegion(stack, seedInt, px, py, levelHash) {
      this.stack = stack; this.px = px; this.py = py;
      this.x0 = px * 1024; this.y0 = py * 1024; this.w = 1024; this.h = 1024;
      this.boards = {}; this.presets = [];
      this.biomeRegions = {}; this.weights = {}; this.totalWeight = 0;
      this.scanBiomes();
      this.seedInt = seedInt;
      var r = G.gameRandom(seedInt).nextSeeded(px).nextSeeded(py).nextSeeded(levelHash);
      var order = C.presetOrder;
      for (var i = 0; i < order.length; i++) {
        var pr = r.nextSeeded(G.javaStringHash(order[i]));
        var f = (levelHash === CAVE_HASH ? CAVE : levelHash === DEEP_HASH ? DEEP : SURF)[order[i]];
        if (f) f.call(this, pr);
      }
    }
    CaveRegion.prototype = Object.create(PR.prototype);
    CaveRegion.prototype.constructor = CaveRegion;
    CaveRegion.prototype.hasAnyOfBiome = function (b) { var l = this.biomeRegions[b]; return !!(l && l.length); };
    // addPreset: occupy boards with each rectangle, then record the preset with its index and first region
    CaveRegion.prototype.addPreset = function (id, rects, boards, data) {
      var fx = Infinity, fy = Infinity;
      for (var i = 0; i < rects.length; i++) {
        var q = rects[i];
        for (var b = 0; b < boards.length; b++) this.occupy(boards[b], q[0], q[1], q[2], q[3]);
        var rx0 = q[0] >> 4, ry0 = q[1] >> 4, rx1 = (q[0] + q[2] - 1) >> 4, ry1 = (q[1] + q[3] - 1) >> 4;
        for (var rx = rx0; rx <= rx1; rx++) for (var ry = ry0; ry <= ry1; ry++) if (rx < fx || (rx === fx && ry < fy)) { fx = rx; fy = ry; }
      }
      var p = { id: id, index: this.presets.length, fx: fx, fy: fy, rects: rects, data: data || null };
      this.presets.push(p);
      return p;
    };
    // presets that occupy single level regions (RegionTileWorldPresetGenerator): one entry per region
    CaveRegion.prototype.addRegionPresets = function (id, regionKeys, gen) {
      for (var i = 0; i < regionKeys.length; i++) {
        var k = regionKeys[i], t = gen && gen.tiles[k[0] + ',' + k[1]];
        this.presets.push({ id: id, index: this.presets.length, fx: k[0], fy: k[1], rects: [[k[0] * 16, k[1] * 16, 16, 16]], data: t ? { tiles: t } : null, regionOnly: true, regionTile: !!t, outside: this.outside(k[0], k[1]) });
      }
    };
    // A level region outside this 1024-tile preset region belongs to its neighbour's presets: generating it never runs
    // the pieces this region registered there, so the game never builds them (where two structures meet at the edge,
    // only the one that owns the ground shows).
    CaveRegion.prototype.outside = function (rx, ry) { return rx < this.px * 64 || ry < this.py * 64 || rx >= this.px * 64 + 64 || ry >= this.py * 64 + 64; };
    CaveRegion.prototype.notDeepRiverLava = function (x, y) {
      var st = this.stack, b = C.caveBiomes[st.getLazyBiomeID(x, y)];
      return !((b && b.deepRiver && st.deepRiver.get(x, y) === -1) || st.deepLava.get(x, y) === -1);
    };
    CaveRegion.prototype.notRiverLava = function (x, y) { return !(this.stack.caveRiver.get(x, y) === -1 || this.stack.caveLava.get(x, y) === -1); };

    var B = function (name) { return C.biomeIDs[name]; };

    // the "lines" mini-biomes: spider nests, crystals, crypts, bear caves, ice openings, spores, mud
    function linesPreset(id, biomeName, ppr, size, arms, minR, maxR, minW, maxW, boards, predicate) {
      return function (r) {
        var biome = B(biomeName), self = this;
        if (!this.hasAnyOfBiome(biome)) return;
        var n = this.totalBiomePoints(r, biome, ppr);
        for (var i = 0; i < n; i++) {
          var p = this.randomBiomeTile(r, biome, 20, size, size, boards, function (x, y) { return predicate.call(self, x, y, size); });
          if (!p) continue;
          var nArms = typeof arms === 'function' ? arms(r) : arms;
          var lg = new LGWP(p[0] + (size / 2 | 0), p[1] + (size / 2 | 0)).addRandomArms(r, nArms, minR, maxR, minW, maxW);
          if (!lg.inBounds(this)) continue;
          this.addPreset(id, [lg.rect()], boards, { cx: lg.startTileX, cy: lg.startTileY, arm: i, lg: lg });
        }
      };
    }
    function centerOK(x, y, size) { return this.notRiverLava(x + (size / 2 | 0), y + (size / 2 | 0)); }
    function swampCorners(x, y, size) {
      var self = this, sw = B('swamp'), h = size / 2 | 0;
      return I.cornerCheck(x - h, y - h, size, size, function (a, b) { return self.notRiverLava(a, b) && self.stack.getLazyBiomeID(a, b) === sw; });
    }
    var MB = ['minibiomes'], ML = ['minibiomes', 'loot'], LOOT = ['loot'];
    // simple one-rectangle structures: findRandomBiomePresetTile + addPreset on the loot board
    function simplePreset(id, biomeName, ppr, w, h, attempts, checkBoards, valid) {
      return function (r) {
        var biome = B(biomeName), self = this;
        if (!this.hasAnyOfBiome(biome)) return;
        var n = this.totalBiomePoints(r, biome, ppr);
        for (var i = 0; i < n; i++) {
          var p = this.randomBiomeTile(r, biome, attempts, w, h, checkBoards, function (x, y) { return valid.call(self, x, y, w, h); });
          if (!p) continue;
          this.addPreset(id, [[p[0], p[1], w, h]], LOOT, null);
        }
      };
    }
    function cornersNot(test) { return function (x, y, w, h) { var self = this; return I.cornerCheck(x, y, w, h, function (a, b) { return test.call(self, a, b); }); }; }
    function gridNot(test, g) {
      return function (x, y, w, h) {
        var self = this, f = function (a, b) { return test.call(self, a, b); };
        if (!I.cornerCheck(x, y, w, h, f)) return false;
        var nx = ((w - g) / g) | 0, ny = ((h - g) / g) | 0, ox = (((w - g) % g) / 2) | 0, oy = (((h - g) % g) / 2) | 0;
        for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) if (!f(x + ox + i * g, y + oy + j * g)) return false;
        return true;
      };
    }
    function caveOK(x, y) { return this.notRiverLava(x, y); }
    function deepOK(x, y) { return this.notDeepRiverLava(x, y); }
    function caveNoLava(x, y) { return this.stack.caveLava.get(x, y) !== -1; }
    function biomeOK(name) { return function (x, y) { return this.notRiverLava(x, y) && this.stack.getLazyBiomeID(x, y) === B(name); }; }
    function centerCaveOK(x, y, w) { return this.notRiverLava(x + (w / 2 | 0), y + (w / 2 | 0)); }
    function spider(id, biome, ppr) { return linesPreset(id, biome, ppr, 28, 5, 8, 15, 3, 5, MB, centerOK); }
    function crystals(id, biome, ppr) { return linesPreset(id, biome, ppr, 14, 4, 4, 7, 4, 6, MB, centerOK); }
    function crypt(id, biome, ppr) { return linesPreset(id, biome, ppr, 12, 2, 3, 5, 8, 10, MB, centerOK); }
    function bear(id, biome, ppr) { return linesPreset(id, biome, ppr, 20, 4, 6, 10, 6, 8, MB, centerOK); }


    // ---------- point sets, paths and diamond points ----------
    function PSet() { this.m = new Map(); }
    PSet.prototype.key = function (x, y) { return x * 4294967296 + (y >>> 0); };
    PSet.prototype.add = function (x, y) { var k = x + ',' + y; if (this.m.has(k)) return false; this.m.set(k, [x, y]); return true; };
    PSet.prototype.has = function (x, y) { return this.m.has(x + ',' + y); };
    PSet.prototype.size = function () { return this.m.size; };
    PSet.prototype.values = function () { return Array.from(this.m.values()); };
    // iteration order of the game's PointHashSet (a java.util.HashSet<Long>)
    PSet.prototype.javaValues = function () {
      var J = (typeof JHashMapOrder !== 'undefined') ? JHashMapOrder : (typeof require !== 'undefined' ? require('./jhashmap.js') : null);
      return J ? J.order(this.values(), 'put') : this.values();
    };
    function diamondDist(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }
    LG.prototype.addSimplePoints = function (set, width) {
      width = fr(width); var x, y, a, b;
      if (this.x1 === this.x2 && this.y1 === this.y2) {
        var x0 = Math.floor(fr(this.x1 - width)), x1 = Math.ceil(fr(this.x1 + width)), y0 = Math.floor(fr(this.y1 - width)), y1 = Math.ceil(fr(this.y1 + width));
        for (x = x0; x <= x1; x++) for (y = y0; y <= y1; y++) if (!set.has(x, y) && diamondDist(this.x1, this.y1, x, y) <= width) set.add(x, y);
        return;
      }
      var p1, p2, dy, dx, f, lo, hi, lo2, hi2;
      if (Math.abs(this.y1 - this.y2) <= Math.abs(this.x1 - this.x2)) {
        if (this.x1 < this.x2) { p1 = [this.x1, this.y1]; p2 = [this.x2, this.y2]; } else { p1 = [this.x2, this.y2]; p2 = [this.x1, this.y1]; }
        dy = p2[1] - p1[1]; dx = p2[0] - p1[0];
        for (x = p1[0]; x <= p2[0]; x++) {
          f = fr(p1[1] + fr(dy * fr((x - p1[0]) / dx)));
          lo = Math.floor(fr(x - width)); hi = Math.ceil(fr(x + width)); lo2 = Math.floor(fr(f - width)); hi2 = Math.ceil(fr(f + width));
          for (a = lo; a <= hi; a++) for (b = lo2; b <= hi2; b++) if (!set.has(a, b) && diamondDist(a, b, x, f) <= width) set.add(a, b);
        }
      } else {
        if (this.y1 < this.y2) { p1 = [this.x1, this.y1]; p2 = [this.x2, this.y2]; } else { p1 = [this.x2, this.y2]; p2 = [this.x1, this.y1]; }
        dy = p2[1] - p1[1]; dx = p2[0] - p1[0];
        for (y = p1[1]; y <= p2[1]; y++) {
          f = fr(p1[0] + fr(dx * fr((y - p1[1]) / dy)));
          lo = Math.floor(fr(f - width)); hi = Math.ceil(fr(f + width)); lo2 = Math.floor(fr(y - width)); hi2 = Math.ceil(fr(y + width));
          for (a = lo; a <= hi; a++) for (b = lo2; b <= hi2; b++) if (!set.has(a, b) && diamondDist(a, b, f, y) <= width) set.add(a, b);
        }
      }
    };
    LG.prototype.getDiamondPoints = function () {
      var r = this.root || this, set = new PSet();
      this.addSimplePoints(set, this.width);   // getSimplePoints starts from the line it is called on, then the root's lines
      for (var i = 0; i < r.lines.length; i++) r.lines[i].addSimplePoints(set, r.lines[i].width);
      return set;
    };
    // java.awt.Rectangle.intersectsLine via outcodes
    function outcode(rx, ry, rw, rh, x, y) {
      var o = 0;
      if (rw <= 0) o |= 5; else if (x < rx) o |= 1; else if (x > rx + rw) o |= 4;
      if (rh <= 0) o |= 10; else if (y < ry) o |= 2; else if (y > ry + rh) o |= 8;
      return o;
    }
    function rectIntersectsLine(rx, ry, rw, rh, x1, y1, x2, y2) {
      var o1, o2 = outcode(rx, ry, rw, rh, x2, y2);
      if (o2 === 0) return true;
      while ((o1 = outcode(rx, ry, rw, rh, x1, y1)) !== 0) {
        if (o1 & o2) return false;
        if (o1 & 5) { var x = rx; if (o1 & 4) x += rw; y1 = y1 + (x - x1) * (y2 - y1) / (x2 - x1); x1 = x; }
        else { var y = ry; if (o1 & 8) y += rh; x1 = x1 + (y - y1) * (x2 - x1) / (y2 - y1); y1 = y; }
      }
      return true;
    }
    // LinesGeneration.pathTiles(line, diagonalFirst, consumer): returns the list of path tiles
    function pathTiles(x1, y1, x2, y2, diag) {
      x1 = fr(x1); y1 = fr(y1); x2 = fr(x2); y2 = fr(y2);
      var seen = new PSet(), cur = [Math.floor(x1), Math.floor(y1)], end = [Math.floor(x2), Math.floor(y2)], out = [cur];
      var L = [fr(fr(x1 * 32) + 16), fr(fr(y1 * 32) + 16), fr(fr(x2 * 32) + 16), fr(fr(y2 * 32) + 16)];
      function hits(x, y) { return !seen.has(x, y) && rectIntersectsLine(x * 32, y * 32, 32, 32, L[0], L[1], L[2], L[3]); }
      seen.add(cur[0], cur[1]);
      for (;;) {
        var nx = cur[0], ny = cur[1], next = null;
        if (hits(nx, ny - 1)) { if (L[0] < L[2]) seen.add(nx + 1, ny); else if (L[0] > L[2]) seen.add(nx - 1, ny); next = [nx, ny - 1]; }
        else if (hits(nx + 1, ny)) { if (L[1] < L[3]) seen.add(nx, ny + 1); else if (L[1] > L[3]) seen.add(nx, ny - 1); next = [nx + 1, ny]; }
        else if (hits(nx, ny + 1)) { if (L[0] < L[2]) seen.add(nx + 1, ny); else if (L[0] > L[2]) seen.add(nx - 1, ny); next = [nx, ny + 1]; }
        else if (hits(nx - 1, ny)) { if (L[1] < L[3]) seen.add(nx, ny - 1); else if (L[1] > L[3]) seen.add(nx, ny + 1); next = [nx - 1, ny]; }
        else if (hits(nx + 1, ny - 1)) { if (diag) { seen.add(nx + 1, ny); next = [nx, ny - 1]; } else { seen.add(nx, ny - 1); next = [nx + 1, ny]; } }
        else if (hits(nx + 1, ny + 1)) { if (diag) { seen.add(nx, ny + 1); next = [nx + 1, ny]; } else { seen.add(nx + 1, ny); next = [nx, ny + 1]; } }
        else if (hits(nx - 1, ny + 1)) { if (diag) { seen.add(nx, ny + 1); next = [nx - 1, ny]; } else { seen.add(nx - 1, ny); next = [nx, ny + 1]; } }
        else if (hits(nx - 1, ny - 1)) { if (diag) { seen.add(nx - 1, ny); next = [nx, ny - 1]; } else { seen.add(nx, ny - 1); next = [nx - 1, ny]; } }
        if (!next) break;
        seen.add(next[0], next[1]); out.push(next); cur = next;
        if (cur[0] === end[0] && cur[1] === end[1]) break;
      }
      return out;
    }
    CaveRegion.prototype.tileInBounds = function (x, y, m) { m = m || 0; return x >= this.x0 + m && x < this.x0 + this.w - m && y >= this.y0 + m && y < this.y0 + this.h - m; };
    // RegionTileWorldPresetGenerator: one placeable per level region touched, in java.util.HashMap<Long> order
    function RegionTiles() { this.keys = []; this.seen = new Set(); this.tiles = {}; }
    RegionTiles.prototype.addTile = function (x, y, fn) {
      var rx = x >> 4, ry = y >> 4, k = rx + ',' + ry;
      if (!this.seen.has(k)) { this.seen.add(k); this.keys.push([rx, ry]); }
      (this.tiles[k] || (this.tiles[k] = [])).push(x, y, fn || 0);
    };
    // java.util.HashMap<Long, ...> iteration order, treeified bins included
    RegionTiles.prototype.ordered = function () {
      var J = (typeof JHashMapOrder !== 'undefined') ? JHashMapOrder : (typeof require !== 'undefined' ? require('./jhashmap.js') : null);
      if (J) return J.order(this.keys);
      var n = this.keys.length, cap = 16; while (n > cap * 0.75) cap *= 2;
      return this.keys.map(function (k, i) { var h = k[0] ^ k[1]; h = (h ^ (h >>> 16)) & (cap - 1); return { k: k, b: h, i: i }; })
        .sort(function (a, b) { return a.b - b.b || a.i - b.i; }).map(function (e) { return e.k; });
    };

    function minecarts(r) {
      var n = this.totalPoints(r, 0.02);
      for (var i = 0; i < n; i++) {
        var p = this.randomTile(r, 10, 4, 4, null, null);
        if (!p) continue;
        var lines = [], base = new LG(null, p[0] + 2, p[1] + 2, p[0] + 2, p[1] + 2, 0), cur = base;
        var angle = r.nextInt(4) * 90, count = r.getIntBetween(6, 15);
        for (var j = 0; j < count; j++) {
          var w = r.getFloatBetween(1, 3), a = r.getIntOffset(angle, 20), len = r.getIntBetween(5, 25);
          var nl = cur.addArm(a, len, w);
          if (!this.tileInBounds(nl.x2, nl.y2, Math.ceil(w) + 1)) { cur.removeLastLine(); break; }
          cur = nl; lines.push(cur);
          angle += r.getWeighted([30, 0, 5, 90, 5, -90]);
        }
        if (base.isEmpty()) continue;
        var pts = cur.getDiamondPoints();
        // TNT lines
        var tnt = [], tc = r.getWeighted([100, 0, 200, 1, 50, 2]);
        for (var k = 0; k < tc; k++) {
          if (!lines.length) break;
          var line = lines.splice(r.nextInt(lines.length), 1)[0];
          var off = r.getIntBetween(10, 14) * r.getOneOf([1, -1]);
          var ll = fr(Math.sqrt((line.x2 - line.x1) * (line.x2 - line.x1) + (line.y2 - line.y1) * (line.y2 - line.y1)));
          var nd = normalize(fr(line.x1 - line.x2), fr(line.y1 - line.y2));
          var t = r.getFloatBetween(0, ll);
          var mx = fr(line.x2 + fr(nd[0] * t)), my = fr(line.y2 + fr(nd[1] * t));
          var A = perpPoint(mx, my, fr(2 * Math.sign(off)), nd), Bp = perpPoint(mx, my, fr(off), nd);
          var bx = Math.floor(Bp[0]), by = Math.floor(Bp[1]);
          if (this.tileInBounds(bx, by, 2)) tnt.push([A[0], A[1], Bp[0], Bp[1]]);
        }
        var gen = new RegionTiles(), q;
        pts.javaValues().forEach(function (pt) { gen.addTile(pt[0], pt[1], 1); });   // clear rock, maybe a crate
        var track = [], self = this;
        base.lines.forEach(function (l) {
          pathTiles(l.x1, l.y1, l.x2, l.y2, true).forEach(function (pt) { if (self.tileInBounds(pt[0], pt[1], 2)) { track.push(pt); gen.addTile(pt[0], pt[1], 2); } });   // track
        });
        var mc = r.getWeighted([100, 0, 200, 1, 50, 2]);
        for (k = 0; k < mc; k++) { if (!track.length) break; q = track.splice(r.nextInt(track.length), 1)[0]; gen.addTile(q[0], q[1], 5); }   // a minecart (a mob)
        tnt.forEach(function (tl) { var tp = pathTiles(tl[0], tl[1], tl[2], tl[3], true); tp.forEach(function (pt) { gen.addTile(pt[0], pt[1], 6); }); if (tp.length) { gen.addTile(tp[0][0], tp[0][1], 7); gen.addTile(tp[tp.length - 1][0], tp[tp.length - 1][1], 8); } });   // wire, lever, TNT
        this.addRegionPresets('minecarttracks', gen.ordered(), gen);
      }
    }
    function normalize(x, y) { var d = fr(Math.sqrt(x * x + y * y)); return d === 0 ? [0, 0] : [fr(x / d), fr(y / d)]; }
    function perpPoint(x, y, dist, dir) { var px = fr(-dir[1]), py = dir[0]; return [fr(x - fr(px * dist)), fr(y - fr(py * dist))]; }

    // ---------- BiomeCenterWorldPreset: chieftain arena (plains) and vulture arenas (desert) ----------
    var NB = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    CaveRegion.prototype.regionWithin = function (rx, ry, m) { var sx = this.x0 >> 4, sy = this.y0 >> 4; return rx >= sx + m && rx < sx + 64 - m && ry >= sy + m && ry < sy + 64 - m; };
    CaveRegion.prototype.isRegionBiome = function (rx, ry, b) {
      var l = this.biomeRegions[b]; if (!l) return false;
      if (!this._rb) this._rb = {};
      var s = this._rb[b]; if (!s) { s = this._rb[b] = new Set(); for (var i = 0; i < l.length; i++) s.add(l[i][0] + ',' + l[i][1]); }
      return s.has(rx + ',' + ry);
    };
    function biomeCenter(opts) {
      return function (r) {
        var biome = B(opts.biome), visited = new PSet(), self = this;
        var n = this.totalBiomePoints(r, biome, opts.ppr);
        for (var i = 0; i < n; i++) {
          for (var att = 0; att < opts.attempts; att++) {
            var list = this.biomeRegions[biome], st;
            st = (list && list.length) ? list[r.nextInt(list.length)] : null;
            if (!st) return;   // the game would throw here; never happens since the biome is present
            if (visited.has(st[0], st[1])) continue;
            var section = new PSet(), sx = st[0], sy = st[1], queue = [[st[0], st[1]]];
            section.add(st[0], st[1]); visited.add(st[0], st[1]);
            while (queue.length) {
              var c = queue.shift(), full = false;
              for (var k = 0; k < 4; k++) {
                if (section.size() >= opts.max) { full = true; break; }
                var nx = c[0] + NB[k][0], ny = c[1] + NB[k][1];
                if (section.has(nx, ny) || visited.has(nx, ny)) continue;
                var ok = this.regionWithin(nx, ny, 0) ? this.isRegionBiome(nx, ny, biome) : this.stack.getLazyBiomeID(nx * 16 + 8, ny * 16 + 8) === biome;
                if (!ok) continue;
                section.add(nx, ny); visited.add(nx, ny); sx += nx; sy += ny; queue.push([nx, ny]);
              }
              if (full || section.size() >= opts.max) break;
            }
            var ax = Math.trunc(sx / section.size()), ay = Math.trunc(sy / section.size());
            if (!this.regionWithin(ax, ay, 0)) break;
            if (section.size() <= opts.min) break;
            // breadth first from the average to the nearest valid region of the section
            var seen = new PSet(), q2 = [[ax, ay]], found = null; seen.add(ax, ay);
            while (q2.length) {
              var c2 = q2.shift();
              if (seen.size() >= section.size() || (section.has(c2[0], c2[1]) && this.regionWithin(c2[0], c2[1], 0) && opts.validFinal.call(this, c2[0], c2[1]))) { found = c2; break; }
              for (k = 0; k < 4; k++) { var bx2 = c2[0] + NB[k][0], by2 = c2[1] + NB[k][1]; if (!seen.has(bx2, by2)) { seen.add(bx2, by2); q2.push([bx2, by2]); } }
            }
            if (!found || !section.has(found[0], found[1]) || !this.regionWithin(found[0], found[1], 0) || !opts.validFinal.call(this, found[0], found[1])) break;
            opts.onFound.call(this, found[0], found[1], r);
            break;
          }
        }
      };
    }
    function lazyIs(self, b) { return function (x, y) { return self.stack.getLazyBiomeID(x, y) === b; }; }
    var chieftain = biomeCenter({
      biome: 'plains', ppr: 0.004, attempts: 50, max: 400, min: 36,
      validFinal: function (rx, ry) { var cx = rx * 16 + 8, cy = ry * 16 + 8; return I.cornerCheck(cx - 20, cy - 20, 40, 40, lazyIs(this, B('plains'))); },
      onFound: function (rx, ry, r) {
        var cx = rx * 16 + 8, cy = ry * 16 + 8, self = this, plains = B('plains');
        var base = new LG(null, cx, cy, cx, cy, 0), angle = r.nextInt(360), arms = 4, step = (360 / arms) | 0;
        function test(l, m) { return self.tileInBounds(l.x2, l.y2, m) && self.stack.getLazyBiomeID(l.x2, l.y2) === plains; }
        for (var a = 0; a < arms; a++) {
          angle += step;
          var maxLen = r.getIntBetween(150, 200), dist = 0, cur = base, ang = angle;
          while (dist < maxLen) {
            ang = r.getIntOffset(ang, 15);
            var len = r.getFloatBetween(5, 10), w = r.getFloatBetween(5, 6);
            dist = fr(dist + len);
            cur = cur.addArm(ang, len, w);
            if (!test(cur, 15)) break;
          }
          if (!test(cur, 10)) base.removeLastLine();
        }
        if (!base.isEmpty()) {
          var gen = new RegionTiles(), dpts = base.getDiamondPoints();
          (this.carved || (this.carved = [])).push(dpts);
          dpts.values().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }).forEach(function (pt) { gen.addTile(pt[0], pt[1]); });
          this.addRegionPresets('chieftainarena', gen.ordered(), gen);
        }
        this.addPreset('chieftainarena', [[cx - 20, cy - 20, 40, 40]], ML, { cx: cx, cy: cy });
      }
    });
    var vulture = biomeCenter({
      biome: 'desert', ppr: 0.015, attempts: 20, max: 400, min: 25,
      validFinal: function (rx, ry) { var cx = rx * 16 + 8, cy = ry * 16 + 8; return I.cornerCheck(cx - 18, cy - 18, 36, 36, lazyIs(this, B('desert'))); },
      onFound: function (rx, ry) { var cx = rx * 16 + 8, cy = ry * 16 + 8; this.addPreset('vulturearenas', [[cx - 18, cy - 18, 36, 36]], ML, { cx: cx, cy: cy }); }
    });
    var CAVE = {
      cavepresets: generationPresets('cavepresets', 'cave'),
      forestlootareas: simplePreset('forestlootareas', 'forest', 0.05, 15, 15, 20, LOOT, centerCaveOK),
      snowlootareas: simplePreset('snowlootareas', 'snow', 0.05, 15, 15, 20, LOOT, centerCaveOK),
      swampwitchcastle: simplePreset('swampwitchcastle', 'swamp', 0.004, 44, 34, 50, LOOT, cornersNot(biomeOK('swamp'))),
      desertcavelingoasis: simplePreset('desertcavelingoasis', 'desert', 0.004, 20, 17, 50, LOOT, cornersNot(biomeOK('desert'))),
      frenchhorn: simplePreset('frenchhorn', 'snow', 0.002, 30, 26, 20, LOOT, cornersNot(caveNoLava)),
      snowmusicplayer: simplePreset('snowmusicplayer', 'snow', 0.003, 20, 18, 20, LOOT, cornersNot(caveOK)),
      forestspidernests: spider('forestspidernests', 'forest', 0.025),
      forestsapphirecrystals: crystals('forestsapphirecrystals', 'forest', 0.012),
      forestvampirecrypts: crypt('forestvampirecrypts', 'forest', 0.0375),
      forestbearcave: bear('forestbearcave', 'forest', 0.005),
      snowcaveiceopenings: linesPreset('snowcaveiceopenings', 'snow', 0.07, 14, 2, 4, 10, 3, 6, ML, centerOK),
      snowspidernests: spider('snowspidernests', 'snow', 0.064),
      snowvampirecrypts: crypt('snowvampirecrypts', 'snow', 0.012),
      plainsbearcave: bear('plainsbearcave', 'plains', 0.005),
      swampcavespores: linesPreset('swampcavespores', 'swamp', 0.02, 24, 4, 8, 12, 8, 12, MB, swampCorners),
      swampmudareas: linesPreset('swampmudareas', 'swamp', 0.04, 15, 5, 4, 10, 3, 5, MB, swampCorners),
      swampspidernests: spider('swampspidernests', 'swamp', 0.025),
      desertamethystcrystals: crystals('desertamethystcrystals', 'desert', 0.012),
      minecarttracks: minecarts,
      chieftainarena: chieftain,
      vulturearenas: vulture,
      plainsruneboundtribes: function (r) {
        var plains = B('plains'), n = this.totalBiomePoints(r, plains, 0.017);
        for (var i = 0; i < n; i++) {
          var cell = 12, gx = r.getIntBetween(2, 3), gy = r.getIntBetween(2, 3), w = gx * cell, h = gy * cell;
          var p = this.randomBiomeTile(r, plains, 30, w, h, ML, null);
          if (!p) continue;
          this.addPreset('plainsruneboundtribes', [[p[0], p[1], w, h]], ML, { gx: gx, gy: gy });
        }
      },
      chestrooms: function (r) {
        var self = this, n = this.totalPoints(r, 0.05);
        for (var i = 0; i < n; i++) {
          var p = this.randomTile(r, 20, 7, 7, LOOT, function (x, y) { return I.cornerCheck(x, y, 7, 7, function (a, b) { return self.notRiverLava(a, b); }); });
          if (!p) continue;
          this.addPreset('chestrooms', [[p[0], p[1], 7, 7]], LOOT, { i: i });
        }
      },
      caveruins: function (r) {
        var self = this, n = this.totalPoints(r, 0.1), M = C.caveRuinsMax || [10, 10];
        for (var i = 0; i < n; i++) {
          var p = this.randomTile(r, 5, M[0], M[1], LOOT, function (x, y) { return self.notRiverLava(x + (M[0] / 2 | 0), y + (M[1] / 2 | 0)); });
          if (!p) continue;
          this.addPreset('caveruins', [[p[0], p[1], M[0], M[1]]], LOOT, { i: i });
        }
      }
    };


    // ---------- deep cave ----------
    // smooth points (LinesGeneration.getSmoothPoints with exact distance), and the cellular automaton built from them
    function distToSeg(l, x, y) {
      var dx = x - l.x1, dy = y - l.y1, ex = l.x2 - l.x1, ey = l.y2 - l.y1, dot = dx * ex + dy * ey, len = ex * ex + ey * ey, t = -1, px, py;
      if (len !== 0) t = fr(dot / len);
      if (t < 0) { px = l.x1; py = l.y1; } else if (t > 1) { px = l.x2; py = l.y2; } else { px = fr(l.x1 + fr(t * ex)); py = fr(l.y1 + fr(t * ey)); }
      return Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
    }
    LG.prototype.addSmoothPoints = function (map, width) {
      width = fr(width); var self = this, x, y, a, b;
      function put(px, py, d) {
        if (d > width) return;
        var k = px + ',' + py, o = map.get(k);
        if (!o) map.set(k, { x: px, y: py, dist: d, lw: width });
        else if (d < o.dist) map.set(k, { x: px, y: py, dist: d, lw: Math.min(width, o.lw) });
      }
      if (this.x1 === this.x2 && this.y1 === this.y2) {
        var x0 = Math.floor(fr(this.x1 - width)), x1 = Math.ceil(fr(this.x1 + width)), y0 = Math.floor(fr(this.y1 - width)), y1 = Math.ceil(fr(this.y1 + width));
        for (x = x0; x <= x1; x++) for (y = y0; y <= y1; y++) put(x, y, Math.sqrt((this.x1 - x) * (this.x1 - x) + (this.y1 - y) * (this.y1 - y)));
        return;
      }
      var p1, p2, dy, dx, f, lo, hi, lo2, hi2;
      if (Math.abs(this.y1 - this.y2) <= Math.abs(this.x1 - this.x2)) {
        if (this.x1 < this.x2) { p1 = [this.x1, this.y1]; p2 = [this.x2, this.y2]; } else { p1 = [this.x2, this.y2]; p2 = [this.x1, this.y1]; }
        dy = p2[1] - p1[1]; dx = p2[0] - p1[0];
        for (x = p1[0]; x <= p2[0]; x++) {
          f = fr(p1[1] + fr(dy * fr((x - p1[0]) / dx)));
          lo = Math.floor(fr(x - width)); hi = Math.ceil(fr(x + width)); lo2 = Math.floor(fr(f - width)); hi2 = Math.ceil(fr(f + width));
          for (a = lo; a <= hi; a++) for (b = lo2; b <= hi2; b++) put(a, b, distToSeg(self, a, b));
        }
      } else {
        if (this.y1 < this.y2) { p1 = [this.x1, this.y1]; p2 = [this.x2, this.y2]; } else { p1 = [this.x2, this.y2]; p2 = [this.x1, this.y1]; }
        dy = p2[1] - p1[1]; dx = p2[0] - p1[0];
        for (y = p1[1]; y <= p2[1]; y++) {
          f = fr(p1[0] + fr(dx * fr((y - p1[1]) / dy)));
          lo = Math.floor(fr(f - width)); hi = Math.ceil(fr(f + width)); lo2 = Math.floor(fr(y - width)); hi2 = Math.ceil(fr(y + width));
          for (a = lo; a <= hi; a++) for (b = lo2; b <= hi2; b++) put(a, b, distToSeg(self, a, b));
        }
      }
    };
    LG.prototype.getSmoothPoints = function () {
      var r = this.root || this, map = new Map();
      this.addSmoothPoints(map, this.width);
      for (var i = 0; i < r.lines.length; i++) r.lines[i].addSmoothPoints(map, r.lines[i].width);
      return map;
    };
    var ALL8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]], CLOSE4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    function CA() { this.alive = new PSet(); }
    CA.prototype.step = function (death, birth, iters, nb) {
      for (var it = 0; it < iters; it++) {
        var snap = new Map(), cells = this.alive.values();
        for (var i = 0; i < cells.length; i++) for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          var k = (cells[i][0] + dx) + ',' + (cells[i][1] + dy), self0 = dx === 0 && dy === 0, o = snap.get(k);
          if (!o) snap.set(k, [cells[i][0] + dx, cells[i][1] + dy, self0]); else if (self0) o[2] = true;
        }
        var next = new PSet();
        snap.forEach(function (v) {
          var n = 0; for (var j = 0; j < nb.length; j++) { var q = snap.get((v[0] + nb[j][0]) + ',' + (v[1] + nb[j][1])); if (q && q[2]) n++; }
          if (v[2]) { if (n >= death) next.add(v[0], v[1]); } else if (n > birth) next.add(v[0], v[1]);
        });
        this.alive = next;
      }
    };
    LG.prototype.doCellularAutomaton = function (r) {
      var pts = Array.from(this.getSmoothPoints().values()).sort(function (a, b) { return a.x - b.x || a.y - b.y; }), ca = new CA();
      for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (p.lw === 0) continue; var c = Math.abs(p.dist / p.lw - 1); if (c >= 1 || r.nextDouble() < c) ca.alive.add(p.x, p.y); }
      ca.step(4, 3, 4, ALL8);
      return ca;
    };
    // presets that occupy whole level regions on the minibiomes and loot boards (RegionTile generators with forEachRegion)
    CaveRegion.prototype.addRegionTilePresets = function (id, gen) {
      var keys = gen.ordered();
      var group = [];   // all the region pieces of one structure, in the order they are listed
      for (var i = 0; i < keys.length; i++) {
        var pr = this.addPreset(id, [[keys[i][0] * 16, keys[i][1] * 16, 16, 16]], ML, { tiles: gen.tiles[keys[i][0] + ',' + keys[i][1]] || [] });
        pr.regionTile = true;
        if (this.outside(keys[i][0], keys[i][1])) pr.outside = true;
        if (gen.ctx) { Object.defineProperty(pr.data, 'group', { value: group }); Object.defineProperty(pr.data, 'ctx', { value: gen.ctx }); group.push(pr); }
      }
    };

    var croneArena = biomeCenter({
      biome: 'plains', ppr: 0.004, attempts: 50, max: 400, min: 36,
      validFinal: function (rx, ry) { var cx = rx * 16 + 8, cy = ry * 16 + 8; return I.cornerCheck(cx - 20, cy - 20, 40, 40, lazyIs(this, B('plains'))); },
      onFound: function (rx, ry, r) {
        var cx = rx * 16 + 8, cy = ry * 16 + 8, self = this, plains = B('plains');
        var base = new LG(null, cx, cy, cx, cy, 0);
        function test(l, m) { return self.tileInBounds(l.x2, l.y2, m) && self.stack.getLazyBiomeID(l.x2, l.y2) === plains; }
        var ang = [45, r.getChance(0.5) ? -1 : 45, 135, r.getChance(0.5) ? -1 : 135, 225, r.getChance(0.5) ? -1 : 225, 270, r.getChance(0.5) ? -1 : 270, 315, r.getChance(0.5) ? -1 : 315];
        for (var a = 0; a < ang.length; a++) {
          if (ang[a] === -1) continue;
          var cur = multiArm(base, r, ang[a], 15, r.getIntBetween(150, 200), 5, 10, 5, 6, function (l) { return !test(l, 15); });
          if (!test(cur, 10)) base.removeLastLine();
        }
        if (!base.isEmpty()) {
          var gen = new RegionTiles();
          base.getDiamondPoints().values().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }).forEach(function (pt) { gen.addTile(pt[0], pt[1]); });
          this.addRegionTilePresets('cursedcronearena', gen);
        }
        this.addPreset('cursedcronearena', [[cx - 20, cy - 20, 40, 40]], ML, { cx: cx, cy: cy });
      }
    });
    function multiArm(from, r, angle, angOff, maxLen, minL, maxL, minW, maxW, stop) {
      var dist = 0, cur = from;
      while (dist < maxLen) {
        angle = r.getIntOffset(angle, angOff);
        var len = r.getFloatBetween(minL, maxL), w = r.getFloatBetween(minW, maxW);
        dist = fr(dist + len);
        cur = cur.addArm(angle, len, w);
        if (stop && stop(cur)) break;
      }
      return cur;
    }
    var desertTemple = biomeCenter({
      biome: 'desert', ppr: 0.004, attempts: 50, max: 625, min: 36,
      validFinal: function (rx, ry) { var cx = rx * 16 + 8, cy = ry * 16 + 8; return I.cornerCheck(cx - 20, cy - 20, 40, 40, lazyIs(this, B('desert'))); },
      onFound: function (rx, ry, r) {
        var cx = rx * 16 + 8, cy = ry * 16 + 8, self = this, desert = B('desert'), rad = 15.5;
        var base = new LG(null, cx, cy, cx, cy, rad);
        function test(l, m) { return self.tileInBounds(l.x2, l.y2, m) && self.stack.getLazyBiomeID(l.x2, l.y2) === desert; }
        var angle = r.nextInt(360), n = 8, step = (360 / n) | 0;
        for (var a = 0; a < n; a++) {
          angle += step;
          var cur = multiArm(base, r, angle, 15, r.getIntBetween(150, 200), 5, 10, 8, 9, function (l) { return !test(l, 15); });
          if (!test(cur, 10)) base.removeLastLine();
        }
        if (!base.isEmpty()) {
          var ca = base.doCellularAutomaton(r);
          ca.step(3, 2147483647, 1, CLOSE4);
          for (var x = cx - Math.floor(rad); x <= cx + Math.ceil(rad); x++) for (var y = cy - Math.floor(rad); y <= cy + Math.ceil(rad); y++)
            if (fr(Math.sqrt(fr(fr((cx - x) * (cx - x)) + fr((cy - y) * (cy - y))))) <= rad) ca.alive.add(x, y);
          var gen = new RegionTiles(), alive = ca.alive.values().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
          alive.forEach(function (pt) { gen.addTile(pt[0], pt[1], 1); });   // floor
          alive.forEach(function (pt) { for (var i = 0; i < 8; i++) if (!ca.alive.has(pt[0] + ALL8[i][0], pt[1] + ALL8[i][1])) { gen.addTile(pt[0], pt[1], 2); break; } });   // edge walls
          alive.forEach(function (pt) { gen.addTile(pt[0], pt[1], 3); });   // crates and vases
          for (x = cx - Math.floor(rad); x <= cx + Math.ceil(rad); x++) for (y = cy - Math.floor(rad); y <= cy + Math.ceil(rad); y++)
            if (fr(Math.sqrt(fr(fr((cx - x) * (cx - x)) + fr((cy - y) * (cy - y))))) <= rad) gen.addTile(x, y, 4);   // more in the middle
          alive.forEach(function (pt) { gen.addTile(pt[0], pt[1], 5); });   // palm furniture against the walls
          gen.ctx = { alive: ca.alive, main: [cx - 20, cy - 20, 40, 40] };
          this.addRegionTilePresets('deserttemple', gen);
        }
        this.addPreset('deserttemple', [[cx - 20, cy - 20, 40, 40]], ML, { cx: cx, cy: cy });
      }
    });
    function gridPreset(id, biomeName, ppr, cell, lo, hi, extra, attempts) {
      return function (r) {
        var biome = B(biomeName), n = this.totalBiomePoints(r, biome, ppr);
        for (var i = 0; i < n; i++) {
          var gx = r.getIntBetween(lo, hi), gy = r.getIntBetween(lo, hi), w = gx * cell + extra, h = gy * cell + extra;
          var p = this.randomBiomeTile(r, biome, attempts, w, h, ML, null);
          if (!p) continue;
          this.addPreset(id, [[p[0], p[1], w, h]], ML, { gx: gx, gy: gy, i: i });
        }
      };
    }
    // ---------- Delaunay triangulation (DelaunayTriangulator, float arithmetic) ----------
    var EPS = fr(1e-6);
    function cmpPt(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; }
    function Tri(a, b, c) {
      var s = [a, b, c].sort(cmpPt); this.p1 = s[0]; this.p2 = s[1]; this.p3 = s[2];
      this.avg = [fr(fr(fr(a[0] + b[0]) + c[0]) / 3), fr(fr(fr(a[1] + b[1]) + c[1]) / 3)]; this.complete = false;
    }
    function Edge(a, b) { if (cmpPt(a, b) === -1) { this.p1 = a; this.p2 = b; } else { this.p1 = b; this.p2 = a; } }
    Edge.prototype.key = function () { return this.p1[0] + ',' + this.p1[1] + ',' + this.p2[0] + ',' + this.p2[1]; };
    function circum(p, a, b, c) {
      var cx, cy, m1, m2, mx1, mx2, my1, my2;
      var fa = Math.abs(fr(a[1] - b[1])), fb = Math.abs(fr(b[1] - c[1]));
      if (fa < EPS) {
        if (fb < EPS) return 2;
        m2 = fr(fr(-fr(c[0] - b[0])) / fr(c[1] - b[1])); mx2 = fr(fr(b[0] + c[0]) / 2); my2 = fr(fr(b[1] + c[1]) / 2);
        cx = fr(fr(b[0] + a[0]) / 2); cy = fr(fr(m2 * fr(cx - mx2)) + my2);
      } else {
        m1 = fr(fr(-fr(b[0] - a[0])) / fr(b[1] - a[1])); mx1 = fr(fr(a[0] + b[0]) / 2); my1 = fr(fr(a[1] + b[1]) / 2);
        if (fb < EPS) { cx = fr(fr(c[0] + b[0]) / 2); cy = fr(fr(m1 * fr(cx - mx1)) + my1); }
        else {
          m2 = fr(fr(-fr(c[0] - b[0])) / fr(c[1] - b[1])); mx2 = fr(fr(b[0] + c[0]) / 2); my2 = fr(fr(b[1] + c[1]) / 2);
          cx = fr(fr(fr(fr(fr(m1 * mx1) - fr(m2 * mx2)) + my2) - my1) / fr(m1 - m2)); cy = fr(fr(m1 * fr(cx - mx1)) + my1);
        }
      }
      var dx = fr(b[0] - cx), dy = fr(b[1] - cy), rsq = fr(fr(dx * dx) + fr(dy * dy));
      dx = fr(p[0] - cx); var dxs = fr(dx * dx); dy = fr(p[1] - cy);
      if (fr(fr(dxs + fr(dy * dy)) - rsq) <= EPS) return 0;
      return (p[0] > cx && dxs > rsq) ? 1 : 2;
    }
    // returns the lines joining the centres of neighbouring triangles (the third argument of compute)
    function delaunayDual(points) {
      points.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
      var mn = [points[0][0], points[0][1]], mxp = [points[0][0], points[0][1]], i, j;
      for (i = 0; i < points.length; i++) { var q = points[i]; if (q[0] < mn[0]) mn[0] = q[0]; if (q[0] > mxp[0]) mxp[0] = q[0]; if (q[1] < mn[1]) mn[1] = q[1]; if (q[1] > mxp[1]) mxp[1] = q[1]; }
      var dmax = fr(Math.max(fr(mxp[0] - mn[0]), fr(mxp[1] - mn[1])) * 20), midx = fr(fr(mxp[0] + mn[0]) / 2), midy = fr(fr(mxp[1] + mn[1]) / 2);
      var sup = new Tri([fr(midx - dmax), fr(midy - dmax)], [midx, fr(midy + dmax)], [fr(midx + dmax), fr(midy - dmax)]);
      var edges = [], tris = [null];
      for (i = 0; i < points.length; i++) {
        var pt = points[i];
        for (j = tris.length - 1; j >= 0; j--) {
          var t = tris[j]; if (t && t.complete) continue;
          var a = t ? t.p1 : sup.p1, b = t ? t.p2 : sup.p2, c = t ? t.p3 : sup.p3, res = circum(pt, a, b, c);
          if (res === 1) { if (t) t.complete = true; }
          else if (res === 0) { edges.push(new Edge(a, b), new Edge(b, c), new Edge(c, a)); tris.splice(j, 1); }
        }
        for (var e = 0; e < edges.length; e++) {
          var E = edges[e]; if (!E) continue; var dup = false;
          for (var f = e + 1; f < edges.length; f++) { var F = edges[f]; if (F && E.p1[0] === F.p1[0] && E.p1[1] === F.p1[1] && E.p2[0] === F.p2[0] && E.p2[1] === F.p2[1]) { dup = true; edges[f] = null; } }
          if (!dup) tris.push(new Tri(E.p1, E.p2, pt));
        }
        edges = [];
      }
      var seen = new Map(), out = [];
      function same(p, q) { return p[0] === q[0] && p[1] === q[1]; }
      for (i = tris.length - 1; i >= 0; i--) {
        var T = tris[i];
        if (!T || [T.p1, T.p2, T.p3].some(function (p) { return same(p, sup.p1) || same(p, sup.p2) || same(p, sup.p3); })) { tris.splice(i, 1); continue; }
        [[T.p1, T.p2], [T.p2, T.p3], [T.p3, T.p1]].forEach(function (pr) {
          var k = new Edge(pr[0], pr[1]).key(), o = seen.get(k);
          if (o === undefined || o === null) { if (o === undefined) seen.set(k, T); else seen.set(k, T); }
          else { out.push(new Edge(o.avg, T.avg)); seen.set(k, null); }
        });
      }
      return out;
    }
    function fishian(r) {
      var swamp = B('swamp'), self = this;
      if (!this.hasAnyOfBiome(swamp)) return;
      var size = 75, n = this.totalBiomePoints(r, swamp, 0.006);
      for (var i = 0; i < n; i++) {
        var p = this.randomBiomeTile(r, swamp, 50, size, size, ML, function (x, y) { return I.cornerCheck(x, y, size, size, lazyIs(self, swamp)); });
        if (!p) continue;
        var lg = new LGWP(p[0] + (size / 2 | 0), p[1] + (size / 2 | 0)).addRandomArms(r, 16, fr(size / 2 - 10), fr(size / 2), 6, 8);
        if (!lg.inBounds(this)) continue;
        var gen = new RegionTiles(), valid = lg.lg.getDiamondPoints();
        valid.javaValues().forEach(function (pt) { gen.addTile(pt[0], pt[1], 1); });   // puddle cobble
        var rc = lg.rect(), off = -20, w = rc[2] - off * 2, h = rc[3] - off * 2, cell = 20, nx = (w / cell) | 0, ny = (h / cell) | 0;
        var ox = rc[0] + off + (((w % cell) / 2) | 0), oy = rc[1] + off + (((h % cell) / 2) | 0), pts = [];
        for (var a = 0; a < nx; a++) { var x0 = a * cell + ox; for (var b = 0; b < ny; b++) { var y0 = b * cell + oy; pts.push([fr(r.getIntBetween(x0, x0 + cell)), fr(r.getIntBetween(y0, y0 + cell))]); } }
        var dual = delaunayDual(pts), floor = new PSet(), lakeBlock = new PSet();
        dual.forEach(function (E) { pathTiles(E.p1[0], E.p1[1], E.p2[0], E.p2[1], true).forEach(function (pt) { if (valid.has(pt[0], pt[1])) { gen.addTile(pt[0], pt[1], 2); floor.add(pt[0], pt[1]); } }); });   // stone paths
        var houses = 2, housesAdded = [];
        while (pts.length) {
          var q = pts.splice(r.nextInt(pts.length), 1)[0], qx = Math.trunc(q[0]), qy = Math.trunc(q[1]);
          if (houses > 0) {
            var hx = qx - 5, hy = qy - 5;
            if (!I.gridCheck(hx, hy, 10, 10, 2, function (x, y) { return !floor.has(x, y) && valid.has(x, y); })) continue;
            houses--; housesAdded.push([hx, hy]); continue;
          }
          if (floor.has(qx, qy) || lakeBlock.has(qx, qy)) continue;
          if (r.getChance(0.2)) continue;
          var lake = new LG(null, qx, qy, qx, qy, 0), arms = r.getIntBetween(5, 7), ang = r.nextInt(360), st = (360 / arms) | 0;
          for (var k = 0; k < arms; k++) {
            ang = ang + r.getIntOffset(st, (st / 2) | 0);
            var dx = cos(ang), dy = sin(ang), end = [qx, qy];
            var path = pathTiles(q[0], q[1], fr(q[0] + fr(dx * cell)), fr(q[1] + fr(dy * cell)), true);
            for (var t = 0; t < path.length; t++) { if (floor.has(path[t][0], path[t][1]) || lakeBlock.has(path[t][0], path[t][1])) break; end = path[t]; }
            lake.addLine(Math.trunc(q[0]), Math.trunc(q[1]), end[0], end[1], r.getFloatBetween(2, 3));
          }
          var lca = lake.doCellularAutomaton(r);
          lca.alive.values().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (pt) { if (valid.has(pt[0], pt[1]) && !floor.has(pt[0], pt[1]) && !lakeBlock.has(pt[0], pt[1])) gen.addTile(pt[0], pt[1], 3); });   // ponds
        }
        floor.javaValues().forEach(function (pt) { for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) { var x = pt[0] + dx, y = pt[1] + dy; if (!floor.has(x, y) && !lakeBlock.has(x, y)) gen.addTile(x, y, 4); } });   // cobble edging
        valid.javaValues().forEach(function (pt) { if (!floor.has(pt[0], pt[1]) && r.getChance(0.2)) gen.addTile(pt[0], pt[1], 5); });   // shells, bamboo, coral
        this.addRegionTilePresets('deepswampfishianbiome', gen);
        housesAdded.forEach(function (hp, hi) { self.addPreset('deepswampfishianbiome', [[hp[0], hp[1], 10, 10]], [], { house: hi }); });
      }
    }
    var DEEP = {
      deepcavepresets: generationPresets('deepcavepresets', 'deepcave'),
      deepsnowmusicplayer: simplePreset('deepsnowmusicplayer', 'snow', 0.003, 17, 28, 20, LOOT, cornersNot(deepOK)),
      deepswampagedchampion: simplePreset('deepswampagedchampion', 'swamp', 0.006, 17, 17, 100, LOOT, cornersNot(deepOK)),
      corekeepercore: simplePreset('corekeepercore', 'swamp', 0.002, 30, 30, 100, ML, cornersNot(deepOK)),
      palworldgrizzbolt: simplePreset('palworldgrizzbolt', 'desert', 0.002, 32, 32, 100, ML, cornersNot(deepOK)),
      shrineofthemoon: simplePreset('shrineofthemoon', 'plains', 0.002, 30, 24, 100, ML, gridNot(deepOK, 4)),
      ancientrootsareas: linesPreset('ancientrootsareas', 'swamp', 0.04, 15, function (r) { return r.getIntBetween(2, 4); }, 8, 18, 2, 2, MB, swampCorners),
      deepforestrubycrystals: crystals('deepforestrubycrystals', 'forest', 0.012),
      deepplainstopazcrystals: crystals('deepplainstopazcrystals', 'plains', 0.012),
      deepswampfishianbiome: fishian,
      deepswampemeralcrystals: crystals('deepswampemeralcrystals', 'swamp', 0.012),
      deepswampspidernests: linesPreset('deepswampspidernests', 'swamp', 0.025, 45, 5, 15, 25, 3, 5, MB, function (x, y, size) { return I.cornerCheck(x, y, size, size, lazyIs(this, B('swamp'))); }),
      cursedcronearena: croneArena,
      deserttemple: desertTemple,
      deepforestabandonedmines: gridPreset('deepforestabandonedmines', 'forest', 0.005, 6, 6, 10, 1, 50),
      deepplainsruneboundtombs: gridPreset('deepplainsruneboundtombs', 'plains', 0.01, 10, 3, 4, 0, 30),
      chestrooms: function (r) {
        var self = this, n = this.totalPoints(r, 0.05);
        for (var i = 0; i < n; i++) {
          var p = this.randomTile(r, 20, 7, 7, LOOT, function (x, y) { return I.cornerCheck(x, y, 7, 7, function (a, b) { return self.notDeepRiverLava(a, b); }); });
          if (!p) continue;
          this.addPreset('chestrooms', [[p[0], p[1], 7, 7]], LOOT, { i: i });
        }
      },
      caveruins: function (r) {
        var self = this, n = this.totalPoints(r, 0.1), M = [10, 10];
        for (var i = 0; i < n; i++) {
          var p = this.randomTile(r, 5, M[0], M[1], LOOT, function (x, y) { return self.notDeepRiverLava(x + 5, y + 5); });
          if (!p) continue;
          this.addPreset('caveruins', [[p[0], p[1], M[0], M[1]]], LOOT, { i: i });
        }
      }
    };


    // ---------- surface ----------
    function multiBiomeRegion(r, reg, biomes) {
      // TicketSystemList over the biomes' region lists (tickets = list size), then one region of the chosen list
      var lists = [], total = 0;
      biomes.forEach(function (b) { var l = reg.biomeRegions[b]; if (l && l.length) { lists.push(l); total += l.length; } });
      if (!total) return null;
      var t = r.nextInt(total), acc = 0, pick = null;
      for (var i = 0; i < lists.length; i++) { if (t >= acc && t < acc + lists[i].length) { pick = lists[i]; break; } acc += lists[i].length; }
      return pick[r.nextInt(pick.length)];
    }
    CaveRegion.prototype.multiBiomeTile = function (r, biomes, attempts, w, h, boards, valid) {
      for (var i = 0; i < attempts; i++) {
        var reg = multiBiomeRegion(r, this, biomes); if (!reg) return null;
        var tx = reg[0] * 16, ty = reg[1] * 16;
        if (tx + w >= this.x0 + this.w || ty + h >= this.y0 + this.h) continue;
        var x = I.intBetween(r, tx, Math.min(tx + 15, this.x0 + this.w - w)), y = I.intBetween(r, ty, Math.min(ty + 15, this.y0 + this.h - h));
        if (biomes.indexOf(this.stack.getLazyBiomeID(x + (w / 2 | 0), y + (h / 2 | 0))) < 0) continue;
        if (boards && this.occupied(boards, x, y, w, h)) continue;
        if (!valid || valid(x, y)) return [x, y];
      }
      return null;
    };
    CaveRegion.prototype.multiBiomePoints = function (r, biomes, f) {
      var self = this, wsum = 0; biomes.forEach(function (b) { wsum += self.biomeWeight(b); });
      var d = (this.w * this.h / 256) * fr(f) * wsum, n = Math.trunc(d);
      if (d !== n && r.nextDouble() < d - n) n++;
      return n;
    };
    LG.prototype.addDiagPoints = function (set, width) {   // getSimplePoints with GameMath.diagonalMoveDistance
      width = fr(width); var SQ2 = Math.SQRT2;
      function dist(x1, y1, x2, y2) { var a = Math.abs(x1 - x2), b = Math.abs(y1 - y2); return a < b ? a * SQ2 + (b - a) : b < a ? b * SQ2 + (a - b) : a * SQ2; }
      var x, y, a, b;
      if (this.x1 === this.x2 && this.y1 === this.y2) {
        var x0 = Math.floor(fr(this.x1 - width)), x1 = Math.ceil(fr(this.x1 + width)), y0 = Math.floor(fr(this.y1 - width)), y1 = Math.ceil(fr(this.y1 + width));
        for (x = x0; x <= x1; x++) for (y = y0; y <= y1; y++) if (!set.has(x, y) && dist(this.x1, this.y1, x, y) <= width) set.add(x, y);
        return;
      }
      var p1, p2, dy, dx, f, lo, hi, lo2, hi2;
      if (Math.abs(this.y1 - this.y2) <= Math.abs(this.x1 - this.x2)) {
        if (this.x1 < this.x2) { p1 = [this.x1, this.y1]; p2 = [this.x2, this.y2]; } else { p1 = [this.x2, this.y2]; p2 = [this.x1, this.y1]; }
        dy = p2[1] - p1[1]; dx = p2[0] - p1[0];
        for (x = p1[0]; x <= p2[0]; x++) {
          f = fr(p1[1] + fr(dy * fr((x - p1[0]) / dx)));
          lo = Math.floor(fr(x - width)); hi = Math.ceil(fr(x + width)); lo2 = Math.floor(fr(f - width)); hi2 = Math.ceil(fr(f + width));
          for (a = lo; a <= hi; a++) for (b = lo2; b <= hi2; b++) if (!set.has(a, b) && dist(a, b, x, f) <= width) set.add(a, b);
        }
      } else {
        if (this.y1 < this.y2) { p1 = [this.x1, this.y1]; p2 = [this.x2, this.y2]; } else { p1 = [this.x2, this.y2]; p2 = [this.x1, this.y1]; }
        dy = p2[1] - p1[1]; dx = p2[0] - p1[0];
        for (y = p1[1]; y <= p2[1]; y++) {
          f = fr(p1[0] + fr(dx * fr((y - p1[1]) / dy)));
          lo = Math.floor(fr(f - width)); hi = Math.ceil(fr(f + width)); lo2 = Math.floor(fr(y - width)); hi2 = Math.ceil(fr(y + width));
          for (a = lo; a <= hi; a++) for (b = lo2; b <= hi2; b++) if (!set.has(a, b) && dist(a, b, f, y) <= width) set.add(a, b);
        }
      }
    };
    function charredForest(r) {
      var self = this, st = this.stack, valid = [B('forest'), B('plains')];
      if (!valid.some(function (b) { return self.hasAnyOfBiome(b); })) return;
      var n = this.multiBiomePoints(r, valid, 0.0005), size = 100, BRD = ['minibiomes', 'loot', 'villages'];
      function tileOK(x, y) { return st.ocean.get(x, y) !== -1 && valid.indexOf(st.getLazyBiomeID(x, y)) >= 0; }
      for (var i = 0; i < n; i++) {
        var dim = [size, size];
        var p = this.multiBiomeTile(r, valid, 1000, size, size, BRD, function (x, y) { return I.gridCheck(x - 10, y - 10, size + 20, size + 20, 20, tileOK); });
        if (p) this.attemptExpand(BRD, p, dim, 10, 10, tileOK, 10, 20);
        if (!p) continue;
        var m = Math.min(dim[0], dim[1]);
        var lg = new LGWP(p[0] + (dim[0] / 2 | 0), p[1] + (dim[1] / 2 | 0)).addRandomArms(r, 13, fr(m / 2 - 10), fr(m / 2), 15, 18);
        if (!lg.inBounds(this)) continue;
        var main = this.addPreset('charredforest', [[p[0], p[1], dim[0], dim[1]]], [], null);
        var gen = new RegionTiles();
        (lg.armBounds || []).forEach(function (b) { for (var rx = b.minX >> 4; rx <= b.maxX >> 4; rx++) for (var ry = b.minY >> 4; ry <= b.maxY >> 4; ry++) gen.addRegion(rx, ry); });
        var root = lg.lg, pts = new PSet();
        root.addDiagPoints(pts, root.width); root.lines.forEach(function (l) { l.addDiagPoints(pts, l.width); });
        pts.javaValues().forEach(function (pt) { gen.addTile(pt[0], pt[1], 1); });   // ash
        var rc = lg.rect(), off = -20, w = rc[2] - off * 2, h = rc[3] - off * 2, cell = 30, nx = (w / cell) | 0, ny = (h / cell) | 0;
        var ox = rc[0] + off + (((w % cell) / 2) | 0), oy = rc[1] + off + (((h % cell) / 2) | 0), grid = [];
        for (var a = 0; a < nx; a++) { var x0 = a * cell + ox; for (var c = 0; c < ny; c++) { var y0 = c * cell + oy; grid.push([fr(r.getIntBetween(x0, x0 + cell)), fr(r.getIntBetween(y0, y0 + cell))]); } }
        var dual = delaunayDual(grid);
        dual.forEach(function (E) { pathTiles(E.p1[0], E.p1[1], E.p2[0], E.p2[1], true).forEach(function (pt) { if (pts.has(pt[0], pt[1])) gen.addTile(pt[0], pt[1], 2); }); });   // gravel paths
        pts.javaValues().forEach(function (pt) { if (r.getChance(0.15)) gen.addTile(pt[0], pt[1], 3); });   // burned trees, bushes, rocks
        this.addRegionTilePresets('charredforest', gen);
      }
    }
    RegionTiles.prototype.addRegion = function (rx, ry) { var k = rx + ',' + ry; if (!this.seen.has(k)) { this.seen.add(k); this.keys.push([rx, ry]); } };
    // CharredForestMiniBiomeWorldPreset.attemptExpand: grow the rectangle side by side while the border stays valid
    CaveRegion.prototype.attemptExpand = function (boards, pt, dim, res, max, valid, pad, step) {
      var L1 = true, R1 = true, U1 = true, D1 = true, count = 0;
      while (max > 0) {
        var grew = false, y0 = pt[1], cnt = Math.max(Math.ceil(fr(fr(dim[1] + pad * 2) / step)), 1), x = pt[0] - res - pad, i, yy;
        if (L1 && !this.occupied(boards, x, y0, res, dim[1])) {
          for (i = 0; i < cnt; i++) { yy = Math.min(pt[1] - pad + i * step, y0 + dim[1] - 1 + pad); if (!valid(x, yy)) { L1 = false; break; } }
          if (L1) { pt[0] -= res; dim[0] += res; grew = true; max--; count++; if (max <= 0) break; }
        }
        x = pt[0] + dim[0] + pad;
        if (R1 && !this.occupied(boards, x, y0, res, dim[1])) {
          for (i = 0; i < cnt; i++) { yy = Math.min(pt[1] - pad + i * step, y0 + dim[1] - 1 + pad); if (!valid(x, yy)) { R1 = false; break; } }
          if (R1) { dim[0] += res; grew = true; max--; count++; if (max <= 0) break; }
        }
        var x0 = pt[0], xx; cnt = Math.max(Math.ceil(fr(fr(dim[0] + pad * 2) / step)), 1); var y = pt[1] - res - pad;
        if (U1 && !this.occupied(boards, x0, y, dim[0], res)) {
          for (i = 0; i < cnt; i++) { xx = Math.min(pt[0] - pad + i * step, x0 + dim[0] - 1 + pad); if (!valid(xx, y)) { U1 = false; break; } }
          if (U1) { pt[1] -= res; dim[1] += res; grew = true; max--; count++; if (max <= 0) break; }
        }
        y = pt[1] + dim[1] + pad;
        if (D1 && !this.occupied(boards, x0, y, dim[0], res)) {
          for (i = 0; i < cnt; i++) { xx = Math.min(pt[0] - pad + i * step, x0 + dim[0] - 1 + pad); if (!valid(xx, y)) { D1 = false; break; } }
          if (D1) { dim[1] += res; grew = true; max--; count++; if (max <= 0) break; }
        }
        if (!grew) break;
      }
      return count;
    };
    // ---------- GenerationPresetsWorldPreset (surfacepresets, cavepresets, deepcavepresets): many small presets drawn from tickets ----------
    function GTickets() { this.l = []; this.total = 0; }
    GTickets.prototype.add = function (n, o) { this.l.push([this.total, this.total + n, o]); this.total += n; };
    GTickets.prototype.random = function (r) { if (!this.l.length) return null; var v = r.nextInt(this.total); for (var i = 0; i < this.l.length; i++) if (v >= this.l[i][0] && v < this.l[i][1]) return this.l[i][2]; return null; };
    // PresetUtils.getRotatedPoint around (cx, cy); rot 1 clockwise, 2 half, 3 anticlockwise
    function rotPt(x, y, cx, cy, rot) { var dx = x - cx, dy = y - cy; return rot === 1 ? [cx - dy, cy + dx] : rot === 2 ? [cx - dx, cy - dy] : rot === 3 ? [cx + dy, cy - dx] : [x, y]; }
    function rotInSpace(x, y, w, h, rot) { var p = rotPt(x, y, 0, 0, rot); if (rot === 1) p[0] += h - 1; else if (rot === 2) { p[0] += w - 1; p[1] += h - 1; } else if (rot === 3) p[1] += w - 1; return p; }
    function Tester(w, h, preds) { this.w = w; this.h = h; this.p = preds; }
    Tester.prototype.mirrorX = function () { var w = this.w; return new Tester(w, this.h, this.p.map(function (q) { return [w - 1 - q[0], q[1], w - 1 - q[2], q[3], q[4], q[5]]; })); };
    Tester.prototype.mirrorY = function () { var h = this.h; return new Tester(this.w, h, this.p.map(function (q) { return [q[0], h - 1 - q[1], q[2], h - 1 - q[3], q[4], q[5]]; })); };
    Tester.prototype.rotate = function (rot) {
      if (!rot) return this;
      var w = this.w, h = this.h, s = rotPt(w, h, 0, 0, rot);
      return new Tester(Math.abs(s[0]), Math.abs(s[1]), this.p.map(function (q) { var a = rotInSpace(q[0], q[1], w, h, rot), b = rotInSpace(q[2], q[3], w, h, rot); return [a[0], a[1], b[0], b[1], q[4], q[5]]; }));
    };
    function gpTest(reg, key, biomes, fn) {
      var st = reg.stack, swamp = biomes.indexOf(B('swamp')) >= 0, lv = key === 'cavepresets' ? 'cave' : key === 'deepcavepresets' ? 'deepcave' : 'surface';
      function levelWater(x, y, beach) {
        if (lv === 'cave') return !reg.notRiverLava(x, y);
        if (lv === 'deepcave') return !reg.notDeepRiverLava(x, y);
        return beach ? st.river.get(x, y) < 0 : st.river.get(x, y) === -1;
      }
      switch (fn) {
        case 'biome': return function (x, y) { return !biomes.length || biomes.indexOf(st.getLazyBiomeID(x, y)) >= 0; };
        case 'nw': return function (x, y) { return !levelWater(x, y, false); };
        case 'nwb': return function (x, y) { return !levelWater(x, y, true); };
        case 'nwlb': return function (x, y) { if (lv !== 'surface') return !levelWater(x, y, true); return swamp ? !(st.water.get(x, y) < 0) : !(st.river.get(x, y) < 0); };
        case 'wl': return function (x, y) { if (lv !== 'surface') return levelWater(x, y, false); return swamp ? st.water.get(x, y) === -1 : st.river.get(x, y) === -1; };
        case 'ocean': return function (x, y) { return lv === 'surface' && st.ocean.get(x, y) === -1; };
        case 'nocean': return function (x, y) { return st.ocean.get(x, y) !== -1; };
        case 'deepnw': return function (x, y) { return reg.notDeepRiverLava(x, y); };
      }
      return function () { return true; };
    }
    CaveRegion.prototype.gpCanApply = function (key, e, t, x, y) {
      if (x < this.x0 || y < this.y0 || x + t.w > this.x0 + this.w || y + t.h > this.y0 + this.h) return false;
      for (var i = 0; i < t.p.length; i++) {
        var q = t.p[i], f = gpTest(this, key, e.b, q[4]);
        var ax = x + Math.min(q[0], q[2]), ay = y + Math.min(q[1], q[3]), w = Math.abs(q[2] - q[0]) + 1, h = Math.abs(q[3] - q[1]) + 1;
        if (!(q[5] ? I.gridCheck(ax, ay, w, h, q[5], f) : I.cornerCheck(ax, ay, w, h, f))) return false;
      }
      return true;
    };
    CaveRegion.prototype.gpBiomeRegion = function (r, biomes) {
      if (!biomes.length) return [(this.x0 >> 4) + r.nextInt(64), (this.y0 >> 4) + r.nextInt(64)];
      var t = new GTickets(), self = this;
      biomes.slice().sort(function (a, b) { return a - b; }).forEach(function (b) { var l = self.biomeRegions[b]; if (l && l.length) t.add(l.length, l); });
      var l = t.random(r); if (!l || !l.length) return null;
      return l[r.nextInt(l.length)];
    };
    CaveRegion.prototype.gpTileFromRegion = function (r, reg, w, h) {
      var tx = reg[0] * 16, ty = reg[1] * 16;
      if (!(tx + w < this.x0 + this.w) || !(ty + h < this.y0 + this.h)) return null;
      return [I.intBetween(r, tx, Math.min(tx + 15, this.x0 + this.w - w)), I.intBetween(r, ty, Math.min(ty + 15, this.y0 + this.h - h))];
    };
    var ROTS = [1, 3, 2, 0];   // getOneOf(CLOCKWISE, ANTI_CLOCKWISE, HALF_180, null)
    CaveRegion.prototype.gpFindSimple = function (r, key, e) {
      var base = new Tester(e.w, e.h, e.p);
      for (var i = 0; i < e.a; i++) {
        var reg = this.gpBiomeRegion(r, e.b); if (!reg) return null;
        var p = this.gpTileFromRegion(r, reg, base.w, base.h); if (!p) continue;
        if (this.occupied(e.chk, p[0], p[1], base.w, base.h)) continue;
        if (e.f & 8) {
          var opts = [], t0 = base, mx = false, my = false, rot = 0;
          if (e.f & 4) {
            rot = ROTS[r.nextInt(4)]; var t1 = base.rotate(rot);
            if (this.gpCanApply(key, e, t1, p[0], p[1])) opts.push({ t: t1, rot: rot, mx: false, my: false });
            if (e.f & 1) { var t2 = t1.mirrorX(); if (this.gpCanApply(key, e, t2, p[0], p[1])) opts.push({ t: t2, rot: rot, mx: true, my: false }); }
            if (e.f & 2) { var t3 = t1.mirrorY(); if (this.gpCanApply(key, e, t3, p[0], p[1])) opts.push({ t: t3, rot: rot, mx: false, my: true }); }
          } else {
            if (e.f & 1) { var t4 = base.mirrorX(); if (this.gpCanApply(key, e, t4, p[0], p[1])) opts.push({ t: t4, rot: 0, mx: true, my: false }); }
            if (e.f & 2) { var t5 = base.mirrorY(); if (this.gpCanApply(key, e, t5, p[0], p[1])) opts.push({ t: t5, rot: 0, mx: false, my: true }); }
          }
          if (opts.length) { var o = opts[r.nextInt(opts.length)]; return { x: p[0], y: p[1], t: o.t, rot: o.rot, mx: o.mx, my: o.my }; }
          continue;
        }
        var t = base, fmx = false, fmy = false, frot = 0;
        if ((e.f & 1) && r.nextBoolean()) { t = t.mirrorX(); fmx = true; }
        if ((e.f & 2) && r.nextBoolean()) { t = t.mirrorY(); fmy = true; }
        if (e.f & 4) { frot = ROTS[r.nextInt(4)]; t = t.rotate(frot); }
        if (this.gpCanApply(key, e, t, p[0], p[1])) return { x: p[0], y: p[1], t: t, rot: frot, mx: fmx, my: fmy };
      }
      return null;
    };
    CaveRegion.prototype.gpFindFishingHut = function (r, key, e) {
      var base = new Tester(15, 9, [[0, 0, 5, 4, 'nocean', 0], [11, -1, 15, 3, 'ocean', 0]]), st = this.stack;
      for (var i = 0; i < 100; i++) {
        var reg = this.gpBiomeRegion(r, e.b); if (!reg) return null;
        var p = this.gpTileFromRegion(r, reg, 15, 9); if (!p) continue;
        if (e.b.length && e.b.indexOf(st.getLazyBiomeID(p[0] + 8, p[1] + 3)) < 0) continue;
        if (st.ocean.get(p[0] + 8, p[1] + 3) !== -2) continue;
        if (this.occupied(['villages', 'minibiomes', 'loot'], p[0], p[1], 15, 9)) continue;
        if (this.gpCanApply(key, e, base, p[0], p[1])) return { x: p[0], y: p[1], t: base, rot: 0, mx: false, my: false };
        var m = base.mirrorX(); if (this.gpCanApply(key, e, m, p[0] + 1, p[1])) return { x: p[0] + 1, y: p[1], t: m, rot: 0, mx: true, my: false };
        var c = base.rotate(1); if (this.gpCanApply(key, e, c, p[0] + 2, p[1] - 5)) return { x: p[0] + 2, y: p[1] - 5, t: c, rot: 1, mx: false, my: false };
        if (this.gpCanApply(key, e, c, p[0] + 2, p[1] - 5)) return { x: p[0] + 2, y: p[1] - 5, t: c, rot: 1, mx: false, my: false };
      }
      return null;
    };
    function generationPresets(key, level) {
      return function (r) {
        var D = G.GPData && G.GPData[key]; if (!D) return;
        var self = this, t = new GTickets(), sum = 0, raw = 0;
        D.list.forEach(function (e) {
          var w = 0; e.b.forEach(function (b) { w += self.weights[b] || 0; });
          var n = Math.trunc(e.t * (w / self.totalWeight)); if (n < 1) n = 1;
          t.add(n, e); sum += n; raw += e.t;
        });
        if (raw - sum > 0) t.add(raw - sum, null);
        var left = (this.w * this.h / 256) * fr(D.ppr);
        while (left > 0) {
          if (left < 1 && !(r.nextDouble() < left)) break;
          left -= 1;
          var e = t.random(r); if (!e) continue;
          var found = e.c === 'FishingHut' ? this.gpFindFishingHut(r, key, e) : this.gpFindSimple(r, key, e);
          if (!found) continue;
          var boards = e.c === 'FishingHut' ? ['villages', 'minibiomes', 'loot'] : e.set;
          this.addPreset('gp:' + e.c, [[found.x, found.y, found.t.w, found.t.h]], boards, { gp: e.c, i: D.list.indexOf(e), rot: found.rot, mx: found.mx, my: found.my });
        }
      };
    }
    var LV = ['loot', 'villages'];
    // one-off surface spots: findRandomBiomePresetTile with a corner check, then addPreset on the given boards
    function surfaceSpot(id, biomeName, ppr, w, h, attempts, checkBoards, spawnRange, ok, setBoards) {
      return function (r) {
        var st = this.stack, biome = B(biomeName);
        if (!this.hasAnyOfBiome(biome)) return;
        var n = this.totalBiomePoints(r, biome, ppr);
        for (var i = 0; i < n; i++) {
          var p = this.randomBiomeTile(r, biome, attempts, w, h, checkBoards, function (x, y) { return I.cornerCheck(x, y, w, h, function (a, b) { return ok(st, a, b); }); });
          if (!p) continue;
          var e = this.addPreset(id, [[p[0], p[1], w, h]], setBoards || checkBoards, null);
          if (spawnRange >= 0) e.spawnRange = spawnRange;
        }
      };
    }
    var SURF = {
      dungeonentrance: function (r) {
        var st = this.stack, forest = B('forest'), n = this.totalBiomePoints(r, forest, 0.002);
        var ok = function (x, y) { return st.getLazyBiomeID(x, y) === forest && !st.isSurfaceOceanOrRiver(x, y); };
        for (var i = 0; i < n; i++) {
          var p = this.randomBiomeTile(r, forest, 20, 20, 20, LV, function (x, y) { return I.cornerCheck(x, y, 20, 20, ok); });
          if (!p) continue;
          this.addPreset('dungeonentrance', [[p[0], p[1], 20, 20]], LV, null).spawnRange = -1;
        }
      },
      piratevillages: function (r) {
        var st = this.stack, forest = B('forest'), n = this.totalBiomePoints(r, forest, 0.001);
        var ok = function (x, y) { return !st.isSurfaceOcean(x, y) && st.getLazyBiomeID(x, y) === forest; };
        for (var i = 0; i < n; i++) {
          var size = I.intBetween(r, 60, 80), pad = 35;
          var p = this.randomBiomeTile(r, forest, 200, size, size, ['villagespadding', 'villages'], function (x, y) { return I.gridCheck(x, y, size, size, 20, ok); });
          if (!p) continue;
          this.addPreset('piratevillages', [[p[0], p[1], size, size]], ['villages'], null).spawnRange = 7;
          this.occupy('villagespadding', p[0] - pad, p[1] - pad, size + pad * 2, size + pad * 2);
          var gen = new RegionTiles(), m = 20;
          for (var rx = (p[0] - m) >> 4; rx <= (p[0] + size + m * 2 - 1) >> 4; rx++) for (var ry = (p[1] - m) >> 4; ry <= (p[1] + size + m * 2 - 1) >> 4; ry++) gen.addRegion(rx, ry);
          this.addRegionPresets('piratevillages', gen.ordered());
        }
      },
      surfacevillages: function (r) {
        var st = this.stack, n = this.totalPoints(r, 0.001);
        for (var i = 0; i < n; i++) {
          var size = I.intBetween(r, 60, 120), sets = 0;
          var p = this.randomTile(r, 200, size, size, ['villagespadding', 'villages'], function (x, y) {
            if (!I.gridCheck(x, y, size, size, 16, function (a, b) { return !st.isSurfaceOceanOrRiver(a, b); })) return false;
            var seen = {};
            var ok = I.gridCheck(x, y, size, size, 16, function (a, b) { var id = st.getLazyBiomeID(a, b); if (C.villageSets[id] == null) return false; seen[id] = 1; return true; });
            if (ok) for (var id in seen) if (C.villageSets[id] > 0) sets++;
            if (!sets) return false;
            return ok;
          });
          if (!p) continue;
          this.addPreset('surfacevillages', [[p[0], p[1], size, size]], ['villages'], null).spawnRange = 7;
        }
      },
      charredforest: charredForest,
      swampwitchcabins: surfaceSpot('swampwitchcabins', 'swamp', 0.004, 14, 15, 50, ['loot', 'villages'], 1, function (st, x, y) { return !st.isSurfaceExpensiveWater(x, y) && st.getLazyBiomeID(x, y) === B('swamp'); }),
      katanaruins: surfaceSpot('katanaruins', 'plains', 0.004, 9, 9, 50, ['loot', 'villages'], 1, function (st, x, y) { return !(st.ocean.get(x, y) < 0) && st.getLazyBiomeID(x, y) === B('plains'); }),
      mimegarden: surfaceSpot('mimegarden', 'forest', 0.001, 9, 9, 50, ['loot', 'villages'], 4, function (st, x, y) { return !(st.ocean.get(x, y) < 0) && st.getLazyBiomeID(x, y) === B('forest'); }),
      valheimhugin: surfaceSpot('valheimhugin', 'forest', 0.001, 20, 20, 100, ['villages', 'minibiomes', 'loot'], -1, function (st, x, y) { return !st.isSurfaceOceanOrRiver(x, y); }, ['loot']),
      thrumbodanger: surfaceSpot('thrumbodanger', 'plains', 0.001, 30, 30, 100, ['villages', 'minibiomes', 'loot'], -1, function (st, x, y) { return !st.isSurfaceOceanOrRiver(x, y); }, ['loot']),
      surfacepresets: generationPresets('surfacepresets', 'surface'),
      surfaceruins: function (r) {
        var st = this.stack, n = this.totalPoints(r, 0.01);
        for (var i = 0; i < n; i++) {
          var p = this.randomTile(r, 20, 9, 9, LV, function (x, y) { return I.cornerCheck(x, y, 9, 9, function (a, b) { return !st.isSurfaceExpensiveWater(a, b); }); });
          if (!p) continue;
          this.addPreset('surfaceruins', [[p[0], p[1], 9, 9]], ['loot'], null).spawnRange = 1;
        }
      }
    };

    // ---------- structures that reach over a 1024-tile edge (LevelPresetsRegion generation runs) ----------
    // Presets that share a level region form one generation run, started by the first of its regions (inside its own
    // 1024 area) the game generates; the run generates its regions, then places its presets, skipping any preset with
    // another region generated before. Pieces past the edge are placed with their run, and writing them generates
    // (and so runs the presets of) the neighbour's region first, so they end up on top. Regions are taken to be
    // generated in reading order. This works out which presets of one area are never placed (p.skip) and which
    // tiles a neighbour's piece covers (p.covered: Set of tile keys).
    var STRADDLE = { minecarttracks: 1, chieftainarena: 1, cursedcronearena: 1, deserttemple: 1, deepswampfishianbiome: 1, charredforest: 1 };
    function presetRegions(p) {
      var out = [];
      p.rects.forEach(function (q) { for (var rx = q[0] >> 4; rx <= (q[0] + q[2] - 1) >> 4; rx++) for (var ry = q[1] >> 4; ry <= (q[1] + q[3] - 1) >> 4; ry++) out.push(rx + ',' + ry); });
      return out;
    }
    G.BiomeStack.prototype.edgeFlags = function (fn, px, py) {
      var mine = this[fn](px, py);
      if (mine._edge) return mine;
      mine._edge = true;
      var st = this, need = {}, x0 = px * 1024, y0 = py * 1024;
      mine.forEach(function (p) {
        if (p.outside) need[Math.floor(p.fx / 64) + ',' + Math.floor(p.fy / 64)] = 1;
        if (!STRADDLE[p.id] || p.regionOnly || p.regionTile) return;
        var q = p.rects[0], dxs = [0], dys = [0];
        if (q[0] - x0 < 64) dxs.push(-1); if (x0 + 1024 - (q[0] + q[2]) < 64) dxs.push(1);
        if (q[1] - y0 < 64) dys.push(-1); if (y0 + 1024 - (q[1] + q[3]) < 64) dys.push(1);
        dxs.forEach(function (dx) { dys.forEach(function (dy) { if (dx || dy) need[(px + dx) + ',' + (py + dy)] = 1; }); });
      });
      delete need[px + ',' + py];
      var areas = [[px, py]].concat(Object.keys(need).map(function (k) { return k.split(',').map(Number); }));
      if (areas.length === 1 && !mine.some(function (p) { return p.outside; })) return mine;
      // generation runs per area: presets joined through the regions they share
      var runs = [], runAt = {};   // runAt['ax,ay|rx,ry'] -> run
      areas.forEach(function (a) {
        var list = a[0] === px && a[1] === py ? mine : st[fn](a[0], a[1]), local = {};
        list.forEach(function (p) {
          var regs = presetRegions(p), run = null;
          regs.forEach(function (r) {
            var o = local[r];
            if (o && run && o !== run) { o.presets.forEach(function (q) { run.presets.push(q); }); Object.keys(o.regions).forEach(function (k) { run.regions[k] = 1; local[k] = run; }); o.dead = true; }
            else if (o && !run) run = o;
          });
          if (!run) { run = { area: a, presets: [], regions: {} }; runs.push(run); }
          run.presets.push(p); regs.forEach(function (r) { run.regions[r] = 1; local[r] = run; });
          p._regs = regs;
        });
        Object.keys(local).forEach(function (r) { runAt[a[0] + ',' + a[1] + '|' + r] = local[r]; });
      });
      runs = runs.filter(function (r) { return !r.dead; });
      runs.forEach(function (r) { r.presets.sort(function (a, b) { return a.index - b.index; }); });
      function owner(r) { var c = r.split(','); return Math.floor(+c[0] / 64) + ',' + Math.floor(+c[1] / 64); }
      function inside(run, r) { return owner(r) === run.area[0] + ',' + run.area[1]; }
      var gen = {}, clock = 0, wrote = {};   // region -> time generated; tile key -> the outside piece that wrote it last
      function generate(r) {
        if (gen[r] !== undefined) return;
        gen[r] = clock++;
        var run = runAt[owner(r) + '|' + r];
        if (run && !run.ran) start(run, r);
      }
      function start(run, trig) {
        run.ran = true;
        run.presets.forEach(function (p) { p._skip = p._regs.some(function (r) { return r !== trig && gen[r] !== undefined; }); });
        Object.keys(run.regions).forEach(function (r) { if (inside(run, r) && gen[r] === undefined) gen[r] = clock++; });
        run.presets.forEach(function (p) {
          if (p._skip) return;
          p._regs.forEach(function (r) {
            if (inside(run, r)) return;
            generate(r);                                   // the neighbour's region (and its presets) first
            if (p.data && p.data.tiles) for (var i = 0; i < p.data.tiles.length; i += 3) wrote[p.data.tiles[i] + ',' + p.data.tiles[i + 1]] = p;
          });
        });
      }
      var all = {};
      runs.forEach(function (run) { Object.keys(run.regions).forEach(function (r) { if (inside(run, r)) all[r] = 1; }); });
      Object.keys(all).map(function (r) { return r.split(',').map(Number); })
        .sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; })
        .forEach(function (c) { generate(c[0] + ',' + c[1]); });
      mine.forEach(function (p) {
        p.skip = !!p._skip;
        if (p.data && p.data.tiles && !p.outside) {
          var cov = null;
          for (var i = 0; i < p.data.tiles.length; i += 3) { var k = p.data.tiles[i] + ',' + p.data.tiles[i + 1], w = wrote[k]; if (w && w !== p && w.fx !== undefined && !mine.includes(w)) (cov || (cov = new Set())).add(k); }
          if (cov) p.covered = cov;
        }
      });
      return mine;
    };

    G.BiomeStack.prototype.cavePresets = function (px, py) {
      var key = px + ',' + py, c = this._cavePresetCache || (this._cavePresetCache = new Map());
      if (!c.has(key)) c.set(key, new CaveRegion(this, this.seed, px, py, CAVE_HASH).presets);
      return c.get(key);
    };
    G.BiomeStack.prototype.deepPresets = function (px, py) {
      var key = px + ',' + py, c = this._deepPresetCache || (this._deepPresetCache = new Map());
      if (!c.has(key)) c.set(key, new CaveRegion(this, this.seed, px, py, DEEP_HASH).presets);
      return c.get(key);
    };
    G.BiomeStack.prototype.surfacePresetsFull = function (px, py) {
      var key = px + ',' + py, c = this._surfPresetCache || (this._surfPresetCache = new Map());
      if (!c.has(key)) c.set(key, new CaveRegion(this, this.seed, px, py, SURF_HASH).presets);
      return c.get(key);
    };
    G.Cave = { DEEP: DEEP, SURF: SURF, delaunayDual: delaunayDual, CaveRegion: CaveRegion, LG: LG, LGWP: LGWP, cos: cos, sin: sin, fixAngle: fixAngle, CAVE: CAVE, CAVE_HASH: CAVE_HASH };
    return G;
  }
  var api = { install: install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NecesseCave = api;
})(typeof self !== 'undefined' ? self : this);

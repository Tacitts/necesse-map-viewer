/*
 * Natural decoration of generated regions: trees, grass, flowers, bushes, rocks, crates, ores and cave plants.
 * A port of Biome.generateRegion{Surface,Cave,DeepCave}Terrain with BiomeGeneratorStack.startPlace / startPlaceOnVein
 * (GeneratorPlaceFactory): for every biome present in a 16x16 region (in biome ID order) a fresh region random runs
 * the biome's rules in order; each rule takes its own seeded random and walks the region column by column.
 * Rules come from port/biomerules.json (parsed from the game's code by mkrules.py).
 */
(function (root) {
  'use strict';
  function install(G, objectNames) {
    var R = null, f = Math.fround, ON = objectNames;
    var NAME_ID = {}; ON.forEach(function (n, i) { if (n && NAME_ID[n] === undefined) NAME_ID[n] = i; });
    var BIOME = { 1: 'Forest', 2: 'Plains', 3: 'Desert', 4: 'Swamp', 5: 'Snow' };
    var OVERGROWN = { grasstile: 'overgrowngrasstile', plainsgrasstile: 'overgrownplainsgrasstile', swampgrasstile: 'overgrownswampgrasstile' };
    var LIQ = {}, ORGANIC = {}, GRASS = {}, TREE = {};
    // SideMultiTile log benches: [dx, dy, part] for each rotation (part 0 is the master)
    var SIDE = [[[0, -1, 1], [0, 0, 0]], [[0, 0, 0], [1, 0, 1]], [[0, 0, 0], [0, 1, 1]], [[-1, 0, 1], [0, 0, 0]]];

    G.setDecoRules = function (rules) {
      R = rules; G.setBiomeRules(rules); G.decoReady = true; G.decoRules = rules;
      R.liquidTiles.forEach(function (t) { LIQ[t] = 1; }); R.organicTiles.forEach(function (t) { ORGANIC[t] = 1; });
      R.isGrass.forEach(function (n) { GRASS[n] = 1; }); R.isTree.forEach(function (n) { TREE[n] = 1; });
      for (var k in R.rules) {   // the snow piles are placed in a loop: one rule for each of snowpile0..3
        var out = [];
        R.rules[k].forEach(function (r) {
          if (r.op === 'place' && r.place[1] === 'snowpile') for (var i = 0; i < 4; i++) out.push({ op: 'place', tests: r.tests, place: [r.place[0], 'snowpile' + i] });
          else if (r.op === 'place' || r.op === 'liquid') out.push(r);
        });
        R.rules[k] = out;
      }
    };

    // the tiles an object covers when its master is at (x, y)
    function parts(name, x, y, rot) {
      var m = R.multi[name];
      if (!m) return [[x, y, name]];
      var id = NAME_ID[name], out = [];
      if (m[0] === 'SideMultiTile') { SIDE[rot & 3].forEach(function (p) { out.push([x + p[0], y + p[1], ON[id + p[2]]]); }); return out; }
      for (var j = 0; j < m[2]; j++) for (var i = 0; i < m[1]; i++) out.push([x + i - m[3], y + j - m[4], ON[id + j * m[1] + i]]);
      return out;
    }

    // objects that may also lie on object layer 1 (GameObject.getValidObjectLayers): a layer-0 object placed on one pushes it there
    var LAYER1 = {}; ['woolcarpet', 'leathercarpet', 'brownbearcarpet', 'bluecarpet', 'goldgridcarpet', 'greencarpet', 'heartcarpet', 'purplecarpet', 'redyarncarpet',
      'steelgreycarpet', 'velourcarpet', 'groundslime', 'yellowflowerpatch', 'redflowerpatch', 'purpleflowerpatch', 'blueflowerpatch', 'whiteflowerpatch'].forEach(function (n) { LAYER1[n] = 1; });
    var MPART = null;   // part name -> { w, h, i, j, names } for the StaticMultiTile objects biomes place
    function multiPart(n) {
      if (!MPART) { MPART = {};
        Object.keys(R.multi || {}).forEach(function (name) { var m = R.multi[name], id = NAME_ID[name]; if (m[0] !== 'StaticMultiTile' || id === undefined) return;
          var names = []; for (var j = 0; j < m[2]; j++) for (var i = 0; i < m[1]; i++) names.push(ON[id + j * m[1] + i]);
          for (j = 0; j < m[2]; j++) for (i = 0; i < m[1]; i++) MPART[names[j * m[1] + i]] = { w: m[1], h: m[2], i: i, j: j, names: names }; }); }
      return MPART[n] || null;
    }
    var VALIDATE = { surface: true };   // in the caves no shores exist yet when regions are validated
    function isValid(name, x, y, tileAt, objAt) {
      var cls = R.classes[name]; if (!cls) return true;   // only the objects biomes place (not their extra parts)
      var t = tileAt(x, y), fl = R.flags[name] || [false, false, [], false], ov = R.tileOverrides[t] || [false, false];
      function liq(x, y) { return !!LIQ[tileAt(x, y)]; }
      var shore = false;
      if (!LIQ[t]) for (var dy = -1; dy <= 1 && !shore; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && liq(x + dx, y + dy)) { shore = true; break; }
      if (cls === 'SingleRockSmall' || cls === 'SmallRuneStoneObject') return !shore;
      if (cls === 'CustomWildFlowerObject') return fl[2].indexOf(t) >= 0;
      if (!fl[0] && LIQ[t] && !ov[0]) return false;
      if (!fl[1] && shore && !ov[1]) return false;
      function adjTree() { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && TREE[objAt(x + dx, y + dy)]) return true; return false; }
      if (TREE[name] && adjTree()) return false;
      var g = R.grass[name];
      if (g && (g[1].length ? g[1].indexOf(t) < 0 : (g[2] && !ORGANIC[t]))) return false;
      if (cls === 'FlowerPatchObject' && !ORGANIC[t] && t !== 'snowtile') return false;
      if (cls === 'SnowPileObject' && t !== 'snowtile') return false;
      if (cls === 'CactusObject' && t !== 'sandtile') return false;
      if (cls === 'RandomCrateObject' && t === 'lavatile') return false;
      return true;
    }

    // One region's decoration. base(x, y) -> [tile, object] (names, 'air' for none) for any tile, inside or out.
    // Returns { T, O } for the 16 x 16 tiles of the region (index (y << 4) | x).
    G.BiomeStack.prototype.decorateRegion = function (level, rx, ry, base, outside, loaded) {
      outside = outside || base; loaded = loaded || function () { return true; };
      var st = this, x0 = rx * 16, y0 = ry * 16, T = new Array(256), O = new Array(256), B = new Int32Array(256), biomes = [], spill = [];
      for (var k = 0; k < 256; k++) {
        var x = x0 + (k & 15), y = y0 + (k >> 4), b = base(x, y);
        T[k] = b[0]; O[k] = b[1]; B[k] = st.getSpreadBiomeID(x, y);
        if (biomes.indexOf(B[k]) < 0) biomes.push(B[k]);
      }
      biomes.sort(function (a, b) { return a - b; });
      function inR(x, y) { return x >= x0 && y >= y0 && x < x0 + 16 && y < y0 + 16; }
      function tileAt(x, y) { return inR(x, y) ? T[((y - y0) << 4) | (x - x0)] : outside(x, y)[0]; }
      function objAt(x, y) { return inR(x, y) ? O[((y - y0) << 4) | (x - x0)] : outside(x, y)[1]; }
      function setObj(x, y, n) { if (inR(x, y)) O[((y - y0) << 4) | (x - x0)] = n; else spill.push(x, y, n); }
      // Liquid data (shores and depths) only exists on the surface once its rules ran updateLiquidManager;
      // before that, and in the caves, a new region's arrays are still all zero.
      var liquidReady = false;
      function isLiq(x, y) { return !!LIQ[tileAt(x, y)]; }
      function isShore(x, y) {   // a dry tile with liquid among its 8 neighbours
        if (!liquidReady || isLiq(x, y)) return false;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && loaded(x + dx, y + dy) && isLiq(x + dx, y + dy)) return true;
        return false;
      }
      // Liquid data is worked out over the regions generated so far (loaded(x, y)); water whose shore lies in a region
      // not generated yet counts as deep. Within a 20-tile margin: steps from the shore through water (LiquidManager
      // heights, down to -10), then salt water: everything within 10 steps of water 10 or more steps from any shore.
      var WM = 20, WN = 16 + 2 * WM, depth = null, salt = null;
      function liquidField() {
        var N = WN * WN, wet = new Int8Array(N), dist = new Int16Array(N), q = new Int32Array(N), h = 0, t = 0, i, j, k;
        for (j = 0; j < WN; j++) for (i = 0; i < WN; i++) {
          var x = x0 - WM + i, y = y0 - WM + j; k = j * WN + i;
          wet[k] = !loaded(x, y) ? -1 : isLiq(x, y) ? 1 : 0;
          if (wet[k] === 0) { dist[k] = 0; q[t++] = k; } else dist[k] = 99;
        }
        while (h < t) {   // breadth first from the land through the water (cross steps), as the heights spread
          k = q[h++]; var cx = k % WN, d = dist[k] + 1;
          var nb = [cx > 0 ? k - 1 : -1, cx < WN - 1 ? k + 1 : -1, k >= WN ? k - WN : -1, k < N - WN ? k + WN : -1];
          for (var n = 0; n < 4; n++) { var m = nb[n]; if (m >= 0 && wet[m] === 1 && dist[m] > d) { dist[m] = d; q[t++] = m; } }
        }
        depth = dist;
        var sd = new Int16Array(N); h = 0; t = 0;
        for (k = 0; k < N; k++) { if (wet[k] === 1 && dist[k] >= 10) { sd[k] = 0; q[t++] = k; } else sd[k] = 99; }
        while (h < t) {   // the salt spreads 10 steps from the cores over everything generated
          k = q[h++]; var cx2 = k % WN, d2 = sd[k] + 1; if (d2 > 10) continue;
          var nb2 = [cx2 > 0 ? k - 1 : -1, cx2 < WN - 1 ? k + 1 : -1, k >= WN ? k - WN : -1, k < N - WN ? k + WN : -1];
          for (var n2 = 0; n2 < 4; n2++) { var m2 = nb2[n2]; if (m2 >= 0 && wet[m2] >= 0 && sd[m2] > d2) { sd[m2] = d2; q[t++] = m2; } }
        }
        salt = sd;
      }
      function heightOK(x, y) {  // LiquidManager height >= -6: within 6 steps of the shore
        if (!liquidReady || !isLiq(x, y)) return true;
        if (!depth) liquidField();
        return depth[(y - y0 + WM) * WN + (x - x0 + WM)] <= 6;
      }
      function isSalt(x, y) {
        if (!salt) liquidField();
        return salt[(y - y0 + WM) * WN + (x - x0 + WM)] <= 10;
      }
      function adj8(x, y, fn) { var n = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if ((dx || dy) && fn(objAt(x + dx, y + dy))) n++; return n; }
      // GameObject.canPlace with the overrides of the classes biomes place (byPlayer = false)
      function canPlace1(name, x, y, master) {
        var o = objAt(x, y), t = tileAt(x, y), fl = R.flags[name] || R.flags[master] || [false, false, [], false], ov = R.tileOverrides[t] || [false, false];
        if (o === name) return false;                                                       // sameobject
        if (o !== 'air' && !(GRASS[o] && !GRASS[name]) && !(LAYER1[o] && !LAYER1[name])) return false;   // occupied (grass gives way; a flower patch moves down a layer)
        if (!fl[0] && LIQ[t] && !ov[0]) return false;                                       // liquid
        if (!fl[1] && !ov[1] && isShore(x, y)) return false;                                // shore
        var g = R.grass[name], cls = R.classes[name];
        if (g) {                                                                            // GrassObject
          if (g[0] > 0 && adj8(x, y, function (n) { return GRASS[n]; }) > g[0]) return false;
          if (g[1].length ? g[1].indexOf(t) < 0 : (g[2] && !ORGANIC[t])) return false;
          if (/Reeds|Cattail|WaterPlant/.test(cls) && !heightOK(x, y)) return false;
        }
        if (fl[2].length && fl[2].indexOf(t) < 0) return false;                             // wild flowers: their grow tiles
        if (TREE[name] && adj8(x, y, function (n) { return TREE[n]; })) return false;       // treenear
        if (cls === 'FlowerPatchObject' && !ORGANIC[t] && t !== 'snowtile') return false;
        if (cls === 'CactusObject' && t !== 'sandtile') return false;
        if (cls === 'SnowPileObject' && adj8(x, y, function (n) { return n !== 'air'; }) > 2) return false;
        if (cls === 'WaterLanternObject' && !LIQ[t]) return false;
        if (cls === 'RandomCrateObject' && t === 'lavatile') return false;
        return true;
      }
      function canPlace(name, x, y, rot) {
        var ps = parts(name, x, y, rot);
        for (var i = 0; i < ps.length; i++) if (!canPlace1(i === 0 ? name : ps[i][2], ps[i][0], ps[i][1], name)) return false;
        return true;
      }
      function place(name, x, y, rot) { parts(name, x, y, rot).forEach(function (p) { setObj(p[0], p[1], p[2]); }); }
      function tileField(n) { return R.tilefields[n] || n; }
      function objField(n) { return n === '0' ? 'air' : R.objfields[n] || n; }

      for (var bi = 0; bi < biomes.length; bi++) {
        var bid = biomes[bi], rules = R.rules[BIOME[bid] + ':' + level]; if (!rules) continue;
        var r0 = G.gameRandom(st.seed).nextSeeded(rx).nextSeeded(ry);   // BiomeGeneratorStack.getNewRegionRandom
        for (var ri = 0; ri < rules.length; ri++) {
          var rule = rules[ri];
          if (rule.op === 'liquid') { liquidReady = true; continue; }
          if (rule.op !== 'place') continue;
          var rr = rule.vein ? r0.nextSeeded(G.javaStringHash(rule.vein)) : r0.nextSeeded0(), vein = null;
          if (rule.place[0] === 'mob') continue;
          if (rule.vein) {
            vein = st.vein(rule.vein);
            if (vein.first && !vein.first.anyCell(x0 - vein.reach, y0 - vein.reach, x0 + 15 + vein.reach, y0 + 15 + vein.reach)) continue;
            vein.block(x0, y0, 16, 16);
          }
          var P = rule.place, tests = rule.tests;
          for (var lx = 0; lx < 16; lx++) for (var ly = 0; ly < 16; ly++) {
            var k2 = (ly << 4) | lx; if (B[k2] !== bid) continue;
            var x = x0 + lx, y = y0 + ly, ok = true;
            if (vein && vein.get(x, y) !== -1) continue;
            for (var ti = 0; ti < tests.length && ok; ti++) {
              var tt = tests[ti];
              switch (tt[0]) {
                case 'tile': ok = T[k2] === tileField(tt[1]); break;
                case 'object': ok = O[k2] === objField(tt[1]); break;
                case 'chance': ok = rr.getChanceD(tt[1]); break;
                case 'chancePerRegion': ok = rr.getChanceD(tt[1] / 256); break;
                case 'tilefn': var tf = tileField(tt[2]); ok = T[k2] === tf || T[k2] === OVERGROWN[tf]; break;
                case 'isSurfaceOcean': case 'onlyOnWater': ok = st.isSurfaceOcean ? st.isSurfaceOcean(x, y) : false; break;
                case 'testclass': ok = !(liquidReady && isSalt(x, y)); break;   // isFreshWaterByRegion
                default: ok = false;
              }
            }
            if (!ok) continue;
            switch (P[0]) {
              case 'placeObjectForced': place(P[1], x, y, 0); break;
              case 'placeObject': if (canPlace(P[1], x, y, 0)) place(P[1], x, y, 0); break;
              case 'placeObjectRandomRotation': if (canPlace(P[1], x, y, rr.nextInt(4))) place(P[1], x, y, rr.nextInt(4)); break;
              case 'placeObjectForcedRandomRotation': place(P[1], x, y, rr.nextInt(4)); break;
              case 'placeObjectFruitGrower': if (canPlace(P[1], x, y, 0)) { place(P[1], x, y, 0); rr.nextInt(R.maxStage[P[1]] || 4); } break;
              case 'entity':   // blueberry bushes: one in a hundred is a stabby bush (a mob) instead
                if (canPlace(P[1], x, y, 0)) { place(P[1], x, y, 0); if (rr.getChance(f(0.01))) { setObj(x, y, 'air'); r0.nextInt(); } else rr.nextInt(R.maxStage[P[1]] || 4); }
                break;
              case 'tile': T[k2] = tileField(P[1]); break;
              case 'crates':
                var n4 = [objAt(x - 1, y), objAt(x + 1, y), objAt(x, y - 1), objAt(x, y + 1)], wall = false;
                for (var c = 0; c < 4; c++) if (n4[c] !== 'air' && P[1].indexOf(n4[c]) < 0) wall = true;
                if (wall) { var cn = P[1][rr.nextInt(P[1].length)]; if (canPlace(cn, x, y, 0)) place(cn, x, y, 0); }
                break;
              case 'custom':
                if (P[1] === 'SwampBiome$1') {   // mud patches with wild mushrooms
                  if (rr.getChance(f(0.7))) T[k2] = 'mudtile';
                  if (O[k2] === 'air' && rr.getChance(f(0.15)) && canPlace('wildmushroom', x, y, 0)) place('wildmushroom', x, y, 0);
                } else {                         // reeds and cattails in water
                  if (rr.getChance(f(0.2)) && canPlace('reeds', x, y, 0)) place('reeds', x, y, 0);
                  if (rr.getChance(f(0.2)) && canPlace('cattail', x, y, 0)) place('cattail', x, y, 0);
                }
                break;
            }
          }
        }
      }
      return { T: T, O: O, spill: spill };
    };

    // A region's final natural decoration: its own, plus the parts of multi-tile objects (2x2 swamp roots,
    // log benches, 2x1 rocks) whose masters stand in a neighbouring region; those writes land last.
    // cache: a Map shared by all calls for one level.
    G.BiomeStack.prototype.decoratedRegion = function (level, rx, ry, base0, cache) {
      var st = this;
      if (cache.size > 6000) cache.clear();
      function base(x, y) {   // the undecorated ground, computed once per region
        var nx = x >> 4, ny = y >> 4, bk = 'b' + nx + ',' + ny, b = cache.get(bk);
        if (!b) {
          b = { T: new Array(256), O: new Array(256) };
          for (var k = 0; k < 256; k++) { var v = base0(nx * 16 + (k & 15), ny * 16 + (k >> 4)); b.T[k] = v[0]; b.O[k] = v[1]; }
          cache.set(bk, b);
        }
        var i = ((y & 15) << 4) | (x & 15);
        return [b.T[i], b.O[i]];
      }
      function raw(x, y) { var k = x + ',' + y, r = cache.get(k); if (!r) { r = st.decorateRegion(level, x, y, base); cache.set(k, r); } return r; }
      // Regions are taken to generate in reading order, so this one sees the decoration of the regions above and
      // to the left (as they were first generated) and nothing yet of the ones below and to the right.
      var fk = 'f' + rx + ',' + ry, me = cache.get(fk);
      if (!me) {
        me = st.decorateRegion(level, rx, ry, base, function (x, y) {
          var nx = x >> 4, ny = y >> 4;
          if (ny < ry || (ny === ry && nx < rx)) { var r = raw(nx, ny), k = ((y & 15) << 4) | (x & 15); return [r.T[k], r.O[k]]; }
          return [base(x, y)[0], 'air'];
        }, function (x, y) { var nx = x >> 4, ny = y >> 4; return ny < ry || (ny === ry && nx <= rx); });
        cache.set(fk, me);
      }
      if (!me.final) {
        var O = me.O.slice(), T = me.T, x0 = rx * 16, y0 = ry * 16, dx, dy, i, x, y;
        for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var sp = raw(rx + dx, ry + dy).spill;
          for (i = 0; i < sp.length; i += 3) {
            var lx = sp[i] - x0, ly = sp[i + 1] - y0;
            if (lx >= 0 && ly >= 0 && lx < 16 && ly < 16) O[(ly << 4) | lx] = sp[i + 2];
          }
        }
        // Region.checkGenerationValid, tiles first: water touching lava (any of its 8 neighbours) cools to rock,
        // and the water plants on it go with it
        if (level !== 'surface') {
          var lavaAt = function (x, y) { var nx = x >> 4, ny = y >> 4; return (nx === rx && ny === ry ? T[((y & 15) << 4) | (x & 15)] : raw(nx, ny).T[((y & 15) << 4) | (x & 15)]) === 'lavatile'; };
          for (var k0 = 0; k0 < 256; k0++) {
            if (T[k0] !== 'watertile') continue;
            var wx = x0 + (k0 & 15), wy = y0 + (k0 >> 4), hot = false;
            for (dy = -1; dy <= 1 && !hot; dy++) for (dx = -1; dx <= 1; dx++) if ((dx || dy) && lavaAt(wx + dx, wy + dy)) { hot = true; break; }
            if (hot) {
              if (T === me.T) T = T.slice();
              T[k0] = 'rocktile';
              var g = R.grass[O[k0]]; if (g && g[1].length && g[1].indexOf('rocktile') < 0) O[k0] = 'air';
            }
          }
        }
        // Region.checkGenerationValid: every object that is no longer valid is removed (column by column)
        if (VALIDATE[level]) {
          var inR = function (x, y) { return x >= x0 && y >= y0 && x < x0 + 16 && y < y0 + 16; };
          var tileAt = function (x, y) { return inR(x, y) ? T[((y - y0) << 4) | (x - x0)] : raw(x >> 4, y >> 4).T[((y & 15) << 4) | (x & 15)]; };
          // regions are taken to generate in reading order: a tree next to one in an earlier region is removed,
          // while one next to a later region keeps its place (that region's own tree goes instead)
          var objAt = function (x, y) {
            if (inR(x, y)) return O[((y - y0) << 4) | (x - x0)];
            var nx = x >> 4, ny = y >> 4;
            return ny < ry || (ny === ry && nx < rx) ? raw(nx, ny).O[((y & 15) << 4) | (x & 15)] : 'air';
          };
          var later = function (x, y) { var nx = x >> 4, ny = y >> 4; return ny > ry || (ny === ry && nx > rx); };
          for (x = x0; x < x0 + 16; x++) for (y = y0; y < y0 + 16; y++) {
            var k = ((y - y0) << 4) | (x - x0), n = O[k];
            if (n === 'air') continue;
            var mp = multiPart(n), ok = isValid(mp ? mp.names[0] : n, x, y, tileAt, objAt);   // a part is checked as its object
            if (ok && mp) for (var pj = 0; pj < mp.h && ok; pj++) for (var pi = 0; pi < mp.w; pi++) {   // MultiTile: every other part in place
              if (pi === mp.i && pj === mp.j) continue;
              var qx = x - mp.i + pi, qy = y - mp.j + pj;
              if (!later(qx, qy) && objAt(qx, qy) !== mp.names[pj * mp.w + pi]) { ok = false; break; }
            }
            if (ok) continue;
            O[k] = 'air';
            if (mp) for (pj = 0; pj < mp.h; pj++) for (pi = 0; pi < mp.w; pi++) {   // the whole object goes
              qx = x - mp.i + pi; qy = y - mp.j + pj;
              if (inR(qx, qy) && O[((qy - y0) << 4) | (qx - x0)] === mp.names[pj * mp.w + pi]) O[((qy - y0) << 4) | (qx - x0)] = 'air';
            }
          }
        }
        me.final = { T: T, O: O };
      }
      return me.final;
    };
  }
  var api = { install: install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NecesseDeco = api;
})(typeof self !== 'undefined' ? self : this);

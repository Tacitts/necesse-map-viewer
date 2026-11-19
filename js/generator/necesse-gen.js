/*
 * Necesse world generator, JavaScript port (stage 1: biomes, oceans, rivers, beaches).
 * Translated from Necesse 1.3.3's necesse.engine.world.biomeGenerator package.
 * Works in browsers, web workers and Node. Call NecesseGen.init(constants) once with the
 * tables from constants.json, then new NecesseGen.BiomeStack(seedInt).
 */
(function (root) {
  'use strict';

  var C = null;          // constants: primes, perm, permBits, vectors, biomeTickets, biomeIDs, range4
  var TWO24 = 16777216, TWO48 = 281474976710656;
  var M_HI = 0x5DE, M_LO = 0xECE66D;     // 0x5DEECE66D split into 24-bit halves

  // ---------- java.util.Random, exact, without BigInt ----------
  // state is 48 bits held as hi (top 24) and lo (bottom 24)
  function JRandom() { this.hi = 0; this.lo = 0; }
  // seed given as an exact non-negative number < 2^48 (the low 48 bits of the Java long)
  JRandom.prototype.setSeed48 = function (v48) {
    var hi = Math.floor(v48 / TWO24), lo = v48 - hi * TWO24;
    this.hi = (hi ^ M_HI) & 0xFFFFFF; this.lo = (lo ^ M_LO) & 0xFFFFFF;
    return this;
  };
  JRandom.prototype.next = function (bits) {
    var lo = this.lo * M_LO + 0xB;
    var carry = Math.floor(lo / TWO24);
    lo -= carry * TWO24;
    var hi = (this.hi * M_LO + this.lo * M_HI + carry) % TWO24;
    this.hi = hi; this.lo = lo;
    // (int)(seed >>> (48 - bits))
    var v = Math.floor((hi * TWO24 + lo) / Math.pow(2, 48 - bits));
    return v | 0;
  };
  JRandom.prototype.nextInt = function (bound) {
    if (bound === undefined) return this.next(32);
    if ((bound & -bound) === bound) {           // power of two
      return Math.floor(this.next(31) * bound / 2147483648) | 0;   // exact: bound is a power of two
    }
    var bits, val;
    do { bits = this.next(31); val = bits % bound; } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  };
  JRandom.prototype.nextFloat = function () { return this.next(24) / TWO24; };
  JRandom.prototype.nextDouble = function () { return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992; };
  // low 48 bits of nextLong(), as a non-negative number
  JRandom.prototype.nextLong48 = function () {
    var h = this.next(32), l = this.next(32);
    var v = (h & 0xFFFF) * 4294967296 + l;      // l is signed: Java adds it as a sign-extended int
    v %= TWO48; if (v < 0) v += TWO48;
    return v;
  };
  function mul48(v48, k) {                      // (v48 * k) mod 2^48, k a small positive int (< 2^29)
    var hi = Math.floor(v48 / TWO24), lo = v48 - hi * TWO24;
    var lp = lo * k, lc = Math.floor(lp / TWO24);
    var nlo = lp - lc * TWO24;
    var nhi = (hi * k + lc) % TWO24;
    return nhi * TWO24 + nlo;
  }
  function intToSeed48(s) { return s < 0 ? s + TWO48 : s; }   // sign-extended int -> low 48 bits
  function floorMod(a, n) { return ((a % n) + n) % n; }
  function prime(i) { return C.primes[floorMod(i, C.primes.length)]; }

  // GameRandom(long seed) for an int seed
  function gameRandom(seedInt) { return new JRandom().setSeed48(intToSeed48(seedInt)); }
  // GameRandom.nextSeeded(int): new GameRandom(nextLong() * prime(i))
  JRandom.prototype.nextSeeded = function (i) {
    var p = prime(i);
    return new JRandom().setSeed48(mul48(this.nextLong48(), p));
  };
  JRandom.prototype.getChance = function (f) { return f >= 1 ? true : this.nextFloat() < f; };
  JRandom.prototype.getChanceD = function (d) { return d >= 1 ? true : this.nextDouble() < d; };   // GameRandom.getChance(double)
  JRandom.prototype.nextSeeded0 = function () { return new JRandom().setSeed48(this.nextLong48()); };  // nextSeeded(): new GameRandom(nextLong())

  // ---------- GameRandomNoise (perlin) ----------
  function Noise(seed) {
    var len = C.perm.length;
    this.sp = new Int32Array(len * 2);
    this.vx = new Float64Array(len * 2);
    this.vy = new Float64Array(len * 2);
    if (seed < len) seed = seed | (seed << C.permBits);
    for (var i = 0; i < len; i++) {
      var v = (i & 1) === 1 ? (C.perm[i] ^ (seed & (len - 1))) : (C.perm[i] ^ ((seed >> C.permBits) & (len - 1)));
      this.sp[i] = this.sp[i + len] = v;
      var g = C.vectors[v % 12];
      this.vx[i] = this.vx[i + len] = g[0];
      this.vy[i] = this.vy[i + len] = g[1];
    }
  }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return (1 - t) * a + t * b; }
  Noise.prototype.perlin2 = function (x, y) {
    var X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y;
    var m = C.perm.length - 1;
    X &= m; Y &= m;
    var sp = this.sp, vx = this.vx, vy = this.vy;
    var i00 = X + sp[Y], i01 = X + sp[Y + 1], i10 = X + 1 + sp[Y], i11 = X + 1 + sp[Y + 1];
    var n00 = vx[i00] * x + vy[i00] * y;
    var n01 = vx[i01] * x + vy[i01] * (y - 1);
    var n10 = vx[i10] * (x - 1) + vy[i10] * y;
    var n11 = vx[i11] * (x - 1) + vy[i11] * (y - 1);
    var u = fade(x);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(y));
  };
  Noise.prototype.perlin2Fractal = function (x, y, octaves, persistence) {
    var total = 0, freq = 1, amp = 1, max = 0;
    for (var i = 0; i < octaves; i++) {
      total += this.perlin2(x * freq, y * freq) * amp;
      max += amp; amp *= persistence; freq *= 2;
    }
    return total / max;
  };

  // GameRandomNoise.simplex2 over the same seeded permutation and gradient tables as perlin2
  var SF2 = 0.5 * (Math.sqrt(3) - 1), SG2 = (3 - Math.sqrt(3)) / 6;
  Noise.prototype.simplex2 = function (xin, yin) {
    var s = (xin + yin) * SF2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    var t = (i + j) * SG2, x0 = (xin - i) + t, y0 = (yin - j) + t, i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    var x1 = (x0 - i1) + SG2, y1 = (y0 - j1) + SG2, x2 = (x0 - 1) + 2 * SG2, y2 = (y0 - 1) + 2 * SG2;
    var m = C.perm.length - 1, ii = i & m, jj = j & m, sp = this.sp, vx = this.vx, vy = this.vy;
    var g0 = ii + sp[jj], g1 = ii + i1 + sp[jj + j1], g2 = ii + 1 + sp[jj + 1], n0 = 0, n1 = 0, n2 = 0;
    var t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (vx[g0] * x0 + vy[g0] * y0); }
    var t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (vx[g1] * x1 + vy[g1] * y1); }
    var t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (vx[g2] * x2 + vy[g2] * y2); }
    return 70 * (n0 + n1 + n2);
  };
  Noise.prototype.simplex2Fractal = function (x, y, octaves, persistence) {
    var total = 0, freq = 1, amp = 1, max = 0;
    for (var i = 0; i < octaves; i++) { total += this.simplex2(x * freq, y * freq) * amp; max += amp; amp *= persistence; freq *= 2; }
    return total / max;
  };

  // ---------- Java HashMap<Integer,Integer> iteration order (table of 16, no resize for <= 12 keys) ----------
  function countInHashOrder(values, skip) {
    // returns [[key,count]...] in the order HashMap.entrySet() would iterate them
    var keys = [], counts = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (skip && skip(v)) continue;
      var k = keys.indexOf(v);
      if (k < 0) { keys.push(v); counts.push(1); } else counts[k]++;
    }
    var out = [];
    for (var b = 0; b < 16; b++)
      for (var j = 0; j < keys.length; j++) {
        var h = keys[j]; if (((h ^ (h >>> 16)) & 15) === b) out.push([keys[j], counts[j]]);
      }
    return out;
  }
  function mostFrequentKeys(entries) {            // stable sort by -count, keep the ties with the top count
    var max = -1;
    for (var i = 0; i < entries.length; i++) if (entries[i][1] > max) max = entries[i][1];
    var list = [];
    for (i = 0; i < entries.length; i++) if (entries[i][1] === max) list.push(entries[i][0]);
    return list;
  }

  // ---------- layers ----------
  function Layer(layerSeed, layerScale) {
    this.layerSeed = layerSeed; this.layerScale = layerScale; this.stackScale = layerScale;
    this.parent = null; this.parentDifferentBranch = false; this.worldSeed = 0; this.stack = null;
    this.cache = new Map(); this.lcx = this.lcy = 0x7fffffff; this.lc = null;
  }
  Layer.prototype.init = function (stack, parent, differentBranch, worldSeed) {
    this.stack = stack; this.parent = parent; this.parentDifferentBranch = differentBranch; this.worldSeed = worldSeed;
  };
  Layer.prototype.getStackScale = function () { this.stack.calcScales(); return this.stackScale; };
  Layer.prototype.getRandom = function (x, y) {
    return gameRandom(this.worldSeed).nextSeeded(this.layerSeed).nextSeeded(x).nextSeeded(y);
  };
  Layer.prototype.getParent = function (x, y) { return this.parentDifferentBranch ? 0 : this.parent.get(x, y); };
  Layer.prototype.get = function (x, y) {
    var b = this.blk;
    if (b) { var bx = x - b.x0, by = y - b.y0; if (bx >= 0 && by >= 0 && bx < b.w && by < b.h) return b.a[by * b.w + bx]; }
    // values are cached in 64 x 64 chunks (NaN = not worked out yet); the last chunk used is kept at hand
    var cx = x >> 6, cy = y >> 6, c;
    if (cx === this.lcx && cy === this.lcy) c = this.lc;
    else {
      var key = cx * 65536 + cy;
      c = this.cache.get(key);
      if (!c) {
        if (this.cache.size >= 32) this.cache.clear();
        c = new Float64Array(4096); c.fill(NaN); this.cache.set(key, c);
      }
      this.lcx = cx; this.lcy = cy; this.lc = c;
    }
    var i = ((y & 63) << 6) | (x & 63), v = c[i];
    if (v === v) return v;
    v = this.sample(x, y);
    c[i] = v;
    return v;
  };
  function adjacent(layer, x, y) {
    return [layer.getParent(x - 1, y - 1), layer.getParent(x, y - 1), layer.getParent(x + 1, y - 1),
            layer.getParent(x - 1, y), layer.getParent(x, y), layer.getParent(x + 1, y),
            layer.getParent(x - 1, y + 1), layer.getParent(x, y + 1), layer.getParent(x + 1, y + 1)];
  }
  function sub(proto, ctor) { ctor.prototype = Object.create(proto); ctor.prototype.constructor = ctor; return ctor; }

  var InitialBiome = sub(Layer.prototype, function (seed) { Layer.call(this, seed, 0); });
  InitialBiome.prototype.sample = function (x, y) {
    var r = this.getRandom(x, y), t = C.biomeTickets, total = t[t.length - 1][3];
    var n = r.nextInt(total);
    for (var i = 0; i < t.length; i++) if (n >= t[i][2] && n < t[i][3]) return t[i][0];
    return 0;
  };

  var MostFrequentCA = sub(Layer.prototype, function () { Layer.call(this, 0, 0); });
  MostFrequentCA.prototype.sample = function (x, y) {
    var list = mostFrequentKeys(countInHashOrder(adjacent(this, x, y)));
    return list[this.getRandom(x, y).nextInt(list.length)];
  };

  var ClearSingles = sub(Layer.prototype, function (maxFrequency) { Layer.call(this, 0, 0); this.maxFrequency = maxFrequency; });
  ClearSingles.prototype.sample = function (x, y) {
    var adj = adjacent(this, x, y), center = adj[4];
    var entries = countInHashOrder(adj), cc = 0;
    for (var i = 0; i < entries.length; i++) if (entries[i][0] === center) cc = entries[i][1];
    if (cc > this.maxFrequency) return center;
    var others = entries.filter(function (e) { return e[0] !== center; });
    var list = mostFrequentKeys(others);
    return list[this.getRandom(x, y).nextInt(list.length)];
  };

  var BiomeRules = sub(Layer.prototype, function (seed) { Layer.call(this, seed, 0); });
  BiomeRules.prototype.sample = function (x, y) {
    var adj = adjacent(this, x, y), self = this.getParent(x, y), B = C.biomeIDs;
    if (self === B.desert && adj.indexOf(B.snow) >= 0) return this.mostFrequent(x, y, adj, [B.desert, B.swamp, B.snow]);
    if (self === B.swamp && adj.indexOf(B.snow) >= 0) return this.mostFrequent(x, y, adj, [B.swamp, B.desert, B.snow]);
    return self;
  };
  BiomeRules.prototype.mostFrequent = function (x, y, adj, exclude) {
    var entries = countInHashOrder(adj, function (v) { return exclude.indexOf(v) >= 0; });
    if (!entries.length) return adj[4];
    var list = mostFrequentKeys(entries);
    return list[this.getRandom(x, y).nextInt(list.length)];
  };

  var ScalingRandom = sub(Layer.prototype, function (seed) { Layer.call(this, seed, 1); });
  ScalingRandom.prototype.sample = function (x, y) {
    var a = this.getParent(x >> 1, y >> 1);
    var ex = (x & 1) === 0, ey = (y & 1) === 0;
    if (ex && ey) return a;
    var r = this.getRandom(x, y);
    var b = this.getParent(x >> 1, (y + 1) >> 1);
    if (ex) return r.nextInt(2) === 0 ? a : b;
    var c = this.getParent((x + 1) >> 1, y >> 1);
    if (ey) return r.nextInt(2) === 0 ? a : c;
    var d = this.getParent((x + 1) >> 1, (y + 1) >> 1);
    return [a, b, c, d][r.nextInt(4)];
  };

  // picks the parent value at a random tile within range 4 (roughens biome borders)
  var BiomeSpread = sub(Layer.prototype, function (seed) { Layer.call(this, seed, 0); });
  BiomeSpread.prototype.sample = function (x, y) {
    var r = C.range4, i = this.getRandom(x, y).nextInt(r.length);
    return this.parent.get(x + r[i][0], y + r[i][1]);     // getParentForced: reads across the branch
  };

  var ScalingNearest = sub(Layer.prototype, function (seed) { Layer.call(this, seed, 1); });
  ScalingNearest.prototype.sample = function (x, y) { return this.getParent(x >> 1, y >> 1); };

  function noiseLayerInit(stack, parent, diff, worldSeed) {
    Layer.prototype.init.call(this, stack, parent, diff, worldSeed);
    this.noise = new Noise(this.getRandom(0, 0).nextInt());
  }
  var f = Math.fround;

  var Ocean = sub(Layer.prototype, function (seed, sizeModifier, maxValue, beachSize) {
    Layer.call(this, seed, 0);
    this.sizeModifier = f(sizeModifier); this.maxValue = f(f(f(maxValue) * 2) - 1); this.beachSize = f(beachSize);
  });
  Ocean.prototype.init = noiseLayerInit;
  Ocean.prototype.getValue = function (x, y) {
    var s = this.getStackScale();
    return this.noise.perlin2Fractal(x / s * this.sizeModifier, y / s * this.sizeModifier, 4, 0.5);
  };
  Ocean.prototype.sample = function (x, y) {
    var v = this.getValue(x, y);
    if (v < this.maxValue) return -1;
    if (v < f(this.maxValue + f(this.beachSize * this.sizeModifier))) return -2;
    return this.getParent(x, y);
  };

  var River = sub(Layer.prototype, function (seed, spreadModifier, size, beachSize) {
    Layer.call(this, seed, 0);
    this.spreadModifier = f(spreadModifier); this.size = f(size); this.beachSize = f(beachSize);
  });
  River.prototype.init = noiseLayerInit;
  River.prototype.sample = function (x, y) {
    var p = this.getParent(x, y);
    if (p === -1) return p;
    var s = this.getStackScale();
    var v = Math.abs(this.noise.perlin2Fractal(x / s * this.spreadModifier, y / s * this.spreadModifier, 4, 0.5));
    var w = f(this.size * this.spreadModifier);
    if (v < w) return -1;
    if (v < f(w + f(this.beachSize * this.spreadModifier))) return -2;
    return p;
  };

  var SwampLand = sub(Layer.prototype, function (seed, sizeModifier, maxValue, beachSize, biomeGetter) {
    Layer.call(this, seed, 0);
    this.sizeModifier = f(sizeModifier); this.maxValue = f(f(f(maxValue) * 2) - 1); this.beachSize = f(beachSize);
    this.biomeGetter = biomeGetter;
  });
  SwampLand.prototype.init = noiseLayerInit;
  SwampLand.prototype.sample = function (x, y) {
    var biome = this.biomeGetter(x, y), s = this.getStackScale(), swamp = C.biomeIDs.swamp;
    if (biome !== swamp) return this.getParent(x, y);
    var v = this.noise.perlin2Fractal(x / s * this.sizeModifier, y / s * this.sizeModifier, 4, 0.5);
    if (v < this.maxValue) return -1;
    var r = C.range4;
    for (var i = 0; i < r.length; i++) {
      var px = x + r[i][0], py = y + r[i][1];
      if (this.biomeGetter(px, py) !== swamp && this.getParent(px, py) === -1) return -1;
    }
    if (v < f(this.maxValue + f(this.beachSize * this.sizeModifier))) return -2;
    return biome;
  };

  // ---------- cave layers ----------
  // rock placement: -1 (rock) with the biome's chance, else the parent value (0 across a branch)
  var CaveRockPlace = sub(Layer.prototype, function (seed, biomeGetter, chanceKey) { Layer.call(this, seed, 0); this.biomeGetter = biomeGetter; this.chanceKey = chanceKey; });
  CaveRockPlace.prototype.sample = function (x, y) {
    var b = C.caveBiomes[this.biomeGetter(x, y)];
    if (this.getRandom(x, y).getChance(Math.fround(b[this.chanceKey]))) return -1;
    return this.getParent(x, y);
  };
  var SingleCA = sub(Layer.prototype, function (deathLimit, birthLimit, alive, death) {
    Layer.call(this, 0, 0); this.deathLimit = deathLimit; this.birthLimit = birthLimit; this.alive = alive; this.death = death;
  });
  SingleCA.prototype.sample = function (x, y) {
    var adj = adjacent(this, x, y), n = 0;
    for (var i = 0; i < 9; i++) if (adj[i] === this.alive) n++;
    var self = this.getParent(x, y);
    if (self !== this.death) return n >= this.deathLimit ? this.alive : this.death;
    return n > this.birthLimit ? this.alive : this.death;
  };
  // ---------- vein layers (BiomeGeneratorStack.addRandomVeinsBranch / addRandomSimplexVeinsBranch) ----------
  function jdiv(a, b) { return (a / b) | 0; }                       // Java int division truncates toward zero
  var ChanceVeinStatic = sub(Layer.prototype, function (seed, size, chance, value) { Layer.call(this, seed, 0); this.size = size; this.chance = chance; this.value = value; });
  ChanceVeinStatic.prototype.sample = function (x, y) {
    return this.getRandom(jdiv(x, this.size), jdiv(y, this.size)).getChance(this.chance) ? this.value : this.getParent(x, y);
  };
  var ChanceVeinRandom = sub(Layer.prototype, function (seed, min, max, chance, value) { Layer.call(this, seed, 0); this.min = min; this.max = max; this.chance = chance; this.value = value; });
  ChanceVeinRandom.prototype.cell = function (cx, cy) {   // [placed, w, h, ox, oy] of one vein cell, cached
    var C2 = this.cells || (this.cells = new Map()), key = cx * 67108864 + cy, c = C2.get(key);
    if (c) return c;
    var r = this.getRandom(cx, cy);
    if (!r.getChance(this.chance)) c = [0];
    else {
      var n = this.max - this.min + 1, w = this.min + r.nextInt(n), h = this.min + r.nextInt(n), dw = w - this.min, dh = h - this.min;
      c = [1, w, h, dw >= 1 ? r.nextInt(dw) : 0, dh >= 1 ? r.nextInt(dh) : 0];
    }
    if (C2.size > 100000) C2.clear();
    C2.set(key, c);
    return c;
  };
  ChanceVeinRandom.prototype.sample = function (x, y) {
    var M = this.max, c = this.cell(jdiv(x, M), jdiv(y, M));
    if (!c[0]) return this.getParent(x, y);
    var ax = Math.abs(x % M) - c[3], ay = Math.abs(y % M) - c[4];
    return ax >= 0 && ay >= 0 && ax < c[1] && ay < c[2] ? this.value : -2;
  };
  // whether any vein cell around a rectangle was placed: if none, the whole vein is empty there
  ChanceVeinRandom.prototype.anyCell = ChanceVeinStatic.prototype.anyCell = function (x0, y0, x1, y1) {
    var M = this.max || this.size;
    for (var cx = jdiv(x0, M); cx <= jdiv(x1, M); cx++) for (var cy = jdiv(y0, M); cy <= jdiv(y1, M); cy++)
      if (this.cell ? this.cell(cx, cy)[0] : this.getRandom(cx, cy).getChance(this.chance)) return true;
    return false;
  };
  var RandomReplaceValue = sub(Layer.prototype, function (seed, from, chance, to) { Layer.call(this, seed, 0); this.from = from; this.chance = chance; this.to = to; });
  RandomReplaceValue.prototype.sample = function (x, y) {
    var p = this.getParent(x, y);   // the chance is position seeded, so testing the value first changes nothing
    return p === this.from && this.getRandom(x, y).getChance(this.chance) ? this.to : p;
  };
  var SimplexVein = sub(Layer.prototype, function (seed, size, min, chance, value) { Layer.call(this, seed, 0); this.size = f(size); this.min = f(min); this.chance = f(chance); this.value = value; });
  SimplexVein.prototype.init = function (stack, parent, diff, worldSeed) { Layer.prototype.init.call(this, stack, parent, diff, worldSeed); this.noise = new Noise(this.getRandom(0, 0).nextInt()); };
  SimplexVein.prototype.sample = function (x, y) {
    var s = this.getStackScale(), v = this.noise.simplex2Fractal(x / s * this.size, y / s * this.size, 4, 0.5);
    if (Math.abs(v) > this.min && (this.chance >= 1 || this.getRandom(x, y).getChance(this.chance))) return this.value;
    return this.getParent(x, y);
  };
  var MultiCA = sub(Layer.prototype, function (deathLimit, birthLimit, death) { Layer.call(this, 0, 0); this.deathLimit = deathLimit; this.birthLimit = birthLimit; this.death = death; });
  MultiCA.prototype.sample = function (x, y) {
    var adj = adjacent(this, x, y), n = 0, cnt = {}, best = this.death, bc = 0;
    for (var i = 0; i < 9; i++) if (adj[i] !== this.death) { n++; cnt[adj[i]] = (cnt[adj[i]] || 0) + 1; }
    for (var k in cnt) if (cnt[k] > bc) { bc = cnt[k]; best = +k; }   // only -1 occurs in vein stacks
    if (this.getParent(x, y) !== this.death) return n >= this.deathLimit ? best : this.death;
    return n > this.birthLimit ? best : this.death;
  };

  var CaveLava = sub(Layer.prototype, function (seed, sizeModifier, maxValue) {
    Layer.call(this, seed, 0); this.sizeModifier = f(sizeModifier); this.maxValue = f(f(f(maxValue) * 2) - 1);
  });
  CaveLava.prototype.init = noiseLayerInit;
  CaveLava.prototype.sample = function (x, y) {
    var s = this.getStackScale();
    var v = this.noise.perlin2Fractal(x / s * this.sizeModifier, y / s * this.sizeModifier, 4, 0.5);
    return v < this.maxValue ? -1 : this.getParent(x, y);
  };

  // ---------- stacks ----------
  function Stack(worldSeed) { this.worldSeed = worldSeed | 0; this.layers = []; this.parent = null; this.scaled = false; }
  Stack.prototype.addLayer = function (l) {
    if (this.layers.length) l.init(this, this.layers[this.layers.length - 1], false, this.worldSeed);
    else l.init(this, this.parent, true, this.worldSeed);
    this.layers.push(l); this.scaled = false;
    return l;
  };
  Stack.prototype.addBranchingStack = function (st) { st.parent = this.layers.length ? this.layers[this.layers.length - 1] : null; return st; };
  Stack.prototype.calcScales = function () {
    if (this.scaled) return;
    var s = this.parent ? this.parent.getStackScale() : 1;
    for (var i = 0; i < this.layers.length; i++) { this.layers[i].stackScale = s << this.layers[i].layerScale; s = this.layers[i].stackScale; }
    this.scaled = true;
  };
  // Evaluate the whole stack over a rectangle into arrays (each layer over the area the next one reads), so
  // get(x, y) inside it is an array read. The arrays stay until the next block() call on this stack.
  Stack.prototype.block = function (x0, y0, w, h) {
    var L = this.layers, m = new Array(L.length), i, j, k;
    m[L.length - 1] = 0;
    for (i = L.length - 1; i > 0; i--) m[i - 1] = m[i] + (L[i] instanceof SingleCA || L[i] instanceof MultiCA ? 1 : 0);
    for (i = 0; i < L.length; i++) L[i].blk = null;
    for (i = 0; i < L.length; i++) {
      var bx = x0 - m[i], by = y0 - m[i], bw = w + 2 * m[i], bh = h + 2 * m[i], a = new Int32Array(bw * bh);
      for (j = 0; j < bh; j++) for (k = 0; k < bw; k++) a[j * bw + k] = L[i].sample(bx + k, by + j);
      L[i].blk = { x0: bx, y0: by, w: bw, h: bh, a: a };
    }
  };
  Stack.prototype.get = function (x, y) { return this.layers[this.layers.length - 1].get(x, y); };

  function BiomeStack(seed) {
    seed = seed | 0; this.seed = seed;
    var st = new Stack(seed), self = this, i;
    st.addLayer(new InitialBiome(10));
    st.addLayer(new MostFrequentCA());
    for (i = 0; i < 4; i++) st.addLayer(new BiomeRules(5 + i));
    st.addLayer(new ScalingRandom(20));
    st.addLayer(new ClearSingles(3));
    st.addLayer(new ClearSingles(2));
    st.addLayer(new ScalingRandom(25));
    st.addLayer(new ClearSingles(3));
    st.addLayer(new ScalingRandom(28));
    st.addLayer(new ClearSingles(3));
    st.addLayer(new ScalingRandom(30));
    st.addLayer(new ScalingNearest(35));
    st.addLayer(new MostFrequentCA());
    st.addLayer(new ScalingRandom(40));
    this.lazy = st.addLayer(new ScalingNearest(45));

    this.spread = st.addBranchingStack(new Stack(Math.imul(seed, prime(10))));
    this.spread.addLayer(new BiomeSpread(60));
    this.water = st.addBranchingStack(new Stack(Math.imul(seed, prime(20))));
    this.ocean = this.water.addLayer(new Ocean(80, 0.4, 0.45, 0.04));
    this.river = this.water.addLayer(new River(60, 0.3, 0.04, 0.05));
    this.water.addLayer(new SwampLand(90, 3.0, 0.42, 0.04, function (x, y) { return self.lazy.get(x, y); }));
    for (i = 0; i < 4; i++) st.addLayer(new MostFrequentCA());
    this.main = st;
    var lazyGet = function (x, y) { return self.lazy.get(x, y); };
    this.caveRocks = st.addBranchingStack(new Stack(Math.imul(seed, prime(30))));
    this.caveRocks.addLayer(new CaveRockPlace(120, lazyGet, 'caveRockChance'));
    for (i = 0; i < 4; i++) this.caveRocks.addLayer(new SingleCA(4, 3, -1, 0));
    this.caveRiver = st.addBranchingStack(new Stack(Math.imul(seed, prime(20))));
    this.caveRiver.addLayer(new River(60, 0.3, 0.02, 0.05));
    this.caveLava = st.addBranchingStack(new Stack(Math.imul(seed, prime(20))));
    this.caveLava.addLayer(new CaveLava(65, 1.5, 0.335));
    for (i = 0; i < 2; i++) this.caveLava.addLayer(new MostFrequentCA());
    this.deepRocks = st.addBranchingStack(new Stack(Math.imul(seed, prime(30))));
    this.deepRocks.addLayer(new CaveRockPlace(130, lazyGet, 'deepRockChance'));
    for (i = 0; i < 4; i++) this.deepRocks.addLayer(new SingleCA(4, 3, -1, 0));
    this.deepRiver = st.addBranchingStack(new Stack(Math.imul(seed, prime(20))));
    this.deepRiver.addLayer(new River(75, 0.3, 0.04, 0.05));
    this.deepLava = st.addBranchingStack(new Stack(Math.imul(seed, prime(20))));
    this.deepLava.addLayer(new CaveLava(90, 4.0, 0.41));
    for (i = 0; i < 2; i++) this.deepLava.addLayer(new MostFrequentCA());
  }
  BiomeStack.prototype.getExpensiveBiomeID = function (x, y) { return this.main.get(x, y); };
  BiomeStack.prototype.getSpreadBiomeID = function (x, y) { return this.spread.get(x, y); };
  BiomeStack.prototype.getLazyBiomeID = function (x, y) { return this.lazy.get(x, y); };
  BiomeStack.prototype.waterValue = function (x, y) { return this.water.get(x, y); };
  BiomeStack.prototype.isSurfaceExpensiveWater = function (x, y) { return this.water.get(x, y) === -1; };
  BiomeStack.prototype.isSurfaceOceanOrRiverBeach = function (x, y) { return this.river.get(x, y) === -2; };

  // Palette index of the ground tile at (x, y), following SurfaceLevel.generateRegion:
  // water -> the biome's water tile, river/ocean beach -> beach tile (unless the biome prevents it), else terrain.
  // step > 1 is a coarse preview (skips the shallow-water check).
  BiomeStack.prototype.surfaceIndex = function (x, y, step) {
    var S = C.surface.biomes;
    if (this.isSurfaceExpensiveWater(x, y)) {
      if (step === 1 && (!this.isSurfaceExpensiveWater(x + 2, y) || !this.isSurfaceExpensiveWater(x - 2, y) ||
          !this.isSurfaceExpensiveWater(x, y + 2) || !this.isSurfaceExpensiveWater(x, y - 2))) return 1;
      return 0;
    }
    var sp = S[this.getSpreadBiomeID(x, y)];
    // zoomed-out previews (step > 2) use the cheap lazy biome for the beach rule instead of the 4 smoothing passes
    var ex = step > 2 ? this.getLazyBiomeID(x, y) : this.getExpensiveBiomeID(x, y);
    if (this.isSurfaceOceanOrRiverBeach(x, y) && !S[ex].preventsBeach) return sp.beach;
    return sp.terrain;
  };

  // ---------- world presets: dungeon entrances, villages, pirate villages (WorldPresetRegistry.initRegion) ----------
  // One preset region is 64 x 64 level regions = 1024 x 1024 tiles.
  function PresetRegion(stack, seedInt, px, py) {
    this.stack = stack; this.px = px; this.py = py;
    this.x0 = px * 1024; this.y0 = py * 1024; this.w = 1024; this.h = 1024;
    this.boards = {}; this.placed = [];
    this.biomeRegions = {}; this.weights = {}; this.totalWeight = 0;
    this.scanBiomes();
    var r = gameRandom(seedInt).nextSeeded(px).nextSeeded(py).nextSeeded(C.surfaceHash);
    var order = C.presetOrder;
    for (var i = 0; i < order.length; i++) {
      var pr = r.nextSeeded(javaStringHash(order[i]));
      if (order[i] === 'dungeonentrance') this.addDungeons(pr);
      else if (order[i] === 'piratevillages') this.addPirateVillages(pr);
      else if (order[i] === 'surfacevillages') { this.addVillages(pr); break; }
    }
  }
  PresetRegion.prototype.scanBiomes = function () {
    var st = this.stack, self = this;
    function addRegion(b, key) { (self.biomeRegions[b] || (self.biomeRegions[b] = [])).push(key); }
    function addWeight(b, n) { self.weights[b] = (self.weights[b] || 0) + n; }
    var rx0 = this.x0 >> 4, ry0 = this.y0 >> 4, rx1 = (this.x0 + this.w - 1) >> 4, ry1 = (this.y0 + this.h - 1) >> 4;
    for (var rx = rx0; rx <= rx1; rx++) for (var ry = ry0; ry <= ry1; ry++) {
      var tx = rx * 16, ty = ry * 16, key = [rx, ry];
      var pts = [[tx, ty], [tx + 15, ty], [tx, ty + 15], [tx + 15, ty + 15]];
      var last = st.getLazyBiomeID(pts[0][0], pts[0][1]), run = 1;
      addRegion(last, key);
      for (var k = 1; k < 4; k++) {
        var b = st.getLazyBiomeID(pts[k][0], pts[k][1]);
        if (b !== last) { addWeight(b, run); last = b; run = 1; } else run++;   // the game credits the previous run to the new biome
        addRegion(b, key);
      }
      addWeight(last, run);
      this.totalWeight += 4;
    }
  };
  PresetRegion.prototype.biomeWeight = function (b) {
    var w = this.weights[b]; return w === undefined ? 0 : Math.fround(Math.fround(w) / Math.fround(this.totalWeight));
  };
  function roundUpChance(r, d) { var n = Math.trunc(d); if (d !== n && r.nextDouble() < d - n) n++; return n; }
  PresetRegion.prototype.totalPoints = function (r, f) { return roundUpChance(r, this.w * this.h / 256 * Math.fround(f)); };
  PresetRegion.prototype.totalBiomePoints = function (r, biome, f) { return roundUpChance(r, this.w * this.h / 256 * Math.fround(f) * this.biomeWeight(biome)); };
  PresetRegion.prototype.occupied = function (boards, x, y, w, h) {
    for (var i = 0; i < boards.length; i++) {
      var list = this.boards[boards[i]]; if (!list) continue;
      for (var j = 0; j < list.length; j++) { var q = list[j];
        if (x < q[0] + q[2] && q[0] < x + w && y < q[1] + q[3] && q[1] < y + h) return true; }
    }
    return false;
  };
  PresetRegion.prototype.occupy = function (board, x, y, w, h) { (this.boards[board] || (this.boards[board] = [])).push([x, y, w, h]); };
  function intBetween(r, a, b) { if (a === b) return a; var lo = Math.min(a, b), hi = Math.max(a, b); return r.nextInt(hi - lo + 1) + lo; }
  PresetRegion.prototype.randomTile = function (r, attempts, w, h, boards, valid) {
    for (var i = 0; i < attempts; i++) {
      var x = this.x0 + r.nextInt(this.w - w), y = this.y0 + r.nextInt(this.h - h);
      if (boards && this.occupied(boards, x, y, w, h)) continue;
      if (!valid || valid(x, y)) return [x, y];
    }
    return null;
  };
  PresetRegion.prototype.randomBiomeTile = function (r, biome, attempts, w, h, boards, valid) {
    for (var i = 0; i < attempts; i++) {
      var list = this.biomeRegions[biome];
      if (!list || !list.length) return null;
      var reg = list[r.nextInt(list.length)], tx = reg[0] * 16, ty = reg[1] * 16;
      if (tx + w >= this.x0 + this.w || ty + h >= this.y0 + this.h) continue;
      var x = intBetween(r, tx, Math.min(tx + 15, this.x0 + this.w - w));
      var y = intBetween(r, ty, Math.min(ty + 15, this.y0 + this.h - h));
      if (this.stack.getLazyBiomeID(x + (w / 2 | 0), y + (h / 2 | 0)) !== biome) continue;
      if (boards && this.occupied(boards, x, y, w, h)) continue;
      if (!valid || valid(x, y)) return [x, y];
    }
    return null;
  };
  function cornerCheck(x, y, w, h, f) { return f(x, y) && f(x + w - 1, y) && f(x, y + h - 1) && f(x + w - 1, y + h - 1); }
  function gridCheck(x, y, w, h, step, f) {
    if (!cornerCheck(x, y, w, h, f)) return false;
    var nx = ((w - step) / step) | 0, ny = ((h - step) / step) | 0, ox = (((w - step) % step) / 2) | 0, oy = (((h - step) % step) / 2) | 0;
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) if (!f(x + ox + i * step, y + oy + j * step)) return false;
    return true;
  }
  PresetRegion.prototype.addDungeons = function (r) {
    var st = this.stack, forest = C.biomeIDs.forest, n = this.totalBiomePoints(r, forest, 0.002);
    var ok = function (x, y) { return st.getLazyBiomeID(x, y) === forest && !st.isSurfaceOceanOrRiver(x, y); };
    for (var i = 0; i < n; i++) {
      var p = this.randomBiomeTile(r, forest, 20, 20, 20, ['loot', 'villages'], function (x, y) { return cornerCheck(x, y, 20, 20, ok); });
      if (!p) continue;
      this.occupy('loot', p[0], p[1], 20, 20); this.occupy('villages', p[0], p[1], 20, 20);
      this.placed.push({ type: 'dungeon', x: p[0], y: p[1], w: 20, h: 20 });
    }
  };
  PresetRegion.prototype.addPirateVillages = function (r) {
    var st = this.stack, forest = C.biomeIDs.forest, n = this.totalBiomePoints(r, forest, 0.001);
    var ok = function (x, y) { return !st.isSurfaceOcean(x, y) && st.getLazyBiomeID(x, y) === forest; };
    for (var i = 0; i < n; i++) {
      var size = intBetween(r, 60, 80), pad = 35;
      var p = this.randomBiomeTile(r, forest, 200, size, size, ['villagespadding', 'villages'], function (x, y) { return gridCheck(x, y, size, size, 20, ok); });
      if (!p) continue;
      this.occupy('villages', p[0], p[1], size, size);
      this.occupy('villagespadding', p[0] - pad, p[1] - pad, size + pad * 2, size + pad * 2);
      this.placed.push({ type: 'pirate', x: p[0], y: p[1], w: size, h: size });
    }
  };
  PresetRegion.prototype.addVillages = function (r) {
    var st = this.stack, n = this.totalPoints(r, 0.001);
    for (var i = 0; i < n; i++) {
      var size = intBetween(r, 60, 120), sets = 0;
      var p = this.randomTile(r, 200, size, size, ['villagespadding', 'villages'], function (x, y) {
        if (!gridCheck(x, y, size, size, 16, function (a, b) { return !st.isSurfaceOceanOrRiver(a, b); })) return false;
        var seen = {};
        var ok = gridCheck(x, y, size, size, 16, function (a, b) { var id = st.getLazyBiomeID(a, b); if (C.villageSets[id] == null) return false; seen[id] = 1; return true; });
        if (ok) for (var id in seen) if (C.villageSets[id] > 0) sets++;
        if (!sets) return false;
        return ok;
      });
      if (!p) continue;
      this.occupy('villages', p[0], p[1], size, size);
      this.placed.push({ type: 'village', x: p[0], y: p[1], w: size, h: size });
    }
  };
  BiomeStack.prototype.isSurfaceOcean = function (x, y) { return this.ocean.get(x, y) === -1; };
  BiomeStack.prototype.isSurfaceOceanOrRiver = function (x, y) { return this.river.get(x, y) === -1; };
  BiomeStack.prototype.presetsInRegion = function (px, py) {
    var key = px + ',' + py, c = this._presetCache || (this._presetCache = new Map());
    if (!c.has(key)) c.set(key, new PresetRegion(this, this.seed, px, py).placed);
    return c.get(key);
  };

  // Ground tile and base object at (x, y) for the cave levels, following CaveLevel/DeepCaveLevel.generateRegion.
  // Returns [tileID, objectID] (objectID 0 = none). step > 2 uses the cheap lazy biome instead of the smoothed one.
  BiomeStack.prototype.caveTileObject = function (x, y, deep, step) {
    var B = C.caveBiomes;
    var ex = B[step > 2 ? this.getLazyBiomeID(x, y) : this.getExpensiveBiomeID(x, y)], sp = B[this.getSpreadBiomeID(x, y)];
    var lava = deep ? this.deepLava : this.caveLava, river = deep ? this.deepRiver : this.caveRiver, rocks = deep ? this.deepRocks : this.caveRocks;
    var lavaTile = deep ? ex.deepLava : ex.caveLava, riverTile = deep ? ex.deepRiver : ex.caveRiver;
    if (lava.get(x, y) === -1 && lavaTile) return [lavaTile, 0];
    if (river.get(x, y) === -1 && riverTile) return [riverTile, 0];
    return [deep ? sp.deepTile : sp.caveTile, (step >= 4 ? this.coarseRock(x, y, deep) : rocks.get(x, y) === -1) ? (deep ? sp.deepRock : sp.caveRock) : 0];
  };

  // Zoomed out a pixel covers 4+ tiles, so one tile's exact rock value is effectively noise. The four smoothing
  // passes over an 81-tile window cost ~130us a sample; they turn the 0.37 / 0.40 placement chance into these
  // densities (measured over 2.2M tiles), which a hash reproduces at a fraction of the cost.
  var ROCK_DENSITY = [0.6688, 0.7819];
  BiomeStack.prototype.coarseRock = function (x, y, deep) {
    var h = Math.imul(x, 0x2c1b3c6d) ^ Math.imul(y, 0x297a2d39) ^ Math.imul(this.seed, 0x165667b1) ^ (deep ? 0x5bd1e995 : 0);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296 < ROCK_DENSITY[deep ? 1 : 0];
  };

  // a generation vein by name, built on first use exactly as the biome registers it
  BiomeStack.prototype.vein = function (name) {
    var V = this._veins || (this._veins = {}); if (V[name]) return V[name];
    var d = C.biomeRules.veins[name], h = javaStringHash(name), st = this.main.addBranchingStack(new Stack(Math.imul(this.seed, prime(h)))), a = d.args, i;
    if (d.kind === 'random') {
      var chance = f(a[0]), mn = a[1], mx = a[2], keep = f(a[3]);
      var v10 = f(16 / mx), v12 = v10 * v10, v14 = (mn + mx) / 2, pc = f(((1 / v12) * chance) * (mx / v14));
      st.first = st.addLayer(mn === mx ? new ChanceVeinStatic(h, mn, pc, -1) : new ChanceVeinRandom(h, mn, mx, pc, -1));
      if (keep < 1) st.addLayer(new RandomReplaceValue(Math.imul(h, 2), -1, f(1 - keep), 0));
      for (i = 0; i < a[4]; i++) st.addLayer(new SingleCA(4, 3, -1, 0));
      st.reach = a[4] + 1;
    } else {
      st.addLayer(new SimplexVein(h, a[0], a[1], a[2], -1));
      for (i = 0; i < a[3]; i++) st.addLayer(new MultiCA(4, 3, 0));
    }
    return (V[name] = st);
  };

  // Palette index for any level: surface uses the ground palette, the caves use C.levelPalettes.
  BiomeStack.prototype.levelIndex = function (x, y, level, step) {
    if (level === 'surface') return this.surfaceIndex(x, y, step);
    var to = this.caveTileObject(x, y, level === 'deepcave', step), L = C.levelPalettes[level].lookup;
    var i = to[1] ? L['o' + to[1]] : L['t' + to[0]];
    return i === undefined ? 0 : i;
  };

  function javaStringHash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h;
  }

  var api = {
    init: function (constants) { C = constants; },
    setBiomeRules: function (r) { C.biomeRules = r; },
    BiomeStack: BiomeStack, JRandom: JRandom, Noise: Noise, gameRandom: gameRandom, javaStringHash: javaStringHash,
    _internal: { mul48: mul48, prime: prime, PresetRegion: PresetRegion, C: function () { return C; }, roundUpChance: roundUpChance, intBetween: intBetween, cornerCheck: cornerCheck, gridCheck: gridCheck }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NecesseGen = api;
})(typeof self !== 'undefined' ? self : this);

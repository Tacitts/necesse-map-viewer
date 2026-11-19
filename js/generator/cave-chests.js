/*
 * Necesse generated chests: loot tables and the chest-bearing cave structures, JavaScript port.
 * Translated from Necesse 1.3.3 (necesse.inventory.lootTable, necesse.level.maps.presets).
 * Install with NecesseChests.install(NecesseGen, lootData) after NecesseCave.install(NecesseGen).
 */
(function (root) {
  'use strict';
  function install(G, L) {
    var JR = G.JRandom.prototype, fr = Math.fround, I = G._internal, C = I.C();
    var LEVEL_SEED = { cave: 3046285, deepcave: 628957817, surface: -1853231955 };
    JR.nextBoolean = function () { return this.next(1) !== 0; };

    // java.util.Random(long seed) for a BigInt seed, and Collections.shuffle
    var M48 = (1n << 48n) - 1n;
    function javaRandomLong(seedBig) { return new G.JRandom().setSeed48(Number(BigInt.asUintN(64, seedBig) & M48)); }
    function shuffle(arr, rnd) { for (var i = arr.length; i > 1; i--) { var j = rnd.nextInt(i), t = arr[i - 1]; arr[i - 1] = arr[j]; arr[j] = t; } }

    // ---------- LootTable static helpers ----------
    function runChance(r, chance, mult, f) {
      chance = fr(chance); mult = fr(mult);
      while (mult >= 1) { if (r.getChance(chance)) { f(mult); return; } mult = fr(mult - 1); }
      if (r.getChance(mult) && r.getChance(chance)) f(1);
    }
    function runMultiplied(r, mult, f) {
      mult = fr(mult);
      while (mult >= 1) { mult = fr(mult - 1); f(); }
      if (r.getChance(mult)) f();
    }
    function lootAmount(r, amount, mult) {
      var v = fr(amount * fr(mult)), n = Math.trunc(v);
      if (v > n && r.getChance(fr(v - n))) n++;
      return n;
    }
    // ---------- item rolls (Item.getDefaultLootItem and its overrides) ----------
    var SCROLL = L.scroll;   // [[fromTicket, toTicket, [enchant names]], ...] out of L.scrollTotal
    function defaultLootItem(id, r, amount) {
      var it = L.items[id] || {}, out = { id: id, n: amount };
      switch (it.loot) {
        case 'ToolItem': case 'ArmorItem': case 'TrinketItem':
          if (it.enchantable && r.getChance(0.65)) {
            var list = it.enchants || [];
            if (list.length) out.ench = list[r.nextInt(list.length)];
          }
          break;
        case 'EnchantingScrollItem':
          var t = r.nextInt(L.scrollTotal);
          for (var i = 0; i < SCROLL.length; i++) if (t >= SCROLL[i][0] && t < SCROLL[i][1]) { out.ench = SCROLL[i][2][r.nextInt(SCROLL[i][2].length)]; break; }
          break;
        case 'LeatherDashersTrinketItem': break;
        case 'BumperCarMountItem': r.nextInt(L.bumperVariants || 1); break;
        case 'GatewayTabletItem': out.unsure = true; break;
      }
      return out;
    }
    function amountOf(a, r) {
      if (a[0] === 'const') return a[1];
      if (a[0] === 'between') return r.getIntBetween(a[1], a[2]);
      if (a[0] === 'offset') return r.getIntOffset(a[1], a[2]);
      return 1;
    }
    function itemAdd(node, list, r, mult) {
      if (node.nomult) mult = 1;
      var amount = amountOf(node.amount, r);
      var it = defaultLootItem(node.id, r, amount);
      var n = lootAmount(r, it.n, mult);
      if (n <= 0) return;
      var split = node.split || [1, 1];
      if (split[1] > 1) {
        var stacks = Math.max(Math.min(split[1], (n / split[0]) | 0), 1), per = (n / stacks) | 0, rest = n - per * stacks;
        for (var i = 0; i < stacks; i++) list.push({ id: it.id, n: per + (i < rest ? 1 : 0), ench: it.ench });
      } else list.push({ id: it.id, n: n, ench: it.ench, unsure: it.unsure });
    }
    // extra = { level: 'cave' | 'deepcave', rotation: { v: int } }
    function addItems(node, list, r, mult, extra) {
      var i, items;
      switch (node.t) {
        case 'table': case 'list':
          for (i = 0; i < node.items.length; i++) addItems(node.items[i], list, r, mult, extra); return;
        case 'oneof':
          if (node.items.length) addItems(node.items[r.nextInt(node.items.length)], list, r, mult, extra); return;
        case 'tickets': {
          var total = 0; for (i = 0; i < node.entries.length; i++) total += node.entries[i][0];
          if (!total) return;
          var t = r.nextInt(total), acc = 0;
          for (i = 0; i < node.entries.length; i++) { if (t >= acc && t < acc + node.entries[i][0]) { addItems(node.entries[i][1], list, r, mult, extra); return; } acc += node.entries[i][0]; }
          return;
        }
        case 'countof':
          items = node.items.slice();
          for (i = 0; i < node.count; i++) { if (!items.length) return; addItems(items.splice(r.nextInt(items.length), 1)[0], list, r, mult, extra); }
          return;
        case 'counttickets': {
          var es = node.entries.slice(), tot = 0; es.forEach(function (e) { tot += e[0]; });
          for (i = 0; i < node.count; i++) {
            if (!es.length) return;
            var tk = r.nextInt(tot), k = 0;
            for (; k < es.length; k++) { if (tk < es[k][0]) break; tk -= es[k][0]; }
            var e = es.splice(k, 1)[0]; addItems(e[1], list, r, mult, extra); tot -= e[0];
          }
          return;
        }
        case 'chanceitem':
          runChance(r, node.chance, mult, function (f) { itemAdd(node, list, r, f); }); return;
        case 'chancelist':
          runChance(r, node.chance, mult, function (f) { for (var j = 0; j < node.items.length; j++) addItems(node.items[j], list, r, f, extra); }); return;
        case 'rotation':
          runMultiplied(r, mult, function () {
            if (!node.items.length) return;
            var seed = extra && extra.level ? LEVEL_SEED[extra.level] : r.nextInt(2147483647);
            var counter = extra && extra.rotation ? extra.rotation.v++ : r.nextInt(2147483647);
            var n = node.items.length, idx = Math.abs(Math.abs(seed | 0) + counter) % n;
            var arr = node.items.slice();
            if (seed !== 0) shuffle(arr, javaRandomLong(BigInt(seed) * BigInt((counter / n) | 0)));
            addItems(arr[idx], list, r, 1, extra);
          });
          return;
        case 'nomult': addItems(node.child, list, r, 1, extra); return;
        case 'item': itemAdd(node, list, r, mult); return;
        default: list.push({ id: '?' + node.t, n: 1, unsure: true }); return;
      }
    }
    // Inventory.addItem: combine with matching stacks first, then fill empty slots, in slot order
    function toInventory(list, size) {
      var slots = new Array(size || 40).fill(null);
      list.forEach(function (it) {
        var amount = it.n, stack = (L.items[it.id] && L.items[it.id].stack) || 1;
        for (var s = 0; s < slots.length && amount > 0; s++) {
          var q = slots[s];
          if (q && q.id === it.id && (q.ench || '') === (it.ench || '') && q.n < stack) { var add = Math.min(stack - q.n, amount); q.n += add; amount -= add; }
        }
        for (s = 0; s < slots.length && amount > 0; s++) {
          if (!slots[s]) { var put = Math.min(amount, stack); slots[s] = { id: it.id, n: put, ench: it.ench, unsure: it.unsure }; amount -= put; }
        }
      });
      var out = [];
      slots.forEach(function (q, i) { if (q) out.push({ slot: i, id: q.id, n: q.n, ench: q.ench, unsure: q.unsure }); });
      return out;
    }
    function rollTable(name, r, extra) {
      var list = []; addItems(L.tables[name], list, r, 1, extra); return toInventory(list, 40);
    }

    // the random a placed preset gets when its region generates
    function placeRandom(seedInt, p) { return G.gameRandom(seedInt).nextSeeded(p.fx).nextSeeded(p.fy).nextSeeded(p.index); }

    // ---------- chest rooms (RandomCaveChestRoom) ----------
    var B = C.biomeIDs;
    var ROOM = {};   // biome id -> { sets: n, floors: getOneOf calls, table }
    ROOM[B.swamp] = { sets: 2, floors: 2, table: 'swampCaveChest' };
    ROOM[B.snow] = { sets: 3, floors: 2, table: 'snowCaveChest' };
    ROOM[B.desert] = { sets: 2, floors: 2, table: 'desertCaveChest' };
    ROOM[B.plains] = { sets: 2, floors: 1, table: 'plainsCaveChest' };
    var ROOM_DEFAULT = { sets: 2, floors: 1, table: 'basicCaveChest' };
    var DROOM = {};
    DROOM[B.swamp] = { sets: 2, floors: 2, table: 'deepSwampCaveChest' };
    DROOM[B.snow] = { sets: 2, floors: 2, table: 'deepSnowCaveChest' };
    DROOM[B.desert] = { sets: 2, floors: 1, table: 'deepDesertCaveChest' };
    DROOM[B.plains] = { sets: 1, floors: 1, table: 'deepPlainsCaveChest' };
    var DROOM_DEFAULT = { sets: 2, floors: 1, table: 'deepCaveChest' };
    function chestRoom(stack, p, level) {
      var r = placeRandom(stack.seed, p), x = p.rects[0][0], y = p.rects[0][1], deep = level === 'deepcave';
      var biome = stack.getExpensiveBiomeID(x + 3, y + 3), cfg = deep ? (DROOM[biome] || DROOM_DEFAULT) : (ROOM[biome] || ROOM_DEFAULT);
      r.nextInt(cfg.sets);                                // ChestRoomSet
      for (var f = 0; f < cfg.floors; f++) r.nextInt(2);  // floor tile variants
      var traps = 1;                                      // every set has 1 or 2 trap types; the bound only changes which trap
      r.nextInt(traps);
      if (r.getChance(0.9)) r.nextBoolean();              // trapped, and which side the plate goes
      r.nextInt(4);                                       // opening (one draw whatever the number of open sides)
      if (r.getChance(0.1)) return { x: x + 3, y: y + 3, obj: 'trialentrance', items: [], kind: 'trial' };
      if (deep && r.getChance(0.1)) return { x: x + 3, y: y + 3, obj: 'mimic', items: [], kind: 'trial' };   // a mimic waits here instead of a chest
      return { x: x + 3, y: y + 3, obj: 'storagebox', items: rollTable(cfg.table, r, { level: level || 'cave', rotation: { v: p.data.i } }), kind: 'chestroom' };
    }


    // ---------- cave ruins (CaveRuins1..10 with CaveRuins.applyRuinsLogic) ----------
    var RUIN = {};
    RUIN[B.swamp] = { furn: ['oak', 'spruce'], table: 'swampCaveRuinsChest' };
    RUIN[B.snow] = { furn: ['pine', 'spruce'], table: 'snowCaveRuinsChest' };
    RUIN[B.desert] = { furn: ['palm', 'spruce'], table: 'desertCaveRuinsChest' };
    RUIN[B.plains] = { furn: ['oak', 'spruce'], table: 'plainsCaveRuinsChest' };
    var RUIN_DEFAULT = { furn: ['oak', 'spruce'], table: 'basicCaveRuinsChest' };
    var DRUIN = {};
    DRUIN[B.swamp] = { furn: ['oak', 'spruce'], table: 'swampDeepCaveRuinsChest' };
    DRUIN[B.snow] = { furn: ['pine', 'spruce'], table: 'snowDeepCaveRuinsChest' };
    DRUIN[B.desert] = { furn: ['palm', 'spruce'], table: 'desertDeepCaveRuinsChest' };
    DRUIN[B.plains] = { furn: ['birch', 'maple'], table: 'plainsDeepCaveRuinsChest', fixedWall: true };
    var DRUIN_DEFAULT = { furn: ['oak', 'spruce'], table: 'basicDeepCaveRuinsChest' };
    function caveRuin(stack, p, level) {
      var r = placeRandom(stack.seed, p), x = p.rects[0][0], y = p.rects[0][1], deep = level === 'deepcave';
      var biome = stack.getExpensiveBiomeID(x + 5, y + 5), cfg = deep ? (DRUIN[biome] || DRUIN_DEFAULT) : (RUIN[biome] || RUIN_DEFAULT);
      if (!cfg.fixedWall) r.nextInt(2);               // wall set
      var furn = cfg.furn[r.nextInt(2)];
      // floor; the plains options "graniterock" (cave) and "basaltpath" (deep) are not tiles, so stone floors vanish
      var floor = r.nextInt(deep ? 2 : 4);
      var layout = r.nextInt(10), M = L.ruins[layout + ':' + furn], noFloor = biome === B.plains && floor === (deep ? 1 : 2);
      // applyRuinsLogic: knock out furniture and floor tiles at random, column by column
      var v5 = r.getFloatBetween(0.4, 0.8), v6 = r.getFloatBetween(fr(v5 - fr(0.05)), fr(v5 + fr(0.2)));
      var obj = new Int32Array(M.w * M.h), tile = new Uint8Array(M.w * M.h), cell = M.cells;
      for (var i = 0; i < cell.length; i++) { obj[i] = cell[i][0]; tile[i] = cell[i][1] === 2 && noFloor ? 0 : (cell[i][1] ? 1 : 0); }
      for (var cx = 0; cx < M.w; cx++) for (var cy = 0; cy < M.h; cy++) {
        var k = cx * M.h + cy, o = obj[k], removed = true;
        if (o !== -1) {
          if (o === -2) continue;                     // the chest stays
          var c = cell[k];
          if (o === c[0] && c[2] && r.getChance(v5)) {
            var fp = c[3];
            for (var j = 0; j < fp.length; j += 3) { var kk = fp[j] * M.h + fp[j + 1]; if (fp[j] >= 0 && fp[j] < M.w && fp[j + 1] >= 0 && fp[j + 1] < M.h && obj[kk] === fp[j + 2]) obj[kk] = -1; }
          } else removed = false;
        }
        if (removed && tile[k] && r.getChance(v6)) tile[k] = 0;
      }
      var mx = r.nextBoolean() ? 1 : 0, my = r.nextBoolean() ? 1 : 0, rot = r.nextInt(4);
      var tf = M.tf['' + mx + my + rot], w = tf[0], h = tf[1];
      var ox = 10 - w > 0 ? r.nextInt(10 - w) : 0, oy = 10 - h > 0 ? r.nextInt(10 - h) : 0;
      return { x: x + ox + tf[2], y: y + oy + tf[3], obj: M.chest, items: rollTable(cfg.table, r, { level: level || 'cave', rotation: { v: p.data.i } }), kind: 'caveruin' };
    }


    // ---------- surface ruins (RandomRuinsPreset) ----------
    function surfaceRuin(stack, p, spawn) {
      var x = p.rects[0][0], y = p.rects[0][1];
      if (spawn && spawnRemoved(p, spawn)) return null;
      var r = placeRandom(stack.seed, p);
      r.nextInt(2); r.nextInt(2);                          // wall and floor types
      for (var i = 0; i < 32; i++) r.getChance(0.5);       // which wall pieces survive
      for (var tx = 1; tx < 8; tx++) for (var ty = 1; ty < 8; ty++) {
        if ((ty === 1 || ty === 7) && (tx <= 2 || tx >= 6)) continue;
        if ((ty === 2 || ty === 6) && (tx <= 1 || tx >= 7)) continue;
        r.getChance(0.65);                                 // floor tiles
      }
      var obj = r.nextInt(2) ? 'barrel' : 'storagebox'; r.nextInt(4);
      return { x: x + 4, y: y + 4, obj: obj, items: rollTable('surfaceRuinsChest', r, { level: 'surface' }), kind: 'surfaceruin' };
    }
    // WorldEntity.removePresetsNearbySpawn
    function spawnRemoved(p, spawn) {
      var range = Math.min(p.spawnRange == null ? -1 : p.spawnRange, 7);
      if (range < 0) return false;
      for (var i = 0; i < p.rects.length; i++) { var q = p.rects[i]; if (spawn.x >= q[0] && spawn.x < q[0] + q[2] && spawn.y >= q[1] && spawn.y < q[1] + q[3]) return true; }
      var sx = spawn.x >> 4, sy = spawn.y >> 4;
      for (i = 0; i < p.rects.length; i++) { var r2 = p.rects[i];
        for (var rx = r2[0] >> 4; rx <= (r2[0] + r2[2] - 1) >> 4; rx++) for (var ry = r2[1] >> 4; ry <= (r2[1] + r2[3] - 1) >> 4; ry++) if (Math.max(Math.abs(rx - sx), Math.abs(ry - sy)) <= range) return true; }
      return false;
    }
    G.BiomeStack.prototype.surfaceChests = function (px, py, spawn) {
      var key = 'surface:' + px + ',' + py + ':' + (spawn ? spawn.x + ',' + spawn.y : ''), c = this._caveChestCache || (this._caveChestCache = new Map());
      if (c.has(key)) return c.get(key);
      var out = [], list = this.surfacePresetsFull(px, py);
      for (var i = 0; i < list.length; i++) if (list[i].id === 'surfaceruins') { var ch = surfaceRuin(this, list[i], spawn); if (ch) out.push(ch); }
      c.set(key, out);
      return out;
    };

    G.BiomeStack.prototype.caveChests = function (px, py, level) {
      level = level || 'cave';
      var key = level + ':' + px + ',' + py, c = this._caveChestCache || (this._caveChestCache = new Map());
      if (level === 'surface') return this.surfaceChests(px, py);
      if (c.has(key)) return c.get(key);
      var out = [], list = level === 'deepcave' ? this.deepPresets(px, py) : this.cavePresets(px, py);
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (p.id === 'chestrooms') out.push(chestRoom(this, p, level));
        else if (p.id === 'caveruins') out.push(caveRuin(this, p, level));
      }
      c.set(key, out);
      return out;
    };
    G.Chests = { table: function (name) { return L.tables[name]; }, addItems: addItems, rollTable: rollTable, toInventory: toInventory, placeRandom: placeRandom, caveRuin: caveRuin, chestRoom: chestRoom, spawnRemoved: spawnRemoved };
    return G;
  }
  var api = { install: install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NecesseChests = api;
})(typeof self !== 'undefined' ? self : this);

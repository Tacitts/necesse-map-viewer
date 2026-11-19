/* Iteration order of a java.util.HashMap<Long, V> whose keys are GameMath.getUniqueLongKey(x, y), including treeified bins. */
(function (root) {
  'use strict';
  function keyLong(x, y) { return (BigInt(y) << 32n) | (BigInt(x) & 0xFFFFFFFFn); }
  function signed64(v) { return BigInt.asIntN(64, v); }
  function hashOf(x, y) { var h = (x ^ y) | 0; return (h ^ (h >>> 16)) | 0; }
  function order(keys, mode) {
    var putMode = mode === 'put';
    var n = 16, tab = new Array(16).fill(null), size = 0, threshold = 12;
    function Node(h, k, x, y) { this.hash = h; this.key = k; this.x = x; this.y = y; this.next = null; this.tree = false; this.left = this.right = this.parent = this.prev = null; this.red = false; }
    function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    function rotateLeft(r, p) { var rr, pp, rl; if (p && (rr = p.right)) { if ((rl = p.right = rr.left)) rl.parent = p; if (!(pp = rr.parent = p.parent)) (r = rr).red = false; else if (pp.left === p) pp.left = rr; else pp.right = rr; rr.left = p; p.parent = rr; } return r; }
    function rotateRight(r, p) { var l, pp, lr; if (p && (l = p.left)) { if ((lr = p.left = l.right)) lr.parent = p; if (!(pp = l.parent = p.parent)) (r = l).red = false; else if (pp.right === p) pp.right = l; else pp.left = l; l.right = p; p.parent = l; } return r; }
    function balanceInsertion(r, x) {
      x.red = true;
      for (var xp, xpp, xppl, xppr; ;) {
        if (!(xp = x.parent)) { x.red = false; return x; }
        else if (!xp.red || !(xpp = xp.parent)) return r;
        if (xp === (xppl = xpp.left)) {
          if ((xppr = xpp.right) && xppr.red) { xppr.red = false; xp.red = false; xpp.red = true; x = xpp; }
          else { if (x === xp.right) { r = rotateLeft(r, x = xp); xpp = (xp = x.parent) ? xp.parent : null; }
            if (xp) { xp.red = false; if (xpp) { xpp.red = true; r = rotateRight(r, xpp); } } }
        } else {
          if (xppl && xppl.red) { xppl.red = false; xp.red = false; xpp.red = true; x = xpp; }
          else { if (x === xp.left) { r = rotateRight(r, x = xp); xpp = (xp = x.parent) ? xp.parent : null; }
            if (xp) { xp.red = false; if (xpp) { xpp.red = true; r = rotateLeft(r, xpp); } } }
        }
      }
    }
    function moveRootToFront(index, r) {
      var first = tab[index];
      if (r !== first) {
        var rn = r.next, rp = r.prev;
        if (rn) rn.prev = rp; if (rp) rp.next = rn;
        if (first) first.prev = r;
        r.next = first; r.prev = null; tab[index] = r;
      }
    }
    function dirOf(h, k, p) { var ph = p.hash; if (ph > h) return -1; if (ph < h) return 1; var d = cmp(k, p.key); return d === 0 ? -1 : d; }
    function treeify(head, index) {
      var r = null;
      for (var x = head, next; x; x = next) {
        next = x.next; x.left = x.right = null; x.tree = true;
        if (!r) { x.parent = null; x.red = false; r = x; }
        else for (var p = r; ;) { var dir = dirOf(x.hash, x.key, p), xp = p; p = dir <= 0 ? p.left : p.right;
          if (!p) { x.parent = xp; if (dir <= 0) xp.left = x; else xp.right = x; r = balanceInsertion(r, x); break; } }
      }
      moveRootToFront(index, r);
    }
    function untreeify(head) { for (var q = head; q; q = q.next) { q.tree = false; q.left = q.right = q.parent = null; q.prev = null; } return head; }
    function rootOf(node) { var r = node; while (r.parent) r = r.parent; return r; }
    function treeifyBin(index) {
      if (n < 64) { resize(); return; }
      var hd = tab[index], prev = null;
      for (var e = hd; e; e = e.next) { e.prev = prev; prev = e; }
      treeify(hd, index);
    }
    function resize() {
      var old = tab, on = n; n = on * 2; threshold = (n * 0.75) | 0; tab = new Array(n).fill(null);
      for (var j = 0; j < on; j++) {
        var e = old[j]; if (!e) continue;
        if (!e.next) { e.prev = null; tab[e.hash & (n - 1)] = e; continue; }
        var lo = [], hi = [];
        for (var q = e; q; q = q.next) ((q.hash & on) === 0 ? lo : hi).push(q);
        [[lo, j], [hi, j + on]].forEach(function (pr) {
          var l = pr[0], idx = pr[1]; if (!l.length) return;
          for (var i = 0; i < l.length; i++) { l[i].next = l[i + 1] || null; l[i].prev = l[i - 1] || null; }
          if (e.tree) {
            if (l.length <= 6) tab[idx] = untreeify(l[0]);
            else { tab[idx] = l[0]; if ((pr[0] === lo ? hi : lo).length) treeify(l[0], idx); }
          } else tab[idx] = l[0];
        });
      }
    }
    // HashMap.put: new nodes go to the tail, resize after the insertion
    function putTail(x, y) {
      var h = hashOf(x, y), k = signed64(keyLong(x, y)), i = h & (n - 1), p = tab[i];
      if (!p) tab[i] = new Node(h, k, x, y);
      else if (p.tree) {
        var r = rootOf(p);
        for (var q = r; ;) {
          if (q.hash === h && q.key === k) return;
          var dir = dirOf(h, k, q), xp = q; q = dir <= 0 ? q.left : q.right;
          if (!q) { var xpn = xp.next, nx = new Node(h, k, x, y); nx.tree = true; nx.next = xpn; if (dir <= 0) xp.left = nx; else xp.right = nx; xp.next = nx; nx.parent = nx.prev = xp; if (xpn) xpn.prev = nx;
            moveRootToFront(i, balanceInsertion(r, nx)); break; }
        }
      } else {
        for (var bc = 0; ; bc++) {
          if (p.hash === h && p.key === k) return;
          if (!p.next) { p.next = new Node(h, k, x, y); p.next.prev = p; if (bc >= 7) treeifyBin(i); break; }
          p = p.next;
        }
      }
      if (++size > threshold) resize();
    }
    // HashMap.compute for an absent key: new nodes go to the head of a plain bin
    function put(x, y) {
      if (putMode) return putTail(x, y);
      if (size > threshold) resize();
      var h = hashOf(x, y), k = signed64(keyLong(x, y)), i = h & (n - 1), first = tab[i], bc = 0;
      if (first) {
        if (first.tree) {
          var r = rootOf(first);
          for (var q = r; q;) { if (q.hash === h && q.key === k) return; var d = dirOf(h, k, q); q = d <= 0 ? q.left : q.right; }
          for (q = r; ;) {
            var dir = dirOf(h, k, q), xp = q; q = dir <= 0 ? q.left : q.right;
            if (!q) { var xpn = xp.next, nx = new Node(h, k, x, y); nx.tree = true; nx.next = xpn; if (dir <= 0) xp.left = nx; else xp.right = nx; xp.next = nx; nx.parent = nx.prev = xp; if (xpn) xpn.prev = nx;
              moveRootToFront(i, balanceInsertion(r, nx)); break; }
          }
          size++; return;
        }
        for (var e = first; e; e = e.next) { if (e.hash === h && e.key === k) return; bc++; }
      }
      var nn = new Node(h, k, x, y); nn.next = first; if (first) first.prev = nn; tab[i] = nn;
      if (bc >= 7) treeifyBin(i);
      size++;
    }
    keys.forEach(function (k) { put(k[0], k[1]); });
    var out = [];
    for (var j = 0; j < n; j++) for (var e = tab[j]; e; e = e.next) out.push([e.x, e.y]);
    return out;
  }
  var api = { order: order };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JHashMapOrder = api;
})(typeof self !== 'undefined' ? self : this);

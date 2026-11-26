// HTML for /stats. Two pages: the login form (what everybody else sees) and the dashboard (served only to a valid session).
// Neither contains credentials. The client scripts avoid backticks and "${" on purpose (they live inside String.raw).

const THEME = String.raw`
  :root { color-scheme: light dark; --page:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10); --s1:#2a78d6; --s2:#eb6834; --good:#006300; --bad:#d03b3b; --wash:rgba(11,11,11,.05); }
  @media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { color-scheme: dark; --page:#0d0d0d; --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --s1:#3987e5; --s2:#d95926; --good:#0ca30c; --wash:rgba(255,255,255,.06); } }
  :root[data-theme="dark"] { color-scheme: dark; --page:#0d0d0d; --surface:#1a1a19; --ink:#f0efec; --ink2:#c3c2b7; --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10); --s1:#3987e5; --s2:#d95926; --good:#0ca30c; --wash:rgba(255,255,255,.06); }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  button, input { font: inherit; color: inherit; }
  [hidden] { display: none !important; }
`;

const HEAD = (title) => String.raw`<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title}</title>`;

/* ================= login ================= */
const LOGIN = HEAD('Đăng nhập') + String.raw`<style>${THEME}
  body { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
  .card { width: 100%; max-width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 28px 24px; }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 650; } p { margin: 0 0 20px; color: var(--ink2); }
  label { display: block; margin-bottom: 14px; } label span { display: block; margin-bottom: 6px; font-size: 12px; color: var(--ink2); }
  input { width: 100%; height: 42px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--axis); background: var(--page); outline: none; }
  input:focus-visible { border-color: var(--s1); box-shadow: 0 0 0 3px color-mix(in srgb, var(--s1) 25%, transparent); }
  button { width: 100%; height: 42px; margin-top: 4px; border: 0; border-radius: 9px; background: var(--ink); color: var(--page); font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  #msg { min-height: 20px; margin-top: 12px; font-size: 13px; color: var(--bad); }
</style></head><body>
<form class="card" id="f" method="post" autocomplete="on">
  <h1>Analytics</h1><p>Đăng nhập để xem báo cáo.</p>
  <label><span>Tài khoản</span><input id="u" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required maxlength="100" autofocus></label>
  <label><span>Mật khẩu</span><input id="p" name="password" type="password" autocomplete="current-password" required maxlength="200"></label>
  <button id="b" type="submit">Đăng nhập</button>
  <div id="msg" role="alert" aria-live="polite"></div>
</form>
<script>
(function () {
  var f = document.getElementById('f'), b = document.getElementById('b'), m = document.getElementById('msg');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    b.disabled = true; m.textContent = '';
    fetch('/stats/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ u: document.getElementById('u').value, p: document.getElementById('p').value }) })
      .then(function (r) {
        if (r.ok) { document.getElementById('p').value = ''; location.reload(); return; }
        m.textContent = r.status === 429 ? 'Thử quá nhiều lần. Hãy quay lại sau 15 phút.' : r.status === 503 ? 'Máy chủ chưa được cấu hình (thiếu STATS_SECRET).' : 'Sai tài khoản hoặc mật khẩu.';
        document.getElementById('p').select(); b.disabled = false;
      })
      .catch(function () { m.textContent = 'Không kết nối được máy chủ.'; b.disabled = false; });
  });
})();
</script></body></html>`;

/* ================= dashboard ================= */
const DASH = HEAD('Analytics') + String.raw`<style>${THEME}
  .wrap { max-width: 1080px; margin: 0 auto; padding: 20px 16px 48px; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
  header h1 { margin: 0; font-size: 18px; font-weight: 650; } header small { color: var(--ink2); display: block; font-weight: 400; font-size: 12px; }
  .grow { flex: 1; }
  .seg { display: inline-flex; padding: 3px; border-radius: 10px; background: var(--wash); }
  .seg button { height: 30px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--ink2); cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: 0 0 0 1px var(--border); }
  .ghost { height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--border); background: transparent; cursor: pointer; color: var(--ink2); }
  .ghost:hover, .seg button:hover { background: var(--wash); }
  button:focus-visible { outline: 2px solid var(--s1); outline-offset: 2px; }
  #content { transition: opacity .2s; } .loading #content { opacity: .55; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  .tile, .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .tl { color: var(--ink2); font-size: 12px; } .tv { margin-top: 6px; font-size: 30px; font-weight: 650; letter-spacing: -.01em; line-height: 1.1; }
  .td { margin-top: 8px; min-height: 18px; font-size: 12px; color: var(--muted); } .td b { font-weight: 600; } .up { color: var(--good); } .down { color: var(--bad); }
  .card h2 { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--ink2); }
  .chead { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-bottom: 8px; } .chead h2 { margin: 0; }
  .legend { display: flex; gap: 14px; color: var(--ink2); font-size: 12px; } .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  #chartBox { position: relative; outline: none; } #chartBox:focus-visible { outline: 2px solid var(--s1); outline-offset: 4px; border-radius: 6px; }
  #chart svg { display: block; width: 100%; height: auto; overflow: visible; } #chart text { fill: var(--muted); font-size: 11px; }
  #tip { position: absolute; top: 8px; z-index: 2; min-width: 150px; padding: 10px 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); box-shadow: 0 6px 24px rgba(0,0,0,.18); pointer-events: none; font-size: 12px; }
  #tip .d { color: var(--ink2); margin-bottom: 6px; } #tip .r { display: flex; align-items: center; gap: 8px; margin-top: 3px; } #tip .r i { width: 12px; height: 2px; border-radius: 1px; } #tip .r b { font-size: 14px; min-width: 28px; } #tip .r span { color: var(--ink2); }
  #empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); pointer-events: none; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--grid); } th { color: var(--ink2); font-weight: 600; font-size: 12px; } td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-top: 12px; }
  .card.wide { grid-column: 1 / -1; }
  .fbdist { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0 28px; margin-bottom: 8px; }
  .fblist { list-style: none; margin: 14px 0 0; padding: 0; border-top: 1px solid var(--grid); } .fblist li { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--grid); }
  .fe { flex: none; width: 32px; text-align: center; font-size: 24px; line-height: 1.2; } .fbbody { min-width: 0; }
  .fbmeta { font-size: 12px; color: var(--muted); } .fbtext { margin-top: 2px; white-space: pre-wrap; overflow-wrap: anywhere; } .fbcontact { margin-top: 4px; font-size: 12px; color: var(--ink2); overflow-wrap: anywhere; }
  .row { margin-bottom: 11px; } .row:last-child { margin-bottom: 0; }
  .rt { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; } .rt .l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rt .v { font-variant-numeric: tabular-nums; } .rt .v small { color: var(--muted); margin-left: 6px; }
  .bar { height: 6px; margin-top: 5px; background: var(--wash); border-radius: 0 4px 4px 0; } .bar i { display: block; height: 100%; min-width: 2px; background: var(--s1); border-radius: 0 4px 4px 0; }
  .row.zero .l, .row.zero .v { color: var(--muted); }
  .none { color: var(--muted); font-size: 13px; }
  #err, #warn { margin-bottom: 12px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font-size: 13px; } #err { color: var(--bad); }
  footer { margin-top: 18px; color: var(--muted); font-size: 12px; line-height: 1.6; }
  @media (max-width: 760px) { .tiles { grid-template-columns: repeat(2, 1fr); } .tv { font-size: 26px; } }
</style></head><body>
<div class="wrap" id="main">
  <header>
    <div><h1>Analytics<small>Quây quần quanh cây thông</small></h1></div>
    <div class="grow"></div>
    <div class="seg" role="group" aria-label="Khoảng thời gian" id="range">
      <button type="button" data-r="7" aria-pressed="true">7 ngày</button><button type="button" data-r="30" aria-pressed="false">30 ngày</button><button type="button" data-r="90" aria-pressed="false">90 ngày</button>
    </div>
    <button class="ghost" id="refresh" type="button">Làm mới</button>
    <button class="ghost" id="logout" type="button">Đăng xuất</button>
  </header>
  <div id="err" hidden role="alert">Không tải được số liệu. Thử làm mới trang.</div>
  <div id="warn" hidden></div>
  <div id="content">
    <section class="tiles" id="tiles" aria-label="Tổng quan"></section>
    <section class="card" aria-labelledby="ct">
      <div class="chead">
        <h2 id="ct">Lượt truy cập theo ngày</h2>
        <div class="legend"><span><i style="background:var(--s1)"></i>Khách</span><span><i style="background:var(--s2)"></i>Lượt xem trang</span></div>
        <div class="grow"></div>
        <button class="ghost" id="tbtn" type="button" aria-pressed="false">Xem dạng bảng</button>
      </div>
      <div id="chartBox" tabindex="0" aria-label="Biểu đồ khách và lượt xem trang theo ngày. Dùng phím mũi tên trái phải để xem từng ngày.">
        <div id="chart"></div><div id="tip" hidden></div><div id="empty" hidden>Chưa có dữ liệu trong khoảng này</div>
      </div>
      <div id="tbl" hidden></div>
    </section>
    <section class="grid" id="lists"></section>
  </div>
  <footer id="foot"></footer>
</div>
<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var EV = { join: 'Vào quảng trường (tham gia)', wish: 'Treo quả châu', gift: 'Nhặt quà từ trời', chat: 'Gửi tin nhắn', photo: 'Tải thiệp ảnh', video_start: 'Bắt đầu quay video', video_done: 'Quay video xong', share: 'Bấm chia sẻ', santa_join: 'Đăng ký Ông già Noel bí mật', mission_claim: 'Nhận kẹo nhiệm vụ', lang_switch: 'Đổi ngôn ngữ', feedback_open: 'Mở hộp góp ý', feedback_sent: 'Gửi góp ý', tarot_open: 'Tarot: mở quầy (bấm Xem Tarot)', tarot_shuffle: 'Tarot: bấm Xào bài', tarot_read: 'Tarot: rút đủ 3 lá và xem kết quả', tarot_again: 'Tarot: rút lại lần nữa', ferris_ride: 'Lên vòng quay' };
  var DEV = { desktop: 'Máy tính', mobile: 'Điện thoại', tablet: 'Máy tính bảng' };
  var nf = new Intl.NumberFormat('vi-VN'), cf = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
  var fmt = function (n) { return n < 10000 ? nf.format(n) : cf.format(n); };
  var regionNames = null; try { regionNames = new Intl.DisplayNames(['vi'], { type: 'region' }); } catch (e) { /* older browsers */ }
  var state = { range: 7, data: null, hover: -1, geom: null };
  try { var saved = Number(localStorage.getItem('stats.range')); if (saved === 30 || saved === 90) state.range = saved; } catch (e) { /* ignore */ }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function dateLabel(d, long) { var t = new Date(d + 'T00:00:00'); return long ? t.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' }) : t.getDate() + '/' + (t.getMonth() + 1); }

  /* ---------- data ---------- */
  function load() {
    $('main').classList.add('loading'); $('err').hidden = true;
    fetch('/stats/data/' + state.range, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { if (r.status === 401) { location.reload(); return null; } if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (d) { state.data = d; render(); } })
      .catch(function () { $('err').hidden = false; })
      .then(function () { $('main').classList.remove('loading'); });
  }

  /* ---------- tiles ---------- */
  function delta(cur, prev) {
    var box = el('div', 'td');
    if (!prev) { box.textContent = cur ? 'Mới trong kỳ này' : 'Chưa có dữ liệu kỳ trước'; return box; }
    var pct = Math.round(((cur - prev) / prev) * 100), up = pct >= 0;
    var b = pct === 0 ? el('b', null, '— 0%') : el('b', up ? 'up' : 'down', (up ? '▲ ' : '▼ ') + Math.abs(pct) + '%');
    box.append(b, document.createTextNode(' so với ' + state.range + ' ngày trước'));
    return box;
  }
  function renderTiles(d) {
    var t = $('tiles'); t.replaceChildren();
    var join = (d.ev.filter(function (e) { return e.k === 'join'; })[0] || { n: 0 }).n;
    var items = [['Khách', d.totals.uv, d.prev.uv], ['Lượt xem trang', d.totals.pv, d.prev.pv], ['Sự kiện trong app', d.totals.ev, d.prev.ev]];
    items.forEach(function (it) { var c = el('div', 'tile'); c.append(el('div', 'tl', it[0]), el('div', 'tv', fmt(it[1])), delta(it[1], it[2])); t.append(c); });
    var rate = d.totals.uv ? Math.round((join / d.totals.uv) * 100) : 0;
    var c = el('div', 'tile'); c.append(el('div', 'tl', 'Tỉ lệ vào quảng trường'), el('div', 'tv', rate + '%'), el('div', 'td', nf.format(join) + ' lượt tham gia / ' + nf.format(d.totals.uv) + ' khách')); t.append(c);
  }

  /* ---------- chart (one axis: both series are counts) ---------- */
  function niceStep(v) { var p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); var m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function drawChart() {
    var d = state.data; if (!d) return;
    var box = $('chart'), W = Math.max(box.clientWidth, 280), H = 250, L = 38, R = 14, T = 12, B = 28;
    var s = d.series, n = s.length, pw = W - L - R, ph = H - T - B;
    var max = Math.max.apply(null, s.map(function (p) { return Math.max(p.pv, p.uv); }).concat([1]));
    var step = Math.max(1, niceStep(max / 4)), top = step * 4;
    var X = function (i) { return n === 1 ? L + pw / 2 : L + (i * pw) / (n - 1); }, Y = function (v) { return T + ph - (v / top) * ph; };
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Biểu đồ đường: khách và lượt xem trang theo ngày, ' + n + ' ngày' });
    for (var k = 0; k <= 4; k++) { // hairline grid + y labels
      var y = Y(k * step);
      g.append(svg('line', { x1: L, x2: W - R, y1: y, y2: y, stroke: k === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
      var tx = svg('text', { x: L - 8, y: y + 4, 'text-anchor': 'end' }); tx.textContent = fmt(k * step); g.append(tx);
    }
    var every = n <= 8 ? (W < 480 ? 2 : 1) : n <= 31 ? 5 : 15;
    s.forEach(function (p, i) { if ((n - 1 - i) % every === 0) { var tx = svg('text', { x: X(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }); tx.textContent = dateLabel(p.d); g.append(tx); } });
    var line = function (key) { return s.map(function (p, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[key]).toFixed(1); }).join(' '); };
    g.append(svg('path', { d: line('uv') + ' L' + X(n - 1).toFixed(1) + ' ' + Y(0) + ' L' + X(0).toFixed(1) + ' ' + Y(0) + ' Z', fill: 'var(--s1)', 'fill-opacity': '0.10' }));
    g.append(svg('path', { d: line('pv'), fill: 'none', stroke: 'var(--s2)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    g.append(svg('path', { d: line('uv'), fill: 'none', stroke: 'var(--s1)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    [['pv', 'var(--s2)'], ['uv', 'var(--s1)']].forEach(function (a) { g.append(svg('circle', { cx: X(n - 1), cy: Y(s[n - 1][a[0]]), r: 4, fill: a[1], stroke: 'var(--surface)', 'stroke-width': 2 })); }); // end dots
    var hover = svg('g', { id: 'hv' }); g.append(hover);
    box.replaceChildren(g);
    state.geom = { W: W, X: X, Y: Y, L: L, R: R, T: T, ph: ph, n: n };
    $('empty').hidden = !!(d.totals.pv || d.totals.uv);
    setHover(Math.min(state.hover, n - 1));
  }
  function setHover(i) {
    state.hover = i;
    var h = document.getElementById('hv'), tip = $('tip'); if (!h) return;
    h.replaceChildren();
    if (i < 0 || !state.data) { tip.hidden = true; return; }
    var gm = state.geom, p = state.data.series[i], x = gm.X(i);
    h.append(svg('line', { x1: x, x2: x, y1: gm.T, y2: gm.T + gm.ph, stroke: 'var(--axis)', 'stroke-width': 1 }));
    [['pv', 'var(--s2)'], ['uv', 'var(--s1)']].forEach(function (a) { h.append(svg('circle', { cx: x, cy: gm.Y(p[a[0]]), r: 4, fill: a[1], stroke: 'var(--surface)', 'stroke-width': 2 })); });
    tip.replaceChildren(el('div', 'd', dateLabel(p.d, true)));
    [['uv', 'Khách', 'var(--s1)'], ['pv', 'Lượt xem trang', 'var(--s2)']].forEach(function (a) {
      var r = el('div', 'r'), key = el('i'); key.style.background = a[2];
      r.append(key, el('b', null, nf.format(p[a[0]])), el('span', null, a[1])); tip.append(r);
    });
    tip.hidden = false;
    var px = (x / gm.W) * $('chart').clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(px + 14, $('chart').clientWidth - tw)) + 'px';
  }
  function bindChart() {
    var b = $('chartBox');
    b.addEventListener('pointermove', function (e) {
      if (!state.geom) return; var r = $('chart').getBoundingClientRect(), gm = state.geom;
      var x = ((e.clientX - r.left) / r.width) * gm.W, best = 0, bd = 1e9;
      for (var i = 0; i < gm.n; i++) { var dd = Math.abs(gm.X(i) - x); if (dd < bd) { bd = dd; best = i; } }
      if (best !== state.hover) setHover(best);
    });
    b.addEventListener('pointerleave', function () { if (document.activeElement !== b) setHover(-1); });
    b.addEventListener('blur', function () { setHover(-1); });
    b.addEventListener('focus', function () { if (state.data && state.hover < 0) setHover(state.data.series.length - 1); });
    b.addEventListener('keydown', function (e) {
      if (!state.data) return; var n = state.data.series.length, i = state.hover < 0 ? n - 1 : state.hover;
      if (e.key === 'ArrowLeft') { setHover(Math.max(0, i - 1)); e.preventDefault(); } else if (e.key === 'ArrowRight') { setHover(Math.min(n - 1, i + 1)); e.preventDefault(); } else if (e.key === 'Escape') setHover(-1);
    });
  }

  /* ---------- table twin of the chart ---------- */
  function renderTable(d) {
    var t = el('table'), head = el('tr'); t.setAttribute('aria-label', 'Số liệu theo ngày');
    ['Ngày', 'Khách', 'Lượt xem trang'].forEach(function (h, i) { var th = el('th', i ? 'n' : null, h); th.scope = 'col'; head.append(th); });
    t.append(head);
    d.series.slice().reverse().forEach(function (p) { var r = el('tr'); r.append(el('td', null, dateLabel(p.d, true)), el('td', 'n', nf.format(p.uv)), el('td', 'n', nf.format(p.pv))); t.append(r); });
    $('tbl').replaceChildren(t);
  }

  /* ---------- ranked lists (single series -> one colour) ---------- */
  function flag(c) { return c === 'ZZ' ? '🌐' : String.fromCodePoint.apply(null, c.split('').map(function (ch) { return 127397 + ch.charCodeAt(0); })); }
  var LABEL = {
    ref: function (k) { return k === 'direct' ? 'Truy cập trực tiếp' : k; },
    ctry: function (k) { return flag(k) + ' ' + (k === 'ZZ' ? 'Không rõ' : (regionNames && regionNames.of(k)) || k); },
    dev: function (k) { return DEV[k] || k; }, br: function (k) { return k; }, os: function (k) { return k; },
    pg: function (k) { return k === '/' ? '/ (trang chủ)' : k; }, ev: function (k) { return EV[k] || k; },
  };
  function card(title, key, rows) {
    var c = el('section', 'card'); c.append(el('h2', null, title));
    var total = rows.reduce(function (s, r) { return s + r.n; }, 0), max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    if (!rows.length || (key !== 'ev' && !total)) { c.append(el('div', 'none', 'Chưa có dữ liệu')); return c; }
    rows.forEach(function (r) {
      var row = el('div', 'row' + (r.n ? '' : ' zero')), top = el('div', 'rt'), l = el('span', 'l', LABEL[key](r.k)), v = el('span', 'v', nf.format(r.n));
      if (key !== 'ev' && total) v.append(el('small', null, Math.round((r.n / total) * 100) + '%'));
      l.title = l.textContent; top.append(l, v);
      var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (r.n / max) * 100 + '%'; bar.append(fill);
      row.append(top, bar); c.append(row);
    });
    return c;
  }
  function renderLists(d) {
    var l = $('lists'); l.replaceChildren();
    l.append(card('Nguồn truy cập', 'ref', d.ref), card('Quốc gia', 'ctry', d.ctry), card('Thiết bị', 'dev', d.dev), card('Trình duyệt', 'br', d.br), card('Hệ điều hành', 'os', d.os), card('Trang', 'pg', d.pg), card('Sự kiện trong app', 'ev', d.ev));
    renderFeedback(d);
  }

  /* ---------- user feedback: rating distribution + newest comments (all text via textContent) ---------- */
  var FACE = { 4: '😍', 3: '🙂', 2: '😐', 1: '😞', 0: '—' }, FACE_NAME = { 4: 'Rất thích', 3: 'Ổn', 2: 'Tạm được', 1: 'Chưa tốt' };
  var FROM = { menu: 'từ menu', wish: 'sau khi treo quả', video: 'sau khi quay video' };
  function renderFeedback(d) {
    var fb = d.fb || { total: 0, byRating: {}, items: [] }, c = el('section', 'card wide');
    c.append(el('h2', null, 'Góp ý từ người dùng (' + nf.format(fb.total) + ')'));
    if (!fb.total) { c.append(el('div', 'none', 'Chưa có góp ý nào trong khoảng này')); $('lists').append(c); return; }
    var dist = el('div', 'fbdist'), rated = [4, 3, 2, 1].map(function (r) { return { r: r, n: fb.byRating[r] || 0 }; });
    var max = Math.max.apply(null, rated.map(function (x) { return x.n; }).concat([1]));
    rated.forEach(function (x) {
      var row = el('div', 'row' + (x.n ? '' : ' zero')), top = el('div', 'rt'), bar = el('div', 'bar'), fill = el('i');
      top.append(el('span', 'l', FACE[x.r] + ' ' + FACE_NAME[x.r]), el('span', 'v', nf.format(x.n)));
      fill.style.width = (x.n / max) * 100 + '%'; bar.append(fill); row.append(top, bar); dist.append(row);
    });
    c.append(dist);
    if (fb.byRating[0]) c.append(el('div', 'none', nf.format(fb.byRating[0]) + ' góp ý chỉ có chữ, không chọn mặt cảm xúc'));
    var list = el('ul', 'fblist');
    fb.items.forEach(function (it) {
      var li = el('li'), box = el('div', 'fbbody');
      var when = new Date(it.t).toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      box.append(el('div', 'fbmeta', when + ' · ' + (DEV[it.dev] || it.dev) + ' · ' + (it.lang === 'en' ? 'English' : 'Tiếng Việt') + ' · ' + (FROM[it.from] || it.from)));
      if (it.text) box.append(el('div', 'fbtext', it.text));
      if (it.contact) box.append(el('div', 'fbcontact', 'Liên hệ: ' + it.contact));
      li.append(el('span', 'fe', FACE[it.r] || '—'), box); list.append(li);
    });
    c.append(list); $('lists').append(c);
  }

  function render() {
    var d = state.data;
    renderTiles(d); drawChart(); renderTable(d); renderLists(d);
    $('warn').hidden = d.store !== 'none';
    if (d.store === 'none') $('warn').textContent = 'Chưa kết nối kho dữ liệu: số liệu chưa được lưu. Trên Vercel hãy thêm Upstash Redis (Storage → Marketplace) vào project.';
    $('foot').textContent = 'Cập nhật ' + new Date(d.generatedAt).toLocaleTimeString('vi-VN') + ' · Ngày tính theo giờ UTC' + (d.tz >= 0 ? '+' : '') + d.tz + ' · "Khách" là số khách duy nhất mỗi ngày, cộng dồn qua các ngày (không dùng cookie, không lưu IP) · Lượt xem trang tính mỗi lần tải trang · Kỳ hiện tại gồm cả hôm nay (chưa trọn ngày) nên mức thay đổi có thể thấp hơn thực tế.';
  }

  /* ---------- controls ---------- */
  function markRange() { Array.prototype.forEach.call($('range').children, function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.r) === state.range)); }); }
  $('range').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    state.range = Number(b.dataset.r); try { localStorage.setItem('stats.range', String(state.range)); } catch (x) { /* ignore */ }
    markRange(); load();
  });
  $('refresh').addEventListener('click', load);
  $('logout').addEventListener('click', function () { fetch('/stats/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.reload(); }); });
  $('tbtn').addEventListener('click', function () {
    var on = $('tbl').hidden; $('tbl').hidden = !on; $('chartBox').hidden = on;
    this.setAttribute('aria-pressed', String(on)); this.textContent = on ? 'Xem dạng biểu đồ' : 'Xem dạng bảng';
    if (!on) drawChart();
  });
  var rt = 0; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawChart, 120); });
  setInterval(function () { if (!document.hidden) load(); }, 60000);
  markRange(); bindChart(); load();
})();
</script></body></html>`;

export const loginPage = () => LOGIN;
export const dashboardPage = () => DASH;

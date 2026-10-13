// Archify 產出的流程圖頁面後處理（可重複執行）
//   1. 拿掉圖外面的底框（底色、邊框、陰影、點狀網格），讓流程圖直接呈現
//   2. 拿掉「100% ＋ －」縮放按鈕和「路徑」
//   3. 直覺操作：手機雙指縮放、放大後單指拖曳、雙擊放大／還原；電腦觸控板捏合或 Ctrl＋滾輪縮放、拖曳平移
// 用法：node docs/archify/viewer-patch.mjs public/flows/*.html
import fs from "fs";

const MARK = "sensesoil-viewer-patch";

const STYLE = `<style id="${MARK}-style">
  /* 1. 底框 */
  .diagram-container,
  html[data-preset] .diagram-container {
    background: transparent !important;
    border: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 0 3.25rem !important;
    overflow: hidden !important;
  }
  .diagram-container::before, .diagram-container::after { display: none !important; }
  .diagram-container > svg > rect[fill="url(#grid)"] { display: none; }
  /* 手機不要橫向捲動，整張圖先縮到螢幕寬，再用手勢放大 */
  .diagram-container > svg { min-width: 0 !important; transition: none !important; }
  .diagram-container[data-wide-diagram="true"] { overflow: hidden !important; }
  .diagram-container .diagram-nav,
  .diagram-container .overview-map,
  .diagram-container .focus-chip,
  .diagram-container .route-probe,
  .diagram-container .semantic-lens,
  .diagram-container .diagram-guide,
  .diagram-container .node-finder { transform: none !important; }
  /* 2. 縮放按鈕、路徑 */
  .diagram-nav [data-view], #btn-route-probe, .route-probe { display: none !important; }
  /* 3. 手勢：沒放大時單指照常捲動頁面；放大後單指拖曳圖 */
  .diagram-container { touch-action: pan-y; }
  .diagram-container[data-ss-zoomed] { touch-action: none; cursor: grab; }
  .diagram-container[data-ss-dragging] { cursor: grabbing; user-select: none; }
  .ss-zoom-hint {
    position: absolute; left: 0.25rem; bottom: 1rem;
    font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Microsoft JhengHei', sans-serif;
    color: var(--text-faint, #8a8f98); pointer-events: none; white-space: nowrap;
    transition: opacity .3s;
  }
  .diagram-container[data-ss-zoomed] .ss-zoom-hint { opacity: 0; }
  /* 4. 卡片資訊（語義護照）：預設關閉，點卡片只會標出相關步驟；用「資訊」按鈕開關 */
  html:not([data-ss-info="on"]) #focus-chip { display: none !important; }
  #focus-chip { max-height: min(60vh, 26rem); overflow-y: auto; overscroll-behavior: contain; }
  #ss-info-toggle[aria-pressed="true"] { color: var(--frontend-stroke, #22d3ee); }
  /* 5. 收合：圖只留各階段大標題，下方問題卡只留標題；點單一階段或單一卡片再打開 */
  html[data-ss-outline="on"] .diagram-container > svg { display: none !important; }
  html[data-ss-outline="on"] .ss-zoom-hint { display: none; }
  .ss-outline { display: none; }
  html[data-ss-outline="on"] .ss-outline { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr)); padding: 0.25rem 0 0.5rem; }
  .ss-outline button {
    all: unset; box-sizing: border-box; cursor: pointer;
    display: flex; align-items: center; gap: 0.9rem; padding: 0.9rem 1rem;
    border-radius: 0.9rem; border: 1px solid var(--panel-border, #2a3140);
    background: var(--panel, #10141c); color: var(--text, #e5e7eb);
  }
  .ss-outline button:hover, .ss-outline button:focus-visible { border-color: var(--frontend-stroke, #22d3ee); }
  .ss-outline .n { font: 700 1.6rem/1 'JetBrains Mono', ui-monospace, monospace; color: var(--frontend-stroke, #22d3ee); min-width: 2.2rem; }
  .ss-outline .t { font-size: 1.05rem; font-weight: 700; }
  .ss-outline .c { margin-left: auto; font-size: 0.8rem; color: var(--text-faint, #8a8f98); white-space: nowrap; }
  .card-header { cursor: pointer; }
  .card[data-ss-collapsed] > :not(.card-header) { display: none !important; }
  .card[data-ss-collapsed] .card-header { margin-bottom: 0 !important; }
  #ss-outline-toggle[aria-pressed="true"] { color: var(--frontend-stroke, #22d3ee); }
</style>`;

const SCRIPT = `<script id="${MARK}-script">
(function () {
  var box = document.querySelector('.diagram-container');
  var svg = box && box.querySelector(':scope > svg');
  if (!box || !svg) return;
  var MAX = 5;
  var s = 1, x = 0, y = 0;
  var pts = new Map();
  var pinch = null, pan = null, lastTap = 0;

  var hint = document.createElement('div');
  hint.className = 'ss-zoom-hint no-print';
  hint.textContent = matchMedia('(pointer: coarse)').matches ? '雙指放大縮小，雙擊放大' : '觸控板捏合或 Ctrl＋滾輪放大，拖曳移動';
  box.appendChild(hint);

  function read() {
    // Archify 的搜尋／聚焦也會改 transform，手勢開始前先讀目前的實際狀態
    var m = (getComputedStyle(svg).transform || '').match(/^matrix\\(([^)]+)\\)$/);
    if (!m) { s = 1; x = 0; y = 0; return; }
    var v = m[1].split(',').map(Number);
    if (v.length === 6 && v.every(isFinite)) { s = v[0]; x = v[4]; y = v[5]; }
  }
  function clamp() {
    var w = svg.clientWidth || 1, h = svg.clientHeight || 1;
    s = Math.max(1, Math.min(MAX, s));
    x = Math.min(0, Math.max(w - w * s, x));
    y = Math.min(0, Math.max(h - h * s, y));
  }
  function apply() {
    clamp();
    svg.style.transformOrigin = '0 0';
    svg.style.transform = s > 1.001 ? 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')' : '';
    if (s > 1.001) {
      var w = svg.clientWidth, h = svg.clientHeight;
      var t = -y / s, l = -x / s, r = w - (w - x) / s, b = h - (h - y) / s;
      svg.style.clipPath = 'inset(' + [t, Math.max(0, r), Math.max(0, b), l].map(function (n) { return Math.max(0, n).toFixed(2) + 'px'; }).join(' ') + ')';
      box.setAttribute('data-ss-zoomed', '');
    } else {
      svg.style.removeProperty('clip-path');
      box.removeAttribute('data-ss-zoomed');
    }
  }
  function local(e) {
    var r = svg.getBoundingClientRect();
    // getBoundingClientRect 已含 transform；換算回未縮放時 svg 左上角的座標
    return { x: e.clientX - r.left + x, y: e.clientY - r.top + y };
  }
  function zoomAt(px, py, next) {
    var cx = (px - x) / s, cy = (py - y) / s;
    s = Math.max(1, Math.min(MAX, next));
    x = px - cx * s; y = py - cy * s;
    apply();
  }
  function skip(e) {
    return e.target.closest && e.target.closest('.diagram-nav, .focus-chip, .node-finder, .diagram-guide, .overview-map, .semantic-lens, .ss-zoom-hint');
  }

  box.addEventListener('pointerdown', function (e) {
    if (skip(e)) return;
    read();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      var a = Array.from(pts.values());
      var r = svg.getBoundingClientRect();
      pinch = {
        d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, s: s,
        mx: (a[0].x + a[1].x) / 2 - r.left + x, my: (a[0].y + a[1].y) / 2 - r.top + y,
        x: x, y: y
      };
      pan = null;
    } else if (pts.size === 1 && (s > 1.001 || e.pointerType === 'mouse')) {
      pan = { sx: e.clientX, sy: e.clientY, x: x, y: y, moved: false };
    }
    if (pinch || (pan && s > 1.001)) { try { box.setPointerCapture(e.pointerId); } catch (_) {} }
  }, true);

  box.addEventListener('pointermove', function (e) {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      var a = Array.from(pts.values());
      var r = svg.getBoundingClientRect();
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      var mx = (a[0].x + a[1].x) / 2 - r.left + x, my = (a[0].y + a[1].y) / 2 - r.top + y;
      var next = Math.max(1, Math.min(MAX, pinch.s * d / pinch.d));
      // 起手時兩指中點下的那一點，跟著目前的中點走
      var cx = (pinch.mx - pinch.x) / pinch.s, cy = (pinch.my - pinch.y) / pinch.s;
      s = next; x = mx - cx * s; y = my - cy * s;
      apply();
      e.preventDefault();
    } else if (pan && s > 1.001) {
      var dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) { pan.moved = true; box.setAttribute('data-ss-dragging', ''); }
      x = pan.x + dx; y = pan.y + dy;
      apply();
      e.preventDefault();
    }
  }, { capture: true, passive: false });

  function end(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      if (pan && pan.moved) {
        // 拖曳結束不要被當成點擊節點
        box.setAttribute('data-just-panned', 'true');
        setTimeout(function () { box.removeAttribute('data-just-panned'); }, 80);
        var stop = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
        box.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(function () { box.removeEventListener('click', stop, true); }, 120);
      }
      pan = null;
      box.removeAttribute('data-ss-dragging');
    }
  }
  box.addEventListener('pointerup', end, true);
  box.addEventListener('pointercancel', end, true);

  // 雙擊（觸控雙點）：放大 2.5 倍到點的位置，已放大就還原
  function toggleAt(e) {
    read();
    var p = local(e);
    if (s > 1.001) { s = 1; x = 0; y = 0; apply(); }
    else zoomAt(p.x, p.y, 2.5);
  }
  var lastType = 'mouse';
  box.addEventListener('pointerdown', function (e) { lastType = e.pointerType; }, true);
  box.addEventListener('dblclick', function (e) {
    if (skip(e) || lastType === 'touch') return; // 觸控的雙點由下面處理，避免放大又立刻還原
    e.preventDefault();
    toggleAt(e);
  });
  // 兩指以上：不讓瀏覽器捲頁或縮放整頁（iOS Safari 另有 gesture 事件）
  box.addEventListener('touchmove', function (e) { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange'].forEach(function (n) { box.addEventListener(n, function (e) { e.preventDefault(); }); });
  // 觸控雙點：只算「單指、沒移動、很快放開」的點擊；雙指縮放放開時不算
  var gesture = null;
  box.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || skip(e)) return;
    if (!gesture || pts.size <= 1) gesture = { multi: false, moved: false, t: Date.now(), x: e.clientX, y: e.clientY };
    if (pts.size >= 2) gesture.multi = true;
  }, true);
  box.addEventListener('pointermove', function (e) {
    if (gesture && e.pointerType === 'touch' && Math.abs(e.clientX - gesture.x) + Math.abs(e.clientY - gesture.y) > 10) gesture.moved = true;
  }, true);
  box.addEventListener('pointerup', function (e) {
    if (e.pointerType !== 'touch' || !gesture || pts.size > 0) return;
    var g = gesture;
    gesture = null;
    if (g.multi || g.moved || Date.now() - g.t > 300) { lastTap = 0; return; }
    var now = Date.now();
    if (now - lastTap < 320) { toggleAt(e); lastTap = 0; } else lastTap = now;
  }, true);

  // 電腦：觸控板捏合（瀏覽器送 ctrl＋wheel）或 Ctrl／⌘＋滾輪縮放；放大後一般滾輪平移
  box.addEventListener('wheel', function (e) {
    if (skip(e)) return;
    read();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var p = local(e);
      // 觸控板捏合的 delta 很小、滑鼠滾輪一格約 100，分開調靈敏度
      zoomAt(p.x, p.y, s * Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 40 ? 0.01 : 0.002)));
    } else if (s > 1.001) {
      e.preventDefault();
      x -= e.deltaX; y -= e.deltaY;
      apply();
    }
  }, { passive: false });

  // 原本的 ＋ － 0 快捷鍵改走這裡，避免兩套縮放互相蓋掉
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var w = svg.clientWidth / 2, h = svg.clientHeight / 2;
    if (e.key === '+' || e.key === '=') { read(); zoomAt(w, h, s * 1.25); }
    else if (e.key === '-' || e.key === '_') { read(); zoomAt(w, h, s / 1.25); }
    else if (e.key === '0') { s = 1; x = 0; y = 0; apply(); }
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener('resize', function () { requestAnimationFrame(function () { read(); apply(); }); });

  // 「資訊」按鈕：開關卡片資訊面板，記住使用者的選擇
  var nav = box.querySelector('.diagram-nav');
  var lens = document.getElementById('btn-semantic-lens');
  if (nav) {
    var KEY = 'ss-flow-info';
    var on = false;
    try { on = localStorage.getItem(KEY) === 'on'; } catch (_) {}
    var btn = document.createElement('button');
    btn.id = 'ss-info-toggle';
    btn.type = 'button';
    btn.textContent = '資訊';
    btn.title = '點卡片時顯示詳細資訊';
    function setInfo(v) {
      on = v;
      document.documentElement.setAttribute('data-ss-info', v ? 'on' : 'off');
      btn.setAttribute('aria-pressed', v ? 'true' : 'false');
      btn.setAttribute('aria-label', v ? '關閉卡片資訊' : '開啟卡片資訊');
      try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (_) {}
    }
    btn.addEventListener('click', function () { setInfo(!on); });
    if (lens && lens.parentNode === nav) nav.insertBefore(btn, lens); else nav.insertBefore(btn, nav.firstChild);
    setInfo(on);
  }

  // 「收合／展開」：一鍵只看各階段大標題（1、2、3…），點某一階段就展開並放大到那一段
  var vb = svg.viewBox && svg.viewBox.baseVal;
  var laneRects = Array.prototype.slice.call(svg.querySelectorAll('.c-lane'));
  var laneLabels = Array.prototype.slice.call(svg.querySelectorAll('text')).filter(function (t) { return /^\\d+\\s*\\/\\s*/.test(t.textContent.trim()); });
  var cards = Array.prototype.slice.call(document.querySelectorAll('.cards .card'));
  function laneOf(label) {
    var ly = +label.getAttribute('y');
    return laneRects.filter(function (r) { var b = r.getBBox(); return ly >= b.y && ly <= b.y + b.height; })[0];
  }
  function zoomToLane(rect) {
    if (!rect || !vb) return;
    var b = rect.getBBox();
    var w = svg.clientWidth, h = svg.clientHeight;
    var k = Math.min(w / vb.width, h / vb.height);
    var ox = (w - vb.width * k) / 2, oy = (h - vb.height * k) / 2;
    var lx = (b.x - vb.x) * k + ox, ly = (b.y - vb.y) * k + oy;
    // 放大到卡片字看得清楚就好（每個 SVG 單位約 1 像素）；電腦上本來就看得清楚，只捲到那一段
    var need = Math.min(3, 1 / k);
    if (need < 1.1) {
      s = 1; x = 0; y = 0; apply();
      var top = svg.getBoundingClientRect().top + window.scrollY + ly - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }
    s = need;
    x = -lx * s + 8; y = -ly * s + 8;
    apply();
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  if (nav && laneLabels.length) {
    var outline = document.createElement('div');
    outline.className = 'ss-outline';
    laneLabels.forEach(function (label) {
      var m = label.textContent.trim().match(/^(\\d+)\\s*\\/\\s*(.+)$/);
      var rect = laneOf(label);
      var count = 0;
      if (rect) {
        var lb = rect.getBBox();
        svg.querySelectorAll('[data-node-id]').forEach(function (n) {
          var nb = n.getBBox(), cy = nb.y + nb.height / 2;
          if (cy >= lb.y && cy <= lb.y + lb.height) count++;
        });
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="n"></span><span class="t"></span><span class="c"></span>';
      b.querySelector('.n').textContent = String(+m[1]);
      b.querySelector('.t').textContent = m[2];
      b.querySelector('.c').textContent = count ? count + ' 個步驟' : '';
      b.addEventListener('click', function () {
        setOutline(false);
        requestAnimationFrame(function () { zoomToLane(rect); });
      });
      outline.appendChild(b);
    });
    box.insertBefore(outline, svg);

    var OKEY = 'ss-flow-outline';
    var outlined = false;
    try { outlined = localStorage.getItem(OKEY) === 'on'; } catch (_) {}
    var obtn = document.createElement('button');
    obtn.id = 'ss-outline-toggle';
    obtn.type = 'button';
    function setOutline(v) {
      outlined = v;
      document.documentElement.setAttribute('data-ss-outline', v ? 'on' : 'off');
      obtn.textContent = v ? '展開' : '收合';
      obtn.setAttribute('aria-pressed', v ? 'true' : 'false');
      obtn.title = v ? '展開全部流程與說明' : '只看各階段大標題';
      cards.forEach(function (c) { c.toggleAttribute('data-ss-collapsed', v); });
      if (v) { s = 1; x = 0; y = 0; apply(); }
      try { localStorage.setItem(OKEY, v ? 'on' : 'off'); } catch (_) {}
    }
    obtn.addEventListener('click', function () { setOutline(!outlined); });
    nav.insertBefore(obtn, nav.firstChild);
    setOutline(outlined);
  }
  // 下方說明卡：點標題單獨開合
  cards.forEach(function (c) {
    var head = c.querySelector('.card-header');
    if (!head) return;
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    function flip() { c.toggleAttribute('data-ss-collapsed'); }
    head.addEventListener('click', flip);
    head.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
})();
</script>`;

const files = process.argv.slice(2);
if (!files.length) {
  console.error("用法：node docs/archify/viewer-patch.mjs <檔案.html>...");
  process.exit(1);
}
for (const f of files) {
  let html = fs.readFileSync(f, "utf8");
  // 已經處理過就先拿掉舊的，再放新的
  html = html.replace(new RegExp(`<style id="${MARK}-style">[\\s\\S]*?</style>`), "").replace(new RegExp(`<script id="${MARK}-script">[\\s\\S]*?</script>`), "");
  html = html.replace("</head>", STYLE + "\n</head>");
  const i = html.lastIndexOf("</body>");
  html = html.slice(0, i) + SCRIPT + "\n" + html.slice(i);
  fs.writeFileSync(f, html);
  console.log("patched", f);
}

// Archify 產出的流程圖頁面後處理（可重複執行）
//   1. 拿掉圖外面的底框（底色、邊框、陰影、點狀網格），讓流程圖直接呈現
//   2. 拿掉「100% ＋ －」縮放按鈕和「路徑」
//   3. 直覺操作：手機雙指縮放、放大後單指拖曳、雙擊放大／還原；電腦觸控板捏合或 Ctrl＋滾輪縮放、拖曳平移
// 用法：node docs/archify/viewer-patch.mjs public/flows/*.html
import fs from "fs";

const MARK = "sensesoil-viewer-patch";

const STYLE = `<style id="${MARK}-style">
  /* 主題色：跟 APP 一樣用品牌橘（流程圖節點的分類顏色不變） */
  :root { --ss-accent: #F39C12; }
  .pulse-dot { background: var(--ss-accent) !important; box-shadow: 0 0 0 4px color-mix(in srgb, var(--ss-accent) 18%, transparent) !important; }
  .preset-control-mark { border-color: var(--ss-accent) !important; background: color-mix(in srgb, var(--ss-accent) 28%, transparent) !important; }
  #btn-preset[data-preset-option="signal-flow"] .preset-control-mark { box-shadow: 0 0 10px color-mix(in srgb, var(--ss-accent) 78%, transparent) !important; }
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
  /* 圖示：iPhone Safari 對「放在縮放群組裡的 non-scaling-stroke」算錯，放大後線條糊成一團；改成跟著圖一起縮放 */
  svg .semantic-sigil > * { vector-effect: none !important; }
  /* 標題前的燈號：手機版原本靠上對齊，會跟標題錯開；改成垂直置中 */
  .header-row { align-items: center !important; }
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
  #ss-info-toggle[aria-pressed="true"] { color: var(--ss-accent); }
  /* 5. 收合：圖只留各階段大標題，下方問題卡只留標題；點單一階段或單一卡片再打開 */
  html[data-ss-outline="on"] .diagram-container > svg { display: none !important; }
  html[data-ss-outline="on"] .ss-zoom-hint { display: none; }
  .ss-outline { display: none; }
  html[data-ss-outline="on"] .ss-outline { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); align-items: start; padding: 0.25rem 0 0.5rem; }
  .ss-stage { border-radius: 0.9rem; border: 1px solid var(--panel-border, #2a3140); background: var(--panel, #10141c); color: var(--text, #e5e7eb); overflow: hidden; }
  .ss-stage[data-open] { border-color: color-mix(in srgb, var(--ss-accent) 55%, transparent); }
  .ss-stage-head {
    all: unset; box-sizing: border-box; cursor: pointer; width: 100%;
    display: flex; align-items: center; gap: 0.9rem; padding: 0.9rem 1rem;
  }
  .ss-stage-head:focus-visible { outline: 2px solid var(--ss-accent); outline-offset: -2px; }
  .ss-outline .n { font: 700 1.6rem/1 'JetBrains Mono', ui-monospace, monospace; color: var(--ss-accent); min-width: 2.2rem; }
  .ss-outline .t { font-size: 1.05rem; font-weight: 700; }
  .ss-outline .c { margin-left: auto; font-size: 0.8rem; color: var(--text-faint, #8a8f98); white-space: nowrap; }
  .ss-outline .v { width: 0.5rem; height: 0.5rem; border-right: 2px solid var(--text-faint, #8a8f98); border-bottom: 2px solid var(--text-faint, #8a8f98); rotate: 45deg; translate: 0 -0.15rem; transition: rotate .2s; flex: none; }
  .ss-stage[data-open] > .ss-stage-head .v { rotate: 225deg; translate: 0 0.1rem; }
  .ss-steps { padding: 0 1rem 0.9rem; }
  .ss-steps ol { list-style: none; margin: 0; padding: 0; counter-reset: st; border-top: 1px solid var(--panel-border, #2a3140); }
  .ss-steps li {
    counter-increment: st; display: grid; grid-template-columns: 1.6rem 0.55rem 1fr auto; column-gap: 0.55rem; row-gap: 0.1rem;
    align-items: center; padding: 0.6rem 0; border-bottom: 1px solid color-mix(in srgb, var(--panel-border, #2a3140) 60%, transparent);
  }
  .ss-steps li::before { content: counter(st); grid-row: 1 / span 2; font: 600 0.85rem/1 'JetBrains Mono', ui-monospace, monospace; color: var(--text-faint, #8a8f98); }
  .ss-steps .d { width: 0.55rem; height: 0.55rem; border-radius: 50%; grid-row: 1; }
  .ss-steps .l { font-size: 0.98rem; font-weight: 600; grid-row: 1; grid-column: 3; }
  /* 收合清單只列步驟名稱；部門與說明留在流程圖上 */
  .ss-steps .w, .ss-steps .f { display: none; }
  .ss-steps li { padding: 0.55rem 0; }
  .ss-steps li::before { grid-row: 1; }
  .ss-go {
    all: unset; box-sizing: border-box; cursor: pointer; margin-top: 0.75rem;
    display: inline-flex; align-items: center; padding: 0.45rem 0.9rem; border-radius: 999px;
    font-size: 0.85rem; font-weight: 600; color: var(--ss-accent);
    border: 1px solid color-mix(in srgb, var(--ss-accent) 45%, transparent);
  }
  /* 步驟詳細說明（監造八管、八工） */
  .ss-steps li.has-detail .l { cursor: pointer; }
  .ss-more {
    all: unset; box-sizing: border-box; cursor: pointer; grid-column: 4; grid-row: 1; justify-self: end;
    font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.6rem; border-radius: 999px;
    color: var(--ss-accent); border: 1px solid color-mix(in srgb, var(--ss-accent) 45%, transparent);
  }
  .ss-steps li[data-open] .ss-more { background: color-mix(in srgb, var(--ss-accent) 16%, transparent); }
  .ss-detail {
    grid-column: 1 / -1; margin-top: 0.6rem; padding: 0.85rem 0.9rem; border-radius: 0.75rem;
    background: color-mix(in srgb, var(--bg, #05070d) 60%, transparent); border: 1px solid var(--panel-border, #2a3140);
    font-size: 0.86rem; line-height: 1.6; color: var(--text, #e5e7eb);
  }
  .ss-detail p { margin: 0.15rem 0 0.5rem; }
  .ss-detail ul { margin: 0.15rem 0 0.5rem; padding-left: 1.1rem; }
  .ss-detail ul li { display: list-item; padding: 0.1rem 0; border: 0; counter-increment: none; }
  .ss-detail ul li::before { content: none; }
  .ss-d-title { font-size: 1rem; font-weight: 700; margin-bottom: 0.3rem; }
  .ss-d-intro { color: var(--text-muted, #a3a9b4); }
  .ss-d-label { font-size: 0.75rem; font-weight: 700; color: var(--text-faint, #8a8f98); margin-top: 0.4rem; }
  .ss-d-benefit { color: var(--backend-stroke, #34d399); }
  .ss-d-rhythm { display: grid; gap: 0.3rem; margin: 0.4rem 0 0.7rem; }
  .ss-d-rrow { display: grid; grid-template-columns: 2.6rem 1fr; gap: 0.5rem; }
  .ss-d-when { font-weight: 700; color: var(--ss-accent); }
  .ss-d-group { font-weight: 700; margin: 0.8rem 0 0.4rem; padding-top: 0.6rem; border-top: 1px solid var(--panel-border, #2a3140); }
  .ss-d-item { border: 1px solid var(--panel-border, #2a3140); border-radius: 0.6rem; padding: 0.5rem 0.7rem; margin-bottom: 0.45rem; }
  .ss-d-item[data-open] { border-color: color-mix(in srgb, var(--ss-accent) 45%, transparent); }
  .ss-d-head { all: unset; box-sizing: border-box; cursor: pointer; width: 100%; display: flex; align-items: center; gap: 0.6rem; }
  .ss-d-no { font: 700 0.95rem/1 'JetBrains Mono', ui-monospace, monospace; color: var(--ss-accent); min-width: 1rem; }
  .ss-d-name { font-weight: 700; flex: 1; }
  .ss-d-name small { font-weight: 500; color: var(--text-faint, #8a8f98); margin-left: 0.4rem; }
  .ss-d-item .v { width: 0.4rem; height: 0.4rem; border-right: 2px solid var(--text-faint, #8a8f98); border-bottom: 2px solid var(--text-faint, #8a8f98); rotate: 45deg; translate: 0 -0.1rem; flex: none; }
  .ss-d-item[data-open] .v { rotate: 225deg; translate: 0 0.1rem; }
  .ss-d-item .ss-d-benefit { margin: 0.3rem 0 0; font-size: 0.8rem; }
  .ss-d-body { margin-top: 0.3rem; }
  /* 節點索引（Archify 在說明卡旁列出全部節點）與「要點與索引」開關：用收合清單取代，不顯示 */
  #node-outline, .node-outline, #rail-reveal { display: none !important; }
  /* 收合時「資訊」用不到，先藏起來；展開後才出現 */
  html[data-ss-outline="on"] #ss-info-toggle { display: none !important; }
  .card-header { cursor: pointer; }
  .card[data-ss-collapsed] > :not(.card-header) { display: none !important; }
  .card[data-ss-collapsed] .card-header { margin-bottom: 0 !important; }
  #ss-outline-toggle[aria-pressed="true"] { color: var(--ss-accent); }
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
  // 步驟詳細說明（由 viewer-patch.mjs 依 step-details.json 嵌入）
  var STEP_DETAILS = {};
  try { STEP_DETAILS = JSON.parse((document.getElementById('sensesoil-viewer-patch-details') || {}).textContent || '{}'); } catch (_) {}
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function renderDetail(info) {
    var box2 = el('div', 'ss-detail');
    if (info.title) box2.appendChild(el('div', 'ss-d-title', info.title));
    if (info.intro) box2.appendChild(el('p', 'ss-d-intro', info.intro));
    if (info.rhythm && info.rhythm.length) {
      var rh = el('div', 'ss-d-rhythm');
      info.rhythm.forEach(function (r) {
        var row = el('div', 'ss-d-rrow');
        row.appendChild(el('span', 'ss-d-when', r.when));
        row.appendChild(el('span', 'ss-d-what', r.what));
        rh.appendChild(row);
      });
      box2.appendChild(rh);
    }
    // 簡單格式（八工的每一工）：一段一段「標籤＋文字或清單」
    (info.blocks || []).forEach(function (b) {
      box2.appendChild(el('div', 'ss-d-label', b.label));
      if (b.list) {
        var ul2 = el('ul');
        b.list.forEach(function (t) { ul2.appendChild(el('li', null, t)); });
        box2.appendChild(ul2);
      } else box2.appendChild(el('p', b.label === '利於什麼' ? 'ss-d-benefit' : null, b.text));
    });
    var no = 0;
    (info.groups || []).forEach(function (g) {
      box2.appendChild(el('div', 'ss-d-group', g.name));
      (g.items || []).forEach(function (it) {
        no++;
        // 每一管：預設只顯示名稱與「利於什麼」，點開看管什麼、要做的事、紀錄
        var card = el('div', 'ss-d-item');
        var head = el('button', 'ss-d-head');
        head.type = 'button';
        head.setAttribute('aria-expanded', 'false');
        head.appendChild(el('span', 'ss-d-no', String(no)));
        var nm = el('span', 'ss-d-name', it.name);
        if (it.sub) nm.appendChild(el('small', null, it.sub));
        head.appendChild(nm);
        head.appendChild(el('span', 'v'));
        card.appendChild(head);
        if (it.benefit) card.appendChild(el('p', 'ss-d-benefit', '利於：' + it.benefit));
        var body = el('div', 'ss-d-body');
        body.hidden = true;
        if (it.manage) { body.appendChild(el('div', 'ss-d-label', '管什麼')); body.appendChild(el('p', null, it.manage)); }
        if (it.todo && it.todo.length) {
          body.appendChild(el('div', 'ss-d-label', '要做的事'));
          var ul = el('ul');
          it.todo.forEach(function (t) { ul.appendChild(el('li', null, t)); });
          body.appendChild(ul);
        }
        if (it.records) { body.appendChild(el('div', 'ss-d-label', '留下的紀錄')); body.appendChild(el('p', null, it.records)); }
        card.appendChild(body);
        head.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = body.hidden;
          body.hidden = !open;
          head.setAttribute('aria-expanded', open ? 'true' : 'false');
          card.toggleAttribute('data-open', open);
        });
        box2.appendChild(card);
      });
    });
    return box2;
  }

  // 依箭頭順序排步驟（略過退回的虛線）；蛇形或上下兩排時才不會亂掉。
  // 同時可做的步驟依位置排：上排先、再左到右，所以兩條並行的線會一條一條列完。
  function flowOrder(steps) {
    var byId = {}, indeg = {}, next = {};
    steps.forEach(function (s) { byId[s.id] = s; indeg[s.id] = 0; next[s.id] = []; });
    svg.querySelectorAll('path[data-edge-from][data-edge-to]').forEach(function (e) {
      var f = e.getAttribute('data-edge-from'), t = e.getAttribute('data-edge-to');
      if (e.getAttribute('data-edge-role') === 'return' || !byId[f] || !byId[t] || next[f].indexOf(t) >= 0) return;
      next[f].push(t);
      indeg[t]++;
    });
    var pos = function (a, b) { return Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x; };
    var ready = steps.filter(function (s) { return !indeg[s.id]; });
    var out = [];
    while (ready.length) {
      ready.sort(pos);
      var cur = ready.shift();
      out.push(cur);
      next[cur.id].forEach(function (t) { if (--indeg[t] === 0) ready.push(byId[t]); });
    }
    // 有環或沒連到的，照位置補在後面
    steps.filter(function (s) { return out.indexOf(s) < 0; }).sort(pos).forEach(function (s) { out.push(s); });
    return out;
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
      // 這一段的步驟：卡片中心落在這條泳道裡的節點，由左到右
      var steps = [];
      if (rect) {
        var lb = rect.getBBox();
        svg.querySelectorAll('[data-node-id]').forEach(function (n) {
          var nb = n.getBBox(), cy = nb.y + nb.height / 2;
          if (cy < lb.y || cy > lb.y + lb.height) return;
          // 卡片底框的 class 是 c-backend／c-security…（另有 c-mask 之類的輔助 class，要略過）
          var kind = '';
          n.querySelectorAll('[class]').forEach(function (el) {
            var mm = (el.getAttribute('class') || '').match(/\\bc-(frontend|backend|database|cloud|security|messagebus|external)\\b/);
            if (mm && !kind) kind = mm[1];
          });
          var txt = function (sel) { var e = n.querySelector(sel); return e ? e.textContent.trim() : ''; };
          steps.push({ id: n.getAttribute('data-node-id'), x: nb.x, y: nb.y, label: txt('[data-node-label]'), who: txt('[data-detail="context"]'), note: txt('[data-detail="fine"]'), kind: kind });
        });
        steps = flowOrder(steps);
      }
      var stage = document.createElement('div');
      stage.className = 'ss-stage';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ss-stage-head';
      b.setAttribute('aria-expanded', 'false');
      b.innerHTML = '<span class="n"></span><span class="t"></span><span class="c"></span><span class="v" aria-hidden="true"></span>';
      b.querySelector('.n').textContent = String(+m[1]);
      b.querySelector('.t').textContent = m[2];
      b.querySelector('.c').textContent = steps.length ? steps.length + ' 個步驟' : '';
      var list = document.createElement('div');
      list.className = 'ss-steps';
      list.hidden = true;
      var ol = document.createElement('ol');
      steps.forEach(function (st) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="d"></span><span class="l"></span><span class="w"></span><span class="f"></span>';
        li.querySelector('.d').style.background = 'var(--' + (st.kind || 'backend') + '-stroke, #22d3ee)';
        li.querySelector('.l').textContent = st.label;
        li.querySelector('.w').textContent = st.who;
        li.querySelector('.f').textContent = st.note;
        var info = STEP_DETAILS[st.id];
        if (info) {
          // 有詳細說明的步驟（例如監造管理）：名稱旁多一個「詳細」，點了在下面展開
          li.classList.add('has-detail');
          var more = document.createElement('button');
          more.type = 'button';
          more.className = 'ss-more';
          more.setAttribute('aria-expanded', 'false');
          more.textContent = '詳細';
          var panel = renderDetail(info);
          panel.hidden = true;
          var flipDetail = function () {
            var open = panel.hidden;
            panel.hidden = !open;
            more.setAttribute('aria-expanded', open ? 'true' : 'false');
            li.toggleAttribute('data-open', open);
          };
          more.addEventListener('click', function (e) { e.stopPropagation(); flipDetail(); });
          li.querySelector('.l').addEventListener('click', flipDetail);
          li.appendChild(more);
          li.appendChild(panel);
        }
        ol.appendChild(li);
      });
      list.appendChild(ol);
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'ss-go';
      go.textContent = '在流程圖上看';
      go.addEventListener('click', function () {
        setOutline(false);
        requestAnimationFrame(function () { zoomToLane(rect); });
      });
      list.appendChild(go);
      // 單擊大標題：只開合這一段的步驟
      b.addEventListener('click', function () {
        var open = list.hidden;
        list.hidden = !open;
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
        stage.toggleAttribute('data-open', open);
      });
      stage.appendChild(b);
      stage.appendChild(list);
      outline.appendChild(stage);
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
  // 透鏡：一次只看一種角色（點別的就換過去，再點同一個取消），名稱跟圖例一致
  var lensRoot = document.getElementById('semantic-lens-kinds');
  var lensPanel = document.getElementById('semantic-lens');
  var legendName = {};
  svg.querySelectorAll('[data-legend-kind][data-legend-label]').forEach(function (g) {
    legendName[g.getAttribute('data-legend-kind')] = g.getAttribute('data-legend-label');
  });
  var genericName = {};
  function relabelLens() {
    if (!lensRoot) return;
    lensRoot.querySelectorAll('[data-kind]').forEach(function (btn) {
      var kind = btn.getAttribute('data-kind');
      var strong = btn.querySelector('strong');
      var name = legendName[kind];
      if (!strong || !name) return;
      if (strong.textContent !== name) {
        genericName[strong.textContent] = name;
        strong.textContent = name;
      }
      var em = btn.querySelector('em');
      btn.setAttribute('aria-label', name + (em ? '，' + em.textContent + ' 個步驟' : ''));
    });
    var set = function (sel, text) { var e = lensPanel && lensPanel.querySelector(sel); if (e && e.textContent !== text) e.textContent = text; };
    set('.semantic-lens-eyebrow', '透鏡');
    set('#semantic-lens-title, .semantic-lens-title', '依角色查看');
    set('.semantic-lens-instruction', '點一種角色，標出這類步驟和相連的流程；點別的就換過去，再點一次取消。');
    // 狀態文字裡的通用名稱（後端、安全…）換成圖例名稱
    var status = lensPanel && lensPanel.querySelector('.semantic-lens-status');
    if (status) {
      var t = status.textContent;
      Object.keys(genericName).forEach(function (g) { t = t.split(g).join(genericName[g]); });
      if (t !== status.textContent) status.textContent = t;
    }
  }
  if (lensRoot && window.Archify && Archify.semanticLens) {
    lensRoot.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-kind]');
      if (!btn || btn.disabled) return;
      e.stopImmediatePropagation();
      var kind = btn.getAttribute('data-kind');
      var active = Archify.semanticLens.active() || [];
      active.forEach(function (k) { if (k !== kind) Archify.semanticLens.select(k); });
      Archify.semanticLens.select(kind);
    }, true);
    new MutationObserver(relabelLens).observe(lensPanel, { childList: true, subtree: true, characterData: true });
    relabelLens();
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
// 步驟的詳細說明（例如監造管理的「監造八管」），依檔名對應：docs/archify/step-details.json
const DETAILS = JSON.parse(fs.readFileSync(new URL("./step-details.json", import.meta.url), "utf8"));
for (const f of files) {
  let html = fs.readFileSync(f, "utf8");
  // 已經處理過就先拿掉舊的，再放新的
  html = html
    .replace(new RegExp(`<style id="${MARK}-style">[\\s\\S]*?</style>`), "")
    .replace(new RegExp(`<script id="${MARK}-script">[\\s\\S]*?</script>`), "")
    .replace(new RegExp(`<script type="application/json" id="${MARK}-details">[\\s\\S]*?</script>`), "");
  // 用詞：風格名稱「訊號流」改叫「工作流」（風格選單、標題列標籤、介面字串）
  html = html.split("訊號流").join("工作流").split('"viewer.preset.flow.short":"流動"').join('"viewer.preset.flow.short":"工作流"');
  html = html.replace("</head>", STYLE + "\n</head>");
  const details = DETAILS[f.split(/[\\/]/).pop()] || {};
  const json = JSON.stringify(details).replace(/</g, "\\u003c");
  const i = html.lastIndexOf("</body>");
  html = html.slice(0, i) + `<script type="application/json" id="${MARK}-details">${json}</script>\n` + SCRIPT + "\n" + html.slice(i);
  fs.writeFileSync(f, html);
  console.log("patched", f, Object.keys(details).length ? "（詳細說明：" + Object.keys(details).join("、") + "）" : "");
}

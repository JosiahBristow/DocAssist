/**
 * preview-core.js —— 论文原文预览的共享内核（浏览器 / Android WebView 通用）
 *
 * 负责：pdf.js 逐页渲染、隐形文本层（支持原生选区）、高亮标注层、
 *       选区坐标归一化、标注存取（localStorage）与 Markdown 导出。
 *
 * 不依赖任何 Node API；pdfjsLib 由调用方注入，避免两端各打包一份。
 * 打包方式：Android 端由 esbuild 当 CommonJS 引入；本地预览页用 <script> 暴露 window.PreviewCore。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PreviewCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PREFIX = 'docai_anno_v1:';

  /* ---------------- 文件指纹：同名同内容 → 同一份标注 ---------------- */
  function fingerprintFromBytes(name, bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var h = 2166136261;
    var n = Math.min(arr.length, 2048);
    for (var i = 0; i < n; i++) {
      h ^= arr[i];
      h = Math.imul(h, 16777619);
    }
    return String(name || 'paper.pdf') + ':' + arr.length + ':' + (h >>> 0).toString(36);
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* ---------------- 标注存储 ---------------- */
  function createStore(storage) {
    function key(fp) { return PREFIX + fp; }

    function load(fp) {
      try {
        var doc = JSON.parse(storage.getItem(key(fp)) || 'null');
        if (!doc || !Array.isArray(doc.items)) return { name: '', items: [] };
        return doc;
      } catch (e) {
        return { name: '', items: [] };
      }
    }

    function save(fp, doc) {
      storage.setItem(key(fp), JSON.stringify(doc));
      return doc;
    }

    function add(fp, ann) {
      var doc = load(fp);
      var item = {
        id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'highlight',
        page: Number(ann.page) || 1,
        rects: Array.isArray(ann.rects) ? ann.rects : [],
        text: String(ann.text || '').slice(0, 2000),
        note: String(ann.note || '').slice(0, 1000),
        color: ann.color || 'yellow',
        createdAt: new Date().toISOString()
      };
      doc.items.push(item);
      doc.name = ann.name || doc.name;
      doc.updatedAt = item.createdAt;
      save(fp, doc);
      return item;
    }

    /** 画笔墨迹：points 为相对页面的 [x, y]（0–1），width 为相对页宽的线宽 */
    function addInk(fp, ann) {
      var doc = load(fp);
      var item = {
        id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'ink',
        page: Number(ann.page) || 1,
        points: Array.isArray(ann.points) ? ann.points : [],
        color: String(ann.color || '#B03A2E'),
        width: Number(ann.width) || 0.006,
        createdAt: new Date().toISOString()
      };
      doc.items.push(item);
      doc.name = ann.name || doc.name;
      doc.updatedAt = item.createdAt;
      save(fp, doc);
      return item;
    }

    function update(fp, id, patch) {
      var doc = load(fp);
      var item = null;
      for (var i = 0; i < doc.items.length; i++) {
        if (doc.items[i].id === id) {
          item = doc.items[i];
          if (patch && patch.note != null) item.note = String(patch.note).slice(0, 1000);
          if (patch && patch.text != null) item.text = String(patch.text).slice(0, 2000);
          break;
        }
      }
      doc.updatedAt = new Date().toISOString();
      save(fp, doc);
      return item;
    }

    function remove(fp, id) {
      var doc = load(fp);
      doc.items = doc.items.filter(function (x) { return x.id !== id; });
      doc.updatedAt = new Date().toISOString();
      save(fp, doc);
      return doc.items.length;
    }

    function clear(fp) { storage.removeItem(key(fp)); }
    function count(fp) { return load(fp).items.length; }

    return { load: load, save: save, add: add, addInk: addInk, update: update, remove: remove, clear: clear, count: count };
  }

  /* ---------------- Markdown 导出 ---------------- */
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function formatTime(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function toMarkdown(doc) {
    var items = ((doc && doc.items) || []).slice().sort(function (a, b) {
      return (a.page - b.page) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
    var lines = ['# 论文标注：' + ((doc && doc.name) || 'paper.pdf'), ''];
    lines.push('> 导出时间：' + formatTime(new Date()) + ' · 共 ' + items.length + ' 处');
    if (!items.length) { lines.push('', '（暂无标注）'); return lines.join('\n') + '\n'; }

    var page = 0;
    items.forEach(function (it) {
      if (it.page !== page) {
        page = it.page;
        lines.push('', '## 第 ' + page + ' 页');
      }
      if (it.type === 'ink') {
        lines.push('- 墨迹：' + String(it.color || ''));
        return;
      }
      lines.push('- 高亮：' + String(it.text || '').replace(/\s+/g, ' ').trim());
      if (it.note) lines.push('  - 备注：' + String(it.note).replace(/\s+/g, ' ').trim());
    });
    return lines.join('\n') + '\n';
  }

  /* ---------------- 渲染器 ---------------- */
  function createViewer(opts) {
    var o = opts || {};
    var pdfjsLib = o.pdfjsLib;
    var mount = o.mount;
    var storage = o.storage || null;
    var store = storage ? createStore(storage) : null;

    var MIN_ZOOM = 1, MAX_ZOOM = 3, ZOOM_STEP = 0.25;
    var SVG_NS = 'http://www.w3.org/2000/svg';

    var state = {
      pdf: null,
      page: 1,
      total: 0,
      name: '',
      fp: '',
      annotations: [],
      pageEl: null,
      canvas: null,
      textLayer: null,
      hlLayer: null,
      scrollEl: null,
      zoom: 1,
      inkLayer: null,
      pageAspect: 1.414,
      inkMode: false,
      inkTool: 'pen',
      inkColor: '#B03A2E',
      inkWidth: 0.006,
      stroke: null,
      pointers: {},
      pan: null,
      renderToken: 0,
      destroyed: false
    };

    var selTimer = null;

    function el(tag, cls) {
      var d = document.createElement(tag);
      if (cls) d.className = cls;
      return d;
    }

    function emit(name, payload) {
      if (o[name]) { try { o[name](payload); } catch (e) { /* 不让 UI 回调打断渲染 */ } }
    }

    /* ---- 选区 → 归一化坐标（相对页面，0-1） ---- */
    function captureSelection() {
      if (!state.pageEl || typeof window === 'undefined') return null;
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

      var text = String(sel.toString() || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;

      var box = state.pageEl.getBoundingClientRect();
      if (!box.width || !box.height) return null;

      var rects = [];
      var bounds = null;
      for (var i = 0; i < sel.rangeCount; i++) {
        var range = sel.getRangeAt(i);
        if (!state.pageEl.contains(range.commonAncestorContainer)) continue;
        var rs = range.getClientRects();
        for (var j = 0; j < rs.length; j++) {
          var r = rs[j];
          if (r.width < 2 || r.height < 2) continue;
          if (!bounds) {
            bounds = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          } else {
            bounds.left = Math.min(bounds.left, r.left);
            bounds.top = Math.min(bounds.top, r.top);
            bounds.right = Math.max(bounds.right, r.right);
            bounds.bottom = Math.max(bounds.bottom, r.bottom);
          }
          var x = clamp01((r.left - box.left) / box.width);
          var y = clamp01((r.top - box.top) / box.height);
          var w = Math.min(r.width / box.width, 1 - x);
          var h = Math.min(r.height / box.height, 1 - y);
          if (w <= 0 || h <= 0) continue;
          rects.push({
            x: Math.round(x * 10000) / 10000,
            y: Math.round(y * 10000) / 10000,
            w: Math.round(w * 10000) / 10000,
            h: Math.round(h * 10000) / 10000
          });
        }
      }
      if (!rects.length) return null;
      return { text: text.slice(0, 2000), rects: rects, page: state.page, bounds: bounds };
    }

    function onSelectionChange() {
      if (!state.pageEl || state.destroyed) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(function () {
        var sel = captureSelection();
        if (sel) emit('onSelection', sel);
      }, 220);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('selectionchange', onSelectionChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onInkMove);
      window.addEventListener('pointerup', onInkUp);
      window.addEventListener('pointercancel', onInkCancel);
    }

    /* ---- 缩放 ---- */
    function clampZoom(z) {
      z = Number(z) || 1;
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
    }

    async function setZoom(z) {
      z = clampZoom(z);
      if (z === state.zoom) return;
      state.zoom = z;
      emit('onZoomChange', { zoom: z });
      if (state.pdf) await renderPage();
    }

    function zoomIn() { return setZoom(state.zoom + ZOOM_STEP); }
    function zoomOut() { return setZoom(state.zoom - ZOOM_STEP); }
    function resetZoom() { return setZoom(1); }
    function getZoom() { return state.zoom; }

    /* 双指捏合：手势中先用 transform 预览，松手后按新比例重新渲染（保证清晰） */
    var pinch = null;
    function touchDist(t) {
      var dx = t[0].clientX - t[1].clientX;
      var dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy);
    }
    if (mount && typeof document !== 'undefined') {
      mount.addEventListener('touchstart', function (e) {
        if (state.inkMode) return;
        if (e.touches.length !== 2 || !state.pageEl) return;
        var box = state.pageEl.getBoundingClientRect();
        var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - box.left;
        var my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - box.top;
        pinch = { dist: touchDist(e.touches), zoom: state.zoom, current: state.zoom };
        state.pageEl.style.transformOrigin = mx + 'px ' + my + 'px';
      }, { passive: true });

      mount.addEventListener('touchmove', function (e) {
        if (state.inkMode) return;
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        var z = clampZoom(pinch.zoom * (touchDist(e.touches) / pinch.dist));
        pinch.current = z;
        state.pageEl.style.transform = 'scale(' + (z / pinch.zoom) + ')';
      }, { passive: false });

      mount.addEventListener('touchend', function (e) {
        if (!pinch || e.touches.length >= 2) return;
        var z = pinch.current;
        pinch = null;
        if (state.pageEl) {
          state.pageEl.style.transform = '';
          state.pageEl.style.transformOrigin = '';
        }
        if (z !== state.zoom) setZoom(z);
      });

      mount.addEventListener('wheel', function (e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        setZoom(state.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
      }, { passive: false });
    }

    /* ---- 高亮层 ---- */
    function paintHighlights() {
      if (!state.hlLayer) return;
      state.hlLayer.innerHTML = '';
      state.annotations.forEach(function (a) {
        if (a.page !== state.page) return;
        (a.rects || []).forEach(function (r) {
          var d = el('div', 'pdf-hl' + (a.note ? ' has-note' : ''));
          d.style.left = (r.x * 100) + '%';
          d.style.top = (r.y * 100) + '%';
          d.style.width = (r.w * 100) + '%';
          d.style.height = (r.h * 100) + '%';
          d.setAttribute('data-id', a.id);
          state.hlLayer.appendChild(d);
        });
      });
    }

    /* ---- 点击高亮 + 左右翻页（高亮层 pointer-events:none，不影响划词） ---- */
    function onPageClick(e) {
      if (state.inkMode) return;
      var box = state.pageEl.getBoundingClientRect();
      if (!box.width || !box.height) return;
      var x = (e.clientX - box.left) / box.width;
      var y = (e.clientY - box.top) / box.height;

      // 高亮优先：点在高亮上只打开备注，不翻页
      for (var i = state.annotations.length - 1; i >= 0; i--) {
        var a = state.annotations[i];
        if (a.type === 'ink' || a.page !== state.page) continue;
        for (var k = 0; k < (a.rects || []).length; k++) {
          var r = a.rects[k];
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            emit('onHighlightClick', a);
            return;
          }
        }
      }

      // 有选区时不翻页，避免选字结束的点击误触
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed) return;
      // 放大后左右点击用于查看内容，不翻页
      if (state.zoom > 1.01) return;

      if (x < 0.22) emit('onPageSide', { side: 'prev', page: state.page });
      else if (x > 0.78) emit('onPageSide', { side: 'next', page: state.page });
    }

    /* ---- 画笔批注 ---- */
    function inkPath(points) {
      var W = 1000, H = 1000 * state.pageAspect;
      var pts = points || [];
      if (!pts.length) return '';
      function X(p) { return (p[0] * W).toFixed(1); }
      function Y(p) { return (p[1] * H).toFixed(1); }
      if (pts.length < 3) {
        return 'M ' + X(pts[0]) + ' ' + Y(pts[0]) +
          (pts[1] ? ' L ' + X(pts[1]) + ' ' + Y(pts[1]) : '');
      }
      // 以相邻点中点作为曲线端点、原始点作为控制点，得到平滑笔迹
      var d = 'M ' + X(pts[0]) + ' ' + Y(pts[0]);
      for (var i = 1; i < pts.length - 1; i++) {
        var mx = (pts[i][0] + pts[i + 1][0]) / 2;
        var my = (pts[i][1] + pts[i + 1][1]) / 2;
        d += ' Q ' + X(pts[i]) + ' ' + Y(pts[i]) + ' ' + (mx * W).toFixed(1) + ' ' + (my * H).toFixed(1);
      }
      var last = pts[pts.length - 1];
      d += ' L ' + X(last) + ' ' + Y(last);
      return d;
    }

    function renderInk() {
      if (!state.inkLayer) return;
      var layer = state.inkLayer;
      layer.innerHTML = '';
      state.annotations.forEach(function (a) {
        if (a.type !== 'ink' || a.page !== state.page) return;
        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', inkPath(a.points));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', a.color || '#B03A2E');
        path.setAttribute('stroke-width', String((a.width || 0.006) * 1000));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('data-ink-id', a.id);
        layer.appendChild(path);
      });
    }

    function pointFromEvent(e) {
      var rect = state.inkLayer.getBoundingClientRect();
      return [
        clamp01((e.clientX - rect.left) / rect.width),
        clamp01((e.clientY - rect.top) / rect.height)
      ];
    }

    function updateStrokePath() {
      if (state.stroke && state.stroke.el) {
        state.stroke.el.setAttribute('d', inkPath(state.stroke.points));
      }
    }

    function onInkDown(e) {
      if (!state.inkMode || !state.inkLayer) return;
      e.preventDefault();
      state.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

      // 双指：平移页面（批注模式下替代滚动/缩放）
      if (Object.keys(state.pointers).length >= 2) {
        cancelStroke();
        state.pan = averagePointer();
        return;
      }

      var pt = pointFromEvent(e);
      if (state.inkTool === 'erase') { eraseAt(pt[0], pt[1]); return; }
      try { state.inkLayer.setPointerCapture(e.pointerId); } catch (err) {}
      var path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', state.inkColor);
      path.setAttribute('stroke-width', String(state.inkWidth * 1000));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      state.inkLayer.appendChild(path);
      state.stroke = {
        pointerId: e.pointerId,
        points: [pt],
        el: path,
        color: state.inkColor,
        width: state.inkWidth
      };
      updateStrokePath();
    }

    function averagePointer() {
      var ids = Object.keys(state.pointers);
      if (!ids.length) return null;
      var x = 0, y = 0;
      for (var i = 0; i < ids.length; i++) {
        x += state.pointers[ids[i]].x;
        y += state.pointers[ids[i]].y;
      }
      return { x: x / ids.length, y: y / ids.length };
    }

    function verticalScroller() {
      var el = mount;
      while (el && el !== document.body) {
        var s = getComputedStyle(el);
        if (/(auto|scroll|overlay|hidden)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
        el = el.parentElement;
      }
      return document.scrollingElement || document.documentElement;
    }

    function cancelStroke() {
      if (!state.stroke) return;
      if (state.stroke.el && state.stroke.el.parentNode) {
        state.stroke.el.parentNode.removeChild(state.stroke.el);
      }
      state.stroke = null;
    }

    function addStrokePoint(ev) {
      var pt = pointFromEvent(ev);
      var pts = state.stroke.points;
      var last = pts[pts.length - 1];
      var dx = pt[0] - last[0], dy = pt[1] - last[1];
      if (dx * dx + dy * dy < 0.0000015) return;
      pts.push(pt);
      if (pts.length > 2000) pts.length = 2000;
    }

    function onInkMove(e) {
      if (!state.pointers[e.pointerId] && !state.stroke) return;
      if (state.pointers[e.pointerId]) {
        state.pointers[e.pointerId].x = e.clientX;
        state.pointers[e.pointerId].y = e.clientY;
      }

      // 双指移动页面
      if (state.pan) {
        if (Object.keys(state.pointers).length < 2) { state.pan = null; return; }
        e.preventDefault();
        var avg = averagePointer();
        var dy = avg.y - state.pan.y;
        var dx = avg.x - state.pan.x;
        var vp = verticalScroller();
        if (vp) vp.scrollTop -= dy;
        if (state.scrollEl) state.scrollEl.scrollLeft -= dx;
        state.pan = avg;
        return;
      }

      if (!state.stroke || e.pointerId !== state.stroke.pointerId) return;
      e.preventDefault();
      // 取所有合并事件，低采样设备也能画出连续笔迹
      var evs = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
      if (!evs || !evs.length) evs = [e];
      for (var i = 0; i < evs.length; i++) addStrokePoint(evs[i]);
      updateStrokePath();
    }

    function onInkUp(e) {
      delete state.pointers[e.pointerId];
      if (state.pan) {
        if (Object.keys(state.pointers).length < 2) state.pan = null;
        return;
      }
      if (!state.stroke || e.pointerId !== state.stroke.pointerId) return;
      var stroke = state.stroke;
      state.stroke = null;
      if (stroke.el && stroke.el.parentNode) stroke.el.parentNode.removeChild(stroke.el);
      if (stroke.points.length < 2 || !store) return;
      var item = store.addInk(state.fp, {
        page: state.page,
        points: stroke.points,
        color: stroke.color,
        width: stroke.width,
        name: state.name
      });
      state.annotations.push(item);
      renderInk();
      emit('onCountChange', state.annotations.length);
    }

    function onInkCancel(e) {
      delete state.pointers[e.pointerId];
      if (Object.keys(state.pointers).length < 2) state.pan = null;
      if (state.stroke && e.pointerId === state.stroke.pointerId) cancelStroke();
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var len = dx * dx + dy * dy;
      if (!len) return Math.hypot(px - x1, py - y1);
      var t = ((px - x1) * dx + (py - y1) * dy) / len;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function eraseAt(x, y) {
      if (!store) return;
      var W = 1000, H = 1000 * state.pageAspect;
      var px = x * W, py = y * H;
      var hit = null;
      for (var i = state.annotations.length - 1; i >= 0; i--) {
        var a = state.annotations[i];
        if (a.type !== 'ink' || a.page !== state.page) continue;
        var thr = Math.max(7, (a.width || 0.006) * 1000 * 0.6 + 7);
        var pts = a.points || [];
        for (var j = 1; j < pts.length; j++) {
          if (distToSegment(px, py, pts[j - 1][0] * W, pts[j - 1][1] * H,
            pts[j][0] * W, pts[j][1] * H) <= thr) { hit = a; break; }
        }
        if (hit) break;
      }
      if (!hit) return;
      store.remove(state.fp, hit.id);
      state.annotations = state.annotations.filter(function (z) { return z.id !== hit.id; });
      renderInk();
      emit('onCountChange', state.annotations.length);
    }

    function undoInk() {
      if (!store) return false;
      var list = state.annotations.filter(function (a) { return a.type === 'ink' && a.page === state.page; });
      if (!list.length) return false;
      var last = list[list.length - 1];
      store.remove(state.fp, last.id);
      state.annotations = state.annotations.filter(function (z) { return z.id !== last.id; });
      renderInk();
      emit('onCountChange', state.annotations.length);
      return true;
    }

    function setInkMode(on) {
      state.inkMode = !!on;
      if (state.pageEl) state.pageEl.classList.toggle('inking', state.inkMode);
    }
    function setInkTool(tool) { state.inkTool = tool === 'erase' ? 'erase' : 'pen'; }
    function setInkColor(hex) { if (/^#[0-9a-f]{6}$/i.test(String(hex))) state.inkColor = hex; }
    function setInkWidth(w) { var n = Number(w); if (n > 0 && n < 0.1) state.inkWidth = n; }
    function getInk() {
      return { mode: state.inkMode, tool: state.inkTool, color: state.inkColor, width: state.inkWidth };
    }
    function getAnnotations() {
      return state.annotations.slice();
    }

    /* ---- 渲染当前页 ---- */
    async function renderPage() {
      if (!state.pdf || state.destroyed) return;
      var token = ++state.renderToken;
      var page = await state.pdf.getPage(state.page);
      if (token !== state.renderToken || state.destroyed) { page.cleanup(); return; }

      var base = page.getViewport({ scale: 1 });
      var avail = Math.max(200, mount.clientWidth - 2);
      var scale = (avail / base.width) * state.zoom;
      var vp = page.getViewport({ scale: scale });
      var dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

      mount.innerHTML = '';
      var scroll = el('div', 'pdf-scroll');
      var pageEl = el('div', 'pdf-page');
      pageEl.style.width = vp.width + 'px';
      pageEl.style.height = vp.height + 'px';

      var canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = vp.width + 'px';
      canvas.style.height = vp.height + 'px';
      pageEl.appendChild(canvas);

      var hlLayer = el('div', 'pdf-hl-layer');
      var textLayer = el('div', 'pdf-text-layer');
      pageEl.appendChild(hlLayer);
      pageEl.appendChild(textLayer);

      state.pageAspect = base.height / base.width;
      var inkLayer = document.createElementNS(SVG_NS, 'svg');
      inkLayer.setAttribute('class', 'pdf-ink-layer');
      inkLayer.setAttribute('preserveAspectRatio', 'none');
      inkLayer.setAttribute('viewBox', '0 0 1000 ' + (1000 * state.pageAspect).toFixed(2));
      inkLayer.addEventListener('pointerdown', onInkDown);
      inkLayer.addEventListener('contextmenu', function (ev) {
        if (state.inkMode) ev.preventDefault();
      });
      pageEl.appendChild(inkLayer);
      if (state.inkMode) pageEl.classList.add('inking');

      state.pageEl = pageEl;
      state.canvas = canvas;
      state.textLayer = textLayer;
      state.hlLayer = hlLayer;
      state.inkLayer = inkLayer;
      state.scrollEl = scroll;
      scroll.appendChild(pageEl);
      mount.appendChild(scroll);
      // 监听整个滚动区，页面两侧留白也能点击翻页
      scroll.addEventListener('click', onPageClick);

      var ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      var task = page.render({ canvasContext: ctx, viewport: vp });
      await task.promise;
      if (token !== state.renderToken || state.destroyed) { page.cleanup(); return; }

      var content = await page.getTextContent();
      var styles = content.styles || {};
      var pending = [];
      for (var i = 0; i < content.items.length; i++) {
        var it = content.items[i];
        if (!it.str) continue;
        var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
        var fontHeight = Math.hypot(tx[2], tx[3]);
        if (!fontHeight) continue;
        var style = styles[it.fontName] || {};
        // 与 pdf.js 官方文本层一致：用字体 ascent 定位基线，避免选中框整体上移
        var fontAscent = fontHeight;
        if (style.ascent) fontAscent = style.ascent * fontHeight;
        else if (style.descent) fontAscent = (1 + style.descent) * fontHeight;
        var span = document.createElement('span');
        span.textContent = it.str;
        span.style.left = tx[4] + 'px';
        span.style.top = (tx[5] - fontAscent) + 'px';
        span.style.fontSize = fontHeight + 'px';
        span.style.lineHeight = '1';
        span.style.fontFamily = style.fontFamily || 'sans-serif';
        textLayer.appendChild(span);
        pending.push({ span: span, width: it.width ? it.width * vp.scale : 0 });
      }
      // 第二次遍历再量宽度，避免每加一个节点就触发一次布局
      for (var k = 0; k < pending.length; k++) {
        var p = pending[k];
        if (p.width > 0 && p.span.offsetWidth > 0) {
          p.span.style.transform = 'scaleX(' + (p.width / p.span.offsetWidth).toFixed(3) + ')';
        }
      }

      paintHighlights();
      renderInk();
      emit('onPageChange', { page: state.page, total: state.total });
      page.cleanup();
    }

    async function open(bytes, name) {
      if (!pdfjsLib) throw new Error('pdf.js 未加载');
      close();
      var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      state.pdf = await pdfjsLib.getDocument({
        data: data,
        isEvalSupported: false,
        useWorkerFetch: false
      }).promise;
      state.total = state.pdf.numPages;
      state.page = 1;
      state.zoom = 1;
      state.name = name || 'paper.pdf';
      state.fp = fingerprintFromBytes(state.name, data);
      var doc = store ? store.load(state.fp) : { name: state.name, items: [] };
      doc.name = state.name;
      state.annotations = doc.items || [];
      if (store) store.save(state.fp, doc);
      emit('onOpen', { total: state.total, count: state.annotations.length, name: state.name });
      emit('onZoomChange', { zoom: state.zoom });
      await renderPage();
      return { total: state.total, fp: state.fp, count: state.annotations.length };
    }

    async function goto(n) {
      n = Math.max(1, Math.min(state.total || 1, Math.round(Number(n) || 1)));
      if (n === state.page && state.pageEl) return;
      state.page = n;
      await renderPage();
    }

    function next() { return goto(state.page + 1); }
    function prev() { return goto(state.page - 1); }

    function addHighlight(sel, note) {
      if (!store) throw new Error('标注存储不可用');
      if (!sel || !sel.rects || !sel.rects.length) throw new Error('没有可标记的选区');
      var item = store.add(state.fp, {
        page: sel.page || state.page,
        rects: sel.rects,
        text: sel.text,
        note: note || '',
        name: state.name
      });
      state.annotations.push(item);
      paintHighlights();
      emit('onCountChange', state.annotations.length);
      return item;
    }

    function setNote(id, note) {
      if (!store) return null;
      var item = store.update(state.fp, id, { note: note });
      for (var i = 0; i < state.annotations.length; i++) {
        if (state.annotations[i].id === id) {
          state.annotations[i].note = String(note || '');
          break;
        }
      }
      paintHighlights();
      return item;
    }

    function removeHighlight(id) {
      if (!store) return state.annotations.length;
      store.remove(state.fp, id);
      state.annotations = state.annotations.filter(function (x) { return x.id !== id; });
      paintHighlights();
      emit('onCountChange', state.annotations.length);
      return state.annotations.length;
    }

    function exportMarkdown() {
      return toMarkdown({ name: state.name, items: state.annotations });
    }

    function resize() {
      if (state.pdf && state.pageEl) renderPage();
    }

    function close() {
      state.renderToken++;
      if (mount) mount.innerHTML = '';
      if (state.pdf && state.pdf.destroy) { try { state.pdf.destroy(); } catch (e) {} }
      state.pdf = null;
      state.page = 1;
      state.total = 0;
      state.pageEl = state.canvas = state.textLayer = state.hlLayer = state.scrollEl = state.inkLayer = null;
      state.inkMode = false;
      state.stroke = null;
      state.pointers = {};
      state.pan = null;
      state.annotations = [];
      state.fp = '';
      state.name = '';
      state.zoom = 1;
    }

    function destroy() {
      state.destroyed = true;
      if (typeof document !== 'undefined') document.removeEventListener('selectionchange', onSelectionChange);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onInkMove);
        window.removeEventListener('pointerup', onInkUp);
        window.removeEventListener('pointercancel', onInkCancel);
      }
      clearTimeout(selTimer);
      close();
    }

    function getInfo() {
      return {
        name: state.name,
        page: state.page,
        total: state.total,
        count: state.annotations.length,
        fp: state.fp,
        zoom: state.zoom,
        hasDoc: !!state.pdf
      };
    }

    return {
      open: open,
      goto: goto,
      next: next,
      prev: prev,
      addHighlight: addHighlight,
      setNote: setNote,
      removeHighlight: removeHighlight,
      exportMarkdown: exportMarkdown,
      resize: resize,
      close: close,
      destroy: destroy,
      setZoom: setZoom,
      zoomIn: zoomIn,
      zoomOut: zoomOut,
      resetZoom: resetZoom,
      getZoom: getZoom,
      setInkMode: setInkMode,
      setInkTool: setInkTool,
      setInkColor: setInkColor,
      setInkWidth: setInkWidth,
      undoInk: undoInk,
      getInk: getInk,
      getAnnotations: getAnnotations,
      getInfo: getInfo,
      getSelection: captureSelection
    };
  }

  return {
    fingerprintFromBytes: fingerprintFromBytes,
    createStore: createStore,
    toMarkdown: toMarkdown,
    createViewer: createViewer
  };
});

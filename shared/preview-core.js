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

    return { load: load, save: save, add: add, update: update, remove: remove, clear: clear, count: count };
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
      for (var i = 0; i < sel.rangeCount; i++) {
        var range = sel.getRangeAt(i);
        if (!state.pageEl.contains(range.commonAncestorContainer)) continue;
        var rs = range.getClientRects();
        for (var j = 0; j < rs.length; j++) {
          var r = rs[j];
          if (r.width < 2 || r.height < 2) continue;
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
      return { text: text.slice(0, 2000), rects: rects, page: state.page };
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
        if (e.touches.length !== 2 || !state.pageEl) return;
        var box = state.pageEl.getBoundingClientRect();
        var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - box.left;
        var my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - box.top;
        pinch = { dist: touchDist(e.touches), zoom: state.zoom, current: state.zoom };
        state.pageEl.style.transformOrigin = mx + 'px ' + my + 'px';
      }, { passive: true });

      mount.addEventListener('touchmove', function (e) {
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

    /* ---- 点击高亮（命中检测；高亮层 pointer-events:none，不影响划词） ---- */
    function onPageClick(e) {
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      var box = state.pageEl.getBoundingClientRect();
      if (!box.width || !box.height) return;
      var x = (e.clientX - box.left) / box.width;
      var y = (e.clientY - box.top) / box.height;
      for (var i = state.annotations.length - 1; i >= 0; i--) {
        var a = state.annotations[i];
        if (a.page !== state.page) continue;
        for (var k = 0; k < (a.rects || []).length; k++) {
          var r = a.rects[k];
          if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
            emit('onHighlightClick', a);
            return;
          }
        }
      }
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

      state.pageEl = pageEl;
      state.canvas = canvas;
      state.textLayer = textLayer;
      state.hlLayer = hlLayer;
      state.scrollEl = scroll;
      scroll.appendChild(pageEl);
      mount.appendChild(scroll);
      pageEl.addEventListener('click', onPageClick);

      var ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      var task = page.render({ canvasContext: ctx, viewport: vp });
      await task.promise;
      if (token !== state.renderToken || state.destroyed) { page.cleanup(); return; }

      var content = await page.getTextContent();
      var pending = [];
      for (var i = 0; i < content.items.length; i++) {
        var it = content.items[i];
        if (!it.str) continue;
        var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
        var fontHeight = Math.hypot(tx[2], tx[3]);
        if (!fontHeight) continue;
        var span = document.createElement('span');
        span.textContent = it.str;
        span.style.left = tx[4] + 'px';
        span.style.top = (tx[5] - fontHeight) + 'px';
        span.style.fontSize = fontHeight + 'px';
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
      state.pageEl = state.canvas = state.textLayer = state.hlLayer = state.scrollEl = null;
      state.annotations = [];
      state.fp = '';
      state.name = '';
      state.zoom = 1;
    }

    function destroy() {
      state.destroyed = true;
      if (typeof document !== 'undefined') document.removeEventListener('selectionchange', onSelectionChange);
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

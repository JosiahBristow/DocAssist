/**
 * preview.js —— 论文阅读页里的原文预览交互
 * 渲染/选区/标注都交给 shared/preview-core.js，这里只负责：
 * 翻页、划词操作条（翻译 / 高亮）、备注弹窗、Markdown 导出。
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.js';
import * as pdfLib from 'pdf-lib';
import { createViewer } from '../../shared/preview-core.js';
import { exportAnnotatedPdf } from '../../shared/pdf-export.js';
import { translateSelection } from './llm.js';
import { tr, trf } from './i18n.js';
import * as PenColor from '../../shared/color.js';

const $ = id => document.getElementById(id);

export function createPreview(opts) {
  const toast = opts.toast;
  const copy = opts.copy;
  const esc = opts.esc;
  const onAskAI = opts.onAskAI;

  let viewer = null;
  let pendingSel = null;
  let activeHl = null;
  let resizeTimer = null;
  let inkOn = false;
  let inkColor = '#B03A2E';
  let inkWidth = 0.006;
  let inkTool = 'pen';
  let customHex = '#B03A2E';
  const INK_WIDTHS = [
    { w: 0.003, px: 4 },
    { w: 0.006, px: 6 },
    { w: 0.01, px: 9 },
    { w: 0.016, px: 13 }
  ];

  function init() {
    viewer = createViewer({
      pdfjsLib,
      mount: $('pv-mount'),
      storage: localStorage,
      onPageChange: ({ page, total }) => {
        $('pv-page').value = page;
        $('pv-total').textContent = '/ ' + total;
        $('pv-prev').classList.toggle('off', page <= 1);
        $('pv-next').classList.toggle('off', page >= total);
      },
      onCountChange: n => { $('pv-count').textContent = n ? n + ' ' + tr('处标注') : tr('暂无标注'); },
      onZoomChange: ({ zoom }) => { $('pv-zoom').textContent = Math.round(zoom * 100) + '%'; },
      onSelection: sel => {
        pendingSel = sel;
        showQuick(sel);
      },
      onHighlightClick: ann => showNote(ann),
      onPageSide: ({ side }) => {
        hideQuick();
        pendingSel = null;
        const info = viewer.getInfo();
        if (side === 'prev') {
          if (info.page <= 1) { toast('已经是第一页'); return; }
          viewer.prev();
        } else if (side === 'next') {
          if (info.page >= info.total) { toast('已经是最后一页'); return; }
          viewer.next();
        }
      }
    });

    $('pv-prev').addEventListener('click', () => viewer.prev());
    $('pv-next').addEventListener('click', () => viewer.next());
    $('pv-page').addEventListener('change', e => viewer.goto(e.target.value));
    $('pv-change').addEventListener('click', () => $('pdfpick').click());
    $('quick-translate').addEventListener('click', () => {
      if (!pendingSel) return;
      hideQuick();
      showSheet(pendingSel);
      doTranslate();
    });
    $('quick-ask').addEventListener('click', () => { hideQuick(); doAskAI(); });
    $('quick-highlight').addEventListener('click', () => { hideQuick(); doHighlight(); });
    $('ink-undo').addEventListener('click', () => { if (!viewer.undoInk()) toast('没有可撤销的笔迹'); });
    $('ink-erase').addEventListener('click', () => setInkTool(inkTool === 'erase' ? 'pen' : 'erase'));
    $('ink-done').addEventListener('click', exitInk);
    $('ink-cancel').addEventListener('click', () => $('ink-modal').classList.remove('on'));
    $('ink-apply').addEventListener('click', applyCustomColor);
    $('ink-fix').addEventListener('click', autoDarken);
    ['ink-h', 'ink-s', 'ink-v'].forEach(id => $(id).addEventListener('input', updateCustomPreview));
    restoreInkPrefs();
    renderInkPalette();
    renderInkWidths();
    $('pv-zoom-in').addEventListener('click', () => viewer.zoomIn());
    $('pv-zoom-out').addEventListener('click', () => viewer.zoomOut());
    $('pv-zoom').addEventListener('click', () => viewer.resetZoom());
    $('pv-export').addEventListener('click', openExportMenu);
    $('export-pdf').addEventListener('click', exportPdf);
    $('export-md').addEventListener('click', () => { $('export-modal').classList.remove('on'); exportMd(); });
    $('export-close').addEventListener('click', () => $('export-modal').classList.remove('on'));
    $('pv-sheet-close').addEventListener('click', hideSheet);
    $('pv-btn-highlight').addEventListener('click', doHighlight);
    $('pv-btn-translate').addEventListener('click', doTranslate);
    $('pv-btn-ai').addEventListener('click', doAskAI);
    $('pv-note-save').addEventListener('click', saveNote);
    $('pv-note-del').addEventListener('click', deleteNote);
    $('pv-note-close').addEventListener('click', hideNote);

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!$('screen-read').hidden && viewer.getInfo().hasDoc) viewer.resize();
      }, 250);
    });
    const scroller = $('pv-mount').closest('main');
    if (scroller) scroller.addEventListener('scroll', hideQuick, { passive: true });
    document.addEventListener('pointerdown', e => {
      if (!$('pv-quick').contains(e.target)) hideQuick();
    }, { passive: true });
  }

  async function openBytes(bytes, name) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    exitInk();
    hideSheet();
    hideNote();
    $('pv-name').textContent = name || 'paper.pdf';
    $('pv-count').textContent = tr('加载中…');
    await viewer.open(u8, name || 'paper.pdf');
    const info = viewer.getInfo();
    $('pv-count').textContent = info.count ? info.count + ' ' + tr('处标注') : tr('暂无标注');
    if (info.count) toast(tr('已恢复') + ' ' + info.count + ' ' + tr('处标注'));
    return info;
  }

  async function openFile(file) {
    if (!file) throw new Error('没有选择文件');
    const u8 = new Uint8Array(await file.arrayBuffer());
    if (opts.onBytes) {
      try {
        Promise.resolve(opts.onBytes(u8, file.name || 'paper.pdf', file.size)).catch(function () {});
      } catch (e) { /* 存储失败不影响打开 */ }
    }
    return openBytes(u8, file.name || 'paper.pdf');
  }

  function reset() {
    exitInk();
    viewer.close();
    hideSheet();
    hideNote();
    $('pv-name').textContent = 'paper.pdf';
    $('pv-count').textContent = tr('暂无标注');
  }

  /* ---------------- 划词小工具条 ---------------- */
  function showQuick(sel) {
    const bar = $('pv-quick');
    bar.hidden = false;
    const b = sel.bounds;
    const vw = document.documentElement.clientWidth;
    let left = b ? (b.left + b.right) / 2 : vw / 2;
    let top = b ? b.top - 26 : 80;
    left = Math.max(78, Math.min(vw - 78, left));
    top = Math.max(66, top);
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }
  function hideQuick() {
    const bar = $('pv-quick');
    if (bar) bar.hidden = true;
  }

  /* ---------------- 划词操作条 ---------------- */
  function showSheet(sel) {
    hideQuick();
    $('pv-sheet-text').textContent = sel.text;
    $('pv-sheet-result').innerHTML = '';
    $('pv-sheet-actions').hidden = false;
    $('pv-sheet').classList.add('on');
  }
  function hideSheet() {
    hideQuick();
    $('pv-sheet').classList.remove('on');
    pendingSel = null;
  }

  async function doTranslate() {
    if (!pendingSel) return;
    const text = pendingSel.text;
    $('pv-sheet-actions').hidden = true;
    $('pv-sheet-result').innerHTML = '<div class="sheet-loading"><span class="spinner sm"></span><span>正在翻译…</span></div>';
    try {
      const out = await translateSelection(text);
      $('pv-sheet-result').innerHTML =
        '<div class="sheet-label">' + tr('译文') + '</div><div class="sheet-dst">' + esc(out) + '</div>' +
        '<div class="row" style="margin-top:10px"><div class="btn btn-ghost" onclick="DA.copyText(' + JSON.stringify(out).replace(/"/g, '&quot;') + ', \'' + tr('译文已复制') + '\')">' + tr('复制') + '</div></div>';
    } catch (e) {
      const msg = String(e.message || e);
      $('pv-sheet-result').innerHTML =
        '<div class="sheet-err">' + esc(msg) + '</div>' +
        (/Key/i.test(msg) ? '<div class="btn-mini" style="margin:10px 0 0" onclick="DA.go(\'settings\')">' + tr('去 API 设置') + '</div>' : '');
    } finally {
      $('pv-sheet-actions').hidden = false;
    }
  }

  function doHighlight() {
    if (!pendingSel) return;
    try {
      const ann = viewer.addHighlight(pendingSel, '');
      hideQuick();
      hideSheet();
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      toast('已高亮 · 点高亮处可加备注');
      if (ann) showNote(ann, true);
    } catch (e) {
      toast(String(e.message || e));
    }
  }

  function doAskAI() {
    if (!pendingSel) return;
    const text = pendingSel.text;
    hideQuick();
    hideSheet();
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    if (onAskAI) onAskAI(text);
  }

  /** 当前页截图（JPEG dataURL），用于图片提问 */
  function pageImage() {
    const c = document.querySelector('#pv-mount .pdf-canvas');
    if (!c || !c.width) return '';
    const max = 1400;
    const scale = Math.min(1, max / c.width);
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(c.width * scale);
    tmp.height = Math.round(c.height * scale);
    tmp.getContext('2d').drawImage(c, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/jpeg', 0.75);
  }

  /* ---------------- 备注弹窗 ---------------- */
  function showNote(ann, fresh) {
    activeHl = ann;
    $('pv-note-quote').textContent = ann.text;
    $('pv-note-text').value = ann.note || '';
    $('pv-note').classList.add('on');
    if (!fresh) setTimeout(() => $('pv-note-text').focus(), 50);
  }
  function hideNote() {
    $('pv-note').classList.remove('on');
    activeHl = null;
  }
  function saveNote() {
    if (!activeHl) return;
    viewer.setNote(activeHl.id, $('pv-note-text').value.trim());
    hideNote();
    toast('备注已保存');
  }
  function deleteNote() {
    if (!activeHl) return;
    viewer.removeHighlight(activeHl.id);
    hideNote();
    toast('已删除这处标注');
  }

  function exportMd() {
    if (!viewer.getInfo().hasDoc) return;
    if (!viewer.getInfo().count) { toast('还没有标注，先选中文字点「高亮」'); return; }
    copy(viewer.exportMarkdown(), '标注已复制为 Markdown');
  }

  function openExportMenu() {
    if (!viewer.getInfo().hasDoc) return;
    if (!viewer.getInfo().count) { toast('还没有标注'); return; }
    $('export-modal').classList.add('on');
  }

  async function exportPdf() {
    $('export-modal').classList.remove('on');
    if (!viewer.getInfo().hasDoc) return;
    if (!viewer.getInfo().count) { toast('还没有标注'); return; }
    toast('正在生成 PDF…');
    try {
      const buf = opts.getPdfBytes ? await opts.getPdfBytes() : null;
      if (!buf) throw new Error('找不到原文件');
      const out = await exportAnnotatedPdf(pdfLib, new Uint8Array(buf), viewer.getAnnotations());
      await savePdf(out, $('pv-name').textContent || 'paper.pdf');
    } catch (e) {
      toast('导出失败：' + String(e.message || e));
    }
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function savePdf(bytes, name) {
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    const fs = plugins && plugins.Filesystem;
    const share = plugins && plugins.Share;
    const safeName = String(name || 'paper.pdf').replace(/\.pdf$/i, '') + '-标注版.pdf';
    if (fs && share) {
      return fs.writeFile({ path: safeName, data: bytesToBase64(bytes), directory: 'CACHE', recursive: true })
        .then(res => share.share({ title: safeName, files: [res.uri], dialogTitle: '保存或分享标注版 PDF' }))
        .then(() => toast('已打开分享'))
        .catch(e => toast('保存失败：' + String(e.message || e)));
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('标注版 PDF 已下载');
  }

  /* ---------------- 画笔批注 ---------------- */
  function saveInkPrefs() {
    try {
      localStorage.setItem('docai_ink_color', inkColor);
      localStorage.setItem('docai_ink_width', String(inkWidth));
    } catch (e) {}
  }
  function restoreInkPrefs() {
    try {
      const c = localStorage.getItem('docai_ink_color');
      if (c && /^#[0-9a-f]{6}$/i.test(c)) inkColor = c;
      const w = Number(localStorage.getItem('docai_ink_width'));
      if (INK_WIDTHS.some(x => Math.abs(x.w - w) < 1e-6)) inkWidth = w;
    } catch (e) {}
  }

  function renderInkPalette() {
    const box = $('ink-colors');
    if (!box) return;
    box.innerHTML = '';
    PenColor.PALETTE.forEach(hex => {
      const dot = document.createElement('span');
      dot.className = 'ink-swatch' + (hex === inkColor ? ' on' : '');
      dot.style.background = hex;
      dot.title = hex;
      dot.addEventListener('click', () => {
        inkColor = hex;
        viewer.setInkColor(hex);
        saveInkPrefs();
        renderInkPalette();
      });
      box.appendChild(dot);
    });
    const custom = document.createElement('span');
    custom.className = 'ink-swatch custom' + (PenColor.PALETTE.indexOf(inkColor) === -1 ? ' on' : '');
    custom.title = tr('自定义画笔颜色');
    custom.addEventListener('click', openInkColor);
    box.appendChild(custom);
  }

  function renderInkWidths() {
    const box = $('ink-widths');
    if (!box) return;
    box.innerHTML = '';
    INK_WIDTHS.forEach(item => {
      const btn = document.createElement('span');
      btn.className = 'ink-width' + (Math.abs(item.w - inkWidth) < 1e-6 ? ' on' : '');
      const dot = document.createElement('i');
      dot.style.width = item.px + 'px';
      dot.style.height = item.px + 'px';
      btn.appendChild(dot);
      btn.addEventListener('click', () => {
        inkWidth = item.w;
        viewer.setInkWidth(item.w);
        saveInkPrefs();
        renderInkWidths();
      });
      box.appendChild(btn);
    });
  }

  function setInkTool(tool) {
    inkTool = tool === 'erase' ? 'erase' : 'pen';
    viewer.setInkTool(inkTool);
    $('ink-erase').classList.toggle('on', inkTool === 'erase');
  }

  function toggleInk() {
    if (!viewer.getInfo().hasDoc) { toast('请先打开一篇论文'); return; }
    if (inkOn) { exitInk(); return; }
    inkOn = true;
    viewer.setInkColor(inkColor);
    viewer.setInkWidth(inkWidth);
    viewer.setInkMode(true);
    setInkTool('pen');
    document.body.classList.add('inking');
    const penBtn = $('pv-pen');
    if (penBtn) penBtn.classList.add('on');
    $('ink-bar').hidden = false;
    renderInkPalette();
    renderInkWidths();
    toast('单指书写，双指移动页面');
  }

  function exitInk() {
    inkOn = false;
    if (viewer) viewer.setInkMode(false);
    document.body.classList.remove('inking');
    const penBtn = $('pv-pen');
    if (penBtn) penBtn.classList.remove('on');
    $('ink-bar').hidden = true;
    $('ink-modal').classList.remove('on');
  }

  function openInkColor() {
    customHex = inkColor;
    const hsv = PenColor.hexToHsv(customHex);
    $('ink-h').value = Math.round(hsv.h);
    $('ink-s').value = Math.round(hsv.s);
    $('ink-v').value = Math.round(hsv.v);
    updateCustomPreview();
    $('ink-modal').classList.add('on');
  }

  function updateCustomPreview() {
    const h = Number($('ink-h').value);
    const s = Number($('ink-s').value);
    const v = Number($('ink-v').value);
    customHex = PenColor.hsvToHex(h, s, v);
    $('ink-hv').textContent = h;
    $('ink-sv').textContent = s + '%';
    $('ink-vv').textContent = v + '%';
    $('ink-preview-bar').style.background = customHex;
    const ratio = PenColor.contrastRatio(customHex, '#FFFFFF');
    const hsl = PenColor.hexToHsl(customHex);
    $('ink-meta').textContent = trf('{hex} · HSL {h}° {s}% {l}% · 对比度 {r}:1', {
      hex: customHex,
      h: Math.round(hsl.h),
      s: Math.round(hsl.s),
      l: Math.round(hsl.l),
      r: ratio.toFixed(2)
    });
    const low = ratio < 4.5;
    $('ink-warn').textContent = low ? tr('对比度不足 WCAG 4.5:1') : '';
    $('ink-fix').hidden = !low;
    $('ink-apply').classList.toggle('off', low);
  }

  function autoDarken() {
    customHex = PenColor.ensureContrast(customHex, '#FFFFFF', 4.5);
    const hsv = PenColor.hexToHsv(customHex);
    $('ink-h').value = Math.round(hsv.h);
    $('ink-s').value = Math.round(hsv.s);
    $('ink-v').value = Math.round(hsv.v);
    updateCustomPreview();
  }

  function applyCustomColor() {
    if ($('ink-apply').classList.contains('off')) return;
    inkColor = customHex;
    viewer.setInkColor(inkColor);
    saveInkPrefs();
    renderInkPalette();
    $('ink-modal').classList.remove('on');
  }

  init();
  return {
    openFile, openBytes, reset, hideSheet, pageImage, exitInk,
    toggleInk, hasDoc: () => viewer.getInfo().hasDoc
  };
}

/**
 * preview.js —— 论文阅读页里的原文预览交互
 * 渲染/选区/标注都交给 shared/preview-core.js，这里只负责：
 * 翻页、划词操作条（翻译 / 高亮）、备注弹窗、Markdown 导出。
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.js';
import { createViewer } from '../../shared/preview-core.js';
import { translateSelection } from './llm.js';

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
      onCountChange: n => { $('pv-count').textContent = n ? n + ' 处标注' : '暂无标注'; },
      onZoomChange: ({ zoom }) => { $('pv-zoom').textContent = Math.round(zoom * 100) + '%'; },
      onSelection: sel => {
        pendingSel = sel;
        showSheet(sel);
      },
      onHighlightClick: ann => showNote(ann)
    });

    $('pv-prev').addEventListener('click', () => viewer.prev());
    $('pv-next').addEventListener('click', () => viewer.next());
    $('pv-page').addEventListener('change', e => viewer.goto(e.target.value));
    $('pv-change').addEventListener('click', () => $('pdfpick').click());
    $('pv-zoom-in').addEventListener('click', () => viewer.zoomIn());
    $('pv-zoom-out').addEventListener('click', () => viewer.zoomOut());
    $('pv-zoom').addEventListener('click', () => viewer.resetZoom());
    $('pv-export').addEventListener('click', exportMd);
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
  }

  async function openFile(file) {
    if (!file) throw new Error('没有选择文件');
    hideSheet();
    hideNote();
    $('pv-name').textContent = file.name || 'paper.pdf';
    $('pv-count').textContent = '加载中…';
    const bytes = new Uint8Array(await file.arrayBuffer());
    await viewer.open(bytes, file.name || 'paper.pdf');
    const n = viewer.getInfo().count;
    $('pv-count').textContent = n ? n + ' 处标注' : '暂无标注';
    if (n) toast('已恢复 ' + n + ' 处标注');
  }

  function reset() {
    viewer.close();
    hideSheet();
    hideNote();
    $('pv-name').textContent = 'paper.pdf';
    $('pv-count').textContent = '暂无标注';
  }

  /* ---------------- 划词操作条 ---------------- */
  function showSheet(sel) {
    $('pv-sheet-text').textContent = sel.text;
    $('pv-sheet-result').innerHTML = '';
    $('pv-sheet-actions').hidden = false;
    $('pv-sheet').classList.add('on');
  }
  function hideSheet() {
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
        '<div class="sheet-label">译文</div><div class="sheet-dst">' + esc(out) + '</div>' +
        '<div class="row" style="margin-top:10px"><div class="btn btn-ghost" onclick="DA.copyText(' + JSON.stringify(out).replace(/"/g, '&quot;') + ', \'译文已复制\')">复制</div></div>';
    } catch (e) {
      const msg = String(e.message || e);
      $('pv-sheet-result').innerHTML =
        '<div class="sheet-err">' + esc(msg) + '</div>' +
        (/Key/i.test(msg) ? '<div class="btn-mini" style="margin:10px 0 0" onclick="DA.go(\'settings\')">去 API 设置</div>' : '');
    } finally {
      $('pv-sheet-actions').hidden = false;
    }
  }

  function doHighlight() {
    if (!pendingSel) return;
    try {
      const ann = viewer.addHighlight(pendingSel, '');
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

  init();
  return { openFile, reset, hideSheet, pageImage };
}

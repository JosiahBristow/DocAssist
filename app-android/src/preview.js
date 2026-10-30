/**
 * preview.js —— Android 端「论文原文」界面逻辑
 * 渲染/选区/标注都交给 shared/preview-core.js，这里只负责页面交互：
 * 选文件、翻页、操作条（翻译 / 高亮）、备注弹窗、Markdown 导出。
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.js';
import { createStore, createViewer } from '../../shared/preview-core.js';
import { translateSelection } from './llm.js';

const $ = id => document.getElementById(id);

export function createPreview(opts) {
  const go = opts.go;
  const toast = opts.toast;
  const copy = opts.copy;
  const esc = opts.esc;

  const store = createStore(localStorage);
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
      onSelection: sel => {
        pendingSel = sel;
        showSheet(sel);
      },
      onHighlightClick: ann => showNote(ann)
    });

    $('pvpick').addEventListener('change', onPick);
    $('pv-prev').addEventListener('click', () => viewer.prev());
    $('pv-next').addEventListener('click', () => viewer.next());
    $('pv-page').addEventListener('change', e => viewer.goto(e.target.value));
    $('pv-change').addEventListener('click', () => $('pvpick').click());
    $('pv-export').addEventListener('click', exportMd);
    $('pv-sheet-close').addEventListener('click', hideSheet);
    $('pv-btn-highlight').addEventListener('click', doHighlight);
    $('pv-btn-translate').addEventListener('click', doTranslate);
    $('pv-note-save').addEventListener('click', saveNote);
    $('pv-note-del').addEventListener('click', deleteNote);
    $('pv-note-close').addEventListener('click', hideNote);

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!$('screen-preview').hidden && viewer.getInfo().hasDoc) viewer.resize();
      }, 250);
    });
  }

  function showIdle() {
    $('preview-idle').hidden = false;
    $('preview-viewer').hidden = true;
    $('pvpick').value = '';
  }
  function showViewer() {
    $('preview-idle').hidden = true;
    $('preview-viewer').hidden = false;
  }

  async function openFile(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast('文件请小于 25MB'); return; }
    go('preview');
    showViewer();
    hideSheet();
    hideNote();
    $('pv-name').textContent = file.name || 'paper.pdf';
    $('pv-count').textContent = '加载中…';
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await viewer.open(bytes, file.name || 'paper.pdf');
      $('pv-count').textContent = viewer.getInfo().count ? viewer.getInfo().count + ' 处标注' : '暂无标注';
      if (viewer.getInfo().count) toast('已恢复 ' + viewer.getInfo().count + ' 处标注');
    } catch (e) {
      showIdle();
      toast('打不开这个 PDF：' + String(e.message || e).slice(0, 80));
    }
  }

  function onPick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    openFile(file);
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
  return { openFile, showIdle };
}

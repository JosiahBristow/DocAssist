/**
 * assistant.js —— 悬浮 AI 助手
 * 入口：全局悬浮按钮 / 原文划词「问 AI」/ 面板内「引用选中」「当前页」
 * 支持选中文字与图片；图片需要视觉模型（如 gpt-4o、qwen-vl），文本模型会报错。
 */
import { askAssistant, store } from './llm.js';
import { tr } from './i18n.js';

const $ = id => document.getElementById(id);

export function createAssistant(opts) {
  const toast = opts.toast;
  const go = opts.go;
  const getPageImage = opts.getPageImage;

  let history = [];        // 发送给模型的历史
  let contextText = '';    // 当前附带的选中内容
  let imageData = '';      // 当前附带的图片 dataURL
  let busy = false;

  function init() {
    $('ai-close').addEventListener('click', close);
    $('ai-send').addEventListener('click', send);
    $('ai-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    $('ai-img').addEventListener('click', () => $('ai-imgpick').click());
    $('ai-imgpick').addEventListener('change', onPickImage);
    $('ai-clear').addEventListener('click', clearAll);
    $('ai-cite').addEventListener('click', citeSelection);
    $('ai-page').addEventListener('click', attachPage);
    $('ai-chip-clear').addEventListener('click', () => { contextText = ''; renderChip(); });
    $('ai-thumb-clear').addEventListener('click', () => { imageData = ''; renderChip(); });
    $('ai-go-settings').addEventListener('click', () => { close(); go('settings'); });
  }

  function open(ctx) {
    if (typeof ctx === 'string' && ctx.trim()) {
      contextText = ctx.trim();
      renderChip();
    }
    $('ai-panel').classList.add('on');
    $('ai-keyhint').hidden = !!store.key;
    setTimeout(() => $('ai-input').focus(), 120);
  }
  function close() { $('ai-panel').classList.remove('on'); }

  function renderChip() {
    const chip = $('ai-chip-text');
    chip.hidden = !contextText;
    chip.textContent = contextText
      ? '「' + contextText.slice(0, 40) + (contextText.length > 40 ? '…' : '') + '」'
      : '';
    $('ai-chip-clear').hidden = !contextText;
    const thumb = $('ai-thumb');
    thumb.hidden = !imageData;
    if (imageData) thumb.src = imageData;
    $('ai-thumb-clear').hidden = !imageData;
    $('ai-img-note').hidden = !imageData;
  }

  function onPickImage(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = () => shrinkImage(String(reader.result)).then(url => {
      imageData = url;
      renderChip();
    });
    reader.readAsDataURL(f);
  }

  function shrinkImage(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function citeSelection() {
    const t = String((window.getSelection() && window.getSelection().toString()) || '')
      .replace(/\s+/g, ' ').trim();
    if (!t) { toast('先在页面里选中一段文字'); return; }
    contextText = t;
    renderChip();
    $('ai-input').focus();
  }

  function attachPage() {
    const url = getPageImage && getPageImage();
    if (!url) { toast('先打开一篇 PDF，再截取当前页'); return; }
    imageData = url;
    renderChip();
    toast('已附上当前页截图');
  }

  function bubble(role, text, img) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-msg ' + role;
    if (img) {
      const im = document.createElement('img');
      im.className = 'ai-msg-img';
      im.src = img;
      wrap.appendChild(im);
    }
    if (text) {
      const p = document.createElement('div');
      p.className = 'ai-bubble';
      p.textContent = text;
      wrap.appendChild(p);
    }
    $('ai-msgs').appendChild(wrap);
    $('ai-msgs').scrollTop = $('ai-msgs').scrollHeight;
    return wrap;
  }

  async function send() {
    if (busy) return;
    const q = ($('ai-input').value || '').trim();
    if (!q && !imageData) { toast('输入问题，或添加一张图片'); return; }
    if (!store.key) {
      $('ai-keyhint').hidden = false;
      toast('请先在「API 设置」配置 Key');
      return;
    }

    const ctx = contextText;
    const img = imageData;
    $('ai-input').value = '';
    bubble('user', q, img);
    $('ai-empty').hidden = true;
    $('ai-send').classList.add('off');
    busy = true;
    const typing = bubble('assistant', tr('思考中…'));
    typing.classList.add('typing');

    try {
      const answer = await askAssistant({ question: q, context: ctx, image: img, history: history.slice(-8) });
      typing.remove();
      bubble('assistant', answer || tr('（没有返回内容）'));
      const userText = (ctx ? '【选中内容】' + ctx + '\n\n' : '') +
        '【问题】' + (q || '请解释这张图片的内容') + (img ? '\n【附图片】' : '');
      history.push({ role: 'user', content: userText });
      history.push({ role: 'assistant', content: answer });
      if (history.length > 16) history = history.slice(-16);
      contextText = '';
      imageData = '';
      renderChip();
    } catch (e) {
      typing.remove();
      bubble('assistant', tr('出错了：') + String(e.message || e));
    } finally {
      busy = false;
      $('ai-send').classList.remove('off');
    }
  }

  function clearAll() {
    history = [];
    $('ai-msgs').innerHTML =
      '<div class="ai-empty" id="ai-empty">' + tr('选中文字后点「问 AI」，或直接输入问题。也可以附一张图（需要支持视觉的模型，如 gpt-4o / qwen-vl）。') + '</div>';
    contextText = '';
    imageData = '';
    renderChip();
  }

  init();
  return { open, close, askAbout: text => open(text) };
}

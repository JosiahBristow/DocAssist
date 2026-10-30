/**
 * search.js —— 「相似」Tab：国内平台检索链接 + 相关论文列表
 * 平台只生成检索链接（不抓取内容）；相关论文来自 OpenAlex/Crossref 公开元数据。
 */
import { buildQueries, platformLinks } from '../../shared/search-links.js';
import { searchPapers } from './llm.js';

const $ = id => document.getElementById(id);
const CACHE_KEY = 'docai_sim_v1:';
const CACHE_TTL = 24 * 3600 * 1000;

export function createSimilarSearch(opts) {
  const toast = opts.toast;
  const esc = opts.esc;
  const copy = opts.copy;

  let title = '';
  let currentList = [];
  let searched = false;

  function render(summary) {
    title = (summary && summary.title) || '';
    const q = buildQueries(title, summary && summary.keywords);
    $('sim-query').value = q.cn;
    renderPlatforms(q.cn);
    $('sim-results').innerHTML = '';
    $('sim-status').textContent = title ? '' : '生成速读后，可按标题检索相关论文';
    currentList = [];
    searched = false;
  }

  function reset() {
    title = '';
    currentList = [];
    searched = false;
    if ($('sim-query')) $('sim-query').value = '';
    if ($('sim-platforms')) $('sim-platforms').innerHTML = '';
    if ($('sim-results')) $('sim-results').innerHTML = '';
    if ($('sim-status')) $('sim-status').textContent = '';
  }

  function renderPlatforms(q) {
    $('sim-platforms').innerHTML = platformLinks(q).map(l =>
      `<span class="sim-platform" data-url="${esc(l.url)}"><b>${esc(l.name)}</b><span>${esc(l.note)}</span></span>`
    ).join('');
  }

  function openLink(url) {
    if (!url) return;
    const b = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (b) {
      b.open({ url }).catch(() => { window.open(url, '_blank'); });
      return;
    }
    window.open(url, '_blank');
  }

  function cacheGet(key) {
    try {
      const c = JSON.parse(localStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < CACHE_TTL && Array.isArray(c.list)) return c.list;
    } catch (e) {}
    return null;
  }

  async function run(force) {
    if (!title) { toast('先生成速读，再检索相关论文'); return; }
    const key = CACHE_KEY + title;
    if (!force) {
      const cached = cacheGet(key);
      if (cached) { currentList = cached; renderResults(); return; }
    }
    $('sim-status').textContent = '检索中…';
    $('sim-results').innerHTML = '';
    try {
      const list = await searchPapers(title);
      currentList = list;
      if (!list.length) {
        $('sim-status').textContent = '没有找到相关论文，可修改检索词后使用上方国内平台链接';
        return;
      }
      localStorage.setItem(key, JSON.stringify({ t: Date.now(), list: list }));
      $('sim-status').textContent = '共 ' + list.length + ' 篇 · 按标题检索（OpenAlex / Crossref）';
      renderResults();
    } catch (e) {
      $('sim-status').textContent = '检索失败：' + String(e.message || e).slice(0, 70) + '，可直接使用上方平台链接';
    }
  }

  function renderResults() {
    $('sim-results').innerHTML = currentList.map((p, i) => {
      const meta = [p.authors.slice(0, 3).join(', '), p.year, p.venue, p.citations ? '被引 ' + p.citations : '']
        .filter(Boolean).join(' · ');
      return `<div class="sim-item">
        <div class="sim-title">${esc(p.title)}</div>
        <div class="sim-meta">${esc(meta)}</div>
        ${p.abstract ? `<div class="sim-abs" id="sim-abs-${i}" hidden>${esc(p.abstract)}</div>` : ''}
        <div class="sim-actions">
          ${p.abstract ? `<span class="btn-mini" data-act="abs" data-i="${i}">摘要</span>` : ''}
          <span class="btn-mini" data-act="open" data-i="${i}">打开</span>
          ${p.pdf ? `<span class="btn-mini" data-act="pdf" data-i="${i}">PDF</span>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function init() {
    $('sim-search').addEventListener('click', () => run(true));
    $('sim-copy').addEventListener('click', () => {
      const q = ($('sim-query').value || '').trim();
      if (!q) { toast('检索词为空'); return; }
      copy(q, '检索词已复制');
    });
    $('sim-query').addEventListener('input', e => renderPlatforms(e.target.value));
    $('sim-platforms').addEventListener('click', e => {
      const el = e.target.closest('.sim-platform');
      if (el) openLink(el.dataset.url);
    });
    $('sim-results').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const p = currentList[Number(btn.dataset.i)];
      if (!p) return;
      const act = btn.dataset.act;
      if (act === 'abs') {
        const box = document.getElementById('sim-abs-' + btn.dataset.i);
        if (box) {
          box.hidden = !box.hidden;
          btn.textContent = box.hidden ? '摘要' : '收起';
        }
      } else if (act === 'open') {
        openLink(p.url);
      } else if (act === 'pdf') {
        openLink(p.pdf);
      }
    });
  }

  init();
  return {
    render: render,
    reset: reset,
    onTabOpen: () => {
      if (!title) { $('sim-status').textContent = '生成速读后，可按标题检索相关论文'; return; }
      if (!searched) { searched = true; run(false); }
    }
  };
}

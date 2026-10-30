/**
 * search-links.js —— 相似论文检索的共享逻辑（Android / 本地预览网页通用）
 *
 * 职责：
 *  1) 由论文标题/关键词生成检索词与国内平台链接（知网/万方/维普/百度学术/Google 学术）
 *  2) 归一化 OpenAlex / Crossref 的返回结构（作者、年份、摘要、链接、PDF、被引数）
 *
 * 注意：国内平台没有公开 API 且禁止抓取，这里只生成检索链接，不抓取平台内容。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SearchLinks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function buildQueries(title, keywords) {
    var t = String(title || '').trim();
    var kws = (keywords || []).map(function (k) { return String(k || '').trim(); }).filter(Boolean);
    var cn = kws.slice(0, 4).join(' ') || t;
    return { cn: cn, en: t || cn };
  }

  function platformLinks(query) {
    var q = encodeURIComponent(String(query || '').trim());
    return [
      { id: 'cnki', name: '知网', note: '期刊 / 学位论文', url: 'https://kns.cnki.net/kns8s/defaultresult/index?kw=' + q },
      { id: 'wanfang', name: '万方', note: '期刊 / 学位论文', url: 'https://s.wanfangdata.com.cn/paper?q=' + q },
      { id: 'cqvip', name: '维普', note: '中文期刊', url: 'https://qikan.cqvip.com/Qikan/Search/Index?key=' + q },
      { id: 'baidu', name: '百度学术', note: '聚合检索', url: 'https://xueshu.baidu.com/s?wd=' + q },
      { id: 'scholar', name: 'Google 学术', note: '英文文献', url: 'https://scholar.google.com/scholar?q=' + q }
    ];
  }

  function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** OpenAlex 的摘要是“词 → 位置数组”的倒排索引，这里还原成正常文本 */
  function reconstructAbstract(inv) {
    if (!inv || typeof inv !== 'object') return '';
    var words = [];
    Object.keys(inv).forEach(function (w) {
      var pos = inv[w] || [];
      for (var i = 0; i < pos.length; i++) words[pos[i]] = w;
    });
    var out = [];
    for (var i = 0; i < words.length; i++) if (words[i] != null) out.push(words[i]);
    return out.join(' ').slice(0, 1500);
  }

  function normalizeOpenAlex(w) {
    w = w || {};
    var authors = (w.authorships || []).map(function (a) {
      return a && a.author && a.author.display_name;
    }).filter(Boolean).slice(0, 6);
    var venue = (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || '';
    var doi = String(w.doi || '').replace(/^https?:\/\/doi\.org\//i, '');
    var url = doi ? 'https://doi.org/' + doi : String(w.id || '');
    var pdf = (w.best_oa_location && w.best_oa_location.pdf_url) || '';
    return {
      title: String(w.title || '').trim(),
      authors: authors,
      year: w.publication_year || '',
      venue: String(venue || '').trim(),
      abstract: reconstructAbstract(w.abstract_inverted_index),
      url: url,
      pdf: /\.pdf($|\?)/i.test(pdf) ? pdf : '',
      citations: Number(w.cited_by_count || 0),
      source: 'openalex'
    };
  }

  function normalizeCrossref(w) {
    w = w || {};
    var title = (w.title && w.title[0]) || '';
    var authors = (w.author || []).map(function (a) {
      return [a.given, a.family].filter(Boolean).join(' ');
    }).filter(Boolean).slice(0, 6);
    var year = (w.issued && w.issued['date-parts'] && w.issued['date-parts'][0] && w.issued['date-parts'][0][0]) || '';
    return {
      title: String(title || '').trim(),
      authors: authors,
      year: year,
      venue: String((w['container-title'] && w['container-title'][0]) || '').trim(),
      abstract: stripTags(w.abstract || '').slice(0, 1500),
      url: w.URL || (w.DOI ? 'https://doi.org/' + w.DOI : ''),
      pdf: '',
      citations: Number(w['is-referenced-by-count'] || 0),
      source: 'crossref'
    };
  }

  function normalizeList(list, source) {
    var fn = source === 'crossref' ? normalizeCrossref : normalizeOpenAlex;
    return (list || []).map(fn).filter(function (p) { return p.title; });
  }

  return {
    buildQueries: buildQueries,
    platformLinks: platformLinks,
    reconstructAbstract: reconstructAbstract,
    normalizeOpenAlex: normalizeOpenAlex,
    normalizeCrossref: normalizeCrossref,
    normalizeList: normalizeList
  };
});

/**
 * library.js —— 本地论文库（IndexedDB）
 *
 * 记住用户打开过的论文：元数据（文件名、大小、打开时间）与 PDF 字节分开存，
 * 重启应用后可以直接打开，不需要重新选择文件。
 * 浏览器 / Android WebView 通用；不依赖任何 Node API。
 *
 * 容量策略：最多保留 6 篇、总计不超过 120MB，超出时删除最久未打开的。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PaperLibrary = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DB_NAME = 'docai_library_v1';
  var DB_VERSION = 1;
  var MAX_COUNT = 6;
  var MAX_BYTES = 120 * 1024 * 1024;

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('当前环境不支持本地论文存储'));
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('metas')) db.createObjectStore('metas', { keyPath: 'fp' });
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'fp' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('打开本地存储失败')); };
    });
  }

  function allMetas() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('metas', 'readonly');
        var req = t.objectStore('metas').getAll();
        req.onsuccess = function () {
          var list = (req.result || []).slice().sort(function (a, b) {
            return (b.openedAt || 0) - (a.openedAt || 0);
          });
          resolve(list);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function putRecord(meta, bytes) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(['metas', 'files'], 'readwrite');
        t.objectStore('metas').put(meta);
        t.objectStore('files').put({ fp: meta.fp, bytes: bytes });
        t.oncomplete = function () { resolve(meta); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('写入本地存储失败')); };
      });
    });
  }

  function save(rec) {
    // 先同步复制一份字节：调用方随后可能把原始 buffer 交给 pdf.js 而使其 detached
    var data = rec.bytes instanceof Uint8Array ? rec.bytes.slice() : rec.bytes;
    var meta = {
      fp: String(rec.fp || ''),
      name: String(rec.name || 'paper.pdf'),
      size: Number(rec.size || (data && data.byteLength) || 0),
      openedAt: Number(rec.openedAt || Date.now())
    };
    if (!meta.fp) return Promise.reject(new Error('缺少文件标识'));

    return putRecord(meta, data).then(allMetas).then(function (list) {
      var drop = pickExpired(list, MAX_COUNT, MAX_BYTES);
      return Promise.all(drop.map(remove)).then(function () { return meta; });
    });
  }

  function list() {
    return allMetas().catch(function () { return []; });
  }

  function get(fp) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(['metas', 'files'], 'readonly');
        var mreq = t.objectStore('metas').get(fp);
        var freq = t.objectStore('files').get(fp);
        t.oncomplete = function () {
          if (!mreq.result || !freq.result) return resolve(null);
          resolve(Object.assign({}, mreq.result, { bytes: freq.result.bytes }));
        };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function touch(fp) {
    return allMetas().then(function (items) {
      var m = items.filter(function (x) { return x.fp === fp; })[0];
      if (!m) return null;
      m.openedAt = Date.now();
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var t = db.transaction('metas', 'readwrite');
          t.objectStore('metas').put(m);
          t.oncomplete = function () { resolve(m); };
          t.onerror = function () { reject(t.error); };
        });
      });
    });
  }

  function remove(fp) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(['metas', 'files'], 'readwrite');
        t.objectStore('metas').delete(fp);
        t.objectStore('files').delete(fp);
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  /** 纯函数：按数量与总大小算出应删除的最旧记录（新→旧排序后，超出部分丢弃） */
  function pickExpired(items, maxCount, maxBytes) {
    var sorted = (items || []).slice().sort(function (a, b) {
      return (b.openedAt || 0) - (a.openedAt || 0);
    });
    var drop = [];
    var total = 0;
    sorted.forEach(function (m, i) {
      total += Number(m.size || 0);
      if (i >= maxCount || total > maxBytes) drop.push(m.fp);
    });
    return drop;
  }

  function relativeTime(ts, now) {
    now = now || Date.now();
    var diff = Math.max(0, now - Number(ts || 0));
    var min = Math.floor(diff / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + ' 小时前';
    var day = Math.floor(hour / 24);
    if (day < 7) return day + ' 天前';
    var d = new Date(Number(ts));
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  return {
    save: save,
    list: list,
    get: get,
    touch: touch,
    remove: remove,
    pickExpired: pickExpired,
    relativeTime: relativeTime,
    MAX_COUNT: MAX_COUNT,
    MAX_BYTES: MAX_BYTES
  };
});

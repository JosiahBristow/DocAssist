/**
 * 把共享代码同步到各处（小程序端 / 云函数端各需要独立副本）。
 * 用法：node scripts/sync.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function copy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(root, src), path.join(root, dst));
  console.log('sync', src, '->', dst);
}

copy('shared/gb7714.js', 'miniprogram/utils/gb7714.js');
copy('shared/refconvert.js', 'miniprogram/utils/refconvert.js');
copy('shared/refconvert.js', 'cloudfunctions/docai/refconvert.js');
copy('shared/docai-core.js', 'cloudfunctions/docai/docai-core.js');

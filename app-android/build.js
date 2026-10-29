/**
 * 打包浏览器端资源：src/app.js → www/app.js（esbuild），并复制 pdf.js worker
 * 运行：node build.js
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const www = path.join(root, 'www');
fs.mkdirSync(path.join(www, 'assets'), { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, 'src', 'app.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: false,
  sourcemap: false,
  outfile: path.join(www, 'app.js'),
  logLevel: 'info'
});

const workerSrc = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.js');
const workerDst = path.join(www, 'assets', 'pdf.worker.min.js');
if (!fs.existsSync(workerSrc)) {
  console.error('找不到 pdf.js worker：', workerSrc);
  process.exit(1);
}
fs.copyFileSync(workerSrc, workerDst);
console.log('copied pdf.worker.min.js', (fs.statSync(workerDst).size / 1024).toFixed(0) + ' KB');
console.log('build ok →', path.join(www, 'app.js'), (fs.statSync(path.join(www, 'app.js')).size / 1024).toFixed(0) + ' KB');

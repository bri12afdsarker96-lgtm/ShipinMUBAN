// 打包可视化编辑器（纯前端，含 @remotion/player）。
// 用法：node scripts/build-gui.mjs          # 打包到 gui/dist
//       node scripts/build-gui.mjs --serve  # 打包并本地起服务预览
import * as esbuild from 'esbuild';
import {copyFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outdir = path.join(root, 'gui', 'dist');
const serve = process.argv.includes('--serve');

const options = {
  entryPoints: [path.join(root, 'gui', 'index.tsx')],
  bundle: true,
  outfile: path.join(outdir, 'bundle.js'),
  jsx: 'automatic',
  loader: {'.json': 'json'},
  define: {'process.env.NODE_ENV': serve ? '"development"' : '"production"'},
  format: 'iife',
  minify: !serve,
  logLevel: 'info',
};

mkdirSync(outdir, {recursive: true});

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  copyFileSync(path.join(root, 'gui', 'index.html'), path.join(outdir, 'index.html'));
  const {host, port} = await ctx.serve({servedir: outdir, host: '127.0.0.1', port: 5173});
  console.log(`编辑器预览：http://${host}:${port}`);
} else {
  await esbuild.build(options);
  copyFileSync(path.join(root, 'gui', 'index.html'), path.join(outdir, 'index.html'));
  console.log(`已打包：${path.relative(root, outdir)}`);
}

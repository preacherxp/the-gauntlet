// Builds the playable site: the page, its stylesheet, and all of the game's
// code with the parts of three.js it uses, bundled and minified into one file.
// (The page in the repository loads the modules one by one, which is handy
// while working on it but slow over the network.)
//   node tools/build-site.mjs [out_dir]      (default: dist)

import { cp, mkdir, rm, writeFile, readFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(ROOT, process.argv[2] || 'dist');
const THREE = path.join(ROOT, 'node_modules/three');
await access(path.join(THREE, 'build/three.module.js')).catch(() => { console.error('three.js is missing: run npm install first'); process.exit(1); });

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// the game in one file; three.js keeps its licence header at the end of it
await build({
  entryPoints: [path.join(ROOT, 'src/main.js')], outfile: path.join(out, 'game.js'),
  bundle: true, minify: true, format: 'esm', target: 'es2022', legalComments: 'eof', logLevel: 'warning',
});

// the page: no import map any more, and the bundle instead of src/main.js
let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const importMap = /\s*<script type="importmap">[\s\S]*?<\/script>/;
const entry = '<script type="module" src="src/main.js"></script>';
if (!importMap.test(html) || !html.includes(entry)) { console.error('index.html no longer looks as build-site.mjs expects'); process.exit(1); }
html = html.replace(importMap, '').replace(entry, '<script type="module" src="game.js"></script>');
await writeFile(path.join(out, 'index.html'), html);
await cp(path.join(ROOT, 'style.css'), path.join(out, 'style.css'));
await cp(path.join(THREE, 'LICENSE'), path.join(out, 'three.js-LICENSE.txt'));
await writeFile(path.join(out, '.nojekyll'), '');

const kb = async (f) => ((await stat(path.join(out, f))).size / 1024).toFixed(0) + ' KB';
console.log('site written to', out, '· game.js', await kb('game.js'));

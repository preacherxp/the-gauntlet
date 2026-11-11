// Gathers what the game needs to run as a static site: the page, its code,
// and the parts of three.js it imports, at the same paths the page expects.
//   node tools/build-site.mjs [out_dir]      (default: dist)

import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(ROOT, process.argv[2] || 'dist');
const THREE = path.join(ROOT, 'node_modules/three');
await access(path.join(THREE, 'build/three.module.js')).catch(() => { console.error('three.js is missing: run npm install first'); process.exit(1); });

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ['index.html', 'style.css']) await cp(path.join(ROOT, f), path.join(out, f));
await cp(path.join(ROOT, 'src'), path.join(out, 'src'), { recursive: true });
for (const f of ['build/three.module.js', 'build/three.core.js', 'LICENSE']) await cp(path.join(THREE, f), path.join(out, 'node_modules/three', f));
for (const dir of ['controls', 'postprocessing', 'shaders', 'utils']) {
  await cp(path.join(THREE, 'examples/jsm', dir), path.join(out, 'node_modules/three/examples/jsm', dir), { recursive: true });
}
await writeFile(path.join(out, '.nojekyll'), '');   // GitHub Pages: serve node_modules as it is
console.log('site written to', out);

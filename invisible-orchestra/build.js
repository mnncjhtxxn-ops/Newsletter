/**
 * Build: bundles src/main.js (with three.js) into one self-contained HTML
 * file that runs from file:// with no network, no server and no cache.
 *
 *   node build.js            → dist/invisible-orchestra.html
 *   node build.js --watch    → rebuild on change
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, watch, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const threeVersion = JSON.parse(readFileSync(resolve(root, 'node_modules/three/package.json'), 'utf8')).version;

async function bundle() {
  const t0 = Date.now();
  const result = await build({
    entryPoints: [resolve(root, 'src/main.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome100', 'edge100'],
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  });
  const js = result.outputFiles[0].text;
  const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8');
  const html = readFileSync(resolve(root, 'src/index.html'), 'utf8');
  const banner = `<!--
  2037: The Invisible Orchestra — v${pkg.version}
  Built ${new Date().toISOString()}. Self-contained: no network, no server, no external assets.
  Bundles three.js ${threeVersion} (MIT, © 2010-2025 three.js authors — https://github.com/mrdoob/three.js/blob/dev/LICENSE).
  The 2037 scenario is fictional. It does not forecast any real bill, tariff or network.
-->`;
  const out = html
    .replace('<!--INLINE_CSS-->', () => `<style>\n${css}\n</style>`)
    .replace('<!--INLINE_JS-->', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`)
    .replace('<!doctype html>', () => `<!doctype html>\n${banner}`);
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  const file = resolve(root, 'dist/invisible-orchestra.html');
  writeFileSync(file, out);
  const kb = (statSync(file).size / 1024).toFixed(0);
  console.log(`built dist/invisible-orchestra.html (${kb} kB) in ${Date.now() - t0} ms`);
}

await bundle();
if (process.argv.includes('--watch')) {
  let timer = null;
  watch(resolve(root, 'src'), { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => bundle().catch((e) => console.error(e.message)), 120); });
  console.log('watching src/ …');
}

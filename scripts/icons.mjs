/* The shared Lucide icon scan.
   It lives outside src/ so the lucideSubset() walk in vite.config.js never reads it: the
   build plugin and the test suite share one implementation, and nothing here can add an
   icon to the bundle. The name scan and the markup serialisation reproduce the plugin's
   own output byte for byte. */
import fs from 'node:fs';
import path from 'node:path';
import { icons as lucide } from 'lucide';

const pascal = n =>
  n
    .split('-')
    .map(p => p[0].toUpperCase() + p.slice(1))
    .join('');

const walk = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.js$/.test(e.name) ? [p] : [];
  });

/* The quoted lowercase kebab-case tokens of every .js file under srcDir, in sorted order. */
export function lucideIconNames(srcDir = 'src') {
  const text = walk(path.resolve(srcDir))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const tokens = [...text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)].map(m => m[1]);
  return [...new Set(tokens)].filter(n => lucide[pascal(n)]).sort();
}

/* The inline SVG markup of one icon name, exactly as the build ships it. */
export function lucideIconMarkup(name) {
  let svg = lucide[pascal(name)];
  if (!svg) return '';
  if (svg[0] === 'svg') svg = svg[2];
  return svg
    .map(
      ([t, a]) =>
        `<${t} ${Object.entries(a)
          .filter(([k]) => k !== 'key')
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')}/>`,
    )
    .join('');
}

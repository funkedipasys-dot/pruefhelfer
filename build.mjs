/**
 * Bündelt die Erweiterung nach `dist/`.
 *
 * Zwei Einstiegspunkte, zwei Formate:
 *
 * - **`content.js` als IIFE.** Content-Scripts können in MV3 **keine** Module
 *   sein — Chrome lädt sie als klassische Skripte, ein `import` darin ist ein
 *   Syntaxfehler zur Laufzeit.
 * - **`popup.js` als ES-Modul**, passend zum `<script type="module">` in
 *   `popup.html`.
 *
 * Kein Service Worker: diese Erweiterung spricht mit keinem Server, es gibt
 * nichts, das im Hintergrund laufen müsste.
 *
 * `target: chrome102` deckt sich mit `minimum_chrome_version` im Manifest.
 * Stünde hier ein höheres Ziel, könnte esbuild Syntax ausgeben, die der älteste
 * unterstützte Browser nicht versteht — die Erweiterung ließe sich installieren
 * und schlüge erst beim Ausführen fehl.
 */

import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

const BUNDLES = [
  { entry: 'src/light/content.ts', out: 'content.js', format: 'iife' },
  { entry: 'src/light/popup.ts', out: 'popup.js', format: 'esm' },
];

const COPIES = [
  ['src/light/manifest.json', 'manifest.json'],
  ['src/light/popup.html', 'popup.html'],
  ['src/popup.css', 'popup.css'],
  // Ordner, kein Einzelblatt — das Manifest verweist auf vier Größen. Fehlen
  // sie im Paket, zeigt Chrome den Buchstaben-Platzhalter und meckert beim Laden.
  ['icons', 'icons'],
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const bundle of BUNDLES) {
  await build({
    entryPoints: [join(root, bundle.entry)],
    outfile: join(dist, bundle.out),
    format: bundle.format,
    bundle: true,
    minify: false,
    sourcemap: false,
    target: 'chrome102',
    charset: 'utf8',
    legalComments: 'none',
  });
}

// `recursive`, weil unter den Kopien auch ein Ordner ist. Für einzelne Dateien
// ändert die Angabe nichts.
for (const [from, to] of COPIES) {
  await cp(join(root, from), join(dist, to), { recursive: true });
}

console.log(`dist/ gebaut: ${[...BUNDLES.map((b) => b.out), ...COPIES.map(([, to]) => to)].join(', ')}`);

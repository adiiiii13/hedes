import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const serverDir = path.resolve('build', 'server');
const indexPath = path.join(serverDir, 'index.js');
const mjsPath = path.join(serverDir, 'index.mjs');
const pkgPath = path.join(serverDir, 'package.json');

let content = fs.readFileSync(indexPath, 'utf-8');
const polyfill = 'if (typeof self === "undefined") { globalThis.self = globalThis; }\n';
if (!content.includes('globalThis.self = globalThis')) {
  content = polyfill + content;
  fs.writeFileSync(indexPath, content, 'utf-8');
}
fs.writeFileSync(mjsPath, content, 'utf-8');
fs.writeFileSync(pkgPath, JSON.stringify({ type: 'module' }, null, 2), 'utf-8');

console.log('Testing index.js import...');
const m1 = await import(pathToFileURL(indexPath).href);
console.log('index.js loaded, routes:', !!m1.routes);

console.log('Testing index.mjs import...');
const m2 = await import(pathToFileURL(mjsPath).href);
console.log('index.mjs loaded, routes:', !!m2.routes);

if (m1.routes && m2.routes) {
  console.log('ALL SERVER BUILDS VERIFIED SUCCESSFULLY!');
} else {
  console.error('ERROR: routes missing!');
  process.exit(1);
}

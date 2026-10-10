// Build with esbuild only, so the toolchain stays small:
//   node scripts/build.mjs             web app -> dist/web, plus one self-contained page in dist/preview
//   node scripts/build.mjs --netlify   web app + the Netlify functions -> dist/netlify/functions/api.js, tick.js
//   node scripts/build.mjs --mcp       agent tool server -> dist/mcp/bellwether.mjs
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const args = new Set(process.argv.slice(2));
const FONTS = 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Inter+Tight:ital,wght@0,500;0,600;0,700;1,700&family=Inter:wght@400;500;600&display=swap';
const TITLE = 'Bellwether';
const DESCRIPTION = 'A Bitget stock perp moved while New York was shut. Call whether it holds at the bell, and play an agent whose every forecast is sealed before the outcome.';
const ICON = `data:image/svg+xml;base64,${Buffer.from(await readFile('src/ui/mark.svg')).toString('base64')}`;

async function web() {
  await rm('dist/web', { recursive: true, force: true });
  await build({
    entryPoints: { app: 'src/ui/main.tsx' }, outdir: 'dist/web/assets',
    bundle: true, minify: true, format: 'iife', target: 'es2020', jsx: 'automatic',
    loader: { '.svg': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
  });
  // the snapshot of the live files this build was made from: the page reads fresher ones from GitHub when it can
  await cp('live', 'dist/web/live', { recursive: true });
  await cp('public', 'dist/web', { recursive: true }); // the tour video and its poster
  const js = await readFile('dist/web/assets/app.js', 'utf8');
  const css = await readFile('dist/web/assets/app.css', 'utf8');
  await writeFile('dist/web/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESCRIPTION}">
<link rel="icon" type="image/svg+xml" href="${ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<div id="root"></div>
<script src="assets/app.js"></script>
</body>
</html>
`);
  // One self-contained page: the same app with its CSS and JS inlined, next to a copy of the live files.
  await rm('dist/preview', { recursive: true, force: true });
  await mkdir('dist/preview', { recursive: true });
  await cp('live', 'dist/preview/live', { recursive: true });
  await cp('public', 'dist/preview', { recursive: true });
  await writeFile('dist/preview/bellwether.html', `<title>${TITLE}</title>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>
<div id="root"></div>
<script>
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`);
  console.log(`web: app.js ${(js.length / 1024).toFixed(0)} kB, app.css ${(css.length / 1024).toFixed(0)} kB`);
}

async function netlify() {
  await rm('dist/netlify', { recursive: true, force: true });
  await build({ entryPoints: ['netlify/api.ts'], outfile: 'dist/netlify/functions/api.js', bundle: true, platform: 'node', format: 'cjs', target: 'node18', logLevel: 'warning' });
  // the hourly clock: a scheduled function that starts the agent's workflow (see netlify.toml)
  await build({ entryPoints: ['netlify/tick.ts'], outfile: 'dist/netlify/functions/tick.js', bundle: true, platform: 'node', format: 'cjs', target: 'node18', logLevel: 'warning' });
  console.log('netlify: dist/netlify/functions/api.js, tick.js');
}

async function mcp() {
  await build({ entryPoints: ['mcp/bellwether.ts'], outfile: 'dist/mcp/bellwether.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning', banner: { js: '#!/usr/bin/env node' } });
  console.log('mcp: dist/mcp/bellwether.mjs');
}

if (args.has('--mcp')) await mcp();
if (args.has('--netlify')) await netlify();
if (!args.has('--mcp') || args.has('--netlify')) await web();

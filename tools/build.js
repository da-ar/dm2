/* Bundles the game into one self-contained HTML file: dist/dm2.html.
   Usage: node tools/build.js [--body-only out.html] [--share-base URL]
   --body-only   writes the page without the <html>/<head>/<body> wrapper (for hosts that add their own).
   --share-base  the public address share links should use, for hosts that show the game inside a frame
                 (the page can't see that address itself). Links become URL#DM2-code. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const css = read('css/style.css');
const js = scripts.map((s) => `/* ${s} */\n` + read(s)).join('\n');
const body = html.split('<!--BUILD:BODY-->')[1].split('<!--/BUILD:BODY-->')[0].trim();
const title = html.match(/<title>[^<]*<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const args = process.argv.slice(2);
const baseAt = args.indexOf('--share-base');
const shareBase = baseAt >= 0 ? args[baseAt + 1] : '';
const config = shareBase ? `window.DM2_SHARE_BASE = ${JSON.stringify(shareBase)};\n` : '';
const safeJs = (config + js).replace(/<\/script/gi, '<\\/script');

const inner = `${title}
${fonts}
<style>
${css}
</style>
${body}
<script>
${safeJs}
</script>
`;

const bodyAt = args.indexOf('--body-only');
if (bodyAt >= 0) {
  fs.writeFileSync(args[bodyAt + 1], inner);
  console.log('wrote', args[bodyAt + 1], shareBase ? '(share links: ' + shareBase + ')' : '');
} else {
  const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d0820">
${inner.replace(/<script>[\s\S]*$/, '')}</head>
<body>
<script>
${safeJs}
</script>
</body>
</html>
`;
  // body markup must live inside <body>: move it out of the head section
  const fixed = full.replace(`${body}\n</head>\n<body>`, `</head>\n<body>\n${body}`);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/dm2.html'), fixed);
  console.log('wrote dist/dm2.html', (fixed.length / 1024).toFixed(1) + ' KB');
}

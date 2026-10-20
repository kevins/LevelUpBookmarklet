// Builds the bookmarklet:  src/bookmarklet-entry.ts --esbuild--> one IIFE --> javascript: URL
// Outputs:
//   LevelUpBookmarklet.js      the javascript: URL to paste into a favorite (same as dist/bookmarklet.txt)
//   dist/bookmarklet.txt       the javascript: URL
//   dist/bookmarklet.min.js    the exact code the favorite runs
//   dist/bookmarklet.dev.js    readable bundle, handy for pasting into the console while testing
//   dist/installer.html        drag-to-favorites-bar install page
//   dist/build-info.json       sizes
// Target: Microsoft Edge. javascript: favorites run up to about 2,040,000 characters (Chromium caps URLs at 2 MiB),
// so the build fails at 2,000,000. Size is not squeezed any further: plain esbuild minification, no property
// renaming or text substitution, so what runs is what the source says.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const LIMIT = 2_000_000;


const common = {
  absWorkingDir: root,
  entryPoints: [path.join(root, 'src/bookmarklet-entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'edge110'],
  legalComments: 'none',
  write: false,
  // The Translator's language and refresh tools (src/translator.d.ts).
  alias: { 'levelup-translator': './src/vendor/translator-entry.ts' },
  define: { __DEV__: 'false', __VERSION__: JSON.stringify(version) }
};
// The build id is a hash of what the favorite runs (built once with a placeholder id): any change in the output,
// from the source, the build script or esbuild, gives a new id, and the same output always the same id.
const withId = id => ({ ...common.define, __BUILD_ID__: JSON.stringify(id) });
const probe = await build({ ...common, minify: true, define: withId('levelup-build') });
const buildId = `${version}-${createHash('sha256').update(probe.outputFiles[0].text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12)}`;
const [minified, development] = await Promise.all([build({ ...common, minify: true, define: withId(buildId) }), build({ ...common, minify: false, define: withId(`${buildId}-dev`) })]);
const payload = `${minified.outputFiles[0].text.trim().replace(/;$/, '')};void 0`;
new Function(payload); // throws on a syntax error

// The favorite's URL is percent-decoded before it runs: keep % and # literal, and every control character (newline,
// tab, …) encoded, since the browser drops them from a URL. Checked with the browser's own URL parser.
// eslint-disable-next-line no-control-regex -- control characters are exactly what must be encoded
const encoded = `javascript:${payload.replace(/[\x00-\x1f\x7f%#]/g, c => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`)}`;
// Written as the browser stores it (spaces, quotes and < > encoded as well), so the pasted text is what is kept.
const bookmarklet = new URL(encoded).href;
if (decodeURIComponent(bookmarklet.slice('javascript:'.length)) !== payload) throw new Error('URL encoding changed the payload.');
const characters = bookmarklet.length, bytes = Buffer.byteLength(bookmarklet, 'utf8');
if (characters > LIMIT) throw new Error(`The favorite would be ${characters} characters; Edge runs favorites up to about 2,000,000.`);

const prohibited = [/\bchrome\.(runtime|storage|scripting|tabs|sidePanel|declarativeNetRequest)\b/i, /\bbrowser\.(runtime|storage)\b/i, /impersonat/i, /MSCRMCallerID/i, /CallerObjectId/i];
for (const pattern of prohibited) if (pattern.test(payload)) throw new Error(`Production bundle contains prohibited text: ${pattern}`);

const esc = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const logo = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>';
const installer = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Level Up bookmarklet</title>
<style>
:root{--brand:#0f6cbd;--brand2:#115ea3;--fg1:#242424;--fg2:#424242;--fg3:#616161;--bg:#fafafa;--card:#fff;--s2:#e0e0e0}
@media (prefers-color-scheme:dark){:root{--brand:#479ef5;--brand2:#62abf5;--fg1:#f0f0f0;--fg2:#d6d6d6;--fg3:#adadad;--bg:#1f1f1f;--card:#292929;--s2:#3d3d3d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg1);font:15px/1.55 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:820px;margin:0 auto;padding:56px 24px 72px}.hero{display:flex;align-items:center;gap:14px}
.logo{width:44px;height:44px;border-radius:10px;background:#742774;color:#fff;display:grid;place-items:center}h1{font-size:30px;line-height:36px;margin:0;font-weight:600}
.lead{color:var(--fg2);font-size:17px;max-width:640px;margin:14px 0 28px}
.install{background:var(--card);border:1px solid var(--s2);border-radius:12px;padding:24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
a.bookmark{display:inline-flex;align-items:center;gap:10px;padding:12px 22px;border-radius:8px;background:#742774;color:#fff;font-weight:600;font-size:16px;text-decoration:none;cursor:grab;box-shadow:0 8px 16px rgba(116,39,116,.28)}
a.bookmark:active{cursor:grabbing}ol{margin:0;padding-left:20px;color:var(--fg2)}li{margin:2px 0}
.alt{margin:14px 0 0;color:var(--fg2);font-size:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
button{font:inherit;font-weight:600;padding:5px 12px;border-radius:4px;border:1px solid var(--s2);background:var(--card);color:var(--fg1);cursor:pointer}button:hover{border-color:var(--brand);color:var(--brand)}
.k{color:var(--fg3);font-size:13px;margin-top:36px}kbd{font:12px/1 "Segoe UI",sans-serif;padding:2px 5px;border:1px solid var(--s2);border-bottom-width:2px;border-radius:4px;background:var(--card)}
</style></head><body><main>
<div class="hero"><div class="logo">${logo}</div><h1>Level Up</h1></div>
<p class="lead">Developer and admin tools for Dynamics 365 / Power Apps model-driven apps, in one bookmark. Your favorites, button order and settings are the same in every environment of the same cloud in this browser profile.</p>
<div class="install"><a id="bookmark" class="bookmark" href="${esc(bookmarklet)}" title="Drag me to your favorites bar">${logo} Level Up</a>
<ol><li>Show the favorites bar in Microsoft Edge: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>.</li><li>Drag the button onto the favorites bar, then delete your old Level Up favorite (or edit it and paste the copied URL).</li><li>Open a model-driven app and click <b>Level Up</b>.</li></ol></div>
<p class="alt">Dragging not possible? <button type="button" id="copy">Copy Bookmarklet</button><span id="status" role="status">then edit your Level Up favorite and paste it as the URL.</span></p>
<p class="k">Version ${version} · ${characters.toLocaleString('en-US')} of 2,000,000 characters Edge allows (${bytes.toLocaleString('en-US')} UTF-8 bytes) · runs only in your own signed-in session.</p>
</main><script>
document.getElementById('copy').onclick = async () => {
  const url = document.getElementById('bookmark').getAttribute('href'), status = document.getElementById('status');
  try { await navigator.clipboard.writeText(url); } catch { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  status.textContent = 'Copied. Edit your Level Up favorite (Ctrl+Shift+O) and paste it as the URL.';
};
</script></body></html>`;

await mkdir(dist, { recursive: true });
await Promise.all([
  writeFile(path.join(root, 'LevelUpBookmarklet.js'), bookmarklet),
  writeFile(path.join(dist, 'bookmarklet.txt'), bookmarklet),
  writeFile(path.join(dist, 'bookmarklet.min.js'), payload),
  writeFile(path.join(dist, 'bookmarklet.dev.js'), development.outputFiles[0].text),
  writeFile(path.join(dist, 'installer.html'), installer),
  writeFile(path.join(dist, 'build-info.json'), JSON.stringify({ version, buildId, bookmarkletCharacters: characters, bookmarkletCharacterLimit: LIMIT, bookmarkletBytes: bytes, minifiedPayloadBytes: Buffer.byteLength(payload) }, null, 2))
]);
console.log(`Built Level Up ${version}: ${characters.toLocaleString('en-US')} of ${LIMIT.toLocaleString('en-US')} characters (${bytes.toLocaleString('en-US')} UTF-8 bytes).`);

/* The audit engine can actually see what it claims to see.
   ============================================================================

   darksurface.mjs is shared infrastructure now: the lead view uses it and the
   Relationships page will. A check that silently passes is worse than no check,
   and this one has already failed that way once — the first version could not
   see a white card because it only ever looked at text colour, and the first
   cut of the hierarchy paint used custom properties that jsdom drops, so the
   rules never landed and the audit reported clean.

   So this asserts the engine against a hand-built page where the answers are
   known: no app, no bundle, no fixtures. It fails if the engine stops seeing
   dark text, light surfaces, var() indirection, or filter:brightness.
*/
import { JSDOM } from 'jsdom';
import { audit, nodeLuminance, luminance } from './darksurface.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 300) : '')); } };

const page = css => new JSDOM(`<!doctype html><html><body>
  <style>${css}</style>
  <div id="surface" class="dark">
    <p class="light-text">readable</p>
    <p class="dark-text">unreadable</p>
    <p class="tokened">via a custom property</p>
    <p class="filtered">brightened</p>
    <div class="slab">white card</div>
    <div class="tinted">a tint, not a slab</div>
    <label class="sw"><b></b></label>
  </div></body></html>`, { pretendToBeVisual: true });

const CSS = `
  .dark{--ink:#F2FCFF;--deep:#05071A;background:#05071A}
  .light-text{color:#F2FCFF}
  .dark-text{color:#18152F}
  .tokened{color:var(--ink)}
  .filtered{color:#4A3F1B;filter:brightness(3)}
  .slab{background:#FBFBFE}
  .tinted{background:rgba(56,189,248,.06)}
  .sw b{background:#fff}
`;

const dom = page(CSS);
const root = dom.window.document.getElementById('surface');
const A = { win: dom.window, host: '.dark' };
const r = audit(root, A);

console.log('\ntext');
ok('it finds text that is too dark', r.dark.some(d => /dark-text/.test(d)), r.dark.join(' | '));
ok('it passes text that is light enough', !r.dark.some(d => /light-text/.test(d)), r.dark.join(' | '));
ok('it resolves a custom property rather than reading var(--ink) as unknown',
   !r.dark.some(d => /tokened/.test(d)), r.dark.join(' | '));
ok('it honours filter:brightness instead of the pre-filter colour',
   !r.dark.some(d => /filtered/.test(d)), r.dark.join(' | '));
/* the four <p>s and the two <div>s that carry a label; the empty knob is not
   counted, which is what "text of their own" means */
ok('it counts only elements with text of their own', r.count === 6, String(r.count));

console.log('\nsurfaces');
ok('it finds a light slab', r.light.some(d => /slab/.test(d)), r.light.join(' | '));
ok('it ignores a low-alpha tint over the plate', !r.light.some(d => /tinted/.test(d)), r.light.join(' | '));
ok('it exempts a toggle knob', !r.light.some(d => /\.sw/.test(d)), r.light.join(' | '));

console.log('\nthe blind spot that started this');
/* dark text on a white card: correct against its own surface, wrong in a dark
   view. The text pass alone cannot see it — the surface pass is why it does. */
ok('dark-on-white inside a dark view is caught by the surface pass',
   r.light.some(d => /slab/.test(d)), 'the slab must be reported even though its text is legible on it');

console.log('\narithmetic');
ok('white is 1', Math.abs(luminance([255,255,255]) - 1) < 1e-9);
ok('black is 0', luminance([0,0,0]) === 0);
ok('nodeLuminance reads one element', (nodeLuminance(root.querySelector('.light-text'), A) || 0) > 0.9,
   String(nodeLuminance(root.querySelector('.light-text'), A)));
ok('nodeLuminance applies brightness too', (nodeLuminance(root.querySelector('.filtered'), A) || 0) > 0.35,
   String(nodeLuminance(root.querySelector('.filtered'), A)));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

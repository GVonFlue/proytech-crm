/* THE PAGE BEHIND A MODAL MUST NOT SCROLL.
   ============================================================================

   THE BUG THIS FIXES

   A modal is position:fixed over the page, and the page behind it stayed
   scrollable. A wheel or a trackpad swipe anywhere over the scrim moved the
   CRM underneath instead of the modal. On a lead view that is disorienting; on
   a panel taller than the viewport it made the bottom of that panel GENUINELY
   UNREACHABLE, because every attempt to get there moved the page instead. That
   is how the rep profile's notes could not be reached at all.

   THE PART THAT ONLY BREAKS WITH TWO OPEN

   Modals nest — a lead view with a scheduler on top of it. A boolean lock lets
   the INNER one restore `overflow` on close while the outer is still open, and
   the page starts scrolling behind it again. That is the case nobody tests by
   hand, so it is the case tested hardest here.

   Pure module state, no DOM framework — jsdom's document is enough.
*/
import fs from 'fs';
import { JSDOM } from 'jsdom';
import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://crm.test/' });
for (const k of ['window', 'document']) {
  Object.defineProperty(globalThis, k, { value: dom.window[k] ?? dom.window, configurable: true, writable: true });
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const built = await esbuild.build({ entryPoints:['src/lib/scrolllock.js'], bundle:true, write:false,
  format:'esm', loader:{'.js':'js'}, external:['react'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  logLevel:'silent' });
fs.writeFileSync('tests/.bsl.mjs', built.outputFiles[0].text);
const L = await import('./.bsl.mjs?v=' + Date.now());

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 200) : '')); } };

const overflow = () => document.body.style.overflow;
const padding = () => document.body.style.paddingRight;

console.log('\none modal locks the page and gives it back');
{
  ok('the page scrolls before anything opens', overflow() === '', overflow());
  L.lockScroll();
  ok('opening a modal locks it', overflow() === 'hidden', overflow());
  ok('  and the counter says one is open', L._lockDepth() === 1, String(L._lockDepth()));
  L.unlockScroll();
  ok('closing it gives the page back', overflow() === '', overflow());
  ok('  and the counter is back to zero', L._lockDepth() === 0, String(L._lockDepth()));
}

console.log('\nTWO OPEN AT ONCE — the case a boolean gets wrong');
{
  L.lockScroll();          // the lead view
  L.lockScroll();          // a scheduler on top of it
  ok('both are counted', L._lockDepth() === 2, String(L._lockDepth()));
  ok('the page is locked', overflow() === 'hidden');

  L.unlockScroll();        // the scheduler closes
  ok('closing the INNER one does not unlock the page', overflow() === 'hidden', overflow());
  ok('  because the outer one is still open', L._lockDepth() === 1, String(L._lockDepth()));

  L.unlockScroll();        // the lead view closes
  ok('the page unlocks only when the LAST one closes', overflow() === '', overflow());
  ok('  and the counter is zero again', L._lockDepth() === 0);
}

console.log('\nit restores what was there, not a hardcoded default');
{
  /* Another feature may have set an inline overflow for its own reasons. A lock
     that "restores" by assuming '' would silently undo it. */
  document.body.style.overflow = 'clip';
  L.lockScroll();
  ok('the lock still takes effect', overflow() === 'hidden');
  L.unlockScroll();
  ok('and the previous value comes back, not an empty string', overflow() === 'clip', overflow());
  document.body.style.overflow = '';
}

console.log('\nthe scrollbar width is replaced so nothing jumps sideways');
{
  /* Hiding the body scrollbar reclaims its width and the whole page shifts, so
     the width is measured and put back as padding.

     BUT THE MEASUREMENT CAN BE NONSENSE. jsdom never lays out, so
     documentElement.clientWidth is 0 and the subtraction returns the whole
     window width — this test originally reported 1024px of padding, which would
     have shoved the page sideways far worse than the jump it prevents. The same
     happens in any detached or unlaid-out document. A scrollbar is never wider
     than about forty pixels, so anything beyond that is refused. */
  L.lockScroll();
  ok('an impossible scrollbar width is refused, not applied', padding() === '', padding());
  L.unlockScroll();
  ok('and none is left behind', padding() === '');
  ok('  the bound is stated in the source, not just observed here',
     /gap > 0 && gap <= 40/.test(fs.readFileSync('src/lib/scrolllock.js', 'utf8')));
}

console.log('\nunbalanced calls cannot wedge the page shut');
{
  /* A component that unmounts twice, or an error between lock and unlock, must
     not leave the counter negative — otherwise the NEXT modal's unlock would
     fire early and the page would scroll behind it forever. */
  L.unlockScroll(); L.unlockScroll(); L.unlockScroll();
  ok('extra unlocks floor the counter at zero', L._lockDepth() === 0, String(L._lockDepth()));
  L.lockScroll();
  ok('  and the next lock still works', overflow() === 'hidden');
  L.unlockScroll();
  ok('  and still releases', overflow() === '');
}

console.log('\nevery modal in the app uses it');
{
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const lead = fs.readFileSync('src/LeadView.jsx', 'utf8');
  const prof = fs.readFileSync('src/RepProfile.jsx', 'utf8');

  /* Count the scrims, count the locks. A new modal added without one is the
     regression this asserts against — and it is invisible until somebody
     scrolls. `.scrim` (the sidebar backdrop) is not a modal and is excluded. */
  const scrims = (app.match(/className="scrim2/g) || []).length;
  const locks = (app.match(/useScrollLock\(\)/g) || []).length;
  ok(`all ${scrims} scrim2 modals in App.jsx lock the page`, locks === scrims,
     `${scrims} scrims, ${locks} locks`);
  ok('the lead view locks it', /useScrollLock\(\)/.test(lead));
  ok('the rep profile locks it', /useScrollLock\(\)/.test(prof));

  /* The rep profile shipped using `.m-body`, which App.jsx documents as a DEAD
     class with no rule behind it, so its body had no overflow rule at all and
     everything below the fold was unreachable. */
  ok('the rep profile scrolls with the class that has a rule behind it',
     /className="m-scroll/.test(prof) && !/className="m-body/.test(prof));

  /* Chaining: reaching the end of a modal's own scroll must not hand the rest
     to the page. Companion to the lock, not a duplicate of it. */
  ok('the modal scroll area contains its overscroll',
     /\.m-scroll\{[^}]*overscroll-behavior:contain/.test(app));
  ok('and so does the lead view column', /\.m-left\{[^}]*overscroll-behavior:contain/.test(app));
}

console.log('\nLOCKING THE PAGE IS HALF THE JOB — the modal must still scroll');
{
  /* THE REGRESSION THIS PINS.

     The lock shipped verified on one half only: the page stopped moving, and
     nobody checked that the modal's own content still scrolled. It did not.
     `.m-right` is overflow:hidden BY DESIGN — the feed is the scroller and the
     column is not — and that held only while the composer was short. The BK
     brief added five fields; a flex item with the default min-height:auto is
     floored at its content height, so the composer could not shrink and pushed
     1020px through a 508px hidden box. Everything past the fold, including the
     Log button, became unreachable. A rep could not book a call at all.

     jsdom has no layout, so the sizes cannot be asserted here — these pin the
     RULES that produce them. The measurements live in the PR body, taken in
     Chrome with real wheel events. */
  const app = fs.readFileSync('src/App.jsx', 'utf8');

  ok('the column is still overflow:hidden — one scroller, as designed',
     /\.m-right\{[^}]*overflow:hidden/.test(app));
  /* The three properties that let the composer give space back and then scroll
     what is left. Any one of them missing reproduces the bug. */
  ok('the composer can shrink below its content', /\.compose\{[^}]*min-height:0/.test(app));
  ok('  and scrolls once it has', /\.compose\{[^}]*overflow-y:auto/.test(app));
  ok('  and shrinks rather than growing', /\.compose\{flex:0 1 auto/.test(app));
  ok('  and does not hand its overscroll to the page',
     /\.compose\{[^}]*overscroll-behavior:contain/.test(app));

  /* max-height:100% was the wrong tool and is specifically excluded: a
     percentage max-height resolves against the CONTAINER, not against the space
     left after the fixed-height siblings, so the column still overflowed. */
  ok('it does not use a percentage max-height, which resolves against the wrong box',
     !/\.compose\{[^}]*max-height:100%/.test(app));

  /* The feed must not win the space fight. With basis:auto its starting size is
     its whole content height and it squeezed the composer to fifty pixels —
     reachable, and unusable. */
  ok('the feed asks for no space of its own', /\.feed\{[^}]*flex:1 1 0[;,]/.test(app));

  /* Nothing behind the composer competes with it while somebody is typing. */
  ok('the filter row and the delete block yield while composing',
     /\.compose ~ \.afilter, \.compose ~ \.m-danger\{display:none\}/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

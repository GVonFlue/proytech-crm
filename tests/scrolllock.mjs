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

console.log('\nAND THE FEED MUST HAVE ROOM TO READ — the other half of the same fight');
{
  /* THE REGRESSION THIS PINS.

     The composer opens by default for a rep. Measured in Chrome at a 764px
     viewport, it took 293px of the 506px column and left the feed 79: not one
     past entry fully visible, and the most recent note showing 49 percent of
     itself. With the BK brief open the feed was 0px. So the rep could write and
     could not read what was said last time — and seeing the last call is half
     of why he opens the lead at all.

     THE ORDER OF YIELDING IS THE WHOLE DESIGN, and it is what the rules below
     encode: the Log button never gives (that was #66), then the note box gives,
     then the feed gives down to its floor. Getting this backwards is not
     theoretical — a 150px floor squeezed the composer to 223px against 233px of
     furniture and put the Log button outside it again.

     jsdom has no layout, so the pixels cannot be asserted here. These pin the
     RULES that produce them; the measurements are in the PR body, taken in
     Chrome against a bundle of this source. */
  const app = fs.readFileSync('src/App.jsx', 'utf8');

  /* Only the note box is elastic. If the composer itself is the flexible thing,
     shrinking it scrolls the Log button out of reach. */
  ok('the composer lays its parts out in a column',
     /\.modal\.lead \.compose\{[^}]*flex-direction:column/.test(app));
  ok('  and its furniture keeps its height — chips, dispbar, tags, Log button',
     /\.modal\.lead \.compose>\*\{flex:none\}/.test(app));
  ok('  so the note box alone absorbs the difference',
     /\.modal\.lead \.compose \.act-input\{flex:0 1 auto/.test(app));

  /* Six lines was right BEFORE the box could grow. sizeNote made the floor
     unnecessary, and 112px of it was coming straight out of the feed. */
  ok('  starting at three lines, not six, because it grows with what is typed',
     /\.modal\.lead \.compose \.act-input\{[^}]*min-height:56px/.test(app));
  const lead = fs.readFileSync('src/LeadView.jsx', 'utf8');
  ok('  and it really does grow, or three lines would just be worse',
     /onChange=\{growNote\}/.test(lead) && /const sizeNote/.test(lead));

  /* Scoped, or the rep profile's note box shares the shrink. */
  ok('the rep profile note box is not caught by this — it shares .act-input',
     /className="act-input rp-note-in"/.test(fs.readFileSync('src/RepProfile.jsx', 'utf8')) &&
     !/^\.act-input\{[^}]*flex:0 1 auto/m.test(app));

  /* The floor. Bounded BELOW by one complete entry (33px day header + 77px item
     + 9px gap) and ABOVE by the composer's own minimum. */
  ok('the feed can never be squeezed out of existence',
     /\.modal\.lead \.feed\{min-height:110px\}/.test(app));

  /* A DESKTOP floor. On a phone the modal scrolls as one page and the feed is
     not its own scroller — and .modal.lead .feed outranks the bare .feed in
     that media query, so the phone rule has to be restated at equal weight or
     the desktop floor silently follows it there. */
  /* Asserted as CO-LOCATION with the bare .feed reset rather than against a
     hardcoded breakpoint: the invariant is that the two travel together, and
     this file should not also become the place that pins which px value the
     phone layout uses. Walking back to the nearest @media additionally proves
     the override is inside a query at all and not loose in the desktop rules,
     where it would undo the floor everywhere. */
  const reset = app.indexOf('.feed{flex:none;min-height:auto;overflow:visible}');
  const at = app.indexOf('.modal.lead .feed{min-height:auto}');
  const q1 = reset < 0 ? -1 : app.slice(0, reset).lastIndexOf('@media');
  const q2 = at < 0 ? -2 : app.slice(0, at).lastIndexOf('@media');
  ok('  and the phone rule still wins on a phone, at matching specificity',
     at > 0 && q1 === q2, at < 0 ? 'the override is not there at all'
       : 'reset in ' + app.slice(q1, q1 + 24) + ', override in ' + app.slice(q2, q2 + 24));
}

console.log('\nTHE COMPOSER IS A PANEL, so it needs gutters — paid for, and NOT by the feed');
{
  /* The composer is a bordered, 12px-rounded panel that shipped with padding:0.
     Measured, the inset on all four sides was 1px, which is the border itself:
     the chips ran to the frame, and so did the note box and the Log button.

     THE INTERESTING PART IS THE FUNDING, not the padding. Horizontal costs
     nothing anyone is fighting over. Vertical comes straight out of the feed
     through the flex split, and that room was bought in #68 and #69 — so it is
     paid for from three places that had slack instead, and the feed measures
     172px before and after at a 502px column. */
  const app = fs.readFileSync('src/App.jsx', 'utf8');

  ok('the composer has real padding, not a frame drawn against its content',
     /\.modal\.lead \.compose\{padding:12px 14px\}/.test(app));

  /* The three sources. If any of these is reverted without also reverting the
     padding, the difference silently comes out of the feed again. */
  ok('  paid for out of the header, which is 126px of tiles and 82px of name',
     /\.modal\.lead \.m-head\{padding-bottom:8px\}/.test(app));
  ok('  and the jump bar',
     /\.modal\.lead \.m-jump\{padding-top:6px;padding-bottom:6px\}/.test(app));
  ok('  and the composer gaps that the padding makes partly redundant',
     /\.modal\.lead \.compose \.act-types\{margin-bottom:8px\}/.test(app) &&
     /\.modal\.lead \.compose \.dispbar\{margin-bottom:7px\}/.test(app) &&
     /\.modal\.lead \.compose \.tagpick\{margin-top:6px\}/.test(app));

  /* THE INVARIANT THIS SECTION EXISTS FOR. The floor is what makes "the feed
     did not pay for it" checkable by anything other than my eye. */
  ok('and the feed floor is untouched — the gutters did not come out of it',
     /\.modal\.lead \.feed\{min-height:110px\}/.test(app));

  /* Scoped, all of it. .m-head and .m-jump are not unique to the lead view. */
  ok('nothing here moves another modal',
     !/^\.m-head\{[^}]*padding-bottom:8px/m.test(app) &&
     !/^\.m-jump\{[^}]*padding-top:6px/m.test(app));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

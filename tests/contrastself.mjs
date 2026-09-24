import { JSDOM } from 'jsdom';
import { contrast, parseColor, ratio } from './contrast.mjs';
/* The contrast engine can actually see what it claims to see.

   leadcontrast and relscontrast pass when this engine finds nothing, and an
   engine that silently finds nothing passes everything. So it is run here
   against a hand-built page where every answer is known: no app, no bundle.
   Each case below is something the engine must catch, or must NOT flag. */
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; console.log('  FAIL ' + n + (x ? '\n        ' + String(x).slice(0, 400) : '')); } };

const dom = new JSDOM(`<!doctype html><html><body><style>
  #root{--ink:#181530;--pale:#C9CBE3}
  .band{background-color:#181530;background-image:linear-gradient(#181530,#0F1433)}
  .band .name{color:#fff}
  .band .muddy{color:#3B3470}
  .body{background:#fff}
  .body .ink{color:var(--ink)}
  .body .ghost{color:var(--pale)}
  .body .tint{background:rgba(43,77,224,.06)}
  .body .tint b{color:#181530}
  .body .dimmed{opacity:.3;color:#6E6A8A}
  .body .alpha{color:rgba(24,21,48,.18)}
</style><div id="root">
  <div class="band"><h2 class="name">Chris Waipa</h2><span class="muddy">muddy on navy</span></div>
  <div class="body">
    <p class="ink">ink via a custom property</p>
    <p class="ghost">pale via a custom property</p>
    <div class="tint"><b>on a translucent tint</b></div>
    <p class="dimmed">faded by opacity</p>
    <p class="alpha">faded by alpha</p>
    <p class="skipme" style="color:#eee">deliberate exception</p>
  </div></div></body></html>`, { pretendToBeVisual: true });
const win = dom.window, root = win.document.getElementById('root');
const { count, low } = contrast(root, { win, skip: '.skipme' });
const hit = s => low.some(l => l.includes(s));

console.log('\nthe maths');
ok('white on black is 21:1', Math.abs(ratio([255,255,255],[0,0,0]) - 21) < 0.01);
ok('8-digit hex carries its alpha (the stage pill writes color+"1A")', Math.abs(parseColor('#2B4DE01A').a - 0x1A/255) < 0.001);

console.log('\nwhat it must catch');
ok('light text on white — the old dark-view colours left behind', hit('pale via a custom property'), low.join('\n'));
ok('dark text on the navy band', hit('muddy on navy'), low.join('\n'));
ok('text dimmed by an ancestor\'s opacity', hit('faded by opacity'), low.join('\n'));
ok('text faded by its own alpha', hit('faded by alpha'), low.join('\n'));

console.log('\nwhat it must not flag');
ok('white on the navy band — read from background-color under a gradient', !hit('Chris Waipa'), low.join('\n'));
ok('ink resolved through var() on white', !hit('ink via a custom property'));
ok('ink on a translucent tint over white', !hit('on a translucent tint'));
ok('a named exception', !hit('deliberate exception'));
ok(`it looked at every text element (${count})`, count === 7, String(count));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

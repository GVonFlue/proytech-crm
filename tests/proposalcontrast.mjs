/* THE PUBLIC PROPOSAL'S ACCEPT BUTTON CAN BE READ.

   "Lock in my launch" was white on #FF6B2C, about 2.9:1: below WCAG AA at
   every text size, on the one button a client presses to buy. It now uses
   #CC4A0A (about 4.6:1), the same fill as the onboarding portal's and the
   lead view's buttons, and keeps the brand orange as its glow.

   Measured from the stylesheet itself (src/proposal/main.jsx PAGE_CSS) with
   the shared contrast engine, so a later edit that puts a light orange back
   behind white text fails here:
     - the button's text against its fill clears 4.5:1 (normal-size text)
     - so does its hover fill
     - the brand orange is still on it, as a glow (box-shadow), carrying no
       text
     - the old fill is gone

   Seen red with the fill put back to #FF6B2C. */
import fs from 'node:fs';
import { ratio, parseColor } from './contrast.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const src = fs.readFileSync('src/proposal/main.jsx', 'utf8');
const rule = sel => { const m = new RegExp('(^|\\n)' + sel.replace(/[.:()]/g, c => '\\' + c) + '\\{([^}]*)\\}').exec(src); return m ? m[2] : ''; };
const prop = (body, name) => { const m = new RegExp('(?:^|;|\\n)\\s*' + name + '\\s*:\\s*([^;]+)').exec(body); return m ? m[1].trim() : ''; };
const r = (a, b) => { const x = parseColor(a), y = parseColor(b); return x && y ? ratio(x.rgb, y.rgb) : 0; };

const btn = rule('.pg-btn');
ok('the accept button rule is found', !!btn);
const fg = prop(btn, 'color'), bg = prop(btn, 'background');
ok(`its text clears 4.5:1 on its fill (${fg} on ${bg}: ${r(fg, bg).toFixed(2)}:1)`, r(fg, bg) >= 4.5);
const hover = rule('.pg-btn:hover:not(:disabled)');
const hbg = prop(hover, 'background');
ok(`and on its hover fill (${hbg}: ${r(fg, hbg).toFixed(2)}:1)`, !!hbg && r(fg, hbg) >= 4.5);
ok('the brand orange stays, as the glow', /rgba\(255,\s*107,\s*44/.test(prop(btn, 'box-shadow')), prop(btn, 'box-shadow'));
ok('the old fill is gone (white on #FF6B2C is about 2.9:1)', !/background:\s*#FF6B2C/i.test(src) && r('#fff', '#FF6B2C') < 3);
ok('the button still says "Lock in my launch"', /Lock in my launch/.test(src));

console.log(`\nproposalcontrast: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

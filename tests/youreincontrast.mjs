/* THE "YOU'RE IN" SCREEN'S ORANGE CAN BE READ.

   Every new client sees this screen the moment they accept. Two things on it
   put white text on light orange:
     - "Start my onboarding": a #FF8A4C..#FB6926..#E2531A gradient, 2.34 to
       3.83:1 under white
     - the "Admit one" tag on the ticket: #FB6926, 2.94:1 at 10px
   Both now sit on --yi-hot-ink (#CC4A0A, 4.61:1) and darker, the fill #97 gave
   the proposal's accept button. The brand orange stays as their glow.

   Measured from CELEBRATE_CSS itself with the shared contrast engine, every
   colour stop of every fill, var() resolved through the .yi tokens, so a later
   edit that puts a light stop back behind white text fails here. Held to 4.5:1
   (normal text) even where the text is large, as #97 did.

   Seen red with the old gradient and the old tag fill put back. */
import fs from 'node:fs';
import { ratio, parseColor } from './contrast.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

const file = fs.readFileSync('src/proposal/Celebrate.jsx', 'utf8');
const start = file.indexOf('export const CELEBRATE_CSS = `');
const open = file.indexOf('`', start) + 1;
const css = start >= 0 ? file.slice(open, file.indexOf('`', open)) : '';
ok('CELEBRATE_CSS is found', css.length > 500);

// Top-level rules only (outside @media), keyed by selector.
const rules = {};
for (const m of css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '').matchAll(/(^|\n)([^{}\n][^{}]*)\{([^}]*)\}/g)) rules[m[2].trim()] = (rules[m[2].trim()] || '') + ';' + m[3];
const prop = (body, name) => { const m = new RegExp('(?:^|;|\\n)\\s*' + name + '\\s*:\\s*([^;]+)').exec(body || ''); return m ? m[1].trim() : ''; };
const tokens = {};
for (const m of (rules['.yi'] || '').matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) tokens[m[1]] = m[2].trim();
const resolve = v => v.replace(/var\((--[\w-]+)\)/g, (_, t) => tokens[t] || 'UNRESOLVED');
const stops = v => resolve(v).match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|UNRESOLVED/gi) || [];
const r = (a, b) => { const x = parseColor(a), y = parseColor(b); return x && y ? ratio(x.rgb, y.rgb) : 0; };
const worst = (fg, bg) => { const s = stops(bg); return s.length ? Math.min(...s.map(x => r(fg, x))) : 0; };

ok('the text-carrying orange token is #CC4A0A', /^#CC4A0A$/i.test(tokens['--yi-hot-ink'] || ''), tokens['--yi-hot-ink']);

const go = rules['.yi-go'], goH = rules['.yi-go:hover'];
const goFg = prop(go, 'color'), goBg = prop(go, 'background');
ok(`"Start my onboarding": every stop of its fill clears 4.5:1 under ${goFg} (worst ${worst(goFg, goBg).toFixed(2)}:1)`, stops(goBg).length >= 2 && worst(goFg, goBg) >= 4.5, resolve(goBg));
ok(`and of its hover fill (worst ${worst(goFg, prop(goH, 'background')).toFixed(2)}:1)`, !!prop(goH, 'background') && worst(goFg, prop(goH, 'background')) >= 4.5, goH);
ok('its hover never brightens the fill (a brightness filter lifts #CC4A0A under 4.5:1)', !/brightness\(\s*1\.\d*[1-9]/.test(goH || ''), goH);

const adm = rules['.yi-admit'];
const admFg = prop(adm, 'color'), admBg = prop(adm, 'background');
ok(`the "Admit one" tag clears 4.5:1 (${admFg} on ${resolve(admBg)}: ${worst(admFg, admBg).toFixed(2)}:1)`, worst(admFg, admBg) >= 4.5);

ok('the brand orange stays on both, as their glow', /rgba\(251,\s*105,\s*38/.test(prop(go, 'box-shadow')) && /rgba\(251,\s*105,\s*38/.test(prop(adm, 'box-shadow')));

// The general rule: any rule here that sets white text on a fill clears 4.5:1
// at every stop, so a new white-on-orange element is caught too.
const white = Object.entries(rules).filter(([, b]) => /^#fff(fff)?$/i.test(prop(b, 'color')) && prop(b, 'background'));
const bad = white.filter(([, b]) => worst('#fff', prop(b, 'background')) < 4.5).map(([s, b]) => `${s} ${worst('#fff', prop(b, 'background')).toFixed(2)}`);
ok(`every white-text fill on the screen clears 4.5:1 (${white.length} rules)`, white.length >= 3 && !bad.length, bad.join('; '));

ok('the old light stops are gone from every fill that carries text', !/#FF8A4C|#E2531A/i.test(css) && !/background:var\(--yi-hot\)/.test(css));
ok('confetti keeps the brand orange', /CONFETTI_COLORS = \[[^\]]*'#FB6926'/.test(file));
ok('the button still says "Start my onboarding"', /Start my onboarding/.test(file));

console.log(`\nyoureincontrast: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

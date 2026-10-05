/* THE APPROVED PROPOSAL DESIGN, HELD IN PLACE.
   ============================================================================

   The look was approved as Sample_Proposal_Reed_Realty_v5 and arrived as five
   layers of CSS overrides plus a 1.4 MB base64 image. It was folded into
   PROPOSAL_CSS as one set of rules and proven equivalent in Chrome (computed
   style of every element, desktop, 390px and print). This file keeps the
   parts that can silently regress without anyone looking at a screen:

   - the cover's STRUCTURE (one .pd-hero around plate + client, summary below
     on white), because every brand rule assumes it;
   - the logo and footer mark are IMAGES FROM THE OFFER (company.logo /
     company.mark), white-label, with the name as text only when unset;
   - the stylesheet stays merged: no embedded raster, no stacked !important
     overrides, small enough to ship to a phone;
   - the CRM list shows status, viewed time and value, and a missing number
     is a dash, never $0.                                                    */
import fs from 'node:fs'; import path from 'node:path'; import esbuild from 'esbuild';
/* bundles are named per process (tests/clockguard.mjs runs this suite in
   parallel); delete ours on the way out */
process.on('exit', () => { for (const f of fs.readdirSync('tests')) if (f.endsWith(`-${process.pid}.mjs`)) { try { fs.unlinkSync('tests/' + f); } catch {} } });
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  ok  ' + n)) : (fail++, console.log('  FAIL ' + n + (x ? ' — ' + String(x).slice(0, 300) : ''))); };

/* render the REAL components to static markup */
const entry = path.join(ROOT, `tests/.bpdesign-entry-${process.pid}.jsx`);
fs.writeFileSync(entry, `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
import ProposalDoc, { PROPOSAL_CSS } from '../src/ProposalDoc.jsx';
import Proposals from '../src/Proposals.jsx';
import * as P from '../src/lib/proposal.js';
export const doc = (body) => renderToStaticMarkup(React.createElement(ProposalDoc, { body, expiresAt: '2026-10-14T17:00:00Z' }));
export const list = (props) => renderToStaticMarkup(React.createElement(Proposals, props));
export { PROPOSAL_CSS, P };`);
const built = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
  loader: { '.js': 'jsx' }, external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'lucide-react'],
  define: { 'import.meta.env': '{}' }, logLevel: 'error',
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /(^|\/)lib\/supabase$/ }, () => ({ path: path.join(ROOT, 'tests/stub-supabase.js') })); } }] });
const out = path.join(ROOT, `tests/.bpdesign-${process.pid}.mjs`); fs.writeFileSync(out, built.outputFiles[0].text);
const { doc, list, PROPOSAL_CSS, P } = await import(out);
fs.unlinkSync(entry); fs.unlinkSync(out);

const OFFER = JSON.parse(fs.readFileSync(path.join(ROOT, 'PROPOSAL-OFFER.json'), 'utf8'));
const { offer } = P.readOffer({ offer: OFFER });
const q = P.quote(offer, { packageId: 'growth-os', addonIds: ['automations'], seats: 5 });
const BODY = P.buildBody({ offer, q, client: { name: 'Jordan Reed', company: 'Reed Realty Group', city: 'Wichita, KS' }, preparedOn: '2026-10-06', validDays: 7,
  copy: { headline: 'Growth systems and site rebuild', summary: 'SENTINEL-SUMMARY you have built a strong reputation.', plan: { goal: 'Close 48 homes', numbers: [], levers: [] }, gaps: [], build: [], whyNow: [], email: {} } });

console.log('\nthe cover');
{
  const h = doc(BODY);
  const hero = h.indexOf('class="pd-hero"'), plate = h.indexOf('class="pd-plate"'), top = h.indexOf('class="pd-top"'), sum = h.indexOf('class="pd-summary"');
  ok('one .pd-hero holds the plate, then the client block', hero > -1 && hero < plate && plate < top);
  // the hero closes before the summary opens: count divs between hero and summary
  const between = h.slice(h.lastIndexOf('<div', hero), sum);   // from the hero's own opening tag
  const opens = (between.match(/<div/g) || []).length, closes = (between.match(/<\/div>/g) || []).length;
  ok('the summary sits BELOW the hero, on white, not inside it', sum > top && opens === closes, `${opens} opened, ${closes} closed before the summary`);
  ok('the plate shows the LOGO IMAGE from the offer', /<div class="pd-plate"><img class="pd-logo" src="\/proytech-logo-dark\.png" alt="ProyTech"/.test(h));
  ok('  and not the name as text when a logo is set', !/class="pd-mark"/.test(h));
  ok('the footer mark is an image from the offer', /<img class="pd-foot-mark" src="\/proytech-nucleus\.png"/.test(h) && /class="pd-foot has-mark"/.test(h));
  const bare = doc({ ...BODY, company: { ...BODY.company, logo: '', mark: '' } });
  ok('no logo set: the company NAME, as text', /<span class="pd-mark">ProyTech<\/span>/.test(bare) && !/pd-logo/.test(bare));
  ok('no mark set: no footer image and no gap left for one', !/pd-foot-mark/.test(bare) && /class="pd-foot"/.test(bare));
}

console.log('\nthe logo is per install (white-label)');
{
  ok('the shipped offer names its logo and mark', OFFER.company.logo === '/proytech-logo-dark.png' && OFFER.company.mark === '/proytech-nucleus.png');
  ok('  and both files exist in public/', fs.existsSync(path.join(ROOT, 'public', OFFER.company.logo)) && fs.existsSync(path.join(ROOT, 'public', OFFER.company.mark)));
  ok('  and are sized for the page, not the source (< 120 KB each)', [OFFER.company.logo, OFFER.company.mark].every(f => fs.statSync(path.join(ROOT, 'public', f)).size < 120000));
  ok('readOffer carries logo and mark into the snapshot', BODY.company.logo === '/proytech-logo-dark.png' && BODY.company.mark === '/proytech-nucleus.png');
  ok('another install\'s https logo is kept', P.readOffer({ offer: { ...OFFER, company: { ...OFFER.company, logo: 'https://cdn.example.com/acme.png' } } }).offer.company.logo === 'https://cdn.example.com/acme.png');
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'http://plain.example.com/x.png', '//evil.example.com/x.png', '/../secret.png'])
    ok(`an unsafe logo is dropped: ${bad.slice(0, 28)}`, P.readOffer({ offer: { ...OFFER, company: { ...OFFER.company, logo: bad } } }).offer.company.logo === '');
  const src = fs.readFileSync(path.join(ROOT, 'src/ProposalDoc.jsx'), 'utf8');
  ok('no company name is hardcoded in the document', !/ProyTech/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
}

console.log('\nthe stylesheet is merged, not stacked');
{
  ok('no embedded raster image (the footer mark was a 1.4 MB base64 PNG)', !/data:image\/png/.test(PROPOSAL_CSS));
  ok('small enough to ship to a phone (< 20 KB)', PROPOSAL_CSS.length < 20000, PROPOSAL_CSS.length + ' chars');
  const imp = (PROPOSAL_CSS.match(/!important/g) || []).length;
  ok('no stacked !important overrides (only the .pd-noprint utility)', imp === 1 && /\.pd-noprint\{display:none!important\}/.test(PROPOSAL_CSS), imp + ' found');
  ok('no leftover pass markers (v3 / v4 / v5)', !/\/\*\s*v[345]\b/.test(PROPOSAL_CSS));
  ok('the light cover', /\.pd-hero\{[^}]*linear-gradient\(180deg,#FFFFFF,#EEF4FF\)/.test(PROPOSAL_CSS));
  ok('Space Grotesk for display', /\.pdoc h2,\.pd-client,\.pd-num b,\.pd-big\{font-family:"Space Grotesk"/.test(PROPOSAL_CSS));
  ok('a phone block exists (390px is the real reader)', /@media \(max-width:600px\)\{[\s\S]*\.pd-sec\{margin:22px 14px 0/.test(PROPOSAL_CSS));
  const print = (PROPOSAL_CSS.match(/@media print\{([\s\S]*?)\n\}/) || [])[1] || '';
  ok('print: cards and sections never split across a page', /\.pd-sec,\.pd-inv,\.pd-band,\.pd-accept,\.pd-step,\.pd-bi,\.pd-gaps li\{break-inside:avoid\}/.test(print));
  ok('print: a heading never ends a page', /\.pd-sec h2,\.pd-label\{break-after:avoid\}/.test(print));
  ok('print: brand colours print without "background graphics"', /\.pdoc,\.pdoc \*\{-webkit-print-color-adjust:exact;print-color-adjust:exact\}/.test(print));
  ok('print: no shadows on paper', /box-shadow:none/.test(print));
}

console.log('\nthe client page loads the faces');
{
  const page = fs.readFileSync(path.join(ROOT, 'proposal.html'), 'utf8');
  ok('proposal.html loads Space Grotesk and Inter', /fonts\.googleapis\.com\/css2\?[^"]*family=Inter[^"]*family=Space\+Grotesk/.test(page));
  ok('  with display=swap, so a slow font never hides the proposal', /display=swap/.test(page));
}

console.log('\nthe Proposals tab');
{
  /* RELATIVE TO NOW, not to a fixed day: these were anchored on 3 Oct 2026, so
     on 2 Nov 2026 every "open" proposal below would have expired in real time
     and this suite gone red with nothing broken. The one absolute instant
     left is the view time, built as LOCAL wall-clock time (3 Oct, 2:16 pm) so
     it reads "Oct 3 · 2:16 PM" in every timezone; it was 19:16 UTC, which is
     already 4 Oct east of +04:44. */
  const d = n => new Date(Date.now() + n * 864e5).toISOString();
  const VIEWED_AT = new Date(2026, 9, 3, 14, 16).toISOString();
  const mk = (id, lead, status, extra, quote) => ({ id, lead_id: lead, status, token: 'x', updated_at: d(-1), body: { ...BODY, quote: { ...BODY.quote, ...(quote || {}) } }, ...extra });
  const leads = [{ id: 'L1', name: 'Jordan Reed', company: 'Reed Realty Group' }, { id: 'L2', name: 'Dee', company: 'Dee Co' }, { id: 'L3', name: 'Sam', company: 'Ortiz Roofing' }, { id: 'L4', name: 'Pat', company: 'Lee Dental' }];
  const proposals = [
    mk('p1', 'L1', 'viewed', { sent_at: d(-1), viewed_at: VIEWED_AT, expires_at: d(30) }),
    mk('p2', 'L2', 'sent', { sent_at: d(-2), expires_at: d(30) }, { setup: 1500, monthly: 149 }),
    mk('p3', 'L3', 'accepted', { sent_at: d(-6), viewed_at: d(-5), accepted_at: d(-4), accepted_name: 'Sam Ortiz', expires_at: d(1) }, { setup: 1999, monthly: 199 }),
    mk('p4', 'L4', 'draft', {}, { setup: undefined }),
  ];
  const h = list({ leads, settings: { offer: OFFER }, proposals, apiPost: async () => ({}), me: 'Garrett' });
  const txt = h.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok('a clear New proposal button', /<button class="btn btn-p pp-new"[^>]*>.*?New proposal<\/button>/.test(h) && !/pp-new" disabled/.test(h));
  for (const [k, n] of [['all', 4], ['draft', 1], ['sent', 1], ['viewed', 1], ['accepted', 1]])
    ok(`status chip "${k}" with its count (${n})`, new RegExp(`class="pp-chip ${k}[^"]*"[^>]*>.*?<span>${n}</span>`).test(h));
  ok('no Expired chip when nothing has expired', !/pp-chip expired/.test(h));
  ok('every row carries its status chip', ['viewed', 'sent', 'accepted', 'draft'].every(s => new RegExp(`class="pp-pill ${s}"`).test(h)));
  ok('when it was viewed, to the minute', /Viewed Oct 3 · 2:16 PM/.test(txt), (txt.match(/Viewed [^·]+·[^ ]+ [AP]M/) || [''])[0]);
  ok('a sent proposal not yet opened says so', /Not opened yet/.test(txt));
  ok('the accepted row says who accepted', /Accepted [^·]+·[^b]+by Sam Ortiz/.test(txt));
  ok('each row shows its value: setup, and the monthly beside it', /\$4,499 \$548\/mo/.test(txt) && /\$1,999 \$199\/mo/.test(txt));
  ok('a draft with no setup price shows a dash, not $0', /Pat — Lee Dental .*? — /.test(txt) && !/Pat — Lee Dental[^$]*\$0 /.test(txt));
  ok('open value sums sent + viewed setup only', /Waiting on a client 2 \$5,999 in setup/.test(txt), (txt.match(/Waiting on a client[^O]*/) || [''])[0]);
  ok('opened counts every sent proposal ever viewed, accepted included', /Opened 2 of 3 sent/.test(txt), (txt.match(/Opened[^A]*/) || [''])[0]);
  const empty = list({ leads, settings: { offer: OFFER }, proposals: [], apiPost: async () => ({}) });
  ok('empty: says so, and offers the way in', /No proposals yet/.test(empty) && /pp-emptycard[\s\S]*New proposal/.test(empty));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

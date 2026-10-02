/* PHONE LAYOUT: THE CASCADE THAT BROKE IT, CHECKED.

   Oct 2026, both big phone bugs were the stylesheet arguing with itself:
   - .m-grid.lead3.panel-off (three classes) set two columns and out-ranked the
     phone's one-column .m-grid.lead3 (two), so on a phone the record stayed
     two columns and the activity log was a 70px strip.
   - .m-left,.m-right{overflow:visible}, meant for the stacked phone columns,
     also hit the tab popup (which IS a .m-left), so tabs spilled their content
     over the log instead of scrolling.

   The test runner has no layout engine, so this reads the stylesheet and
   checks the cascade directly. The rendered result was checked in a real
   browser at iPhone size when the fix shipped.

   The general rule it enforces: EVERY desktop rule that sets the lead grid's
   columns must have a phone override that comes later and is at least as
   specific. Add a new .m-grid.lead3.something rule without one and this fails.

   Seen red: removing the panel-off override; removing the popup's
   overflow-y:auto; removing the prep rail's min-height:auto. */
import fs from 'fs';

const src = fs.readFileSync('src/App.jsx', 'utf8');
const a = src.indexOf('const CSS=`'), b = src.indexOf('\n`;', a);
const css = src.slice(a + 11, b).replace(/\/\*[\s\S]*?\*\//g, '');

/* split into rules, remembering which @media block each sits in and its position */
const rules = [];
(function walk(text, media, base) {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i); if (open < 0) break;
    const head = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
    const body = text.slice(open + 1, j - 1);
    if (head.startsWith('@media')) walk(body, head.replace(/\s+/g, ''), base + open + 1);
    else if (!head.startsWith('@')) rules.push({ sel: head.replace(/\s+/g, ' '), body, media, pos: base + i });
    i = j;
  }
})(css, '', 0);

const phone = r => /max-width:(820|760|640)px/.test(r.media);
const classes = s => (s.match(/\.[\w-]+/g) || []).length;
const sels = r => r.sel.split(',').map(x => x.trim());

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  (' + JSON.stringify(x) + ')' : '')); } };

ok('the stylesheet parsed', rules.length > 500, rules.length);

/* 1. every desktop lead-grid column rule is answered on a phone */
const desk = rules.filter(r => !r.media && /grid-template-columns/.test(r.body))
  .flatMap(r => sels(r).filter(s => /^\.m-grid\.lead3/.test(s)).map(s => ({ s, pos: r.pos })));
ok('found the desktop lead-grid rules', desk.length >= 3, desk.map(d => d.s));
for (const d of desk) {
  const answer = rules.find(r => phone(r) && r.pos > d.pos && /grid-template-columns:\s*(minmax\(0,\s*1fr\)|1fr)\s*(;|$)/.test(r.body)
    && sels(r).some(s => s === d.s || (classes(s) >= classes(d.s) && s.startsWith('.m-grid.lead3') && d.s.split('.').every(c => s.includes(c)))));
  ok(`on a phone, ${d.s} is overridden to one column`, !!answer);
}

/* 2. the tab popup scrolls on a phone, and out-ranks the overflow:visible rule */
const pop = rules.filter(r => phone(r) && sels(r).includes('.m-left.m-pop'));
ok('the tab popup has a phone rule', pop.length > 0);
ok('which makes it scroll', pop.some(r => /overflow-y:\s*auto/.test(r.body)));
ok('as a sheet over the whole screen', pop.some(r => /position:\s*fixed/.test(r.body)));
const vis = rules.filter(r => phone(r) && /overflow:\s*visible/.test(r.body) && sels(r).includes('.m-left'));
ok('and it out-ranks the phone rule that un-scrolls .m-left',
  vis.every(v => classes('.m-left.m-pop') > classes('.m-left')));

/* 3. the prep rail flows when stacked, instead of collapsing to a strip */
ok('the prep rail is not a collapsing scroll box on a phone',
  rules.some(r => phone(r) && sels(r).some(s => /\.m-grid\.lead3\s*>\s*\.m-prep/.test(s)) && /min-height:\s*auto/.test(r.body)));

/* 4. the header nav anchors to the header, not the fact strip */
ok('the header nav is anchored to the header corner',
  rules.some(r => phone(r) && sels(r).some(s => /\.m-head\.plate\s*>\s*\.m-headright/.test(s)) && /position:\s*static/.test(r.body)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

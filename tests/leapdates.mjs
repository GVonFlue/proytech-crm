import fs from 'fs';
/* These three moved from src/App.jsx to src/lib/lead.js, where they are already
   exported — so the slice no longer needs a trailing re-export. Still sliced
   rather than imported: src/lib/lead.js pulls in lucide-react and ./brand, and
   brand.js reads import.meta.env, which does not exist outside a bundler. */
const src=fs.readFileSync('src/lib/lead.js','utf8');
const i=src.indexOf('export const nextOccurrence=');
const j=src.indexOf('export const DATE_LEAD_DEFAULT');
const code=`const num=v=>{const n=Number(v);return isNaN(n)?0:n;};\n`+src.slice(i,j);
fs.writeFileSync('/tmp/_l.mjs',code);
const m=await import('/tmp/_l.mjs');
let pass=0,fail=0;
const ok=(n,c,x='')=>{c?(pass++,console.log('  ok  '+n)):(fail++,console.log('  FAIL '+n+' — '+x));};
const iso=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:null;

console.log('\nleap-day birthdays');
/* 2027 is not a leap year. new Date(2027,1,29) silently rolls to March 1 —
   the classic bug. It must land on Feb 28, deliberately. */
ok('Feb 29 birthday, non-leap year -> Feb 28',
   iso(m.nextOccurrence('2000-02-29',true,new Date(2027,0,15)))==='2027-02-28',
   iso(m.nextOccurrence('2000-02-29',true,new Date(2027,0,15))));
ok('Feb 29 birthday, leap year -> Feb 29',
   iso(m.nextOccurrence('2000-02-29',true,new Date(2028,0,15)))==='2028-02-29',
   iso(m.nextOccurrence('2000-02-29',true,new Date(2028,0,15))));

console.log('\nrolling to next year');
ok('a birthday already past rolls forward',
   iso(m.nextOccurrence('1985-01-05',true,new Date(2026,7,15)))==='2027-01-05',
   iso(m.nextOccurrence('1985-01-05',true,new Date(2026,7,15))));
ok('a birthday still ahead stays this year',
   iso(m.nextOccurrence('1985-12-05',true,new Date(2026,7,15)))==='2026-12-05',
   iso(m.nextOccurrence('1985-12-05',true,new Date(2026,7,15))));
ok('today counts as today, not next year',
   m.daysToDate('1985-08-15',true,new Date(2026,7,15))===0,
   m.daysToDate('1985-08-15',true,new Date(2026,7,15)));

console.log('\nage');
ok('turns 41 in 2026 if born 1985', m.yearsAt('1985-12-05',true)!==null);
ok('no age when the year is a placeholder', m.yearsAt('0000-03-04',true)===null,
   m.yearsAt('0000-03-04',true));

console.log('\nbad input');
ok('garbage returns null, does not throw', m.nextOccurrence('not-a-date',true)===null);
ok('empty returns null', m.nextOccurrence('',true)===null);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);

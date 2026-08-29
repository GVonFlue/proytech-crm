import esbuild from 'esbuild';
const out = await esbuild.build({ entryPoints:['src/lib/lead.js'], bundle:true, write:false,
  format:'esm', platform:'neutral', external:['lucide-react','react'], define:{'import.meta.env':'{}'} });
const { writeFile, unlink } = await import('node:fs/promises');
await writeFile('tests/.cf.mjs', out.outputFiles[0].text);
const { cardFeeOf, cardFeeSummary, isCardPayment, DEFAULT_OPTIONS } = await import('./.cf.mjs?v='+Date.now());

let p=0,f=0; const ok=(n,c,x='')=>{c?(p++,console.log('  ok  '+n)):(f++,console.log('  FAIL '+n+(x?' — '+x:'')));};
const FEES={cardPct:3.3,cardFixed:0.30};

/* The real book, as measured: 10 Square totalling 5,896.00 and 2 Venmo. */
const sq=[599.52,599.52,599.52,599.52,599.52].map((a,i)=>({id:'sd'+i,amount:a,method:'Square',purpose:'Deposit',methodSource:'inferred'}))
  .concat([579.68,579.68,579.68,579.68,579.68].map((a,i)=>({id:'sp'+i,amount:a,method:'Square',purpose:'Final payment',methodSource:'inferred'})));
const vm=[{id:'vd',amount:1400,method:'Venmo',purpose:'Deposit',methodSource:'inferred'},
          {id:'vp',amount:999,method:'Venmo',purpose:'Final payment',methodSource:'inferred'}];
const book=[...sq,...vm];

ok('the book is 12 payments',            book.length===12);
ok('Square side totals 5,896.00',        Math.round(sq.reduce((a,x)=>a+x.amount,0)*100)/100===5896);
ok('whole book totals 8,295.00',         Math.round(book.reduce((a,x)=>a+x.amount,0)*100)/100===8295);

const s=cardFeeSummary(book,FEES);
/* 5,896.00 x 3.3% = 194.568, plus 10 x 0.30 = 3.00  ->  197.57 */
ok('the historical card fee is $197.57', s.fee===197.57, String(s.fee));
ok('counted on the 10 card payments',    s.counted===10, String(s.counted));
ok('2 fee-free rails, not counted',      s.free===2);
ok('nothing unknown in this book',       s.unknown===0);
ok('all 12 flagged as inferred',         s.inferred===12);

/* Venmo is free, and a Venmo payment of the SAME size costs nothing —
   the point that makes this a property of the rail, not of the revenue */
ok('Venmo carries no fee',               cardFeeOf({amount:1400,method:'Venmo'},FEES)===0);
ok('same amount on Square does',         Math.round(cardFeeOf({amount:1400,method:'Square'},FEES)*100)/100===46.50);

/* unknown is excluded, never assumed to be card — understating is the safe way */
const withUnknown=[...book,{id:'u1',amount:5000}];
const s2=cardFeeSummary(withUnknown,FEES);
ok('an unknown payment adds no fee',     s2.fee===197.57, String(s2.fee));
ok('and is reported as unknown',         s2.unknown===1&&s2.total===13);
ok('a blank method string is unknown',   cardFeeSummary([{id:'x',amount:100,method:''}],FEES).unknown===1);

/* the fixed component is where a blended percentage goes wrong */
ok('the 30c matters on a small payment',
   Math.round(cardFeeOf({amount:50,method:'Square'},FEES)*100)/100===1.95, 'want 1.95');
ok('percentage alone would understate it',
   Math.round(50*0.033*100)/100===1.65);

/* settings drive it — correcting from a statement needs no deploy */
ok('a corrected rate flows straight through',
   Math.round(cardFeeOf({amount:1000,method:'Square'},{cardPct:2.6,cardFixed:0.10})*100)/100===26.10);
ok('missing settings do not crash',      cardFeeOf({amount:1000,method:'Square'},undefined)===0);
ok('null payment is safe',               cardFeeOf(null,FEES)===0&&!isCardPayment(null));
ok('an empty book is zero, not NaN',     cardFeeSummary([],FEES).fee===0);

ok('both option lists ship defaults',
   DEFAULT_OPTIONS.payMethod.includes('Square')&&DEFAULT_OPTIONS.payMethod.includes('Venmo')
   &&DEFAULT_OPTIONS.payPurpose.includes('Deposit'));

await unlink('tests/.cf.mjs').catch(()=>{});
console.log(`\n${p} passed, ${f} failed`); process.exit(f?1:0);

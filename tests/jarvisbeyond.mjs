import { parseReply } from '../src/lib/jarvis.js';
let p=0,f=0; const ok=(n,c,x='')=>{c?(p++,console.log('  ok  '+n)):(f++,console.log('  FAIL '+n+(x?' — '+x:'')));};

const r1=parseReply(JSON.stringify({answer:'Brandon introduced you to five people.',beyond:'Striping firms usually re-bid in spring.',actions:[],cited:['b']}));
ok('answer parses', r1.answer==='Brandon introduced you to five people.');
ok('beyond is its own field', r1.beyond==='Striping firms usually re-bid in spring.');
ok('not malformed', r1.malformed===false);

const r2=parseReply(JSON.stringify({answer:'Only what the records say.',actions:[]}));
ok('missing beyond is empty, not undefined', r2.beyond==='');

const r3=parseReply(JSON.stringify({answer:'x',beyond:null}));
ok('null beyond is empty', r3.beyond==='');

const r4=parseReply('```json\n{"answer":"fenced","beyond":"thinking"}\n```');
ok('fenced JSON still yields both', r4.answer==='fenced'&&r4.beyond==='thinking');

const r5=parseReply('not json at all');
ok('unparseable keeps the raw text as the answer', r5.answer==='not json at all'&&r5.malformed===true);
ok('and beyond stays empty rather than undefined', r5.beyond==='');

const long='z'.repeat(9000);
ok('beyond is capped', parseReply(JSON.stringify({answer:'a',beyond:long})).beyond.length===4000);

/* the salvage rule from Jarvis.jsx, asserted directly: an empty answer must
   never throw the model's own words away */
const salvage=(parsed,text)=>(parsed.answer||'').trim()||String(text||'').trim();
const raw=JSON.stringify({answer:'',beyond:'I had thoughts but no answer field'});
ok('an empty answer falls back to the raw reply', salvage(parseReply(raw),raw).length>0);
ok('and only a truly empty reply yields nothing', salvage(parseReply(''),'')==='');

console.log(`\n${p} passed, ${f} failed`); process.exit(f?1:0);

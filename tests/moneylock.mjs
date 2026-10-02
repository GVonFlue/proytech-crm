/* MONEY LOCK: existing numbers must not move.

   The golden values below were computed by the code as it stood BEFORE the
   service catalog and deal.price (repo zip, 1 Oct 2026), over a fixture shaped
   like real records: multi-field deals with extras, a legacy single deal, a
   bare dealValue, closed deals, payments, retainers live and ended, string
   amounts, and every stage outcome (open, signed, nurture, lost).
   At that change, the old and new code were also run side by side over every
   exported lib function (2,272 identical results) and the Dashboard, Clients,
   Money, Invoices and Leads screens (word for word identical).

   If this goes red, an existing figure changed. That may be intended, but it
   must be a decision, not a side effect: update the golden only on purpose.
   Dates are fixed, so this cannot rot on a calendar boundary.
   Seen red: dealBits counting price twice; servicesOf prices leaking into a
   deal's value; dropping extras from dealBits. */
import fs from 'fs';
import esbuild from 'esbuild';
const bundle = async (entry, tag) => {
  const out = await esbuild.build({ entryPoints:[entry], bundle:true, write:false, format:'esm', platform:'neutral',
    external:['lucide-react','react'], define:{'import.meta.env':'{}'}, logLevel:'silent' });
  fs.writeFileSync(`tests/.${tag}.mjs`, out.outputFiles[0].text); return import(`./.${tag}.mjs?v=` + Date.now());
};
const L = await bundle('src/lib/lead.js', 'bml_lead'), C = await bundle('src/lib/charts.js', 'bml_charts');
const COBALT="#2B4DE0",GOLD="#B9932F",GREEN="#1f8a55",RED="#b4322e",INDIGO="#3D3A8C",INK="#181530";
const ST=[
  {key:'new',      label:'New Lead',      color:'#6B73C9', prob:0.10, open:true,  won:false, lost:false},
  {key:'discovery',label:'Discovery',     color:COBALT,    prob:0.30, open:true,  won:false, lost:false},
  {key:'proposal', label:'Proposal Sent', color:GOLD,      prob:0.70, open:true,  won:false, lost:false},
  {key:'signed',   label:'Signed',        color:GREEN,     prob:1.00, open:false, won:true,  lost:false},
  /* "Not right now" is a THIRD outcome, not a flavour of lost. Open would
     inflate the pipeline and the forecast with people who just said no; lost
     would bury them and drag win rate down for a deal that was never refused.
     open/won/lost all false = counted nowhere, which is exactly right — they
     come back through the follow-up date instead. */
  {key:'nurture',  label:'Not right now', color:'#7C8AA5', prob:0.00, open:false, won:false, lost:false, nurture:true},
  {key:'lost',     label:'Lost',          color:'#B0606A', prob:0.00, open:false, won:false, lost:true},
];

const NOW=new Date('2026-10-15T12:00:00Z');
const FIX=[
 {id:'a',stage:'signed',isClient:true,retainer:249,retainerActive:true,retainerStart:'2026-06-01',
  deals:[{id:'d1',label:'Website build',service:'Website',setup:1500,website:1499,integration:'',extras:[{label:'Extra page',amount:150}]},
         {id:'d2',label:'Phase 2',setup:'',website:'',integration:800,extras:[]}],
  closedDeals:[{id:'c1',label:'Starter',amount:1800,closedAt:'2026-05-10',deal:{setup:1800}}],
  payments:[{id:'p1',amount:1500,date:'2026-07-12'},{id:'p2',amount:249,date:'2026-08-03',purpose:'retainer'},{id:'p3',amount:600,date:'2026-09-20'}]},
 {id:'b',stage:'signed',isClient:true,deal:{setup:2999,website:0,integration:0},payments:[{id:'p4',amount:1000,date:'2026-08-15'}]},
 {id:'c',stage:'new',dealValue:1999},
 {id:'d',stage:'proposal',deals:[{id:'d3',label:'CRM',setup:1200,extras:[{amount:'300'}]}]},
 {id:'e',stage:'lost',deals:[{id:'d4',setup:5000}]},
 {id:'f',stage:'signed',isClient:true,retainer:500,retainerActive:true,retainerStart:'2026-02-01',retainerEnd:'2026-07-01',
  closedDeals:[{id:'c2',label:'Site',amount:3200,closedAt:'2026-04-02'},{id:'c3',label:'Auto',amount:900,closedAt:'2026-08-09'}],
  payments:[{id:'p5',amount:4500,date:'2026-06-11'}]},
 {id:'g',stage:'signed',isClient:true,deals:[{id:'d5',setup:'750.50',website:'',integration:null,extras:[{amount:''},{amount:'49.5'}]}],payments:[]},
 {id:'i',stage:'nurture',deals:[{id:'d6',setup:2200}]},
 {id:'j',stage:'signed',deals:[{id:'d7',setup:1000,website:500}],payments:[{id:'p9',amount:300,date:'2026-10-02'}]},
];

const GOLDEN = {"per":{"a":{"owed":3400,"openSale":3949,"closed":1800,"deals":3949,"invoice":3400},"b":{"owed":1999,"openSale":2999,"closed":0,"deals":2999,"invoice":1999},"c":{"owed":0,"openSale":1999,"closed":0,"deals":1999,"invoice":0},"d":{"owed":0,"openSale":1500,"closed":0,"deals":1500,"invoice":0},"e":{"owed":0,"openSale":5000,"closed":0,"deals":5000,"invoice":0},"f":{"owed":0,"openSale":0,"closed":4100,"deals":0,"invoice":0},"g":{"owed":800,"openSale":800,"closed":0,"deals":800,"invoice":800},"i":{"owed":0,"openSale":2200,"closed":0,"deals":2200,"invoice":0},"j":{"owed":1200,"openSale":1500,"closed":0,"deals":1500,"invoice":1200}},"sold":[{"name":"Unassigned","value":22698},{"name":"Website","value":3149}],"coll":[0,0,0,0,0,0,0,4500,1500,1249,600,300],"mrr":[0,0,0,500,500,500,500,749,749,249,249,249]};
let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok  '+n);} else {fail++;console.log('  FAIL '+n+(x!==undefined?'  ('+JSON.stringify(x)+')':''));} };
const r2=x=>Math.round(x*100)/100;
for (const l of FIX) {
  const g=GOLDEN.per[l.id];
  const now={ owed:r2(L.owedBy(l,ST)), openSale:r2(L.openSaleValue(l)), closed:r2(L.closedDealsTotal(l)),
    deals:r2(L.dealsOf(l).reduce((a,d)=>a+L.dealBits(d),0)),
    invoice:r2(((L.balanceItems(l,ST))||[]).reduce((a,it)=>a+Number(it.amount)*(it.qty||1),0)) };
  ok(`record ${l.id}: owed, pipeline, closed, deal value and invoice unchanged`, JSON.stringify(now)===JSON.stringify(g), {was:g, now});
}
ok('sold by service unchanged', JSON.stringify(C.soldByService(FIX))===JSON.stringify(GOLDEN.sold));
ok('revenue collected by month unchanged', JSON.stringify(C.collectedByMonth(FIX,12,NOW).map(m=>m.value))===JSON.stringify(GOLDEN.coll));
ok('MRR by month unchanged', JSON.stringify(C.mrrByMonth(FIX,12,NOW).map(m=>m.value))===JSON.stringify(GOLDEN.mrr));

/* the new rules */
ok('a deal priced for a client is worth exactly that price', L.dealBits({price:'4200'})===4200);
ok('the price counts once, beside any older fields', L.dealBits({price:1000,setup:250,extras:[{amount:50}]})===1300);
ok('the service on a deal does not change its value',
  L.dealBits({price:1800,service:'Website'})===L.dealBits({price:1800,service:'Web+CRM'}));
const settings={services:[{id:'w',name:'Website',price:'9999'}]};
ok('a catalog price never reaches a deal value',
  L.dealBits({service:'Website',price:'2500'})===2500 && L.servicesOf(settings)[0].price==='9999');
ok('a deal with a service and no price is worth $0 until priced', L.dealBits({service:'Website',price:''})===0);

console.log(`\n${pass} passed, ${fail} failed`);
for (const t of ['bml_lead','bml_charts']) { try{ fs.unlinkSync(`tests/.${t}.mjs`); }catch{} }
process.exit(fail?1:0);

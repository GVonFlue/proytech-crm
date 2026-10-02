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
   Seen red: assignDealService writing an amount; dealBits counting price twice; servicesOf prices leaking into a
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

/* LABELLING A DEAL MOVES NO MONEY. Label every deal on every record, in all
   four shapes (itemised, closed, old single deal, bare dealValue), with the
   same function the Label-your-deals screen uses, then demand the golden
   figures again. Then check the chart lost its Unassigned bar but no dollars. */
const labelled = FIX.map(l => {
  let rec = JSON.parse(JSON.stringify(l));
  for (const row of L.dealRows(rec)) {
    const p = L.assignDealService(rec, row, 'Website');
    ok(`record ${l.id}: a ${row.kind} deal (${row.id}) can be labelled`, !!p, row);
    if (p) rec = { ...rec, ...p };
  }
  return rec;
});
for (const l of labelled) {
  const g=GOLDEN.per[l.id];
  const now={ owed:r2(L.owedBy(l,ST)), openSale:r2(L.openSaleValue(l)), closed:r2(L.closedDealsTotal(l)),
    deals:r2(L.dealsOf(l).reduce((a,d)=>a+L.dealBits(d),0)),
    invoice:r2(((L.balanceItems(l,ST))||[]).reduce((a,it)=>a+Number(it.amount)*(it.qty||1),0)) };
  ok(`record ${l.id} after labelling: every figure unchanged`, JSON.stringify(now)===JSON.stringify(g), {was:g, now});
  ok(`record ${l.id} after labelling: dealValue untouched`, l.dealValue===FIX.find(x=>x.id===l.id).dealValue);
}
ok('revenue collected unchanged after labelling', JSON.stringify(C.collectedByMonth(labelled,12,NOW).map(m=>m.value))===JSON.stringify(GOLDEN.coll));
ok('MRR unchanged after labelling', JSON.stringify(C.mrrByMonth(labelled,12,NOW).map(m=>m.value))===JSON.stringify(GOLDEN.mrr));
const soldAfter=C.soldByService(labelled), soldBefore=GOLDEN.sold;
const tot=a=>r2(a.reduce((x,r)=>x+r.value,0));
ok('after labelling, nothing is Unassigned', !soldAfter.some(r=>r.name==='Unassigned'), soldAfter);
ok('and the chart total is the same dollars, just relabelled', tot(soldAfter)===tot(soldBefore), {before:tot(soldBefore), after:tot(soldAfter)});

/* REVENUE BY SERVICE: won, pipeline, and the lost/parked remainder.
   Must add up to the old Sold-by-service total exactly, and WON must match
   an independent sum from the app's own closed and won definitions. */
for (const [tag, set] of [['as stored', FIX], ['after labelling', labelled]]) {
  const sr = C.serviceRevenue(set, ST);
  const won = r2(sr.rows.reduce((a, r) => a + r.won, 0)), pipe = r2(sr.rows.reduce((a, r) => a + r.pipeline, 0));
  const sold = r2(C.soldByService(set).reduce((a, r) => a + r.value, 0));
  ok(`${tag}: won + pipeline + lost/parked = the old chart total`, r2(won + pipe + sr.excluded) === sold, { won, pipe, excluded:sr.excluded, sold });
  const indep = r2(set.reduce((a, l) => a + L.closedDealsTotal(l) +
    ((l.isClient || L.sOf(l.stage, ST).won) ? L.dealsOf(l).filter(d => !L.isUpsellDeal(d)).reduce((x, d) => x + L.dealBits(d), 0) : 0), 0));
  ok(`${tag}: won matches the app's own closed + won-record sums`, won === indep, { won, indep });
}
const byId = id => { const sr = C.serviceRevenue([FIX.find(l => l.id === id)], ST); return { won:sr.rows.reduce((a,r)=>a+r.won,0), pipe:sr.rows.reduce((a,r)=>a+r.pipeline,0), x:sr.excluded }; };
ok('a signed client\'s deals are won', byId('a').won > 0 && byId('a').pipe === 0);
ok('an open-stage lead\'s deal is pipeline, not won', byId('d').won === 0 && byId('d').pipe === 1500);
ok('a bare deal value on a new lead is pipeline', byId('c').pipe === 1999 && byId('c').won === 0);
ok('a lost lead\'s deal is in neither', byId('e').won === 0 && byId('e').pipe === 0 && byId('e').x === 5000);
ok('a parked (not right now) lead\'s deal is in neither', byId('i').won === 0 && byId('i').pipe === 0 && byId('i').x === 2200);
const ups = C.serviceRevenue([{ id:'u', isClient:true, stage:'signed', deals:[{ id:'x', price:700, service:'CRM', upsell:true }] }], ST).rows[0];
ok('an upsell being pitched to a client is pipeline until won', ups.won === 0 && ups.pipeline === 700);
const cl = C.serviceRevenue(labelled, ST).rows.find(r => r.name === 'Website');
ok('clients and deals are counted for won work', cl.clients >= 4 && cl.deals >= cl.clients, cl);

/* REVENUE BY SERVICE IS CASH. collectedByService must add up, to the cent,
   to every payment logged, which for this fixture is the ORIGINAL code's
   Revenue-collected figures (GOLDEN.coll). Placing cash never moves money. */
const sumColl = r2(GOLDEN.coll.reduce((a, v) => a + v, 0));
for (const [tag, set] of [['as stored', FIX], ['after labelling', labelled]]) {
  const cs = C.collectedByService(set, ST);
  ok(`${tag}: revenue by service totals the original Revenue collected`, cs.total === sumColl, { total:cs.total, sumColl });
  ok(`${tag}: the service bars add up to that total`, r2(cs.rows.reduce((a, r) => a + r.collected, 0)) === cs.total);
}
const csStored = C.collectedByService(FIX, ST);
ok('unlabelled work leaves its cash Unassigned, not guessed', (csStored.rows.find(r => r.name === 'Unassigned') || {}).collected === csStored.total);
const csLab = C.collectedByService(labelled, ST);
ok('once every deal is labelled, single-service clients\' cash is placed', (csLab.rows.find(r => r.name === 'Website') || {}).collected === csLab.total);
ok('won is shown beside cash but never added to it', csLab.rows.every(r => typeof r.won === 'number') && csLab.total === sumColl);

/* the placement rules, on a client who bought two things */
const two = { id:'t', isClient:true, stage:'signed', retainer:199, retainerActive:true,
  deals:[{ id:'w', label:'Site', service:'Website', price:'3000' }, { id:'c', label:'Suite', service:'CRM', price:'2500' }],
  payments:[{ id:'p1', amount:1500, date:'2026-09-01' }, { id:'p2', amount:1000, date:'2026-09-05', dealId:'c' },
            { id:'p3', amount:199, date:'2026-09-30', purpose:'Retainer' }] };
const place = l => Object.fromEntries(C.collectedByService([l], ST).rows.map(r => [r.name, r.collected]));
let pl = place(two);
ok('two services: an untagged payment stays Unassigned', pl.Unassigned === 1500 + 199, pl);
ok('a payment tagged to the CRM deal counts as CRM', pl.CRM === 1000, pl);
let t2 = { ...two, ...L.tagPayment(two, 'p1', 'w') };
ok('tagging it to the Website deal moves it to Website', place(t2).Website === 1500, place(t2));
ok('tagging writes only the tag', t2.payments[0].amount === 1500 && t2.payments[0].date === '2026-09-01' && t2.payments[0].dealId === 'w');
t2 = { ...t2, retainerService:'CRM' };
ok('the retainer payment goes to the retainer\'s service', place(t2).CRM === 1000 + 199, place(t2));
const relab = { ...t2, ...L.assignDealService(t2, { kind:'open', id:'w' }, 'Web+CRM') };
ok('relabelling a deal moves its payments with it', place(relab)['Web+CRM'] === 1500 && !place(relab).Website, place(relab));
const closedT = { ...t2, deals:[t2.deals[1]], closedDeals:[{ id:'zz', label:'Site', amount:3000, service:'Website', deal:{ ...t2.deals[0] } }] };
ok('a tag survives the deal being closed', place(closedT).Website === 1500, place(closedT));
const one = { id:'o', isClient:true, stage:'signed', retainer:249, retainerActive:true,
  deals:[{ id:'x', service:'Website', price:'2999' }], payments:[{ id:'q', amount:999, date:'2026-09-01' }, { id:'r', amount:249, date:'2026-09-02', purpose:'Retainer' }] };
ok('one service: cash and retainer place themselves', place(one).Website === 1248 && !place(one).Unassigned, place(one));
ok('a retainer set to another service wins over the automatic one', place({ ...one, retainerService:'CRM' }).CRM === 249);
const kindRet = { id:'k', isClient:true, stage:'signed', retainerService:'Automations', retainerPayments:[{ id:'rp', amount:300, date:'2026-09-03' }] };
ok('a payment stored as a retainer row is a retainer payment', place(kindRet).Automations === 300);

/* tagging every payment on every record moves no money */
const tagged = labelled.map(l => { let rec = l; const rows = L.dealRows(rec);
  (rec.payments || []).forEach(p => { const pt = rows[0] && L.tagPayment(rec, p.id, rows[0].id); if (pt) rec = { ...rec, ...pt }; }); return rec; });
for (const l of tagged) {
  const g = GOLDEN.per[l.id];
  const now = { owed:r2(L.owedBy(l,ST)), openSale:r2(L.openSaleValue(l)), closed:r2(L.closedDealsTotal(l)),
    deals:r2(L.dealsOf(l).reduce((a,d)=>a+L.dealBits(d),0)),
    invoice:r2(((L.balanceItems(l,ST))||[]).reduce((a,it)=>a+Number(it.amount)*(it.qty||1),0)) };
  ok(`record ${l.id} after tagging its payments: every figure unchanged`, JSON.stringify(now) === JSON.stringify(g), { was:g, now });
}
ok('revenue collected unchanged after tagging', JSON.stringify(C.collectedByMonth(tagged,12,NOW).map(m=>m.value)) === JSON.stringify(GOLDEN.coll));

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

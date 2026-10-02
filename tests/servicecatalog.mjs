/* THE SERVICE CATALOG AND WHAT A DEAL WAS SOLD AS.

   Settings holds what ProyTech sells and what each costs. A deal picks a
   service, takes its price as a starting point, and the Sold-by-service chart
   groups by that service. These checks run the real lib functions, and read
   LeadView/App source (comments stripped, so a comment cannot pass a check)
   for the wiring that has no pure function to call.

   Seen red: copying the catalog price onto a new deal; removing num(d.price) from dealBits; removing the price line from
   balanceItems; making servicesOf ignore a saved list; putting the old prompt
   back as Add a deal; dropping services from the backup restore. */
import fs from 'fs';
import esbuild from 'esbuild';

const bundle = async (entry, tag) => {
  const out = await esbuild.build({ entryPoints:[entry], bundle:true, write:false,
    format:'esm', platform:'neutral', external:['lucide-react','react'], define:{'import.meta.env':'{}'}, logLevel:'silent' });
  const f = `tests/.${tag}.mjs`; fs.writeFileSync(f, out.outputFiles[0].text);
  return import(`./.${tag}.mjs?v=` + Date.now());
};
const L = await bundle('src/lib/lead.js', 'bsvc_lead');
const C = await bundle('src/lib/charts.js', 'bsvc_charts');

let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (info !== undefined ? '  (' + JSON.stringify(info) + ')' : '')); }
};

/* ---- the catalog ---- */
const names = s => L.servicesOf(s).map(x => x.name);
ok('a fresh install gets the five services',
  JSON.stringify(names({})) === JSON.stringify(['Website','CRM','Automations','Web+CRM','Google Business Profile setup']), names({}));
ok('the defaults carry no invented prices', L.servicesOf({}).every(x => x.price === ''));
ok('a saved list wins over the defaults', JSON.stringify(names({ services:[{id:'a',name:'SEO',price:'500'}] })) === '["SEO"]');
ok('an emptied list stays empty, it does not refill', names({ services:[] }).length === 0);
ok('blank rows are ignored', names({ services:[{id:'a',name:'  '},{id:'b',name:'CRM',price:1}] }).join() === 'CRM');
ok('lookup by name ignores case and spaces',
  (L.serviceByName({ services:[{id:'a',name:'Web+CRM',price:'4000'}] }, ' web+crm ') || {}).price === '4000');

/* ---- a deal's value: ONE definition, and it counts the price ---- */
ok('dealBits counts deal.price', L.dealBits({ price:'2500' }) === 2500);
ok('and still counts the older fields beside it',
  L.dealBits({ price:1000, setup:200, website:300, integration:0, extras:[{amount:50}] }) === 1550);
ok('a pre-catalog deal is valued exactly as before', L.dealBits({ setup:1500, website:1499 }) === 2999);

/* ---- the chart groups by service, and closed deals can be backfilled ---- */
const leads = [
  { deals:[{ id:'o1', service:'Website', price:'3000' }] },
  { deals:[{ id:'o2', service:'CRM', price:'1200' }],
    closedDeals:[
      { id:'c1', amount:5000, service:'Web+CRM' },                     // backfilled on the row
      { id:'c2', amount:800, deal:{ service:'Google Business Profile setup' } }, // closed after this change
      { id:'c3', amount:7000 },                                        // never assigned
    ] },
];
const sold = Object.fromEntries(C.soldByService(leads).map(r => [r.name, r.value]));
ok('an open deal lands under its service, priced from deal.price', sold['Website'] === 3000, sold);
ok('a backfilled closed deal moves out of Unassigned', sold['Web+CRM'] === 5000, sold);
ok('a closed deal is still read through its archived deal', sold['Google Business Profile setup'] === 800, sold);
ok('an unassigned deal is shown, not dropped', sold['Unassigned'] === 7000, sold);
ok('nothing is lost: the bars add up to every deal',
  Object.values(sold).reduce((a, b) => a + b, 0) === 3000 + 1200 + 5000 + 800 + 7000, sold);

/* ---- invoices bill the price ---- */
const inv = L.balanceItems({ isClient:true, deals:[{ id:'d', label:'Website', service:'Website', price:'2000' }], payments:[] }, []) || [];
ok('the balance invoice has a line for the service price',
  inv.some(it => it.label === 'Website' && Number(it.amount) === 2000), inv);
ok('two deals keep their names on the price lines',
  L.priceLineLabel({ label:'Phase 2', service:'CRM' }, true) === 'Phase 2 — CRM');

/* ---- wiring, from source ---- */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '');
const lv = strip(fs.readFileSync('src/LeadView.jsx', 'utf8'));
const app = strip(fs.readFileSync('src/App.jsx', 'utf8'));
ok('the panel uses the shared dealBits, not its own sum', /const dealSum=dealBits;/.test(lv));
ok('the panel has no copy of the deal sum left',
  !/num\(d\.integration\)\+\(?\(d\.extras/.test(lv));
ok('Add a deal opens the service picker', /className="deal-add-btn" onClick=\{\(\)=>setPickSvc\(true\)\}/.test(lv));
ok('the picker lists the catalog', /servicesOf\(settings\)\.map\(sv=>pricing===sv\.name[\s\S]{0,1600}?className="svc-opt" onClick/.test(lv));
ok('picking a service stamps the service, and the price typed for this client',
  /service=svc\.name; price=num\(typed\)>0/.test(lv));
ok('the catalog price is never copied onto a deal', !/price=String\(num\((svc|next|cat)\.price\)\)/.test(lv));
ok('changing a deal\'s service never sets its price',
  !/patch\.price/.test((lv.match(/const setDealService=[\s\S]*?updateDeal\(d\.id,patch\)/)||[''])[0]));
ok('closing a deal keeps its service', /const closed=\{[^}]*service:d\.service/.test(lv));
ok('closed deals can be given a service', /className=\{'dh-svc'/.test(lv));
ok('Settings has the catalog editor', /<ServiceCatalogEditor services=\{servicesOf\(settings\)\}/.test(app));
ok('the second invoice builder bills the price too', /if\(num\(d\.price\)\) items\.push/.test(app));
ok('a backup restore carries the catalog', /services:d\.settings\.services/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
for (const t of ['bsvc_lead', 'bsvc_charts']) { try { fs.unlinkSync(`tests/.${t}.mjs`); } catch {} }
process.exit(fail ? 1 : 0);

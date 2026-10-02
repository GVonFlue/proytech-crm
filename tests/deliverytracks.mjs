/* DELIVERY TRACKS FOLLOW WHAT A CLIENT BOUGHT.

   A client's delivery checklists used to come only from Service Interest chips
   ("what they asked about"). They now also come from the services on the deals
   they WON, so a client sold a CRM gets the Business Suite checklist even if
   nobody ticked a chip. Mapping: Website -> Website; CRM -> Business Suite;
   Automations -> AI / Integrations; Web+CRM -> Website + Business Suite;
   Google Business Profile setup -> its own track (new in v2).

   Saved installs never see default changes, so withDefaultTracks teaches the
   saved tracks the new names ONCE (v2), adding only what is missing.

   Seen red: activeTracks ignoring won services; the v2 upgrade removing a
   name; the upgrade re-adding a name the owner deleted after v2; a proposal
   (not won) setting off a checklist; newProject ignoring the service. */
import fs from 'fs';
import esbuild from 'esbuild';
const bundle = async (entry, tag) => {
  const out = await esbuild.build({ entryPoints:[entry], bundle:true, write:false, format:'esm', platform:'neutral',
    external:['lucide-react','react'], define:{'import.meta.env':'{}'}, logLevel:'silent' });
  fs.writeFileSync(`tests/.${tag}.mjs`, out.outputFiles[0].text); return import(`./.${tag}.mjs?v=` + Date.now());
};
const L = await bundle('src/lib/lead.js', 'bdt_lead');
let pass=0, fail=0;
const ok=(n,c,x)=>{ if(c){pass++;console.log('  ok  '+n);} else {fail++;console.log('  FAIL '+n+(x!==undefined?'  ('+JSON.stringify(x)+')':''));} };
const T = L.DEFAULT_DELIVERY_TRACKS;
const keys = a => a.map(t => t.key).sort().join(',');

/* the mapping */
ok('Website sets off the Website checklist', keys(L.tracksForService('Website', T)) === 'website');
ok('CRM sets off the Business Suite checklist', keys(L.tracksForService('CRM', T)) === 'suite');
ok('Automations sets off AI / Integrations', keys(L.tracksForService('Automations', T)) === 'ai');
ok('Web+CRM sets off Website and Business Suite', keys(L.tracksForService('Web+CRM', T)) === 'suite,website');
ok('Google Business Profile setup has its own checklist', keys(L.tracksForService('Google Business Profile setup', T)) === 'gbp');
ok('the new track never shows on clients who did not buy it', T.find(t => t.key === 'gbp').fallback === false);

/* what a client bought: won work only */
const client = { isClient:true, closedDeals:[{ id:'c', amount:900, service:'Automations' }],
  deals:[{ id:'a', price:2000, service:'CRM' }, { id:'b', price:500, service:'Website', upsell:true }] };
ok('won services: closed deals and the client\'s open deals', L.wonServicesOf(client).sort().join() === 'Automations,CRM');
ok('an upsell still being pitched is not bought yet', !L.wonServicesOf(client).includes('Website'));
ok('a lead\'s proposal is not bought', L.wonServicesOf({ stage:'proposal', deals:[{ id:'x', price:1, service:'CRM' }] }).length === 0);
ok('a closed deal labelled through its archived deal counts', L.wonServicesOf({ closedDeals:[{ id:'c', amount:1, deal:{ service:'Website' } }] }).join() === 'Website');

/* checklists follow it */
ok('a client sold a CRM gets the Business Suite checklist, no chip needed',
  keys(L.activeTracks({ isClient:true, closedDeals:[{ id:'c', amount:1, service:'CRM' }] }, T)) === 'suite');
ok('Web+CRM gets both checklists',
  keys(L.activeTracks({ isClient:true, deals:[{ id:'d', price:1, service:'Web+CRM' }] }, T)) === 'suite,website');
ok('chips and purchases combine',
  keys(L.activeTracks({ isClient:true, serviceInterest:['Web Design'], deals:[{ id:'d', price:1, service:'Google Business Profile setup' }] }, T)) === 'gbp,website');

/* UNCHANGED for clients with nothing labelled. Expected values are what the
   ORIGINAL code (repo zip, 1 Oct 2026) returned for these same records. */
const WAS = ["ai,website","website","ai","suite","ai,website","ai,website","ai,website"];
const unlabelled = [
  { isClient:true }, { isClient:true, serviceInterest:['Web Design'] }, { isClient:true, serviceInterest:['CRM Setup'] },
  { isClient:true, serviceInterest:['Business Suite'] }, { isClient:true, serviceInterest:['Both'] },
  { isClient:true, deals:[{ id:'d', setup:1500 }] }, { isClient:true, closedDeals:[{ id:'c', amount:900 }] },
];
unlabelled.forEach((l, i) => ok(`unlabelled client ${i + 1}: same checklists as before (${WAS[i]})`,
  keys(L.activeTracks(l, T)) === WAS[i], keys(L.activeTracks(l, T))));

/* projects pick their track by service */
ok('a project for a GBP deal gets the GBP checklist', L.newProject({ id:'c', label:'Profile work', service:'Google Business Profile setup' }, T).trackKey === 'gbp');
ok('a project for a CRM deal gets Business Suite', L.newProject({ id:'c', label:'Phase 2', deal:{ service:'CRM' } }, T).trackKey === 'suite');
ok('an unlabelled project still matches by name, as before', L.newProject({ id:'c', label:'Website refresh' }, T).trackKey === 'website');

/* the one-time upgrade of SAVED tracks */
const saved = [
  { key:'website', label:'Website', services:['Web Design','My Custom'], milestones:['a'] },
  { key:'ai', label:'AI / Integrations', services:['AI Integration'], milestones:['b'] },
  { key:'suite', label:'Business Suite', services:['Business Suite'], fallback:false, milestones:['c'] },
  { key:'mine', label:'Photography', services:['Photos'], milestones:['d'] },
];
const up = L.withDefaultTracks(saved, 1);
const svc = k => (up.find(t => t.key === k) || {}).services || [];
ok('v1 saved tracks learn the catalog names', svc('website').includes('Website') && svc('website').includes('Web+CRM')
  && svc('suite').includes('CRM') && svc('suite').includes('Web+CRM') && svc('ai').includes('Automations'));
ok('nothing the owner typed is removed or reordered', svc('website').slice(0, 2).join() === 'Web Design,My Custom');
ok('a track the owner made is untouched', JSON.stringify(up.find(t => t.key === 'mine')) === JSON.stringify(saved[3]));
ok('milestones are untouched', up.find(t => t.key === 'website').milestones.join() === 'a');
ok('the Google Business Profile track is added', !!up.find(t => t.key === 'gbp'));
ok('the input is not mutated', saved[0].services.length === 2);
ok('running it twice adds nothing twice', JSON.stringify(L.withDefaultTracks(up, 1)) === JSON.stringify(up));
const pruned = up.map(t => t.key === 'suite' ? { ...t, services:['Business Suite'] } : t);
ok('after v2 is saved, a name the owner removed stays removed', !(L.withDefaultTracks(pruned, 2).find(t => t.key === 'suite').services.includes('CRM')));
ok('and a v2 install is returned as-is', L.withDefaultTracks(pruned, 2) === pruned);

console.log(`\n${pass} passed, ${fail} failed`);
for (const t of ['bdt_lead']) { try { fs.unlinkSync(`tests/.${t}.mjs`); } catch {} }
process.exit(fail ? 1 : 0);

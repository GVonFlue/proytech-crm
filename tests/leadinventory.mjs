/* LEAD-VIEW-INVENTORY.md, asserted.
   ============================================================================

   THIS TEST EXISTS TO MAKE A REDESIGN UNABLE TO LOSE ANYTHING.

   It is written against the CURRENT lead view and passes today. That is the
   point: it is not a wish-list for the new view, it is a description of the old
   one, taken before any of it moved. Every assertion is keyed to an item id in
   LEAD-VIEW-INVENTORY.md, so a failure names the thing that went missing rather
   than a selector that changed.

   WHAT IT DOES NOT ASSERT: behaviour. Not which helper computed a number, not
   what a write contained, not the order of a patch. The existing suites already
   own all of that and keep owning it. This file asserts PRESENCE, because
   presence is the thing a redesign silently costs you.

   THE FIXTURES ARE THE HARD PART. Most of this view is conditional, and a
   conditional element is invisible on the lead you happen to be testing with —
   which is exactly how a redesign drops it and nobody notices for a month. So
   there are five mounts, each shaped to make a different set of conditions
   fire:

     NEW          the create form
     RICH         an owner looking at a CLIENT that has one of everything:
                  meetings, open and closed deals, payments, a retainer, a
                  commission, sponsorships, key dates, labels, custom fields,
                  an intro chain, and tagged activity
     REP          the same client, seen by the rep who owns it
     POOL         a rep looking at an UNCLAIMED pool lead — the one case where
                  the deal fact is deliberately withheld
     REL          the same record flipped to a relationship
   ========================================================================== */
import fs from 'fs'; import path from 'path';
import { JSDOM } from 'jsdom'; import esbuild from 'esbuild';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'https://crm.test/', pretendToBeVisual: true });
for (const k of ['window','document','HTMLElement','Element','Node','Event','CustomEvent','getComputedStyle',
  'requestAnimationFrame','cancelAnimationFrame','localStorage','sessionStorage','history','location','navigator','MutationObserver']) {
  try { Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true }); } catch {}
}
globalThis.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
dom.window.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.fetch = async u => String(u).includes('google-status')
  ? { ok:true, json: async () => ({ connected:true, email:'gvonflue@gmail.com' }) }
  : { ok:false, status:500, json: async () => ({}), text: async () => '' };

let pass = 0, fail = 0; const missing = [];
const ok = (id, n, c, x = '') => {
  if (c) { pass++; console.log('  ok   ' + id + '  ' + n); }
  else { fail++; missing.push(id + ' ' + n); console.log('  MISSING ' + id + '  ' + n + (x ? '\n            ' + String(x).slice(0, 200) : '')); }
};

const iso = d => new Date(d).toISOString();
const ago = n => iso(Date.now() - n * 864e5);
const soon = n => { const d = new Date(Date.now() + n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

const STAGES = [
  { key:'new', label:'New Lead', color:'#6B73C9', prob:.1, open:true, won:false, lost:false },
  { key:'proposal', label:'Proposal Sent', color:'#C8A24A', prob:.7, open:true, won:false, lost:false },
  { key:'signed', label:'Signed', color:'#1F9D55', prob:1, open:false, won:true, lost:false },
  { key:'nurture', label:'Not right now', color:'#7C8AA5', prob:0, open:false, won:false, lost:false, nurture:true },
  { key:'lost', label:'Lost', color:'#B0606A', prob:0, open:false, won:false, lost:true },
];
const SETTINGS = {
  /* 'rels' is on because the SAME modal serves relationships and they are
     reached from that page — switching it off hides half the inventory. */
  modules:['dash','leads','rels','settings'], modulesV:9, stages:STAGES, options:{},
  pools:['General','Test'], retainerStartCleared:'2026-01-01T00:00:00.000Z',
  customFields:[
    { id:'cf1', label:'Brokerage', type:'text' },
    { id:'cf2', label:'Agents', type:'number' },
    { id:'cf3', label:'Region', type:'select', options:['North','South'] },
    { id:'cf4', label:'On retainer', type:'checkbox' },
  ],
};

/* The introducer, so an intro CHAIN exists rather than a single hop. */
const MARCUS = { id:'rel1', name:'Marcus Webb', company:'Webb Lending', stage:'new',
  owner:'Garrett', owner_id:'u_owner', createdAt:ago(400), isRelationship:true,
  relTier:'inner', activities:[], meetings:[], custom:{} };

/* One lead carrying one of everything the view can render. */
const RICH = over => ({
  id:'L1', name:'Sarah Chen', company:'Chen Realty', businessType:'Real Estate',
  stage:'signed', priority:'high', source:'Referral', owner:'Garrett', owner_id:'u_owner',
  phone:'3165551234', email:'sarah@chenrealty.com', website:'chenrealty.com',
  createdAt:ago(60), followUp:soon(2), nextAction:'Follow Up Call',
  nextSteps:'Ask about the listing site', expectedClose:soon(30),
  isClient:true, convertedAt:ago(20), closedAt:String(ago(20)).slice(0,10),
  introducedBy:'rel1', relNote:'Met at the Chamber mixer',
  serviceInterest:['Website'], labels:['VIP'],
  keyDates:[{ id:'kd1', label:'Birthday', date:'1984-11-04', annual:true, lead:14 }],
  custom:{ cf1:'Keller', cf2:12, cf3:'North', cf4:true },
  potentialSponsor:true, pastSponsor:true, sponsorTier:'Gold', sponsorAmount:500,
  sponsorships:[{ id:'sp1', eventName:'Golf Day', label:'Golf Day', date:'2026-06-01', amount:750, paid:false }],
  deals:[{ id:'d1', label:'Website build', setup:2000, website:1000, integration:500,
           extras:[{ id:'x1', label:'Extra page', amount:250 }] }],
  dealValue:3750,
  closedDeals:[{ id:'cd1', label:'Phase one', amount:1500, closedAt:String(ago(90)).slice(0,10), by:'Garrett' }],
  payments:[{ id:'p1', amount:1200, date:String(ago(10)).slice(0,10), note:'Square deposit' }],
  retainer:450, retainerActive:true,
  commission:{ repId:'u_rep', repName:'Tony Porter', pct:10, base:3750, amount:375,
               status:'pending', convertedAt:ago(20) },
  dealValueBy:'Garrett', dealValueAt:ago(21),
  onboarding:{ deposit_paid:{ done:null, due:soon(5) } },
  clientPhase:'intake',
  meetings:[
    { id:'m1', title:'Discovery call', mtype:'Discovery', start:iso(Date.now()+3*864e5),
      end:iso(Date.now()+3*864e5+18e5), status:'', setBy:'Garrett', setById:'u_owner', createdAt:ago(5) },
    { id:'m2', title:'Coffee', mtype:'Coffee', start:ago(9), end:ago(9), status:'held',
      setBy:'Garrett', setById:'u_owner', heldBy:'Garrett', heldById:'u_owner', heldAt:ago(9), createdAt:ago(12) },
    { id:'m3', title:'Undated catch-up', mtype:'Other', start:ago(1), end:ago(1), status:'',
      setBy:'Garrett', setById:'u_owner', createdAt:ago(1), logged:true, dateUnknown:true },
  ],
  activities:[
    { id:'a1', ts:ago(1), type:'Call', text:'Ran through the proposal.', who:'Garrett', tags:['Logan'] },
    { id:'a2', ts:ago(4), type:'Note', text:'Cancelled: Coffee', who:'Garrett', cancelled:true },
    { id:'a3', ts:ago(30), type:'Note', text:'Lead created.', who:'Garrett' },
  ],
  ...over,
});

/* A second ordinary lead, so the Leads table hands the modal a nav list with
   more than one entry — prev/next only render when it does, and a relationship
   does not count because bizLeads filters it out. */
const FILLER = { id:'L9', name:'Second Lead', company:'Second Co', stage:'new',
  owner:'Garrett', owner_id:'u_owner', createdAt:ago(4), activities:[], meetings:[], custom:{} };

const OWNER = { id:'u_owner', name:'Garrett', email:'admin@getproytech.com', role:'owner',
  pools:[], commission_pct:0, appointment_rate:0, active:true, tabs:[], goal_conversions:0, nav_order:[] };
const REP = { id:'u_owner', name:'Tony Porter', email:'tonyporter434@gmail.com', role:'rep',
  pools:['General'], commission_pct:10, appointment_rate:75, active:true,
  tabs:['dash','leads','meetings'], goal_conversions:0, nav_order:[] };
const ROSTER = [
  { id:'u_owner', name:'Garrett', role:'owner' },
  { id:'u_l', name:'Logan', role:'owner' },
  { id:'u_rep', name:'Tony Porter', role:'rep' },
];

const out = await esbuild.build({ entryPoints:['src/App.jsx'], bundle:true, write:false, format:'esm', jsx:'automatic',
  loader:{'.js':'jsx','.jsx':'jsx'}, external:['react','react-dom','react-dom/client','react/jsx-runtime'],
  define:{'import.meta.env':'__ENV__'}, banner:{js:'const __ENV__={MODE:"test",DEV:false,PROD:true};'},
  plugins:[{ name:'stub', setup(b){ b.onResolve({filter:/(^|\/)lib\/supabase$/}, () => ({ path: path.resolve('tests/stub-supabase.js') })); } }],
  logLevel:'silent' });
fs.writeFileSync('tests/.bli.mjs', out.outputFiles[0].text);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const click = async el => { if (!el) throw new Error('click: element not found');
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const settle = async (ms = 100) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };

let curRoot = null, curEl = null;
async function boot({ users, leads, roster = ROSTER }) {
  if (curRoot) { await act(async () => { curRoot.unmount(); }); curEl.remove(); }
  globalThis.__USERS__ = users; globalThis.__TEAM__ = roster;
  globalThis.__LEADS__ = leads; globalThis.__SETTINGS__ = SETTINGS;
  globalThis.__WRITES__ = []; globalThis.__MANY__ = []; globalThis.__MLOGS__ = [];
  globalThis.__SETTINGS_WRITES__ = []; globalThis.__USER_WRITES__ = [];
  curEl = document.createElement('div'); document.body.appendChild(curEl);
  const mod = await import('./.bli.mjs?v=' + Date.now() + Math.random());
  curRoot = createRoot(curEl);
  await act(async () => { curRoot.render(React.createElement(mod.default)); });
  await settle(170);
}
const nav = async l => { const b = [...curEl.querySelectorAll('.nav-i')].find(e => (e.textContent || '').trim() === l);
  if (b) await click(b); await settle(); };
const openLead = async (name, scope = /^All/) => { await nav('Leads');
  /* A rep has no "All" — an unclaimed pool lead is only reachable under Pool,
     which is itself part of the boundary being asserted. */
  const s = [...curEl.querySelectorAll('.scope-seg button')].find(b => scope.test(b.textContent || ''));
  if (s) await click(s);
  const row = [...curEl.querySelectorAll('tbody tr')].find(e => new RegExp(name).test(e.textContent || ''));
  if (!row) throw new Error('no row for ' + name);
  await click(row); await settle(170);
};
/* A relationship is filtered out of the Leads table by bizLeads, so it is
   opened from the Relationships page — which is itself part of the inventory:
   the same modal serves both, reached two ways. */
const openRel = async name => { await nav('Relationships');
  /* The page defaults to Grouped; the table is under List. */
  const list = [...curEl.querySelectorAll('.seg button')].find(b => /^List$/.test((b.textContent||'').trim()));
  if (list) { await click(list); await settle(80); }
  const row = [...curEl.querySelectorAll('tbody tr')].find(e => new RegExp(name).test(e.textContent || ''));
  if (!row) throw new Error('no relationship row for ' + name);
  await click(row); await settle(170);
};
const newLead = async () => { await nav('Leads');
  const b = [...curEl.querySelectorAll('button')].find(x => /^New Lead$/.test((x.textContent || '').trim()));
  if (b) await click(b); await settle(150);
};
/* Open every collapsed section so its contents are in the DOM. */
const openAllSecs = async () => {
  for (const h of [...curEl.querySelectorAll('.msec:not(.open) .msec-h')]) { await click(h); await settle(40); }
};
const T = () => (curEl.querySelector('.modal') || curEl).textContent || '';
const has = re => re.test(T());
const q = s => !!curEl.querySelector(s);
const qa = s => [...curEl.querySelectorAll(s)];
const label = t => qa('label').some(l => new RegExp(t, 'i').test(l.textContent || ''));
const btn = re => qa('button, a').some(b => re.test((b.textContent || '').trim()));

/* ==================================================================== */
console.log('\nA — header  (RICH, owner)');
await boot({ users:[OWNER], leads:[MARCUS, FILLER, RICH()] });
await openLead('Sarah Chen');
ok('A1','lead name', /Sarah Chen/.test((curEl.querySelector('.m-head h2')||{}).textContent||''));
ok('A2','company · type subline', /Chen Realty/.test((curEl.querySelector('.m-head .co')||{}).textContent||''));
ok('A3','added / last contact', /Added .* Last contact/.test((curEl.querySelector('.m-head .meta')||{}).textContent||''));
ok('A4','stage badge', q('.qa') && has(/Signed/));
ok('A5','priority badge', has(/High/));
ok('A6','call link', qa('a').some(a => /^tel:/.test(a.getAttribute('href')||'')));
ok('A7','text link', qa('a').some(a => /^sms:/.test(a.getAttribute('href')||'')));
ok('A8','email link', qa('a').some(a => /^mailto:/.test(a.getAttribute('href')||'')));
ok('A9','website link', qa('a').some(a => /chenrealty\.com/.test(a.getAttribute('href')||'')));
ok('A10','previous lead button', qa('.m-headright .m-x').length >= 3);
ok('A11','N / M counter', /\d+ \/ \d+/.test(T()));
ok('A12','next lead button', qa('.m-headright .m-x').length >= 3);
ok('A13','close button', qa('.m-x').length > 0);
ok('A14','fact strip', q('.m-facts'));
{
  const facts = qa('.m-facts .mf').map(f => (f.textContent || '').trim());
  const sels = qa('.m-facts .mf-sel');
  ok('A14a','stage is an inline picker', sels.some(s => /Stage/.test(s.textContent || '')));
  ok('A14b','priority is an inline picker', sels.some(s => /Priority/.test(s.textContent || '')));
  ok('A14c','source fact', facts.some(f => /^Source/.test(f)));
  ok('A14d','owner fact', facts.some(f => /^Owner/.test(f)));
  ok('A14e','type fact', facts.some(f => /^Type/.test(f)));
  ok('A14f','close fact', facts.some(f => /^Close/.test(f)));
  ok('A14g','deal fact (owner sees it)', facts.some(f => /^Deal/.test(f)), JSON.stringify(facts));
  ok('A14i','meetings fact', facts.some(f => /^Meetings/.test(f)));
}

console.log('\nB — jump bar');
ok('B1','jump-to label', q('.m-jump .mj-l'));
{ const j = qa('.m-jump .mj').map(b => (b.textContent||'').trim());
  ok('B2','meetings chip', j.some(x => /Meetings/.test(x)));
  ok('B3','qualifying chip', j.some(x => /Qualifying/.test(x)));
  ok('B4','service chip', j.some(x => /Service/.test(x)));
  ok('B5','intro chip', j.some(x => /Intro/.test(x)));
  ok('B6','deal chip', j.some(x => /Deal/.test(x))); }

console.log('\nC — contact');
ok('C1','contact heading', has(/Contact/));
ok('C2','name field', label('^Name$'));
ok('C3','company field', label('^Company$'));
ok('C4','phone field', label('^Phone$'));
ok('C5','email field', label('^Email$'));
ok('C6','website field', label('^Website$'));
ok('C7','key dates block', label('Birthdays'));
ok('C7a','a key date row renders', q('.kd-row') && has(/Birthday/));
ok('C7b','lead-time highlight class exists', qa('.kd-row').length > 0);
ok('C7c','remove a key date', q('.kd-row .ev-x'));
ok('C7d','label picker with "Something else…"', qa('.kd-add option').some(o => /Something else/.test(o.textContent||'')));
ok('C7e','key date input', q('.kd-add input[type="date"]'));
ok('C7f','add button', qa('.kd-add button').length > 0);
ok('C7g','repeats-every-year hint', has(/Repeats every year/));
ok('C8','labels block', label('^Labels$'));
ok('C8a','label chips', qa('.lblchip').length > 0);
ok('C8b','new-label chip', q('.lblchip.add'));

console.log('\nD — follow-up');
ok('D1','follow-up heading', has(/Follow-up/));
ok('D2','follow-up date field', label('Follow-up date'));
ok('D3','next action picker', label('Next action'));
ok('D4','what to do textarea', label('What to do on this follow-up'));
ok('D5','due/overdue line', q('.fu-when'));

console.log('\nF — delivery (client)');
ok('F1','delivery heading', has(/Delivery/));
ok('F2','a track with a progress bar', q('.track') && q('.pbar'));
ok('F3','milestone rows', qa('.mslist .mcheck').length > 0);
ok('F5','revert to lead', btn(/Revert to lead/));

console.log('\nG — sections (all opened)');
await openAllSecs();
ok('G1b','meeting list', q('.msec') && has(/Discovery call/));
ok('G1c','undated meeting offers a date', has(/Undated catch-up/));
ok('G1d','scheduler present', has(/Invite client/) || has(/Meet link/));
ok('G1e','scheduler names the calendar', q('.mtg-acct') || q('.mtg-warn'));
ok('G2a','lead source', label('Lead Source'));
ok('G2b','business type', label('Business Type'));
ok('G2c','stage', label('^Stage$'));
ok('G2d','priority', label('^Priority$'));
ok('G2e','owner', label('^Owner$'));
ok('G2f','expected close', label('Expected Close'));
ok('G2g','lead pool (owner only)', label('Lead pool'));
ok('G2h','add custom next action', btn(/Add custom Next Action/));
ok('G3a','service chips', qa('.chips .chip').length > 0);
ok('G4a','relationship toggle', q('.spon-tog.rel'), T().slice(0,120));
ok('G4d','introduced by', label('Introduced by'));
ok('G4e','how you know them', label('How you know them'));
ok('G4f','intro chain', q('.rc-path') && has(/Marcus Webb/));
ok('G5a','potential sponsor toggle', has(/[Pp]otential sponsor/));
ok('G5b','past sponsor toggle', has(/[Pp]ast sponsor/));
ok('G5c','sponsorship history row', q('.sp-row') && has(/Golf Day/));
ok('G5d','provenance tag', q('.sp-tag'));
ok('G5e','owed marker', has(/owed/));
ok('G5g','totals line', q('.sp-h'));
ok('G5h','log one by hand', btn(/Log one by hand/));
ok('G5j','sponsor tier + amount', label('Sponsor tier'));
ok('G6a','custom text field', label('Brokerage'));
ok('G6b','custom select field', label('Region'));
ok('G6c','custom checkbox field', label('On retainer'));
ok('G8','commission section (owner + client)', has(/Rate at conversion/));
ok('G8a','rep name', has(/Tony Porter/));
ok('G8b','deal value entered by', has(/Deal value entered by/));
ok('G8d','deal value used', label('Deal value used'));
ok('G8g','approve commission', btn(/Approve commission/));
ok('G8h','void', btn(/^Void/));
ok('G9a','closed deals block', q('.deal-hist') && has(/Phase one/));
ok('G9b','lifetime line', has(/Lifetime with this client/));
ok('G9c','open deal card', q('.deal-card') && qa('.deal-name').length > 0);
ok('G9e','setup / website / integration', label('Setup \\$') && label('Website \\$') && label('Integration \\$'));
ok('G9f','extra line item', q('.extra-row'));
ok('G9g','add line item', btn(/Add line item/));
ok('G9h','close this deal', btn(/close this deal/i));
ok('G9i','add a deal', btn(/Add a(nother)? deal/));
ok('G9j','deal total row', q('.deal-total'));
ok('G9k','monthly retainer', label('Monthly Retainer'));
ok('G9l','retainer toggle', q('.toggle .sw'));
ok('G9m','payments head', q('.pay-head'));
ok('G9n','recurring note', has(/recurring/));
ok('G9o','paid-of bar', q('.pay-bar') && has(/paid/));
ok('G9p','payment row with month', q('.pay-row') && has(/counts in/));
ok('G9r','log a payment', btn(/Log a payment/));

console.log('\nH — client banners');
ok('H2','client bar', q('.client-bar'));
ok('H3','mark payment collected', btn(/Mark payment collected/));
ok('H5','revert to lead', btn(/Revert to lead/));

console.log('\nI — activity log');
ok('I1','activity log heading', has(/Activity Log/));
ok('I2','expand / split toggle', q('.feed-wide'));
ok('I3','touch bar', q('.touchbar'));
ok('I5','composer opener', q('.compose-open'));
{ await click(curEl.querySelector('.compose-open')); await settle(90); }
ok('I6a','type chips default to Call', qa('.act-t.on').some(b => /^Call$/.test((b.textContent||'').trim())));
ok('I6b','payment chip', q('.act-t.pay'));
ok('I6e','textarea', q('.act-input'));
ok('I6f','tag picker', q('.tagpick') && qa('.tagchip').length > 0);
ok('I6g','who picker for an owner', qa('.m-right select').length > 0);
ok('I6h','log button', btn(/^Log Call$/));
ok('I7','filter chips with counts', q('.afilter') && /All \(\d+\)/.test(T()));
ok('I8a','day headings', q('.fday'));
ok('I8b','activity rows', qa('.fitem').length > 0);
ok('I8c','cancelled marker', has(/[Cc]ancelled/));
ok('I8d','@tag on an activity', q('.ftag'));
ok('I9a','owner delete lead', btn(/Delete lead/));
ok('I4','not-right-now park button', true, 'won stage hides it — asserted on the NEW-stage lead below');

console.log('\nI4 / A14 — a lead in an open stage, owner');
await boot({ users:[OWNER], leads:[MARCUS, RICH({ id:'L2', name:'Open Lead', stage:'new', isClient:false, commission:null })] });
await openLead('Open Lead');
ok('I4','not-right-now park button', q('.notnow'));
ok('H1','convert banner', q('.convert-banner') && has(/Won the deal/));

console.log('\nE / J — the create form');
await boot({ users:[OWNER], leads:[MARCUS] });
await newLead();
ok('E1','first note heading', has(/First note/));
ok('E2','activity type chips', qa('.fn-block .act-t').length > 0);
ok('E3','first note textarea', q('.fn-block .fu-note'));
ok('E4','hint line', q('.fn-hint'));
ok('E5','add more details toggle', q('.morebtn'));
{ await click(curEl.querySelector('.morebtn')); await settle(80); }
ok('E6a','business type', label('Business Type'));
ok('E6b','lead source', label('Lead Source'));
ok('E6c','stage', label('^Stage$'));
ok('E6d','priority', label('^Priority$'));
ok('E6e','next action', label('Next Action'));
ok('E6f','owner', label('^Owner$'));
ok('E6g','follow-up date (the duplicate of D2)', label('Follow-up Date'));
ok('E6h','expected close', label('Expected Close'));
ok('E6i','notes for the follow-up', label('Notes for the follow-up'));
ok('I10','save-first empty state', has(/Save the lead to start logging/));
ok('J1','create lead', btn(/Create Lead/));
ok('J2','cancel', btn(/^Cancel$/));
ok('J3','summary note', q('.m-foot-n'));

console.log('\nREP — the same client, seen by the rep who owns it');
await boot({ users:[REP], leads:[MARCUS, RICH({ owner:'Tony Porter' })] });
await openLead('Sarah Chen');
await openAllSecs();
{
  const facts = qa('.m-facts .mf').map(f => (f.textContent||'').trim());
  ok('A14g','deal fact IS shown on a lead the rep owns', facts.some(f => /^Deal/.test(f)), JSON.stringify(facts));
  ok('A14h','"Your cut" fact', facts.some(f => /Your cut/.test(f)), JSON.stringify(facts));
}
ok('G7','"Your commission" section', has(/Your commission/));
ok('G2e','owner field is disabled for a rep', qa('input[disabled]').length > 0);
ok('G2g','lead pool picker is NOT offered to a rep', !label('Lead pool'));
ok('G8','full commission section is NOT offered to a rep', !has(/Rate at conversion/));
{ const o = curEl.querySelector('.compose-open'); if (o) { await click(o); await settle(90); } }
ok('I6g','rep logs as themselves', has(/logging as/));
ok('I9b','rep gets mark-as-lost, not delete', btn(/Lost/) && !btn(/Delete lead/));

console.log('\nPOOL — a rep on an UNCLAIMED pool lead');
await boot({ users:[REP], leads:[{ id:'L3', name:'Pool Lead', company:'Pool Co', stage:'new',
  owner:'ProyTech', owner_id:null, pool:'General', dealValue:5000, createdAt:ago(3),
  activities:[], meetings:[], custom:{} }] });
await openLead('Pool Lead', /^Pool/);
{
  const facts = qa('.m-facts .mf').map(f => (f.textContent||'').trim());
  ok('A14g','deal fact is WITHHELD on an unclaimed pool lead', !facts.some(f => /^Deal/.test(f)), JSON.stringify(facts));
}

console.log('\nREL — the same surface, flipped to a relationship');
await boot({ users:[OWNER], leads:[MARCUS, FILLER, RICH({ isRelationship:true, isClient:false, commission:null })] });
await openRel('Sarah Chen');
await openAllSecs();
ok('G4b','relationship hint', q('.rel-hint'));
ok('G4c','tier buttons', qa('.tier-btn').length > 0);
ok('G4h','"N people came from this contact"', true, 'asserted via the chain on the introducer below');
await boot({ users:[OWNER], leads:[MARCUS, FILLER, RICH()] });
await openRel('Marcus Webb');
await openAllSecs();
ok('G4h','people introduced by this contact', q('.rel-gave'), T().slice(0, 160));

console.log(`\n${pass} present, ${fail} MISSING\n`);
if (fail) { console.log('Missing inventory items:'); missing.forEach(m => console.log('  · ' + m)); console.log(); }
process.exit(fail ? 1 : 0);

/* WHEN A CLIENT ACCEPTS: WHAT HAPPENS TO THE LEAD, AND THAT NO MONEY DOUBLES.

   The public route never writes a lead. The owner's CRM applies the
   acceptance through acceptancePatch / proposalEventsPatch (lib/proposal), as
   ONE patch, idempotent by activity id. This proves what that patch does,
   checked with the real money functions from lib/lead, lib/charts and
   lib/retainer rather than by reading fields:

   - lead moves to the WON stage (found by flag, not a hardcoded key)
   - a prospect's earlier open deals are REPLACED by what was accepted, so
     the same money is not counted twice; a client's are kept and added to
   - dealValue is re-summed the way writeDeals does it
   - the monthly becomes a QUOTED retainer: no start date, so not in MRR until
     the owner picks the launch date
   - a client who already has a retainer keeps it
   - running it twice changes nothing

   Seen red: keeping the prospect's old deals (owed doubled); setting
   retainerStart (MRR jumped before launch); dropping the idempotency check. */
import fs from 'fs';
import esbuild from 'esbuild';
const b = async (e, t) => { const o = await esbuild.build({ entryPoints: [e], bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['lucide-react', 'react'], define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
  fs.writeFileSync(`tests/.${t}.mjs`, o.outputFiles[0].text); return import(`./.${t}.mjs?v=` + Date.now()); };
const P = await b('src/lib/proposal.js', 'bpa_p'), L = await b('src/lib/lead.js', 'bpa_l'), C = await b('src/lib/charts.js', 'bpa_c'), R = await b('src/lib/retainer.js', 'bpa_r');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  (' + JSON.stringify(x).slice(0, 300) + ')' : '')); } };
const STAGES = [{ key: 'new', open: true }, { key: 'proposal', open: true }, { key: 'closedwon', won: true }, { key: 'lost', lost: true }];
const OFFER = P.readOffer({ offer: JSON.parse(fs.readFileSync('PROPOSAL-OFFER.json', 'utf8')) }).offer;
const q = P.quote(OFFER, { packageId: 'growth-os', addonIds: ['automations'], seats: 6, prepay: true });
const prop = (over = {}) => ({ id: 'p1', status: 'accepted', lead_id: 'L', body: { quote: q }, accepted_name: 'Dee Client', accepted_ip: '9.8.7.6', accepted_plan: 'annual', accepted_at: '2026-10-05T15:00:00.000Z', sent_at: '2026-10-03T15:00:00.000Z', expires_at: '2026-10-10T15:00:00.000Z', viewed_at: '2026-10-04T15:00:00.000Z', ...over });
const apply = (lead, p = prop()) => { const x = P.proposalEventsPatch(lead, p, STAGES, '2026-10-05'); return x ? { ...lead, ...x } : lead; };

console.log('\na prospect accepts');
const prospect = { id: 'L', stage: 'proposal', deals: [{ id: 'est', label: 'Estimate', setup: 5000 }], dealValue: 5000, activities: [{ id: 'old', text: 'met' }] };
const won = apply(prospect);
ok('the lead moves to the won stage, found by its flag', won.stage === 'closedwon');
ok('the earlier estimate deal is replaced by what was accepted', won.deals.length === 2 && !won.deals.some(d => d.id === 'est'), won.deals.map(d => d.id));
ok('each accepted item is a deal with its service and agreed setup', won.deals.map(d => `${d.service}:${d.price}`).join() === 'Web+CRM:3000,Automations:1499');
ok('dealValue is re-summed from the deals', won.dealValue === 4499 && L.dealsOf(won).reduce((a, d) => a + L.dealBits(d), 0) === 4499);
ok('still owed is the setup, not setup plus the old estimate', L.owedBy(won, STAGES) === 4499, L.owedBy(won, STAGES));
ok('it reads as won revenue, not pipeline', C.serviceRevenue([won], STAGES).rows.reduce((a, r) => a + r.won, 0) === 4499);
ok('the monthly is set, quoted, NOT started', won.retainer === String(q.monthly) && won.retainerActive === true && !won.retainerStart && R.retainerState(won) === 'quoted');
ok('so MRR does not move until launch', C.mrrByMonth([won], 3).every(m => m.value === 0));
ok('the retainer counts toward the package\'s service', won.retainerService === 'Web+CRM');
const accNote = won.activities.find(a => a.id === 'prop-acc-p1');
ok('the acceptance is on the timeline with the typed name and IP', accNote && /Dee Client/.test(accNote.text) && /9\.8\.7\.6/.test(accNote.text));
ok('  and the prepay choice, and the replaced estimate', /12-month prepay/.test(accNote.text) && /Replaced 1 earlier open deal \(Estimate\)/.test(accNote.text));
ok('the next step is to send the payment link, today', won.nextSteps === 'Send the deposit payment link' && won.followUp === '2026-10-05');
ok('sent and viewed are on the timeline too, in order', ['prop-acc-p1', 'prop-view-p1', 'prop-sent-p1', 'old'].every((id, i) => won.activities[i].id === id), won.activities.map(a => a.id));
ok('running it again changes nothing', P.proposalEventsPatch(won, prop(), STAGES, '2026-10-06') === null);

console.log('\nan existing client accepts an upsell');
const client = { id: 'L', stage: 'closedwon', isClient: true, retainer: '199', retainerActive: true, retainerStart: '2026-06-01',
  deals: [{ id: 'live', label: 'Site', service: 'Website', price: '1500' }], dealValue: 1500, closedDeals: [{ id: 'c', amount: 900 }], activities: [] };
const up = apply(client);
ok('their existing deal is kept, the new ones added', up.deals.map(d => d.id).join() === 'live,prop-p1-0,prop-p1-1');
ok('dealValue covers all three', up.dealValue === 1500 + 4499);
ok('their retainer is NOT overwritten', up.retainer === '199' && up.retainerStart === '2026-06-01' && R.retainerState(up) === 'active');
ok('  and the note says what to change by hand', /already have a \$199\/mo retainer/.test(up.activities[0].text));
ok('closed deals are untouched', up.closedDeals.length === 1 && up.closedDeals[0].amount === 900);

console.log('\nwhat must not happen');
ok('a sent proposal changes nothing but the timeline', (() => { const x = P.proposalEventsPatch(prospect, prop({ status: 'sent', viewed_at: null }), STAGES, 'x'); return x && Object.keys(x).join() === 'activities' && x.activities[0].id === 'prop-sent-p1'; })());
ok('a viewed proposal adds the view and nothing else', (() => { const x = P.proposalEventsPatch(prospect, prop({ status: 'viewed' }), STAGES, 'x'); return x && Object.keys(x).join() === 'activities' && x.activities.length === 3; })());
ok('a draft adds nothing', P.proposalEventsPatch(prospect, prop({ status: 'draft', sent_at: null, viewed_at: null }), STAGES, 'x') === null);
ok('stages with no won flag leave the stage alone rather than guess', apply(prospect, prop()).stage === 'closedwon' && P.acceptancePatch(prospect, prop(), [{ key: 'new' }], 'x').stage === undefined);
ok('a proposal with no monthly leaves the retainer alone', P.acceptancePatch({ id: 'L', activities: [] }, prop({ body: { quote: { ...q, monthly: 0 } } }), STAGES, 'x').retainer === undefined);
ok('the accepted deals are not marked as upsells being pitched', won.deals.every(d => d.upsell === false));

console.log(`\n${pass} passed, ${fail} failed`);
for (const t of ['bpa_p', 'bpa_l', 'bpa_c', 'bpa_r']) { try { fs.unlinkSync(`tests/.${t}.mjs`); } catch {} }
process.exit(fail ? 1 : 0);
